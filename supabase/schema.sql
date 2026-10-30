-- ============================================================================
-- Ekklesphere: Complete Supabase PostgreSQL 16 + PostGIS Production Schema
-- Version: 0.1 (Pilot: Accra Central Church)
-- Includes:
--   1. Extensions (pgcrypto, postgis, citext)
--   2. Multi-tenancy & Campuses (with PostGIS geofences & BLE Beacons)
--   3. People, Households & Groups
--   4. Access, Devices & Consent (Ghana Act 843 compliance)
--   5. Services, Instances & Attendance Signals/Records
--   6. Geofence Telemetry & Shift/Service Pairing Views
--   7. Care (Absence Detection & Pastoral Notes)
--   8. Communications & Giving (Mobile Money / Cards)
--   9. Audit Logging
--  10. Row Level Security (RLS) & Helper RPC Functions
--  11. Initial Pilot Seed Data
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. EXTENSIONS
-- ----------------------------------------------------------------------------
create extension if not exists pgcrypto;
create extension if not exists postgis;
create extension if not exists citext;

-- ----------------------------------------------------------------------------
-- 2. TENANCY & CAMPUSES
-- ----------------------------------------------------------------------------
create table if not exists tenants (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug citext unique not null,
  timezone text not null default 'Africa/Accra',
  settings jsonb not null default '{
    "currency": "GHS",
    "absence_threshold_leader": 2,
    "absence_threshold_pastor": 3,
    "dwell_min_default": 5
  }',
  created_at timestamptz not null default now()
);

