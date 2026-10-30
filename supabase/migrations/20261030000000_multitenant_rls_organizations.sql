-- ============================================================================
-- Supabase Multi-Tenant Migration Script
-- Migration: 20261030000000_multitenant_rls_organizations.sql
-- Sets up:
--   1. Extensions (pgcrypto, postgis, citext)
--   2. Multi-Tenant Core Tables:
--      - organizations (tenants)
--      - members (users belonging to an organization with RBAC roles)
--      - events (services & gatherings scoped to organization)
--      - attendance (check-in records scoped by organization_id & event_id)
--   3. SQL Utility Functions for RLS:
--      - public.has_organization_access(target_org_id, required_role)
--      - public.current_user_organization_ids()
--      - public.get_user_organization_role(target_org_id)
--      - public.get_current_organization_id()
--   4. Comprehensive Row Level Security (RLS) Policies on all tables
--   5. Auto-provisioning trigger (creator becomes owner in members)
--   6. Updated_at triggers
--   7. Initial Demo Seed for Accra Central Church
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. EXTENSIONS
-- ----------------------------------------------------------------------------
create extension if not exists pgcrypto;
create extension if not exists postgis;
create extension if not exists citext;

-- ----------------------------------------------------------------------------
-- 2. ORGANIZATIONS TABLE
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
    "geofence_outer_radius_m": 300,
    "require_dwell": true
  }'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists organizations_slug_idx on public.organizations (slug);

-- ----------------------------------------------------------------------------
-- 3. MEMBERS TABLE
-- ----------------------------------------------------------------------------
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

create index if not exists members_org_id_idx on public.members (organization_id);
create index if not exists members_user_id_idx on public.members (user_id);
create index if not exists members_org_role_idx on public.members (organization_id, role);
create index if not exists members_org_status_idx on public.members (organization_id, status);
create unique index if not exists members_org_phone_idx 
  on public.members (organization_id, phone_e164) 
  where phone_e164 is not null;

-- ----------------------------------------------------------------------------
-- 4. SQL UTILITY FUNCTION: has_organization_access
-- Simplifies RLS checks for organization_id, verifying user membership & role
-- ----------------------------------------------------------------------------
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
  -- 1. Check for authenticated user ID
  v_user_id := auth.uid();
  if v_user_id is null then
    return false;
  end if;

  -- 2. Superadmin bypass via JWT app_metadata claim
  v_is_super := coalesce((auth.jwt() -> 'app_metadata' ->> 'is_super_admin')::boolean, false);
  if v_is_super then
    return true;
  end if;

  -- 3. Query active membership in public.members for target organization
  select role, status into v_member_role, v_member_status
  from public.members
  where organization_id = target_org_id
    and user_id = v_user_id
    and status = 'active'
  limit 1;

  -- If no active membership record exists
  if v_member_role is null then
    return false;
  end if;

  -- 4. If no specific role is required, membership is sufficient
  if required_role is null or required_role = '' then
    return true;
  end if;

  -- 5. Role hierarchy verification
  -- 'owner' has full permissions across all scopes
  if v_member_role = 'owner' then
    return true;
  end if;

  -- 'admin' can perform admin, pastor, usher, leader and member tasks
  if required_role = 'admin' then
    return v_member_role in ('owner', 'admin');
  end if;

  -- 'pastor' role check
  if required_role = 'pastor' then
    return v_member_role in ('owner', 'admin', 'pastor');
  end if;

  -- 'usher' can perform usher check-in and attendance verification
  if required_role = 'usher' then
    return v_member_role in ('owner', 'admin', 'pastor', 'usher');
  end if;

  -- 'leader' for cell/ministry leaders
  if required_role = 'leader' then
    return v_member_role in ('owner', 'admin', 'pastor', 'leader');
  end if;

  -- 'member' matches any verified role
  if required_role = 'member' then
    return true;
  end if;

  -- Fallback to exact role match
  return v_member_role = required_role;
end;
$$;

-- Utility function returning all organization IDs where current user is active
create or replace function public.current_user_organization_ids()
returns setof uuid
language sql
security definer
set search_path = public, auth
stable
as $$
  select organization_id
  from public.members
  where user_id = auth.uid()
    and status = 'active';
$$;

-- Utility function returning current user's role in a specific organization
create or replace function public.get_user_organization_role(target_org_id uuid)
returns text
language sql
security definer
set search_path = public, auth
stable
as $$
  select role
  from public.members
  where organization_id = target_org_id
    and user_id = auth.uid()
    and status = 'active'
  limit 1;
$$;

-- Utility function to inspect active organization from session context or JWT claim
create or replace function public.get_current_organization_id()
returns uuid
language sql
stable
as $$
  select coalesce(
    nullif(current_setting('app.current_organization_id', true), '')::uuid,
    nullif(auth.jwt() -> 'app_metadata' ->> 'organization_id', '')::uuid,
    nullif(auth.jwt() -> 'user_metadata' ->> 'organization_id', '')::uuid
  );
$$;

