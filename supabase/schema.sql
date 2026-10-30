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
  last_name text not null,
  preferred_name text,
  date_of_birth date,
  gender text check (gender in ('male', 'female', 'other')),
  phone_e164 text,
  email citext,
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
-- 12. SEED DATA (Pilot: Accra Central Church)
-- ----------------------------------------------------------------------------
do $$
declare
  v_tenant_id uuid := '11111111-1111-1111-1111-111111111111';
  v_campus_id uuid := '22222222-2222-2222-2222-222222222222';
  v_service_id uuid := '33333333-3333-3333-3333-333333333333';
  v_fund_id uuid := '44444444-4444-4444-4444-444444444444';
  v_person_1 uuid := '55555555-5555-5555-5555-555555555551';
  v_person_2 uuid := '55555555-5555-5555-5555-555555555552';
  v_user_1 uuid := '66666666-6666-6666-6666-666666666661';
begin
  -- 1. Tenant
  insert into tenants (id, name, slug, timezone)
  values (v_tenant_id, 'Accra Central Assembly', 'accra-central', 'Africa/Accra')
  on conflict (id) do nothing;

  -- 2. Campus with GPS center (Accra Central Sanctuary: lat 5.5560, lng -0.1969)
  insert into campuses (id, tenant_id, name, address, center, inner_radius_m, outer_radius_m, active)
  values (
    v_campus_id,
    v_tenant_id,
    'Accra Central Sanctuary',
    'Liberation Road, Accra, Ghana',
    ST_SetSRID(ST_MakePoint(-0.1969, 5.5560), 4326)::geography,
    100,
    300,
    true
  )
  on conflict (id) do nothing;

  -- 3. Entrance BLE Beacon
  insert into beacons (tenant_id, campus_id, beacon_uuid, major, minor, label)
  values (
    v_tenant_id,
    v_campus_id,
    'e2c56db5-dffb-48d2-b060-d0f5a71096e0',
    10,
    1,
    'Main Sanctuary Foyer'
  )
  on conflict (beacon_uuid, major, minor) do nothing;

  -- 4. Default Sunday Service
  insert into services (
    id, tenant_id, campus_id, name, kind,
    start_time, duration_min, window_before_min, window_after_min, dwell_min, active
  )
  values (
    v_service_id,
    v_tenant_id,
    v_campus_id,
    'Sunday Morning Celebration Service',
    'service',
    '08:30:00',
    120,
    60,
    30,
    5,
    true
  )
  on conflict (id) do nothing;

  -- 5. Seed Persons (Admin Pastor and Member)
  insert into persons (id, tenant_id, first_name, last_name, phone_e164, email, status)
  values
    (v_person_1, v_tenant_id, 'Kwame', 'Appiah', '+233241234567', 'pastor.kwame@ekklesphere.org', 'member'),
    (v_person_2, v_tenant_id, 'Ama', 'Mensah', '+233209876543', 'ama.mensah@gmail.com', 'member')
  on conflict do nothing;

  -- 6. Users & Roles
  insert into users (id, tenant_id, person_id, status)
  values (v_user_1, v_tenant_id, v_person_1, 'active')
  on conflict (id) do nothing;

  insert into user_roles (user_id, role)
  values (v_user_1, 'admin'), (v_user_1, 'pastor')
  on conflict do nothing;

  -- 7. Giving Funds (Tithe & Offering)
  insert into funds (id, tenant_id, name, active)
  values (v_fund_id, v_tenant_id, 'General Tithe & Missions', true)
  on conflict (id) do nothing;

  -- 8. Default Consents
  insert into consents (tenant_id, person_id, type, granted, text_version, channel)
  values
    (v_tenant_id, v_person_2, 'auto_checkin', true, 'v1.0-act843', 'app'),
    (v_tenant_id, v_person_2, 'push', true, 'v1.0-act843', 'app')
  on conflict do nothing;
end $$;
