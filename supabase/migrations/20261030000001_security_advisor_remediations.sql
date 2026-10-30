-- ============================================================================
-- Supabase Security Advisor & Performance Remediation Migration
-- Migration: 20261030000001_security_advisor_remediations.sql
-- Addresses:
--   1. Critical: spatial_ref_sys RLS enabled + public read policy
--   2. Policies for tables with RLS enabled:
--      (persons, users, user_roles, devices, consents, followup_tasks, 
--       pastoral_notes, donations, households, beacons, funds, tenants,
--       attendance_signals, attendance_records, audit_logs)
--   3. Restrict SECURITY DEFINER functions (auto_close_open_shifts, rls_auto_enable)
--      and enforce immutable search_path on site_distance, travel_speed_kmh, etc.
--   4. Covering indexes for 31 unindexed foreign keys
--   5. Wrap auth functions as (select auth.uid()) and (select auth.role())
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. CRITICAL: SECURE spatial_ref_sys (PostGIS) SAFELY
-- Wrapped in privilege guard because spatial_ref_sys is owned by supabase_admin
-- ----------------------------------------------------------------------------
do $$
begin
  alter table if exists public.spatial_ref_sys enable row level security;
  drop policy if exists "allow_read_spatial_ref_sys" on public.spatial_ref_sys;
  create policy "allow_read_spatial_ref_sys" on public.spatial_ref_sys
    for select
    using (true);
exception
  when insufficient_privilege or undefined_table then
    raise notice 'Skipping spatial_ref_sys RLS (managed by PostGIS extension owner).';
end $$;

-- Ensure prerequisite columns/tables exist if 20261029000001 was run earlier
alter table if exists public.sites
  add column if not exists active boolean not null default true;

alter table if exists public.users
  add column if not exists auth_user_id uuid references auth.users(id) on delete set null;

