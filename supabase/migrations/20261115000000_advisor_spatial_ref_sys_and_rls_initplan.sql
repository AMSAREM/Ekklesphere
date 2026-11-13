-- ============================================================================
-- Migration: 20261115000000_advisor_spatial_ref_sys_and_rls_initplan.sql
-- Purpose:
--   Safe consolidated patch for existing databases:
--   1. Remove overly permissive `org_insert_authenticated` & redundant legacy
--      organization policies (`org_select_members`, `org_update_admins`) on
--      `public.organizations`, clearing the Advisor `auth_rls_initplan` warning
--      while preserving Creator (`organizations_creator_all`), member-scoped
--      (`organizations_select_scoped`), owner/admin updates, and intentional
--      published church profile reads.
--   2. Re-harden `account_credentials`, `auth_rate_limits`, `auth_audit_events`
--      (column-scoped SELECT excluding IP/reason), `guard_member_privilege_columns()`,
--      and `members` / `attendance` `(select auth.uid())` initplan wrappers.
--   3. Safely attempt RLS + PostgREST REVOKE on `public.spatial_ref_sys`.
-- ============================================================================

begin;

-- ----------------------------------------------------------------------------
-- 1. Organization Hardening & InitPlan Cleanup
-- ----------------------------------------------------------------------------
drop policy if exists "org_insert_authenticated" on public.organizations;
drop policy if exists "org_select_members" on public.organizations;
drop policy if exists "org_update_admins" on public.organizations;

-- ----------------------------------------------------------------------------
-- 2. Credential, Rate-Limit & Audit Event Table Hardening
-- ----------------------------------------------------------------------------
do $$
begin
  if to_regclass('public.account_credentials') is not null then
    alter table public.account_credentials enable row level security;
    revoke all on table public.account_credentials from public, anon, authenticated;
    grant all on table public.account_credentials to service_role;

    drop policy if exists "account_credentials_deny_all_clients" on public.account_credentials;
    create policy "account_credentials_deny_all_clients"
      on public.account_credentials
      for all
      to anon, authenticated
      using (false)
      with check (false);
  end if;

  if to_regclass('public.auth_rate_limits') is not null then
    alter table public.auth_rate_limits enable row level security;
    revoke all on table public.auth_rate_limits from public, anon, authenticated;
    grant all on table public.auth_rate_limits to service_role;

    drop policy if exists "auth_rate_limits_deny_all_clients" on public.auth_rate_limits;
    create policy "auth_rate_limits_deny_all_clients"
      on public.auth_rate_limits
      for all
      to anon, authenticated
      using (false)
      with check (false);
  end if;

  if to_regclass('public.auth_audit_events') is not null then
    alter table public.auth_audit_events enable row level security;
    revoke all on table public.auth_audit_events from public, anon, authenticated;
    grant select (id, organization_id, account_id, identifier_hash, event_type, success, created_at)
      on table public.auth_audit_events to authenticated;
    grant all on table public.auth_audit_events to service_role;

    drop policy if exists "auth_audit_events_admin_select" on public.auth_audit_events;
    create policy "auth_audit_events_admin_select"
      on public.auth_audit_events
      for select
      to authenticated
      using (
        public.is_platform_creator()
        or (
          organization_id is not null
          and public.has_organization_access(organization_id, 'admin')
        )
      );

    drop policy if exists "auth_audit_events_no_client_write" on public.auth_audit_events;
    create policy "auth_audit_events_no_client_write"
      on public.auth_audit_events
      for insert
      to anon, authenticated
      with check (false);
  end if;
end $$;

-- ----------------------------------------------------------------------------
-- 3. Members Role Alignment, Hardened Privilege Trigger & InitPlan Wrappers
-- ----------------------------------------------------------------------------
do $$
begin
  if to_regclass('public.members') is not null then
    alter table public.members drop constraint if exists members_role_check;
    alter table public.members
      add constraint members_role_check
      check (role in ('owner', 'admin', 'pastor', 'usher', 'finance', 'group_leader', 'leader', 'member', 'guest'));
  end if;
exception
  when others then null;
end $$;