-- ----------------------------------------------------------------------------
-- 5. EVENTS TABLE
-- Services, rehearsals, cell meetings scoped to organization_id
-- ----------------------------------------------------------------------------
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

create index if not exists events_org_id_idx on public.events (organization_id);
create index if not exists events_org_start_time_idx on public.events (organization_id, start_time desc);
create index if not exists events_org_status_idx on public.events (organization_id, status);
create index if not exists events_geo_center_idx on public.events using gist (geo_center);

-- ----------------------------------------------------------------------------
-- 6. ATTENDANCE TABLE
-- Scoped strictly to organization_id and event_id
-- ----------------------------------------------------------------------------
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

create index if not exists attendance_org_id_idx on public.attendance (organization_id);
create index if not exists attendance_org_event_idx on public.attendance (organization_id, event_id);
create index if not exists attendance_org_member_idx on public.attendance (organization_id, member_id);
create index if not exists attendance_org_checked_in_at_idx on public.attendance (organization_id, checked_in_at desc);

-- ----------------------------------------------------------------------------
-- 7. ROW LEVEL SECURITY (RLS) POLICIES
-- All policies utilize public.has_organization_access for bulletproof tenancy
-- ----------------------------------------------------------------------------

-- Enable RLS on all four tables
alter table public.organizations enable row level security;
alter table public.members enable row level security;
alter table public.events enable row level security;
alter table public.attendance enable row level security;

-- Drop existing policies if already defined to ensure clean idempotency
drop policy if exists "org_select_members" on public.organizations;
drop policy if exists "org_insert_authenticated" on public.organizations;
drop policy if exists "org_update_admins" on public.organizations;
drop policy if exists "org_delete_owners" on public.organizations;

drop policy if exists "members_select_policy" on public.members;
drop policy if exists "members_insert_policy" on public.members;
drop policy if exists "members_update_policy" on public.members;
drop policy if exists "members_delete_policy" on public.members;

drop policy if exists "events_select_policy" on public.events;
drop policy if exists "events_insert_policy" on public.events;
drop policy if exists "events_update_policy" on public.events;
drop policy if exists "events_delete_policy" on public.events;

drop policy if exists "attendance_select_policy" on public.attendance;
drop policy if exists "attendance_insert_policy" on public.attendance;
drop policy if exists "attendance_update_policy" on public.attendance;
drop policy if exists "attendance_delete_policy" on public.attendance;

-- 7.1 ORGANIZATIONS RLS POLICIES
create policy "org_select_members" on public.organizations
  for select
  using (public.has_organization_access(id));

create policy "org_insert_authenticated" on public.organizations
  for insert
  with check (auth.role() = 'authenticated');

create policy "org_update_admins" on public.organizations
  for update
  using (public.has_organization_access(id, 'admin'))
  with check (public.has_organization_access(id, 'admin'));

create policy "org_delete_owners" on public.organizations
  for delete
  using (public.has_organization_access(id, 'owner'));

-- 7.2 MEMBERS RLS POLICIES
create policy "members_select_policy" on public.members
  for select
  using (public.has_organization_access(organization_id));

create policy "members_insert_policy" on public.members
  for insert
  with check (
    public.has_organization_access(organization_id, 'admin')
    or (auth.uid() = user_id and public.has_organization_access(organization_id))
  );

create policy "members_update_policy" on public.members
  for update
  using (
    public.has_organization_access(organization_id, 'admin')
    or (auth.uid() = user_id and public.has_organization_access(organization_id))
  )
  with check (
    public.has_organization_access(organization_id, 'admin')
    or (auth.uid() = user_id and public.has_organization_access(organization_id))
  );

create policy "members_delete_policy" on public.members
  for delete
  using (public.has_organization_access(organization_id, 'admin'));

-- 7.3 EVENTS RLS POLICIES
create policy "events_select_policy" on public.events
  for select
  using (public.has_organization_access(organization_id));

create policy "events_insert_policy" on public.events
  for insert
  with check (public.has_organization_access(organization_id, 'admin'));

create policy "events_update_policy" on public.events
  for update
  using (public.has_organization_access(organization_id, 'admin'))
  with check (public.has_organization_access(organization_id, 'admin'));

create policy "events_delete_policy" on public.events
  for delete
  using (public.has_organization_access(organization_id, 'admin'));

-- 7.4 ATTENDANCE RLS POLICIES
create policy "attendance_select_policy" on public.attendance
  for select
  using (public.has_organization_access(organization_id));

create policy "attendance_insert_policy" on public.attendance
  for insert
  with check (
    public.has_organization_access(organization_id)
    and (
      auth.uid() = user_id 
      or public.has_organization_access(organization_id, 'usher')
    )
  );

create policy "attendance_update_policy" on public.attendance
  for update
  using (public.has_organization_access(organization_id, 'usher'))
  with check (public.has_organization_access(organization_id, 'usher'));

create policy "attendance_delete_policy" on public.attendance
  for delete
  using (public.has_organization_access(organization_id, 'admin'));