create table if not exists public.funds (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  name text not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table if exists public.donations
  add column if not exists fund_id uuid references public.funds(id) on delete set null;

create table if not exists public.audit_logs (
  id bigserial primary key,
  tenant_id uuid not null,
  actor_user_id uuid,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  before jsonb,
  after jsonb,
  ip inet,
  at timestamptz not null default now()
);

-- Ensure RLS is enabled on all core tables
alter table if exists public.tenants enable row level security;
alter table if exists public.campuses enable row level security;
alter table if exists public.beacons enable row level security;
alter table if exists public.households enable row level security;
alter table if exists public.persons enable row level security;
alter table if exists public.users enable row level security;
alter table if exists public.user_roles enable row level security;
alter table if exists public.devices enable row level security;
alter table if exists public.consents enable row level security;
alter table if exists public.services enable row level security;
alter table if exists public.service_instances enable row level security;
alter table if exists public.attendance_signals enable row level security;
alter table if exists public.attendance_records enable row level security;
alter table if exists public.followup_tasks enable row level security;
alter table if exists public.pastoral_notes enable row level security;
alter table if exists public.funds enable row level security;
alter table if exists public.donations enable row level security;
alter table if exists public.audit_logs enable row level security;

-- ----------------------------------------------------------------------------
-- 2. HARDEN SECURITY DEFINER FUNCTIONS & FIX MUTABLE search_path
-- ----------------------------------------------------------------------------
do $$
begin
  if exists (
    select 1 from pg_proc p
    join pg_namespace n on p.pronamespace = n.oid
    where n.nspname = 'public' and p.proname = 'auto_close_open_shifts'
  ) then
    revoke execute on function public.auto_close_open_shifts from public, anon, authenticated;
    grant execute on function public.auto_close_open_shifts to service_role;
  end if;

  if exists (
    select 1 from pg_proc p
    join pg_namespace n on p.pronamespace = n.oid
    where n.nspname = 'public' and p.proname = 'rls_auto_enable'
  ) then
    revoke execute on function public.rls_auto_enable from public, anon, authenticated;
    grant execute on function public.rls_auto_enable to service_role;
  end if;

  if exists (
    select 1 from pg_proc p
    join pg_namespace n on p.pronamespace = n.oid
    where n.nspname = 'public'
      and p.proname = 'site_distance'
      and pg_get_function_identity_arguments(p.oid) = 'p_site uuid, p_lng double precision, p_lat double precision'
  ) then
    execute 'alter function public.site_distance(uuid, double precision, double precision) set search_path = public, extensions';
  end if;

  if exists (
    select 1 from pg_proc p
    join pg_namespace n on p.pronamespace = n.oid
    where n.nspname = 'public'
      and p.proname = 'travel_speed_kmh'
      and pg_get_function_identity_arguments(p.oid) = 'p_user uuid, p_lng double precision, p_lat double precision, p_at timestamp with time zone'
  ) then
    execute 'alter function public.travel_speed_kmh(uuid, double precision, double precision, timestamptz) set search_path = public, extensions';
  end if;

  if exists (
    select 1 from pg_proc p
    join pg_namespace n on p.pronamespace = n.oid
    where n.nspname = 'public' and p.proname = 'get_current_organization_id'
  ) then
    execute 'alter function public.get_current_organization_id() set search_path = public, auth, extensions';
  end if;

  if exists (
    select 1 from pg_proc p
    join pg_namespace n on p.pronamespace = n.oid
    where n.nspname = 'public' and p.proname = 'touch_updated_at'
  ) then
    execute 'alter function public.touch_updated_at() set search_path = public';
  end if;
end $$;

-- Coordinate-pair spatial distance and speed helpers with pinned search_path
create or replace function public.site_distance(
  lat1 double precision,
  lng1 double precision,
  lat2 double precision,
  lng2 double precision
)
returns double precision
language sql
immutable
parallel safe
set search_path = public, auth, extensions
as $$
  select ST_Distance(
    ST_SetSRID(ST_MakePoint(lng1, lat1), 4326)::geography,
    ST_SetSRID(ST_MakePoint(lng2, lat2), 4326)::geography
  );
$$;

create or replace function public.travel_speed_kmh(
  dist_meters double precision,
  time_seconds double precision
)
returns double precision
language sql
immutable
parallel safe
set search_path = public, auth, extensions
as $$
  select case
    when time_seconds <= 0 then 0.0
    else (dist_meters / 1000.0) / (time_seconds / 3600.0)
  end;
$$;

-- ----------------------------------------------------------------------------
-- 3. COVERING INDEXES FOR ALL FOREIGN KEYS
-- ----------------------------------------------------------------------------

-- Tenancy, Campuses & Beacons
create index if not exists idx_fk_campuses_tenant on public.campuses (tenant_id);
create index if not exists idx_fk_beacons_tenant on public.beacons (tenant_id);
create index if not exists idx_fk_beacons_campus on public.beacons (campus_id);
create index if not exists idx_fk_households_tenant on public.households (tenant_id);

-- Persons, Users, Roles & Consents
create index if not exists idx_fk_persons_tenant on public.persons (tenant_id);
create index if not exists idx_fk_persons_household on public.persons (household_id);
create index if not exists idx_fk_users_tenant on public.users (tenant_id);
create index if not exists idx_fk_users_person on public.users (person_id);
create index if not exists idx_fk_users_auth_user on public.users (auth_user_id);
create index if not exists idx_fk_user_roles_user on public.user_roles (user_id);
create index if not exists idx_fk_user_roles_campus on public.user_roles (scope_campus_id);
create index if not exists idx_fk_devices_user on public.devices (user_id);
create index if not exists idx_fk_consents_tenant on public.consents (tenant_id);
create index if not exists idx_fk_consents_person on public.consents (person_id);

-- Services & Instances
create index if not exists idx_fk_services_tenant on public.services (tenant_id);
create index if not exists idx_fk_services_campus on public.services (campus_id);
create index if not exists idx_fk_service_instances_tenant on public.service_instances (tenant_id);
create index if not exists idx_fk_service_instances_service on public.service_instances (service_id);
create index if not exists idx_fk_service_instances_campus on public.service_instances (campus_id);

-- Attendance Signals & Records
create index if not exists idx_fk_attendance_signals_tenant on public.attendance_signals (tenant_id);
create index if not exists idx_fk_attendance_signals_person on public.attendance_signals (person_id);
create index if not exists idx_fk_attendance_signals_campus on public.attendance_signals (campus_id);
create index if not exists idx_fk_attendance_signals_instance on public.attendance_signals (service_instance_id);
create index if not exists idx_fk_attendance_signals_device on public.attendance_signals (device_id);

create index if not exists idx_fk_attendance_records_tenant on public.attendance_records (tenant_id);
create index if not exists idx_fk_attendance_records_instance on public.attendance_records (service_instance_id);
create index if not exists idx_fk_attendance_records_person on public.attendance_records (person_id);
create index if not exists idx_fk_attendance_records_campus on public.attendance_records (campus_id);
create index if not exists idx_fk_attendance_records_recorded_by on public.attendance_records (recorded_by);

-- Care & Pastoral Notes
create index if not exists idx_fk_followup_tasks_tenant on public.followup_tasks (tenant_id);
create index if not exists idx_fk_followup_tasks_person on public.followup_tasks (person_id);
create index if not exists idx_fk_followup_tasks_assigned_to on public.followup_tasks (assigned_to);
create index if not exists idx_fk_pastoral_notes_tenant on public.pastoral_notes (tenant_id);
create index if not exists idx_fk_pastoral_notes_person on public.pastoral_notes (person_id);
create index if not exists idx_fk_pastoral_notes_author on public.pastoral_notes (author_id);

-- Giving & Funds
create index if not exists idx_fk_funds_tenant on public.funds (tenant_id);
create index if not exists idx_fk_donations_tenant on public.donations (tenant_id);
create index if not exists idx_fk_donations_person on public.donations (person_id);
create index if not exists idx_fk_donations_fund on public.donations (fund_id);

-- Multi-Tenant Schema foreign keys
create index if not exists idx_fk_events_created_by on public.events (created_by);
create index if not exists idx_fk_attendance_user on public.attendance (user_id);
create index if not exists idx_fk_attendance_checked_by on public.attendance (checked_in_by);

-- ----------------------------------------------------------------------------
-- 4. RLS POLICIES WITH OPTIMIZED (SELECT AUTH.*) WRAPPING
-- ----------------------------------------------------------------------------

-- 4.1 TENANTS
drop policy if exists "tenants_select_active" on public.tenants;
create policy "tenants_select_active" on public.tenants
  for select
  using (
    (select auth.role()) = 'service_role'
    or exists (
      select 1 from public.users u
      where u.tenant_id = public.tenants.id
        and u.auth_user_id = (select auth.uid())
    )
    or exists (
      select 1 from public.members m
      where m.organization_id = public.tenants.id
        and m.user_id = (select auth.uid())
    )
  );

-- 4.2 PERSONS
drop policy if exists "persons_select_policy" on public.persons;
create policy "persons_select_policy" on public.persons
  for select
  using (
    (select auth.role()) = 'service_role'
    or id in (
      select u.person_id from public.users u where u.auth_user_id = (select auth.uid())
    )
    or exists (
      select 1 from public.user_roles ur
      join public.users u on u.id = ur.user_id
      where u.auth_user_id = (select auth.uid())
        and ur.role in ('admin', 'pastor', 'usher', 'group_leader')
        and u.tenant_id = public.persons.tenant_id
    )
  );

drop policy if exists "persons_write_policy" on public.persons;
create policy "persons_write_policy" on public.persons
  for all
  using (
    (select auth.role()) = 'service_role'
    or exists (
      select 1 from public.user_roles ur
      join public.users u on u.id = ur.user_id
      where u.auth_user_id = (select auth.uid())
        and ur.role in ('admin', 'pastor')
        and u.tenant_id = public.persons.tenant_id
    )
  );

-- 4.3 USERS
drop policy if exists "users_select_policy" on public.users;
create policy "users_select_policy" on public.users
  for select
  using (
    (select auth.role()) = 'service_role'
    or auth_user_id = (select auth.uid())
    or exists (
      select 1 from public.user_roles ur
      join public.users u on u.id = ur.user_id
      where u.auth_user_id = (select auth.uid())
        and ur.role in ('admin', 'pastor')
        and u.tenant_id = public.users.tenant_id
    )
  );

-- 4.4 USER_ROLES
drop policy if exists "user_roles_select_policy" on public.user_roles;
create policy "user_roles_select_policy" on public.user_roles
  for select
  using (
    (select auth.role()) = 'service_role'
    or user_id in (
      select u.id from public.users u where u.auth_user_id = (select auth.uid())
    )
    or exists (
      select 1 from public.user_roles ur
      join public.users u on u.id = ur.user_id
      where u.auth_user_id = (select auth.uid())
        and ur.role in ('admin')
    )
  );

-- 4.5 DEVICES (uses devices.user_id -> public.users.id)
drop policy if exists "devices_select_write" on public.devices;
create policy "devices_select_write" on public.devices
  for all
  using (
    (select auth.role()) = 'service_role'
    or exists (
      select 1 from public.users u
      where u.id = public.devices.user_id
        and u.auth_user_id = (select auth.uid())
    )
    or exists (
      select 1 from public.users target_u
      join public.users actor_u on actor_u.tenant_id = target_u.tenant_id
      join public.user_roles ur on ur.user_id = actor_u.id
      where target_u.id = public.devices.user_id
        and actor_u.auth_user_id = (select auth.uid())
        and ur.role = 'admin'
    )
  );

-- 4.6 CONSENTS
drop policy if exists "consents_select_write" on public.consents;
create policy "consents_select_write" on public.consents
  for all
  using (
    (select auth.role()) = 'service_role'
    or person_id in (
      select u.person_id from public.users u where u.auth_user_id = (select auth.uid())
    )
    or exists (
      select 1 from public.user_roles ur
      join public.users u on u.id = ur.user_id
      where u.auth_user_id = (select auth.uid())
        and ur.role in ('admin', 'pastor')
        and u.tenant_id = public.consents.tenant_id
    )
  );

-- 4.7 HOUSEHOLDS
drop policy if exists "households_select_policy" on public.households;
create policy "households_select_policy" on public.households
  for select
  using (
    (select auth.role()) = 'service_role'
    or id in (
      select p.household_id from public.persons p
      join public.users u on u.person_id = p.id
      where u.auth_user_id = (select auth.uid())
    )
    or exists (
      select 1 from public.user_roles ur
      join public.users u on u.id = ur.user_id
      where u.auth_user_id = (select auth.uid())
        and ur.role in ('admin', 'pastor', 'group_leader')
        and u.tenant_id = public.households.tenant_id
    )
  );

-- 4.8 BEACONS
drop policy if exists "beacons_select_policy" on public.beacons;
create policy "beacons_select_policy" on public.beacons
  for select
  using (true);

-- 4.9 FUNDS
drop policy if exists "funds_select_policy" on public.funds;
create policy "funds_select_policy" on public.funds
  for select
  using (active = true or (select auth.role()) = 'service_role');

-- 4.10 DONATIONS
drop policy if exists "donations_select_policy" on public.donations;
create policy "donations_select_policy" on public.donations
  for select
  using (
    (select auth.role()) = 'service_role'
    or person_id in (
      select u.person_id from public.users u where u.auth_user_id = (select auth.uid())
    )
    or exists (
      select 1 from public.user_roles ur
      join public.users u on u.id = ur.user_id
      where u.auth_user_id = (select auth.uid())
        and ur.role in ('admin', 'pastor', 'finance')
        and u.tenant_id = public.donations.tenant_id
    )
  );

drop policy if exists "donations_insert_policy" on public.donations;
create policy "donations_insert_policy" on public.donations
  for insert
  with check (
    (select auth.role()) = 'service_role'
    or (select auth.role()) = 'authenticated'
  );

-- 4.11 FOLLOWUP_TASKS (uses followup_tasks.assigned_to -> public.users.id)
drop policy if exists "followup_tasks_select_policy" on public.followup_tasks;
create policy "followup_tasks_select_policy" on public.followup_tasks
  for select
  using (
    (select auth.role()) = 'service_role'
    or assigned_to in (
      select u.id from public.users u where u.auth_user_id = (select auth.uid())
    )
    or exists (
      select 1 from public.user_roles ur
      join public.users u on u.id = ur.user_id
      where u.auth_user_id = (select auth.uid())
        and ur.role in ('admin', 'pastor', 'group_leader')
        and u.tenant_id = public.followup_tasks.tenant_id
    )
  );

drop policy if exists "followup_tasks_update_policy" on public.followup_tasks;
create policy "followup_tasks_update_policy" on public.followup_tasks
  for update
  using (
    (select auth.role()) = 'service_role'
    or assigned_to in (
      select u.id from public.users u where u.auth_user_id = (select auth.uid())
    )
    or exists (
      select 1 from public.user_roles ur
      join public.users u on u.id = ur.user_id
      where u.auth_user_id = (select auth.uid())
        and ur.role in ('admin', 'pastor')
        and u.tenant_id = public.followup_tasks.tenant_id
    )
  );

-- 4.12 PASTORAL_NOTES (uses pastoral_notes.author_id -> public.users.id)
drop policy if exists "pastoral_notes_select_policy" on public.pastoral_notes;
create policy "pastoral_notes_select_policy" on public.pastoral_notes
  for select
  using (
    (select auth.role()) = 'service_role'
    or author_id in (
      select u.id from public.users u where u.auth_user_id = (select auth.uid())
    )
    or exists (
      select 1 from public.user_roles ur
      join public.users u on u.id = ur.user_id
      where u.auth_user_id = (select auth.uid())
        and ur.role in ('admin', 'pastor')
        and u.tenant_id = public.pastoral_notes.tenant_id
    )
  );

drop policy if exists "pastoral_notes_insert_policy" on public.pastoral_notes;
create policy "pastoral_notes_insert_policy" on public.pastoral_notes
  for insert
  with check (
    (select auth.role()) = 'service_role'
    or exists (
      select 1 from public.user_roles ur
      join public.users u on u.id = ur.user_id
      where u.auth_user_id = (select auth.uid())
        and ur.role in ('admin', 'pastor')
        and u.tenant_id = public.pastoral_notes.tenant_id
    )
  );

-- 4.13 ATTENDANCE_SIGNALS
drop policy if exists "signals_insert_client" on public.attendance_signals;
create policy "signals_insert_client" on public.attendance_signals
  for insert
  with check (
    (select auth.role()) = 'service_role'
    or (select auth.role()) = 'authenticated'
  );

-- 4.14 AUDIT_LOGS
drop policy if exists "audit_logs_select_admin" on public.audit_logs;
create policy "audit_logs_select_admin" on public.audit_logs
  for select
  using (
    (select auth.role()) = 'service_role'
    or exists (
      select 1 from public.user_roles ur
      join public.users u on u.id = ur.user_id
      where u.auth_user_id = (select auth.uid())
        and ur.role = 'admin'
        and u.tenant_id = public.audit_logs.tenant_id
    )
  );

drop policy if exists "audit_logs_insert_all" on public.audit_logs;
create policy "audit_logs_insert_all" on public.audit_logs
  for insert
  with check (true);
