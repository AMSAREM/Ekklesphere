-- ============================================================================
-- Migration: 20261114000000_auth_rls_rate_limit_hardening.sql
-- Purpose:
--   1. Isolate password hashes (`scrypt` + per-user random salt generated in
--      the backend) and brute-force lockout counters in
--      `public.account_credentials`, completely inaccessible to `anon` and
--      `authenticated` Supabase clients via strict RLS & GRANT/REVOKE.
--   2. Add `public.auth_rate_limits` (with atomic RPC enforcement),
--      `public.auth_audit_events` (with column-restricted admin SELECT & 90d
--      retention cleanup) for login/signup throttling and security auditing.
--   3. Prevent self-role escalation on `public.members` via hardened
--      `guard_member_privilege_columns()` trigger and tightened RLS policies.
--   4. Align `members.role` check constraint with tenant roles (`finance`,
--      `group_leader`) and remove `org_insert_authenticated` client bypass.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. ISOLATED CREDENTIALS & BRUTE-FORCE LOCKOUT TABLE
-- ----------------------------------------------------------------------------
create table if not exists public.account_credentials (
  id uuid primary key default gen_random_uuid(),
  member_id uuid references public.members(id) on delete cascade,
  organization_id uuid references public.organizations(id) on delete cascade,
  email citext unique,
  username citext unique,
  phone_e164 text unique,
  full_name text not null,
  role text not null default 'member'
    check (role in ('super_admin', 'creator', 'owner', 'admin', 'pastor', 'usher', 'finance', 'group_leader', 'leader', 'member')),
  is_creator boolean not null default false,
  password_hash text not null,
  password_salt text not null,
  status text not null default 'active'
    check (status in ('active', 'suspended', 'locked')),
  failed_attempts int not null default 0 check (failed_attempts >= 0),
  locked_until timestamptz,
  last_login_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint account_credentials_org_required_for_non_creator
    check (is_creator = true or role in ('creator', 'super_admin') or organization_id is not null)
);

-- Reconcile columns if account_credentials pre-existed
alter table public.account_credentials
  add column if not exists member_id uuid references public.members(id) on delete cascade,
  add column if not exists organization_id uuid references public.organizations(id) on delete cascade,
  add column if not exists email citext,
  add column if not exists username citext,
  add column if not exists phone_e164 text,
  add column if not exists full_name text not null default 'Ekklesphere User',
  add column if not exists role text not null default 'member',
  add column if not exists is_creator boolean not null default false,
  add column if not exists password_hash text,
  add column if not exists password_salt text,
  add column if not exists status text not null default 'active',
  add column if not exists failed_attempts int not null default 0,
  add column if not exists locked_until timestamptz,
  add column if not exists last_login_at timestamptz,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

create index if not exists account_credentials_org_idx on public.account_credentials (organization_id);
create index if not exists account_credentials_member_idx on public.account_credentials (member_id);

alter table public.account_credentials enable row level security;

-- Zero client access: ONLY service_role (backend Express API) can read/write password hashes.
revoke all on table public.account_credentials from public, anon, authenticated;
grant all on table public.account_credentials to service_role;

drop policy if exists "account_credentials_deny_all_clients" on public.account_credentials;
create policy "account_credentials_deny_all_clients"
  on public.account_credentials
  for all
  to anon, authenticated
  using (false)
  with check (false);

-- ----------------------------------------------------------------------------
-- 2. AUTHENTICATION RATE LIMITS (ATOMIC RPC) & AUDIT EVENTS (MINIMAL PII)
-- ----------------------------------------------------------------------------
create table if not exists public.auth_rate_limits (
  rate_key text primary key,
  attempt_count int not null default 0 check (attempt_count >= 0),
  window_started_at timestamptz not null default now(),
  locked_until timestamptz,
  updated_at timestamptz not null default now()
);

alter table public.auth_rate_limits
  add column if not exists attempt_count int not null default 0,
  add column if not exists window_started_at timestamptz not null default now(),
  add column if not exists locked_until timestamptz,
  add column if not exists updated_at timestamptz not null default now();

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