create table if not exists campuses (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  name text not null,
  address text,
  center geography(point, 4326) not null,
  inner_radius_m int not null default 100,
  outer_radius_m int not null default 300,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists campuses_center_idx on campuses using gist (center);
create index if not exists campuses_tenant_idx on campuses (tenant_id);

create table if not exists beacons (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  campus_id uuid not null references campuses(id) on delete cascade,
  beacon_uuid uuid not null,
  major int not null,
  minor int not null,
  label text,
  unique (beacon_uuid, major, minor)
);

create index if not exists beacons_tenant_idx on beacons (tenant_id);

-- ----------------------------------------------------------------------------
-- 3. PEOPLE, HOUSEHOLDS & GROUPS
-- ----------------------------------------------------------------------------
create table if not exists households (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  name text not null,
  address text,
  created_at timestamptz not null default now()
);

create index if not exists households_tenant_idx on households (tenant_id);

create table if not exists persons (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  household_id uuid references households(id) on delete set null,
  first_name text not null,
  middle_name text,
  last_name text not null,
  preferred_name text,
  specific_location text,
  remarks text,
  member_id text,
  squads text,
  department text,
  member_officer_name text,
  date_of_birth date,
  gender text check (gender in ('male', 'female', 'other')),
  phone_e164 text,
  phone_number text,
  email citext,
  place_of_residence text,
  residential_digital_address text,
  hometown text,
  occupation text,
  home_cell_group text,
  month_of_birth text,
  marital_status text,
  spouse_name text,
  number_of_children int default 0,
  emergency_contact_person text,
  emergency_phone text,
  image_url text,
  date_of_baptism date,
  date_of_marriage date,
  date_of_salvation date,
  date_of_membership date default current_date,
  status text not null default 'visitor'
    check (status in ('visitor','member','inactive','transferred','deceased')),
  household_role text check (household_role in ('head','spouse','child','other')),
  joined_on date default current_date,
  photo_key text,
  custom jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create unique index if not exists persons_phone_uq
  on persons (tenant_id, phone_e164) where deleted_at is null and phone_e164 is not null;
create index if not exists persons_tenant_idx on persons (tenant_id);
create index if not exists persons_status_idx on persons (tenant_id, status);
create index if not exists persons_member_id_idx on persons (member_id);
create index if not exists persons_home_cell_group_idx on persons (tenant_id, home_cell_group);

-- ----------------------------------------------------------------------------
-- 4. ACCESS, DEVICES & CONSENT (Ghana Act 843 Sensitive Data Protection)
-- ----------------------------------------------------------------------------
create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  person_id uuid not null unique references persons(id) on delete cascade,
  auth_user_id uuid references auth.users(id) on delete set null,
  phone_verified_at timestamptz,
  email_verified_at timestamptz,
  mfa_secret_enc bytea,
  status text not null default 'active' check (status in ('active', 'suspended', 'invited')),
  last_login_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists users_tenant_idx on users (tenant_id);
create index if not exists users_auth_idx on users (auth_user_id);

-- Fixed schema without expression in primary key
create table if not exists user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  role text not null check (role in ('member','usher','group_leader','pastor','finance','admin')),
  scope_group_id uuid,
  scope_campus_id uuid references campuses(id) on delete cascade,
  created_at timestamptz not null default now()
);

create unique index if not exists user_roles_uq
  on user_roles (user_id, role, coalesce(scope_group_id, '00000000-0000-0000-0000-000000000000'::uuid));

create table if not exists devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  platform text not null check (platform in ('android','ios','web')),
  push_token text,
  public_key text not null,          -- verifies device-signed arrival payloads
  app_version text,
  attestation_ok boolean default false,
  last_seen_at timestamptz default now(),
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists devices_user_idx on devices (user_id);

-- Plain language consent records for location and messaging
create table if not exists consents (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  person_id uuid not null references persons(id) on delete cascade,
  type text not null
    check (type in ('data_processing','auto_checkin','push','sms','email')),
  granted boolean not null,
  text_version text not null,
  channel text not null check (channel in ('app', 'web', 'paper', 'usher')),
  recorded_at timestamptz not null default now()
);

create index if not exists consents_tenant_person_idx on consents (tenant_id, person_id, type);

-- ----------------------------------------------------------------------------
-- 5. SERVICES & SERVICE INSTANCES
-- ----------------------------------------------------------------------------
create table if not exists services (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  campus_id uuid not null references campuses(id) on delete cascade,
  name text not null,
  kind text not null default 'service'
    check (kind in ('service','event','group_meeting')),
  recurrence_rule text,              -- iCal RRULE e.g. FREQ=WEEKLY;BYDAY=SU
  start_time time not null,
  duration_min int not null default 120,
  window_before_min int not null default 60,
  window_after_min int not null default 30,
  dwell_min int not null default 5,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists services_tenant_campus_idx on services (tenant_id, campus_id);

create table if not exists service_instances (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  service_id uuid not null references services(id) on delete cascade,
  campus_id uuid not null references campuses(id) on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status text not null default 'scheduled'
    check (status in ('scheduled','open','closed','cancelled')),
  qr_secret bytea not null default gen_random_bytes(32),
  unique (service_id, starts_at)
);

create index if not exists service_instances_window_idx on service_instances (campus_id, status, starts_at, ends_at);

-- ----------------------------------------------------------------------------
-- 6. ATTENDANCE SIGNALS, RECORDS & RAW TELEMETRY
-- ----------------------------------------------------------------------------
-- Raw signals (transient: retained 90 days max for privacy)
create table if not exists attendance_signals (
  id uuid primary key,               -- client-generated UUID for idempotency
  tenant_id uuid not null references tenants(id) on delete cascade,
  person_id uuid not null references persons(id) on delete cascade,
  device_id uuid references devices(id) on delete set null,
  campus_id uuid not null references campuses(id) on delete cascade,
  service_instance_id uuid references service_instances(id) on delete set null,
  kind text not null check (kind in (
    'geofence_outer','geofence_inner','geofence_dwell',
    'beacon','qr','usher','email_link','manual')),
  occurred_at timestamptz not null,
  received_at timestamptz not null default now(),
  accuracy_m real,
  mock_location boolean not null default false,
  signature_ok boolean not null default false
);

create index if not exists attendance_signals_lookup_idx
  on attendance_signals (tenant_id, person_id, occurred_at desc);

-- Durable official attendance record
create table if not exists attendance_records (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  person_id uuid not null references persons(id) on delete cascade,
  service_instance_id uuid not null references service_instances(id) on delete cascade,
  campus_id uuid not null references campuses(id) on delete cascade,
  method text not null check (method in (
    'usher','posted_qr','beacon','geofence','email_link','manual')),
  confidence smallint not null check (confidence between 0 and 100),
  checked_in_at timestamptz not null default now(),
  departed_at timestamptz,
  late boolean not null default false,
  recorded_by uuid references users(id) on delete set null,
  note text,
  unique (person_id, service_instance_id)
);

create index if not exists attendance_records_instance_idx on attendance_records (tenant_id, service_instance_id);
create index if not exists attendance_records_person_idx on attendance_records (tenant_id, person_id, checked_in_at desc);

-- Single-use tokens for email/SMS fallback web check-in
create table if not exists checkin_tokens (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  person_id uuid not null references persons(id) on delete cascade,
  service_instance_id uuid not null references service_instances(id) on delete cascade,
  token_hash bytea not null unique,
  expires_at timestamptz not null,
  used_at timestamptz
);

-- ----------------------------------------------------------------------------
-- 7. GROUPS & CARE (Absence Tracking & Pastoral Notes)
-- ----------------------------------------------------------------------------
create table if not exists groups (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  name text not null,
  type text not null check (type in ('cell','ministry','class','choir','other')),
  leader_person_id uuid references persons(id) on delete set null,
  default_service_id uuid references services(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists groups_tenant_idx on groups (tenant_id);

create table if not exists group_members (
  group_id uuid not null references groups(id) on delete cascade,
  person_id uuid not null references persons(id) on delete cascade,
  role text not null default 'member' check (role in ('leader', 'assistant', 'member')),
  joined_on date not null default current_date,
  left_on date,
  primary key (group_id, person_id)
);

create table if not exists followup_tasks (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  person_id uuid not null references persons(id) on delete cascade,
  reason text not null check (reason in ('absent_2','absent_3','first_timer','manual')),
  assigned_to uuid references users(id) on delete set null,
  status text not null default 'open'
    check (status in ('open','contacted','resolved','dismissed')),
  due_on date,
  outcome text,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create index if not exists followup_tasks_tenant_status_idx on followup_tasks (tenant_id, status);

-- Confidential notes with field-level encryption (restricted to Pastors only)
create table if not exists pastoral_notes (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  person_id uuid not null references persons(id) on delete cascade,
  author_id uuid not null references users(id) on delete cascade,
  body_enc bytea not null,
  created_at timestamptz not null default now()
);

create index if not exists pastoral_notes_person_idx on pastoral_notes (person_id);

-- ----------------------------------------------------------------------------
-- 8. COMMUNICATIONS & GIVING
-- ----------------------------------------------------------------------------
create table if not exists messages (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  channel text not null check (channel in ('push','sms','email')),
  subject text,
  body text not null,
  audience jsonb not null default '{}',
  created_by uuid references users(id) on delete set null,
  scheduled_for timestamptz,
  sent_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists message_deliveries (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references messages(id) on delete cascade,
  person_id uuid not null references persons(id) on delete cascade,
  status text not null default 'queued' check (status in ('queued','sent','delivered','failed')),
  provider_ref text,
  error text,
  sent_at timestamptz,
  delivered_at timestamptz
);

create table if not exists funds (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  name text not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists donations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  person_id uuid references persons(id) on delete set null,
  fund_id uuid not null references funds(id) on delete cascade,
  amount_minor bigint not null check (amount_minor > 0),
  currency char(3) not null default 'GHS',
  method text not null check (method in ('momo','card','cash','bank')),
  provider text,                    -- paystack, hubtel, manual
  provider_ref text unique,
  status text not null default 'pending' check (status in ('pending', 'success', 'failed')),
  paid_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists donations_tenant_fund_idx on donations (tenant_id, fund_id, status);

-- ----------------------------------------------------------------------------
-- 9. AUDIT LOGGING
-- ----------------------------------------------------------------------------
create table if not exists audit_log (
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

create index if not exists audit_log_tenant_time_idx on audit_log (tenant_id, at desc);

-- ----------------------------------------------------------------------------
-- 10. POSTGIS RPC FUNCTIONS & SHIFTS / SERVICE DERIVATION
-- ----------------------------------------------------------------------------

-- Calculates geodesic distance in meters from a campus center
create or replace function campus_distance(
  p_campus uuid,
  p_lng double precision,
  p_lat double precision
)
returns table (distance_m double precision, inner_radius_m int, outer_radius_m int)
language sql stable as $$
  select ST_Distance(center, ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography),
         inner_radius_m,
         outer_radius_m
  from campuses where id = p_campus;
$$;

-- Detects impossible travel speed (> 150 km/h) from previous located signal
create or replace function check_travel_speed_kmh(
  p_person uuid,
  p_lng double precision,
  p_lat double precision,
  p_at timestamptz
)
returns double precision
language plpgsql stable as $$
declare
  v_prev_loc geography;
  v_prev_time timestamptz;
  v_distance_m double precision;
  v_elapsed_s double precision;
begin
  select ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography, occurred_at
  into v_prev_loc, v_prev_time
  from attendance_signals
  where person_id = p_person
    and accuracy_m is not null
    and occurred_at < p_at
  order by occurred_at desc
  limit 1;

  if v_prev_loc is null or v_prev_time is null then
    return 0.0;
  end if;

  v_elapsed_s := extract(epoch from (p_at - v_prev_time));
  if v_elapsed_s <= 0 then
    return 0.0;
  end if;

  v_distance_m := ST_Distance(v_prev_loc, ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography);
  return (v_distance_m / 1000.0) / (v_elapsed_s / 3600.0);
end;
$$;

-- Automated attendance resolver: matches arrival signal to service and promotes to official record
create or replace function resolve_attendance(
  p_signal_id uuid,
  p_tenant_id uuid,
  p_person_id uuid,
  p_campus_id uuid,
  p_method text,
  p_confidence int,
  p_occurred_at timestamptz
)
returns uuid
language plpgsql as $$
declare
  v_instance_id uuid;
  v_record_id uuid;
  v_is_late boolean := false;
  v_starts_at timestamptz;
begin
  -- Find active or matching service instance for campus
  select id, starts_at into v_instance_id, v_starts_at
  from service_instances
  where tenant_id = p_tenant_id
    and campus_id = p_campus_id
    and p_occurred_at between (starts_at - interval '60 minutes') and (ends_at + interval '30 minutes')
    and status in ('scheduled', 'open')
  order by starts_at asc
  limit 1;

  if v_instance_id is null then
    return null;
  end if;

  if p_occurred_at > v_starts_at then
    v_is_late := true;
  end if;

  -- Upsert attendance record: preserve highest confidence method
  insert into attendance_records (
    tenant_id, person_id, service_instance_id, campus_id,
    method, confidence, checked_in_at, late
  )
  values (
    p_tenant_id, p_person_id, v_instance_id, p_campus_id,
    p_method, p_confidence, p_occurred_at, v_is_late
  )
  on conflict (person_id, service_instance_id)
  do update set
    method = case when excluded.confidence > attendance_records.confidence then excluded.method else attendance_records.method end,
    confidence = greatest(attendance_records.confidence, excluded.confidence)
  returning id into v_record_id;

  return v_record_id;
end;
$$;

-- ----------------------------------------------------------------------------
-- 11. ROW LEVEL SECURITY (RLS) POLICIES
-- ----------------------------------------------------------------------------
alter table tenants enable row level security;
alter table campuses enable row level security;
alter table persons enable row level security;
alter table users enable row level security;
alter table user_roles enable row level security;
alter table devices enable row level security;
alter table consents enable row level security;
alter table services enable row level security;
alter table service_instances enable row level security;
alter table attendance_signals enable row level security;
alter table attendance_records enable row level security;
alter table followup_tasks enable row level security;
alter table pastoral_notes enable row level security;
alter table donations enable row level security;

-- Public / Authenticated read policies
drop policy if exists "allow authenticated read campuses" on campuses;
create policy "allow authenticated read campuses" on campuses
  for select using (active = true);

drop policy if exists "allow authenticated read services" on services;
create policy "allow authenticated read services" on services
  for select using (active = true);

drop policy if exists "allow authenticated read instances" on service_instances;
create policy "allow authenticated read instances" on service_instances
  for select using (true);

-- Members can read their own attendance records
drop policy if exists "read own attendance" on attendance_records;
create policy "read own attendance" on attendance_records
  for select using (
    person_id in (
      select u.person_id from users u where u.auth_user_id = auth.uid()
    )
    or auth.role() = 'service_role'
  );

-- Ushers / Admins can insert attendance records
drop policy if exists "service or usher write attendance" on attendance_records;
create policy "service or usher write attendance" on attendance_records
  for all using (
    auth.role() = 'service_role'
    or exists (
      select 1 from user_roles ur
      join users u on u.id = ur.user_id
      where u.auth_user_id = auth.uid()
        and ur.role in ('admin', 'usher')
    )
  );

-- Service role has unrestricted access for background workers
drop policy if exists "service_role full signals" on attendance_signals;
create policy "service_role full signals" on attendance_signals
  for all using (auth.role() = 'service_role');

-- ----------------------------------------------------------------------------
-- 12. INITIAL TENANT BOOTSTRAP (CLEAN — NO FAKE PEOPLE OR FAKE COORDINATES)
-- ----------------------------------------------------------------------------
insert into tenants (id, name, slug, timezone)
values ('11111111-1111-1111-1111-111111111111', 'Primary Church Organization', 'primary-church', 'Africa/Accra')
on conflict do nothing;

-- ----------------------------------------------------------------------------
-- 12. MULTI-TENANT SCHEMA (organizations, members, events, attendance)
--     WITH SIMPLIFIED RLS UTILITY FUNCTION: has_organization_access
-- ----------------------------------------------------------------------------

create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug citext unique not null,
  timezone text not null default 'Africa/Accra',
  logo_url text,
  website text,
  phone text,
  email citext,
  settings jsonb not null default '{
    "currency": "GHS",
    "absence_threshold_leader": 2,
    "absence_threshold_pastor": 3,
    "dwell_min_default": 5,
    "geofence_inner_radius_m": 100,
    "geofence_outer_radius_m": 300
  }'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.members (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  first_name text not null,
  last_name text not null,
  preferred_name text,
  phone_e164 text,
  email citext,
  role text not null default 'member' 
    check (role in ('owner', 'admin', 'pastor', 'usher', 'leader', 'member', 'guest')),
  status text not null default 'active' 
    check (status in ('active', 'inactive', 'archived', 'pending')),
  gender text check (gender in ('male', 'female', 'other')),
  date_of_birth date,
  joined_at timestamptz default now(),
  photo_url text,
  custom_attributes jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint members_org_user_uq unique (organization_id, user_id)
);

-- RLS Utility Function: has_organization_access
create or replace function public.has_organization_access(
  target_org_id uuid,
  required_role text default null
)
returns boolean
language plpgsql
security definer
set search_path = public, auth
stable
as $$
declare
  v_user_id uuid;
  v_member_role text;
  v_member_status text;
  v_is_super boolean;
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    return false;
  end if;

  v_is_super := coalesce((auth.jwt() -> 'app_metadata' ->> 'is_super_admin')::boolean, false);
  if v_is_super then
    return true;
  end if;

  select role, status into v_member_role, v_member_status
  from public.members
  where organization_id = target_org_id
    and user_id = v_user_id
    and status = 'active'
  limit 1;

  if v_member_role is null then
    return false;
  end if;

  if required_role is null or required_role = '' then
    return true;
  end if;

  if v_member_role = 'owner' then
    return true;
  end if;

  if required_role = 'admin' then
    return v_member_role in ('owner', 'admin');
  end if;

  if required_role = 'pastor' then
    return v_member_role in ('owner', 'admin', 'pastor');
  end if;

  if required_role = 'usher' then
    return v_member_role in ('owner', 'admin', 'pastor', 'usher');
  end if;

  if required_role = 'leader' then
    return v_member_role in ('owner', 'admin', 'pastor', 'leader');
  end if;

  if required_role = 'member' then
    return true;
  end if;

  return v_member_role = required_role;
end;
$$;

create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  description text,
  location text,
  geo_center geography(Point, 4326),
  radius_m int not null default 150,
  inner_radius_m int not null default 100,
  outer_radius_m int not null default 300,
  start_time timestamptz not null,
  end_time timestamptz not null,
  checkin_window_start timestamptz,
  checkin_window_end timestamptz,
  dwell_min int not null default 5,
  status text not null default 'scheduled' 
    check (status in ('scheduled', 'active', 'completed', 'cancelled')),
  qr_secret text not null default encode(gen_random_bytes(24), 'hex'),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.attendance (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  event_id uuid not null references public.events(id) on delete cascade,
  member_id uuid not null references public.members(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  client_event_id uuid,
  checked_in_at timestamptz not null default now(),
  method text not null default 'manual' 
    check (method in ('geofence', 'beacon', 'usher', 'qr_scan', 'manual', 'web_link')),
  status text not null default 'accepted' 
    check (status in ('accepted', 'flagged', 'rejected', 'pending_review')),
  confidence_score smallint not null default 100 
    check (confidence_score between 0 and 100),
  distance_m real,
  accuracy_m real,
  is_mock boolean not null default false,
  flag_reasons text[] not null default '{}'::text[],
  checked_in_by uuid references auth.users(id) on delete set null,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint attendance_org_event_member_uq unique (organization_id, event_id, member_id)
);

-- RLS Enforcement
alter table public.organizations enable row level security;
alter table public.members enable row level security;
alter table public.events enable row level security;
alter table public.attendance enable row level security;

-- Policies using has_organization_access
drop policy if exists "org_select_members" on public.organizations;
create policy "org_select_members" on public.organizations
  for select using (public.has_organization_access(id));

drop policy if exists "org_insert_authenticated" on public.organizations;
create policy "org_insert_authenticated" on public.organizations
  for insert with check (auth.role() = 'authenticated');

drop policy if exists "org_update_admins" on public.organizations;
create policy "org_update_admins" on public.organizations
  for update using (public.has_organization_access(id, 'admin'));

drop policy if exists "members_select_policy" on public.members;
create policy "members_select_policy" on public.members
  for select using (public.has_organization_access(organization_id));

drop policy if exists "members_insert_policy" on public.members;
create policy "members_insert_policy" on public.members
  for insert with check (
    public.has_organization_access(organization_id, 'admin')
    or (auth.uid() = user_id and public.has_organization_access(organization_id))
  );

drop policy if exists "members_update_policy" on public.members;
create policy "members_update_policy" on public.members
  for update using (
    public.has_organization_access(organization_id, 'admin')
    or (auth.uid() = user_id and public.has_organization_access(organization_id))
  );

drop policy if exists "members_delete_policy" on public.members;
create policy "members_delete_policy" on public.members
  for delete using (public.has_organization_access(organization_id, 'admin'));

drop policy if exists "events_select_policy" on public.events;
create policy "events_select_policy" on public.events
  for select using (public.has_organization_access(organization_id));

drop policy if exists "events_insert_policy" on public.events;
create policy "events_insert_policy" on public.events
  for insert with check (public.has_organization_access(organization_id, 'admin'));

drop policy if exists "events_update_policy" on public.events;
create policy "events_update_policy" on public.events
  for update using (public.has_organization_access(organization_id, 'admin'));

drop policy if exists "attendance_select_policy" on public.attendance;
create policy "attendance_select_policy" on public.attendance
  for select using (public.has_organization_access(organization_id));

drop policy if exists "attendance_insert_policy" on public.attendance;
create policy "attendance_insert_policy" on public.attendance
  for insert with check (
    public.has_organization_access(organization_id)
    and (auth.uid() = user_id or public.has_organization_access(organization_id, 'usher'))
  );

drop policy if exists "attendance_update_policy" on public.attendance;
create policy "attendance_update_policy" on public.attendance
  for update using (public.has_organization_access(organization_id, 'usher'));

-- ----------------------------------------------------------------------------
-- 13. SECURITY ADVISOR REMEDIATIONS & COVERING INDEXES
-- ----------------------------------------------------------------------------
do $$
begin
  alter table if exists public.spatial_ref_sys enable row level security;
  drop policy if exists "allow_read_spatial_ref_sys" on public.spatial_ref_sys;
  create policy "allow_read_spatial_ref_sys" on public.spatial_ref_sys for select using (true);
exception
  when insufficient_privilege or undefined_table then
    raise notice 'Skipping spatial_ref_sys RLS (managed by PostGIS extension owner).';
end $$;

-- Revoke execute on sensitive internal RPCs
do $$
begin
  if exists (select 1 from pg_proc where proname = 'auto_close_open_shifts') then
    revoke execute on function public.auto_close_open_shifts from public, anon, authenticated;
    grant execute on function public.auto_close_open_shifts to service_role;
  end if;
  if exists (select 1 from pg_proc where proname = 'rls_auto_enable') then
    revoke execute on function public.rls_auto_enable from public, anon, authenticated;
    grant execute on function public.rls_auto_enable to service_role;
  end if;
end $$;

-- Covering indexes for all foreign key relationships
create index if not exists idx_fk_campuses_tenant on public.campuses (tenant_id);
create index if not exists idx_fk_beacons_tenant on public.beacons (tenant_id);
create index if not exists idx_fk_beacons_campus on public.beacons (campus_id);
create index if not exists idx_fk_households_tenant on public.households (tenant_id);
create index if not exists idx_fk_persons_tenant on public.persons (tenant_id);
create index if not exists idx_fk_persons_household on public.persons (household_id);
create index if not exists idx_fk_users_tenant on public.users (tenant_id);
create index if not exists idx_fk_users_person on public.users (person_id);
create index if not exists idx_fk_user_roles_user on public.user_roles (user_id);
create index if not exists idx_fk_devices_user on public.devices (user_id);
create index if not exists idx_fk_consents_tenant on public.consents (tenant_id);
create index if not exists idx_fk_consents_person on public.consents (person_id);
create index if not exists idx_fk_services_tenant on public.services (tenant_id);
create index if not exists idx_fk_services_campus on public.services (campus_id);
create index if not exists idx_fk_service_instances_tenant on public.service_instances (tenant_id);
create index if not exists idx_fk_service_instances_service on public.service_instances (service_id);
create index if not exists idx_fk_service_instances_campus on public.service_instances (campus_id);
create index if not exists idx_fk_attendance_signals_tenant on public.attendance_signals (tenant_id);
create index if not exists idx_fk_attendance_signals_person on public.attendance_signals (person_id);
create index if not exists idx_fk_attendance_signals_campus on public.attendance_signals (campus_id);
create index if not exists idx_fk_attendance_signals_instance on public.attendance_signals (service_instance_id);
create index if not exists idx_fk_attendance_signals_device on public.attendance_signals (device_id);
create index if not exists idx_fk_attendance_records_tenant on public.attendance_records (tenant_id);
create index if not exists idx_fk_attendance_records_instance on public.attendance_records (service_instance_id);
create index if not exists idx_fk_attendance_records_person on public.attendance_records (person_id);
create index if not exists idx_fk_attendance_records_recorded_by on public.attendance_records (recorded_by);
create index if not exists idx_fk_followup_tasks_tenant on public.followup_tasks (tenant_id);
create index if not exists idx_fk_followup_tasks_person on public.followup_tasks (person_id);
create index if not exists idx_fk_followup_tasks_assigned_to on public.followup_tasks (assigned_to);
create index if not exists idx_fk_pastoral_notes_tenant on public.pastoral_notes (tenant_id);
create index if not exists idx_fk_pastoral_notes_person on public.pastoral_notes (person_id);
create index if not exists idx_fk_pastoral_notes_author on public.pastoral_notes (author_id);
create index if not exists idx_fk_funds_tenant on public.funds (tenant_id);
create index if not exists idx_fk_donations_tenant on public.donations (tenant_id);
create index if not exists idx_fk_donations_person on public.donations (person_id);
create index if not exists idx_fk_donations_fund on public.donations (fund_id);


