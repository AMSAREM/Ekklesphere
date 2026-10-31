-- ============================================================================
-- Supabase Multi-Tenant Migration Script
-- Migration: 20261030000004_ekklesphere_master_rls.sql
-- Description:
--   Applies tenant_id-scoped church tables and multi-tenant RLS policies for Ekklesphere.
--   Replaces psql '\ir' directive with pure, idempotent PostgreSQL DDL and RLS statements.
-- ============================================================================

-- 0. EXTENSIONS
create extension if not exists pgcrypto;
create extension if not exists postgis;
create extension if not exists citext;

-- ----------------------------------------------------------------------------
-- 1. TENANTS (CHURCH ORGANIZATIONS)
-- ----------------------------------------------------------------------------
create table if not exists public.tenants (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug citext unique not null,
  timezone text not null default 'Africa/Accra',
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.tenants enable row level security;

drop policy if exists "tenants_select" on public.tenants;
create policy "tenants_select" on public.tenants
  for select using (
    id = (auth.jwt() ->> 'tenant_id')::uuid 
    or (auth.jwt() ->> 'role') in ('super_admin', 'creator')
  );

drop policy if exists "tenants_admin_all" on public.tenants;
create policy "tenants_admin_all" on public.tenants
  for all using (
    (auth.jwt() ->> 'role') in ('super_admin', 'creator')
  );

-- ----------------------------------------------------------------------------
-- 2. CAMPUSES (WORSHIP AUDITORIUMS & GEOFENCES)
-- ----------------------------------------------------------------------------
create table if not exists public.campuses (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  name text not null,
  address text,
  center geography(point, 4326),
  latitude double precision,
  longitude double precision,
  inner_radius_m int not null default 100,
  outer_radius_m int not null default 300,
  dwell_time_minutes int not null default 15,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.campuses enable row level security;

drop policy if exists "campuses_tenant_isolation_select" on public.campuses;
create policy "campuses_tenant_isolation_select" on public.campuses
  for select using (
    tenant_id = (auth.jwt() ->> 'tenant_id')::uuid 
    or (auth.jwt() ->> 'role') in ('super_admin', 'creator')
  );

drop policy if exists "campuses_tenant_isolation_manage" on public.campuses;
create policy "campuses_tenant_isolation_manage" on public.campuses
  for all using (
    (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid and (auth.jwt() ->> 'role') in ('admin', 'pastor', 'super_admin', 'creator'))
    or (auth.jwt() ->> 'role') in ('super_admin', 'creator')
  );

-- ----------------------------------------------------------------------------
-- 3. USERS (STAFF, PASTORS, USHERS & CREATORS)
-- ----------------------------------------------------------------------------
create table if not exists public.users (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants(id) on delete cascade,
  campus_id uuid references public.campuses(id) on delete set null,
  email citext unique not null,
  role text not null check (role in ('super_admin', 'creator', 'admin', 'pastor', 'usher', 'member', 'group_leader', 'finance')),
  username citext unique,
  full_name text not null,
  status text not null default 'active' check (status in ('active', 'suspended', 'pending_reset')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.users enable row level security;

drop policy if exists "users_tenant_scoped_select" on public.users;
create policy "users_tenant_scoped_select" on public.users
  for select using (
    tenant_id = (auth.jwt() ->> 'tenant_id')::uuid 
    or id = (auth.jwt() ->> 'sub')::uuid
    or (auth.jwt() ->> 'role') in ('super_admin', 'creator')
  );

drop policy if exists "users_tenant_scoped_insert" on public.users;
create policy "users_tenant_scoped_insert" on public.users
  for insert with check (
    (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid and (auth.jwt() ->> 'role') in ('admin', 'pastor', 'super_admin', 'creator'))
    or (auth.jwt() ->> 'role') in ('super_admin', 'creator')
  );

drop policy if exists "users_tenant_scoped_update" on public.users;
create policy "users_tenant_scoped_update" on public.users
  for update using (
    (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid and (auth.jwt() ->> 'role') in ('admin', 'pastor', 'super_admin', 'creator'))
    or id = (auth.jwt() ->> 'sub')::uuid
    or (auth.jwt() ->> 'role') in ('super_admin', 'creator')
  );

drop policy if exists "users_tenant_scoped_delete" on public.users;
create policy "users_tenant_scoped_delete" on public.users
  for delete using (
    (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid and (auth.jwt() ->> 'role') in ('admin', 'super_admin', 'creator'))
    or (auth.jwt() ->> 'role') in ('super_admin', 'creator')
  );

-- ----------------------------------------------------------------------------
-- 4. PERSONS (CHURCH MEMBERSHIP ROSTER & 28 PROFILE FIELDS)
-- ----------------------------------------------------------------------------
create table if not exists public.persons (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  first_name text not null,
  middle_name text,
  last_name text not null,
  specific_location text,
  remarks text,
  member_id text,
  squads text,
  department text,
  officer_name text,
  gender text check (gender in ('male', 'female', 'other')),
  date_of_birth date,
  phone_e164 text,
  place_of_residence text,
  residential_digital_address text,
  hometown text,
  occupation text,
  home_cell_group text,
  group_name text,
  month_of_birth text,
  marital_status text,
  spouse_name text,
  number_of_children int default 0,
  emergency_contact_person text,
  emergency_contact_phone text,
  image_url text,
  date_of_baptism date,
  date_of_marriage date,
  date_of_salvation date,
  date_of_membership date,
  email citext,
  preferred_name text,
  status text not null default 'member' check (status in ('visitor', 'member', 'inactive', 'transferred', 'deceased')),
  household_role text check (household_role in ('head', 'spouse', 'child', 'other')),
  auto_checkin_opted_in boolean not null default true,
  avatar_initials text,
  joined_on date default current_date,
  consecutive_absences int not null default 0,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.persons enable row level security;

drop policy if exists "persons_tenant_isolation_select" on public.persons;
create policy "persons_tenant_isolation_select" on public.persons
  for select using (
    tenant_id = (auth.jwt() ->> 'tenant_id')::uuid 
    or (auth.jwt() ->> 'role') in ('super_admin', 'creator')
  );

drop policy if exists "persons_tenant_isolation_insert" on public.persons;
create policy "persons_tenant_isolation_insert" on public.persons
  for insert with check (
    (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid and (auth.jwt() ->> 'role') in ('admin', 'pastor', 'usher', 'super_admin', 'creator'))
    or (auth.jwt() ->> 'role') in ('super_admin', 'creator')
  );

drop policy if exists "persons_tenant_isolation_update" on public.persons;
create policy "persons_tenant_isolation_update" on public.persons
  for update using (
    (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid and (auth.jwt() ->> 'role') in ('admin', 'pastor', 'usher', 'super_admin', 'creator'))
    or (auth.jwt() ->> 'role') in ('super_admin', 'creator')
  );

drop policy if exists "persons_tenant_isolation_delete" on public.persons;
create policy "persons_tenant_isolation_delete" on public.persons
  for delete using (
    (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid and (auth.jwt() ->> 'role') in ('admin', 'pastor', 'super_admin', 'creator'))
    or (auth.jwt() ->> 'role') in ('super_admin', 'creator')
  );

-- ----------------------------------------------------------------------------
-- 5. SERVICES & SERVICE INSTANCES (WORSHIP GATHERINGS)
-- ----------------------------------------------------------------------------
create table if not exists public.services (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  campus_id uuid not null references public.campuses(id) on delete cascade,
  name text not null,
  kind text not null default 'service' check (kind in ('service', 'event', 'group_meeting')),
  start_time text not null,
  duration_min int not null default 90,
  window_before_min int not null default 60,
  window_after_min int not null default 60,
  dwell_min int not null default 15,
  expected_attendance int not null default 200,
  created_at timestamptz not null default now()
);

create table if not exists public.service_instances (
  id uuid primary key default gen_random_uuid(),
  service_id uuid references public.services(id) on delete set null,
  campus_id uuid not null references public.campuses(id) on delete cascade,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  name text not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status text not null default 'scheduled' check (status in ('scheduled', 'open', 'closed', 'cancelled')),
  expected_attendance int not null default 200,
  created_at timestamptz not null default now()
);

alter table public.services enable row level security;
alter table public.service_instances enable row level security;

drop policy if exists "services_tenant_select" on public.services;
create policy "services_tenant_select" on public.services
  for select using (
    tenant_id = (auth.jwt() ->> 'tenant_id')::uuid 
    or (auth.jwt() ->> 'role') in ('super_admin', 'creator')
  );

drop policy if exists "service_instances_tenant_select" on public.service_instances;
create policy "service_instances_tenant_select" on public.service_instances
  for select using (
    tenant_id = (auth.jwt() ->> 'tenant_id')::uuid 
    or (auth.jwt() ->> 'role') in ('super_admin', 'creator')
  );

-- ----------------------------------------------------------------------------
-- 6. ATTENDANCE RECORDS (LIVE CHECK-INS & USHER RADAR)
-- ----------------------------------------------------------------------------
create table if not exists public.attendance_records (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  person_id uuid not null references public.persons(id) on delete cascade,
  service_instance_id uuid not null references public.service_instances(id) on delete cascade,
  campus_id uuid not null references public.campuses(id) on delete cascade,
  method text not null check (method in ('usher', 'posted_qr', 'beacon', 'geofence', 'email_link', 'manual')),
  confidence int not null default 100 check (confidence between 0 and 100),
  checked_in_at timestamptz not null default now(),
  departed_at timestamptz,
  late boolean not null default false,
  recorded_by text,
  note text,
  created_at timestamptz not null default now()
);

alter table public.attendance_records enable row level security;

drop policy if exists "attendance_tenant_isolation_select" on public.attendance_records;
create policy "attendance_tenant_isolation_select" on public.attendance_records
  for select using (
    tenant_id = (auth.jwt() ->> 'tenant_id')::uuid 
    or (auth.jwt() ->> 'role') in ('super_admin', 'creator')
  );

drop policy if exists "attendance_tenant_isolation_insert" on public.attendance_records;
create policy "attendance_tenant_isolation_insert" on public.attendance_records
  for insert with check (
    (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid and (auth.jwt() ->> 'role') in ('admin', 'pastor', 'usher', 'super_admin', 'creator'))
    or (auth.jwt() ->> 'role') in ('super_admin', 'creator')
  );

drop policy if exists "attendance_tenant_isolation_update" on public.attendance_records;
create policy "attendance_tenant_isolation_update" on public.attendance_records
  for update using (
    (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid and (auth.jwt() ->> 'role') in ('admin', 'pastor', 'usher', 'super_admin', 'creator'))
    or (auth.jwt() ->> 'role') in ('super_admin', 'creator')
  );

drop policy if exists "attendance_tenant_isolation_delete" on public.attendance_records;
create policy "attendance_tenant_isolation_delete" on public.attendance_records
  for delete using (
    (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid and (auth.jwt() ->> 'role') in ('admin', 'pastor', 'super_admin', 'creator'))
    or (auth.jwt() ->> 'role') in ('super_admin', 'creator')
  );

-- ----------------------------------------------------------------------------
-- 7. DONATIONS & TITHING
-- ----------------------------------------------------------------------------
create table if not exists public.donations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  person_id uuid references public.persons(id) on delete set null,
  fund_name text not null,
  amount_minor bigint not null,
  currency text not null default 'GHS',
  method text not null check (method in ('momo', 'card', 'cash', 'bank')),
  provider text not null,
  status text not null default 'paid' check (status in ('pending', 'paid', 'failed')),
  paid_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

alter table public.donations enable row level security;

drop policy if exists "donations_tenant_isolation_select" on public.donations;
create policy "donations_tenant_isolation_select" on public.donations
  for select using (
    tenant_id = (auth.jwt() ->> 'tenant_id')::uuid 
    or (auth.jwt() ->> 'role') in ('super_admin', 'creator')
  );

drop policy if exists "donations_tenant_isolation_insert" on public.donations;
create policy "donations_tenant_isolation_insert" on public.donations
  for insert with check (
    (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid and (auth.jwt() ->> 'role') in ('admin', 'pastor', 'finance', 'super_admin', 'creator'))
    or (auth.jwt() ->> 'role') in ('super_admin', 'creator')
  );

-- ----------------------------------------------------------------------------
-- 8. SYSTEM SETTINGS & CHURCH PREMISE GPS
-- ----------------------------------------------------------------------------
create table if not exists public.system_settings (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants(id) on delete cascade,
  church_name text not null,
  campus_name text,
  campus_address text,
  campus_latitude double precision,
  campus_longitude double precision,
  campus_location_accuracy_m double precision,
  campus_location_updated_at timestamptz,
  senior_pastor text,
  contact_email text,
  contact_phone text,
  timezone text default 'Africa/Accra',
  currency text default 'GHS',
  outer_geofence_meters int default 300,
  inner_geofence_meters int default 100,
  dwell_time_minutes int default 15,
  service_window_before_minutes int default 60,
  service_window_after_minutes int default 60,
  ble_beacon_rssi_threshold int default -75,
  drive_by_protection boolean default true,
  absentee_threshold_services int default 3,
  first_timer_followup_hours int default 24,
  auto_assign_cell_leaders boolean default true,
  require_explicit_consent boolean default true,
  sms_gateway_provider text default 'Arkesel SMS Ghana',
  sms_sender_id text default 'EKKLESPHERE',
  enable_push_notifications boolean default true,
  updated_at timestamptz not null default now()
);

alter table public.system_settings enable row level security;

drop policy if exists "system_settings_select" on public.system_settings;
create policy "system_settings_select" on public.system_settings
  for select using (true);

drop policy if exists "system_settings_update" on public.system_settings;
create policy "system_settings_update" on public.system_settings
  for all using (
    (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid and (auth.jwt() ->> 'role') in ('admin', 'pastor', 'super_admin', 'creator'))
    or (auth.jwt() ->> 'role') in ('super_admin', 'creator')
  );

-- ----------------------------------------------------------------------------
-- 9. LICENSES & VENDOR ACCESS
-- ----------------------------------------------------------------------------
create table if not exists public.licenses (
  id uuid primary key default gen_random_uuid(),
  key text unique not null,
  tier text not null default 'grace_starter' check (tier in ('grace_starter', 'ministry_pro', 'cathedral_enterprise')),
  tenant_id uuid references public.tenants(id) on delete cascade,
  seats_limit int not null default 500,
  status text not null default 'active' check (status in ('active', 'expired', 'revoked', 'grace_period')),
  issued_date timestamptz not null default now(),
  expires_date timestamptz not null default now() + interval '1 year',
  billing_cycle text not null default 'annual' check (billing_cycle in ('monthly', 'annual', 'lifetime')),
  annual_cost_usd numeric not null default 0,
  enabled_features jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.licenses enable row level security;

drop policy if exists "licenses_tenant_isolation_select" on public.licenses;
create policy "licenses_tenant_isolation_select" on public.licenses
  for select using (
    tenant_id = (auth.jwt() ->> 'tenant_id')::uuid 
    or (auth.jwt() ->> 'role') in ('super_admin', 'creator')
  );

drop policy if exists "licenses_creator_manage" on public.licenses;
create policy "licenses_creator_manage" on public.licenses
  for all using (
    (auth.jwt() ->> 'role') in ('super_admin', 'creator')
  );