-- Atomic database-backed rate-limit & lockout counter (for distributed/serverless auth)
create or replace function public.consume_auth_rate_limit(
  p_rate_key text,
  p_max_attempts int default 5,
  p_window_seconds int default 900,
  p_lockout_seconds int default 900
)
returns table (
  allowed boolean,
  attempt_count int,
  locked_until timestamptz,
  retry_after_seconds int
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_now timestamptz := now();
  v_row public.auth_rate_limits%rowtype;
  v_retry int := 0;
begin
  if p_rate_key is null or btrim(p_rate_key) = '' then
    return query select false, 0, v_now + make_interval(secs => p_lockout_seconds), p_lockout_seconds;
    return;
  end if;

  insert into public.auth_rate_limits as arl (rate_key, attempt_count, window_started_at, locked_until, updated_at)
  values (p_rate_key, 1, v_now, null, v_now)
  on conflict (rate_key) do update set
    attempt_count = case
      when arl.locked_until is not null and arl.locked_until > v_now then arl.attempt_count
      when arl.window_started_at + make_interval(secs => p_window_seconds) <= v_now then 1
      else arl.attempt_count + 1
    end,
    window_started_at = case
      when arl.locked_until is not null and arl.locked_until > v_now then arl.window_started_at
      when arl.window_started_at + make_interval(secs => p_window_seconds) <= v_now then v_now
      else arl.window_started_at
    end,
    locked_until = case
      when arl.locked_until is not null and arl.locked_until > v_now then arl.locked_until
      when (
        case
          when arl.window_started_at + make_interval(secs => p_window_seconds) <= v_now then 1
          else arl.attempt_count + 1
        end
      ) >= greatest(1, p_max_attempts) then v_now + make_interval(secs => p_lockout_seconds)
      else null
    end,
    updated_at = v_now
  returning * into v_row;

  if v_row.locked_until is not null and v_row.locked_until > v_now then
    v_retry := greatest(1, ceil(extract(epoch from (v_row.locked_until - v_now)))::int);
    return query select false, v_row.attempt_count, v_row.locked_until, v_retry;
  else
    return query select true, v_row.attempt_count, v_row.locked_until, 0;
  end if;
end;
$$;

revoke all on function public.consume_auth_rate_limit(text, int, int, int) from public, anon, authenticated;
grant execute on function public.consume_auth_rate_limit(text, int, int, int) to service_role;

create or replace function public.reset_auth_rate_limit(p_rate_key text)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  delete from public.auth_rate_limits where rate_key = p_rate_key;
end;
$$;

revoke all on function public.reset_auth_rate_limit(text) from public, anon, authenticated;
grant execute on function public.reset_auth_rate_limit(text) to service_role;

create table if not exists public.auth_audit_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete set null,
  account_id uuid,
  identifier_hash text not null,
  event_type text not null check (
    event_type in (
      'login_success',
      'login_failed',
      'login_locked',
      'login_rate_limited',
      'register_success',
      'register_rejected',
      'token_exchanged',
      'logout'
    )
  ),
  ip_address text,
  success boolean not null default false,
  reason text,
  created_at timestamptz not null default now()
);

alter table public.auth_audit_events
  add column if not exists organization_id uuid references public.organizations(id) on delete set null,
  add column if not exists account_id uuid,
  add column if not exists identifier_hash text,
  add column if not exists event_type text,
  add column if not exists ip_address text,
  add column if not exists success boolean not null default false,
  add column if not exists reason text,
  add column if not exists created_at timestamptz not null default now();

create index if not exists auth_audit_events_org_created_idx
  on public.auth_audit_events (organization_id, created_at desc);

alter table public.auth_audit_events enable row level security;
-- Column-level restriction: org admins can view aggregate-safe audit fields only,
-- never raw `ip_address` or internal failure `reason` via client PostgREST.
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

-- Retention cleanup for auth audit logs & expired rate-limit windows (default 90 days)
create or replace function public.purge_expired_auth_audit_events(p_retention_days int default 90)
returns int
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_deleted int := 0;
begin
  delete from public.auth_audit_events
  where created_at < now() - make_interval(days => greatest(7, p_retention_days));
  get diagnostics v_deleted = row_count;

  delete from public.auth_rate_limits
  where updated_at < now() - interval '7 days';

  return v_deleted;
end;
$$;

revoke all on function public.purge_expired_auth_audit_events(int) from public, anon, authenticated;
grant execute on function public.purge_expired_auth_audit_events(int) to service_role;

-- ----------------------------------------------------------------------------
-- 3. ALIGN members.role & HARDEN SELF-ROLE ESCALATION GUARD ON public.members
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

  -- Backend Express (service_role), SQL Editor (postgres/supabase_admin), and Platform Creators are trusted.
  -- PostgREST client calls always run as current_user = 'anon' or 'authenticated'.
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

    -- Prevent an admin from elevating themselves or transferring ownership unless already owner
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

drop trigger if exists trg_guard_member_privilege_columns on public.members;
create trigger trg_guard_member_privilege_columns
  before update on public.members
  for each row
  execute function public.guard_member_privilege_columns();

-- Tighten `members_insert_policy` & `members_update_policy`
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

-- ----------------------------------------------------------------------------
-- 4. ORGANIZATION POLICY HARDENING
--    Organization creation is handled by service_role (/api/auth/register-organisation)
--    or Platform Creator (/console), never directly by arbitrary authenticated users.
-- ----------------------------------------------------------------------------
drop policy if exists "org_insert_authenticated" on public.organizations;
drop policy if exists "org_select_members" on public.organizations;
drop policy if exists "org_update_admins" on public.organizations;

-- Touch updated_at trigger on account_credentials
drop trigger if exists touch_account_credentials_updated_at on public.account_credentials;
create trigger touch_account_credentials_updated_at
  before update on public.account_credentials
  for each row execute function public.touch_updated_at();
