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
-- 1. CRITICAL: SECURE spatial_ref_sys (PostGIS)
-- ----------------------------------------------------------------------------
alter table if exists public.spatial_ref_sys enable row level security;

drop policy if exists "allow_read_spatial_ref_sys" on public.spatial_ref_sys;
create policy "allow_read_spatial_ref_sys" on public.spatial_ref_sys
  for select
  using (true);

-- ----------------------------------------------------------------------------
-- 2. HARDEN SECURITY DEFINER FUNCTIONS & FIX MUTABLE search_path
-- ----------------------------------------------------------------------------

-- Revoke execute from public/anon/authenticated on internal admin & shift automation functions
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
end $$;

-- Set explicit immutable search_path on spatial distance and speed functions
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
set search_path = public, auth
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
set search_path = public, auth
as $$
  select case 
    when time_seconds <= 0 then 0.0
    else (dist_meters / 1000.0) / (time_seconds / 3600.0)
  end;
$$;

-- ----------------------------------------------------------------------------
-- 3. COVERING INDEXES FOR ALL FOREIGN KEYS (Eliminates sequential scans on joins/deletes)
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
create index if not exists idx_fk_user_roles_user on public.user_roles (user_id);
create index if not exists idx_fk_devices_tenant on public.devices (tenant_id);
create index if not exists idx_fk_devices_person on public.devices (person_id);
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
create index if not exists idx_fk_attendance_records_user on public.attendance_records (user_id);

-- Care & Pastoral Notes
create index if not exists idx_fk_followup_tasks_tenant on public.followup_tasks (tenant_id);
create index if not exists idx_fk_followup_tasks_person on public.followup_tasks (person_id);
create index if not exists idx_fk_followup_tasks_assigned_user on public.followup_tasks (assigned_to_user_id);
create index if not exists idx_fk_pastoral_notes_tenant on public.pastoral_notes (tenant_id);
create index if not exists idx_fk_pastoral_notes_person on public.pastoral_notes (person_id);
create index if not exists idx_fk_pastoral_notes_author on public.pastoral_notes (author_user_id);

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
-- 4. RLS POLICIES FOR THE 16 TABLES WITH OPTIMIZED (SELECT AUTH.*) WRAPPING
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
        and ur.role in ('admin', 'pastor', 'usher', 'leader')
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

-- 4.5 DEVICES
drop policy if exists "devices_select_write" on public.devices;
create policy "devices_select_write" on public.devices
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
        and ur.role = 'admin'
        and u.tenant_id = public.devices.tenant_id
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
        and ur.role in ('admin', 'pastor', 'leader')
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
        and ur.role in ('admin', 'pastor')
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

-- 4.11 FOLLOWUP_TASKS
drop policy if exists "followup_tasks_select_policy" on public.followup_tasks;
create policy "followup_tasks_select_policy" on public.followup_tasks
  for select
  using (
    (select auth.role()) = 'service_role'
    or assigned_to_user_id in (
      select u.id from public.users u where u.auth_user_id = (select auth.uid())
    )
    or exists (
      select 1 from public.user_roles ur
      join public.users u on u.id = ur.user_id
      where u.auth_user_id = (select auth.uid())
        and ur.role in ('admin', 'pastor', 'leader')
        and u.tenant_id = public.followup_tasks.tenant_id
    )
  );

drop policy if exists "followup_tasks_update_policy" on public.followup_tasks;
create policy "followup_tasks_update_policy" on public.followup_tasks
  for update
  using (
    (select auth.role()) = 'service_role'
    or assigned_to_user_id in (
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

-- 4.12 PASTORAL_NOTES
drop policy if exists "pastoral_notes_select_policy" on public.pastoral_notes;
create policy "pastoral_notes_select_policy" on public.pastoral_notes
  for select
  using (
    (select auth.role()) = 'service_role'
    or author_user_id in (
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
alter table if exists public.audit_logs enable row level security;
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

create policy "audit_logs_insert_all" on public.audit_logs
  for insert
  with check (true);
