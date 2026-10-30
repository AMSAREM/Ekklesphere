-- Migration: 20261029000001_ekklesphere_core_schema.sql
-- Full Ekklesphere Core Schema for Supabase PostGIS

create extension if not exists pgcrypto;
create extension if not exists postgis;
create extension if not exists citext;

create table if not exists tenants (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug citext unique not null,
  timezone text not null default 'Africa/Accra',
  settings jsonb not null default '{}',
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

create table if not exists households (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  name text not null,
  address text,
  created_at timestamptz not null default now()
);

create table if not exists persons (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  household_id uuid references households(id) on delete set null,
  first_name text not null,
  last_name text not null,
  preferred_name text,
  date_of_birth date,
  gender text,
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

create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  person_id uuid not null unique references persons(id) on delete cascade,
  phone_verified_at timestamptz,
  email_verified_at timestamptz,
  mfa_secret_enc bytea,
  status text not null default 'active',
  last_login_at timestamptz,
  created_at timestamptz not null default now()
);

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
  public_key text not null,
  app_version text,
  attestation_ok boolean default false,
  last_seen_at timestamptz default now(),
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists consents (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  person_id uuid not null references persons(id) on delete cascade,
  type text not null check (type in ('data_processing','auto_checkin','push','sms','email')),
  granted boolean not null,
  text_version text not null,
  channel text not null,
  recorded_at timestamptz not null default now()
);

create table if not exists services (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  campus_id uuid not null references campuses(id) on delete cascade,
  name text not null,
  kind text not null default 'service' check (kind in ('service','event','group_meeting')),
  recurrence_rule text,
  start_time time not null,
  duration_min int not null default 120,
  window_before_min int not null default 60,
  window_after_min int not null default 30,
  dwell_min int not null default 5,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists service_instances (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  service_id uuid not null references services(id) on delete cascade,
  campus_id uuid not null references campuses(id) on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status text not null default 'scheduled' check (status in ('scheduled','open','closed','cancelled')),
  qr_secret bytea not null default gen_random_bytes(32),
  unique (service_id, starts_at)
);

create table if not exists attendance_signals (
  id uuid primary key,
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

create table if not exists attendance_records (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  person_id uuid not null references persons(id) on delete cascade,
  service_instance_id uuid not null references service_instances(id) on delete cascade,
  campus_id uuid not null references campuses(id) on delete cascade,
  method text not null check (method in (
    'usher','posted_qr','beacon','geofence','email_link','manual')),
  confidence smallint not null check (confidence between 0 and 100),
  checked_in_at timestamptz not null,
  departed_at timestamptz,
  late boolean not null default false,
  recorded_by uuid references users(id) on delete set null,
  note text,
  unique (person_id, service_instance_id)
);

create table if not exists followup_tasks (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  person_id uuid not null references persons(id) on delete cascade,
  reason text not null check (reason in ('absent_2','absent_3','first_timer','manual')),
  assigned_to uuid references users(id) on delete set null,
  status text not null default 'open' check (status in ('open','contacted','resolved','dismissed')),
  due_on date,
  outcome text,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create table if not exists pastoral_notes (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  person_id uuid not null references persons(id) on delete cascade,
  author_id uuid not null references users(id) on delete cascade,
  body_enc bytea not null,
  created_at timestamptz not null default now()
);

create table if not exists donations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  person_id uuid references persons(id) on delete set null,
  amount_minor bigint not null check (amount_minor > 0),
  currency char(3) not null default 'GHS',
  method text not null check (method in ('momo','card','cash','bank')),
  provider text,
  provider_ref text unique,
  status text not null default 'pending',
  paid_at timestamptz,
  created_at timestamptz not null default now()
);