-- ----------------------------------------------------------------------------
-- 8. AUTO-PROVISIONING TRIGGER: CREATOR BECOMES OWNER
-- ----------------------------------------------------------------------------
create or replace function public.handle_new_organization()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_user_id uuid;
  v_first_name text;
  v_last_name text;
  v_email text;
begin
  v_user_id := auth.uid();
  if v_user_id is not null then
    -- Query user details from auth.users if available
    select 
      coalesce(raw_user_meta_data->>'first_name', split_part(email, '@', 1)),
      coalesce(raw_user_meta_data->>'last_name', 'Admin'),
      email
    into v_first_name, v_last_name, v_email
    from auth.users
    where id = v_user_id;

    insert into public.members (
      organization_id,
      user_id,
      first_name,
      last_name,
      email,
      role,
      status
    ) values (
      new.id,
      v_user_id,
      coalesce(v_first_name, 'Admin'),
      coalesce(v_last_name, 'Lead'),
      v_email,
      'owner',
      'active'
    )
    on conflict (organization_id, user_id) do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists on_organization_created on public.organizations;
create trigger on_organization_created
  after insert on public.organizations
  for each row execute function public.handle_new_organization();

-- ----------------------------------------------------------------------------
-- 9. TOUCH UPDATED_AT TRIGGERS
-- ----------------------------------------------------------------------------
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists touch_organizations_updated_at on public.organizations;
create trigger touch_organizations_updated_at
  before update on public.organizations
  for each row execute function public.touch_updated_at();

drop trigger if exists touch_members_updated_at on public.members;
create trigger touch_members_updated_at
  before update on public.members
  for each row execute function public.touch_updated_at();

drop trigger if exists touch_events_updated_at on public.events;
create trigger touch_events_updated_at
  before update on public.events
  for each row execute function public.touch_updated_at();

drop trigger if exists touch_attendance_updated_at on public.attendance;
create trigger touch_attendance_updated_at
  before update on public.attendance
  for each row execute function public.touch_updated_at();

-- ----------------------------------------------------------------------------
-- 10. INITIAL PILOT SEED DATA (ACCRA CENTRAL CHURCH)
-- ----------------------------------------------------------------------------
insert into public.organizations (
  id, name, slug, timezone, settings
) values (
  'e0000000-0000-0000-0000-000000000001',
  'Accra Central Church',
  'accra-central',
  'Africa/Accra',
  '{
    "currency": "GHS",
    "absence_threshold_leader": 2,
    "absence_threshold_pastor": 3,
    "dwell_min_default": 5,
    "geofence_inner_radius_m": 100,
    "geofence_outer_radius_m": 300,
    "require_dwell": true
  }'::jsonb
) on conflict (slug) do nothing;

-- Seed members
insert into public.members (
  id, organization_id, user_id, first_name, last_name, phone_e164, email, role, status
) values
(
  'b0000000-0000-0000-0000-000000000001',
  'e0000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000001',
  'Ama', 'Owusu', '+233241234567', 'ama.owusu@accracentral.org', 'admin', 'active'
),
(
  'b0000000-0000-0000-0000-000000000002',
  'e0000000-0000-0000-0000-000000000001',
  null,
  'Kofi', 'Mensah', '+233249876543', 'kofi.mensah@gmail.com', 'member', 'active'
),
(
  'b0000000-0000-0000-0000-000000000003',
  'e0000000-0000-0000-0000-000000000001',
  null,
  'Kwame', 'Boateng', '+233205551234', 'kwame.boateng@gmail.com', 'usher', 'active'
),
(
  'b0000000-0000-0000-0000-000000000004',
  'e0000000-0000-0000-0000-000000000001',
  null,
  'Abena', 'Antwi', '+233267778899', 'abena.antwi@gmail.com', 'pastor', 'active'
)
on conflict (id) do nothing;

-- Seed Sunday Service Event
insert into public.events (
  id, organization_id, name, description, location, geo_center,
  radius_m, inner_radius_m, outer_radius_m,
  start_time, end_time, checkin_window_start, checkin_window_end, dwell_min, status
) values (
  'ee000000-0000-0000-0000-000000000001',
  'e0000000-0000-0000-0000-000000000001',
  'Sunday Morning Celebration Service',
  'Weekly Sunday Main Service at Accra Central Sanctuary',
  'Accra Central Sanctuary, Ring Road Central, Accra',
  ST_SetSRID(ST_MakePoint(-0.1969, 5.5560), 4326),
  150, 100, 300,
  now() - interval '1 hour',
  now() + interval '2 hours',
  now() - interval '2 hours',
  now() + interval '3 hours',
  5,
  'active'
) on conflict (id) do nothing;

-- Seed Attendance Records
insert into public.attendance (
  id, organization_id, event_id, member_id, user_id, checked_in_at, method, status, confidence_score, distance_m, accuracy_m
) values (
  'aa000000-0000-0000-0000-000000000001',
  'e0000000-0000-0000-0000-000000000001',
  'ee000000-0000-0000-0000-000000000001',
  'b0000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000001',
  now() - interval '45 minutes',
  'geofence',
  'accepted',
  95,
  28.5,
  14.0
) on conflict (organization_id, event_id, member_id) do nothing;