create or replace function public.guard_member_privilege_columns()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  v_jwt_role text;
begin
  if tg_op <> 'UPDATE' then
    return new;
  end if;

  v_jwt_role := coalesce(auth.role(), '');
  if current_user in ('postgres', 'supabase_admin', 'service_role')
     or v_jwt_role = 'service_role'
     or public.is_platform_creator() then
    return new;
  end if;

  if (
    new.role is distinct from old.role
    or new.organization_id is distinct from old.organization_id
    or new.status is distinct from old.status
  ) then
    if not public.has_organization_access(old.organization_id, 'admin') then
      raise exception 'Privilege escalation blocked: only verified organization admins may modify role, status, or organization_id.'
        using errcode = '42501';
    end if;

    if new.role is distinct from old.role and old.user_id = (select auth.uid()) then
      raise exception 'Privilege escalation blocked: administrators cannot modify their own role via client API.'
        using errcode = '42501';
    end if;

    if (new.role = 'owner' or old.role = 'owner') and new.role is distinct from old.role then
      if not public.has_organization_access(old.organization_id, 'owner') then
        raise exception 'Privilege escalation blocked: only an organization owner may assign or revoke owner role.'
          using errcode = '42501';
      end if;
    end if;
  end if;

  return new;
end;
$$;

revoke all on function public.guard_member_privilege_columns() from public, anon, authenticated;

do $$
begin
  if to_regclass('public.members') is not null then
    drop trigger if exists trg_guard_member_privilege_columns on public.members;
    create trigger trg_guard_member_privilege_columns
      before update on public.members
      for each row
      execute function public.guard_member_privilege_columns();

    drop policy if exists "members_insert_policy" on public.members;
    create policy "members_insert_policy"
      on public.members
      for insert
      to authenticated
      with check (
        public.is_platform_creator()
        or public.has_organization_access(organization_id, 'admin')
        or (
          (select auth.uid()) = user_id
          and role = 'member'
          and status = 'active'
        )
      );

    drop policy if exists "members_update_policy" on public.members;
    create policy "members_update_policy"
      on public.members
      for update
      to authenticated
      using (
        public.is_platform_creator()
        or public.has_organization_access(organization_id, 'admin')
        or ((select auth.uid()) = user_id and public.has_organization_access(organization_id))
      )
      with check (
        public.is_platform_creator()
        or public.has_organization_access(organization_id, 'admin')
        or (
          (select auth.uid()) = user_id
          and public.has_organization_access(organization_id)
          and role = 'member'
        )
      );
  end if;

  if to_regclass('public.attendance') is not null then
    drop policy if exists "attendance_insert_policy" on public.attendance;
    create policy "attendance_insert_policy"
      on public.attendance
      for insert
      to authenticated
      with check (
        public.has_organization_access(organization_id)
        and (
          (select auth.uid()) = user_id
          or public.has_organization_access(organization_id, 'usher')
        )
      );
  end if;
end $$;

-- ----------------------------------------------------------------------------
-- 4. Lock down public.spatial_ref_sys safely (PostGIS extension lookup table)
--    Verified: Zero frontend/client code queries `spatial_ref_sys` directly;
--    geofence PostGIS queries execute server-side (`service_role`).
--    In hosted Supabase, `public.spatial_ref_sys` is owned by `supabase_admin`,
--    so the SQL Editor `postgres` role cannot ALTER TABLE or REVOKE directly.
-- ----------------------------------------------------------------------------
do $$
begin
  if exists (
    select 1
    from pg_tables
    where schemaname = 'public'
      and tablename = 'spatial_ref_sys'
      and tableowner = current_user
  ) then
    alter table public.spatial_ref_sys enable row level security;
    drop policy if exists "allow_read_spatial_ref_sys" on public.spatial_ref_sys;
    revoke all on table public.spatial_ref_sys from public, anon, authenticated;
  else
    raise notice 'Skipping public.spatial_ref_sys RLS/grant update (owned by PostGIS extension owner supabase_admin).';
  end if;
exception
  when insufficient_privilege then
    raise notice 'Skipping public.spatial_ref_sys RLS/grant update (insufficient privilege).';
end $$;

commit;
