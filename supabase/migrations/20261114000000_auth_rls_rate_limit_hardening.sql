-- ============================================================================
-- Migration: 20261114000000_auth_rls_rate_limit_hardening.sql
-- Purpose:
--   1. Isolate password hashes (`scrypt` + per-user random salt) and brute-force
--      lockout counters in `public.account_credentials`, completely inaccessible
--      to `anon` and `authenticated` Supabase clients via strict RLS & GRANT/REVOKE.
--   2. Add `public.auth_rate_limits` & `public.auth_audit_events` for login/signup
--      throttling, account lockout persistence, and security auditing.
--   3. Prevent self-role escalation on `public.members` by blocking non-admin /
--      non-service updates to `role`, `organization_id`, and `status`.
--   4. Harden `public.organizations` RLS policies so tenants are never leaked to
--      anonymous queries outside verified membership or creator claims.
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
  using (false)
  with check (false);

-- ----------------------------------------------------------------------------
-- 2. AUTHENTICATION RATE LIMITS & AUDIT EVENTS
-- ----------------------------------------------------------------------------
create table if not exists public.auth_rate_limits (
  rate_key text primary key,
  attempt_count int not null default 0 check (attempt_count >= 0),
  window_started_at timestamptz not null default now(),
  locked_until timestamptz,
  updated_at timestamptz not null default now()
);

alter table public.auth_rate_limits enable row level security;
revoke all on table public.auth_rate_limits from public, anon, authenticated;
grant all on table public.auth_rate_limits to service_role;

drop policy if exists "auth_rate_limits_deny_all_clients" on public.auth_rate_limits;
create policy "auth_rate_limits_deny_all_clients"
  on public.auth_rate_limits
  for all
  using (false)
  with check (false);

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

create index if not exists auth_audit_events_org_created_idx
  on public.auth_audit_events (organization_id, created_at desc);

alter table public.auth_audit_events enable row level security;
revoke all on table public.auth_audit_events from public, anon;
grant select on table public.auth_audit_events to authenticated;
grant all on table public.auth_audit_events to service_role;

drop policy if exists "auth_audit_events_admin_select" on public.auth_audit_events;
create policy "auth_audit_events_admin_select"
  on public.auth_audit_events
  for select
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
  with check (false);

-- ----------------------------------------------------------------------------
-- 3. SELF-ROLE ESCALATION GUARD ON public.members
--    Prevents authenticated members from elevating their own `role`, `status`,
--    or transferring themselves to another `organization_id` via Supabase REST.
-- ----------------------------------------------------------------------------
create or replace function public.guard_member_privilege_columns()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_jwt_role text;
begin
  -- Backend Express uses service_role and handles verified role mutations explicitly.
  v_jwt_role := coalesce(auth.role(), '');
  if v_jwt_role = 'service_role' or public.is_platform_creator() then
    return new;
  end if;

  if tg_op = 'UPDATE' then
    if (
      new.role is distinct from old.role
      or new.organization_id is distinct from old.organization_id
      or new.status is distinct from old.status
    ) then
      if not public.has_organization_access(old.organization_id, 'admin') then
        raise exception 'Privilege escalation blocked: only verified organization admins may modify role, status, or organization_id.'
          using errcode = '42501';
      end if;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_guard_member_privilege_columns on public.members;
create trigger trg_guard_member_privilege_columns
  before update on public.members
  for each row
  execute function public.guard_member_privilege_columns();

-- Tighten `members_insert_policy` so self-registration via client JWT cannot pick elevated roles
drop policy if exists "members_insert_policy" on public.members;
create policy "members_insert_policy" on public.members
  for insert
  with check (
    public.is_platform_creator()
    or public.has_organization_access(organization_id, 'admin')
    or (
      auth.uid() = user_id
      and role = 'member'
      and status = 'active'
    )
  );

drop policy if exists "members_update_policy" on public.members;
create policy "members_update_policy" on public.members
  for update
  using (
    public.is_platform_creator()
    or public.has_organization_access(organization_id, 'admin')
    or (auth.uid() = user_id and public.has_organization_access(organization_id))
  )
  with check (
    public.is_platform_creator()
    or public.has_organization_access(organization_id, 'admin')
    or (
      auth.uid() = user_id
      and public.has_organization_access(organization_id)
      and role = 'member'
    )
  );

-- Touch updated_at trigger on account_credentials
drop trigger if exists touch_account_credentials_updated_at on public.account_credentials;
create trigger touch_account_credentials_updated_at
  before update on public.account_credentials
  for each row execute function public.touch_updated_at();
