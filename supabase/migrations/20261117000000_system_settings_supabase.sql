-- ============================================================================
-- Ekklesphere System Settings — Complete Supabase Postgres Persistence
-- Connects every section of System Settings to Supabase with strict
-- multi-tenant organization_id isolation and Row Level Security (RLS):
--   1. Ensures public.organizations has timezone & settings JSONB columns
--      plus communication gateway columns for full SystemSettings persistence.
--   2. Creates public.church_groups for Ministries, Fellowships & Cell Groups
--      with multi-tenant RLS policies.
-- ============================================================================

begin;

-- ----------------------------------------------------------------------------
-- 1. Ensure public.organizations supports full SystemSettings payload
-- ----------------------------------------------------------------------------
alter table public.organizations
  add column if not exists timezone text not null default 'Africa/Accra (GMT)',
  add column if not exists settings jsonb not null default '{}'::jsonb,
  add column if not exists premise_address text,
  add column if not exists inner_geofence_m int not null default 100,
  add column if not exists outer_geofence_m int not null default 300,
  add column if not exists dwell_time_min int not null default 5,
  add column if not exists sms_configured boolean not null default false,
  add column if not exists push_configured boolean not null default false,
  add column if not exists updated_at timestamptz not null default now();

-- ----------------------------------------------------------------------------
-- 2. Create public.church_groups (Ministries, Fellowships & Cell Groups)
-- ----------------------------------------------------------------------------
create table if not exists public.church_groups (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  category text not null default 'cell_group'
    check (category in ('ministry', 'fellowship', 'cell_group')),
  leader_name text not null,
  leader_phone text,
  leader_email text,
  assistant_leader text,
  meeting_day text,
  meeting_time text,
  meeting_location text,
  target_demographic text,
  description text not null default '',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_church_groups_org
  on public.church_groups (organization_id, category, active);

-- Safe updated_at trigger
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists touch_church_groups_updated_at on public.church_groups;
create trigger touch_church_groups_updated_at
  before update on public.church_groups
  for each row execute function public.touch_updated_at();

-- ----------------------------------------------------------------------------
-- 3. Row Level Security & Least-Privilege Grants for public.church_groups
-- ----------------------------------------------------------------------------
alter table public.church_groups enable row level security;

revoke all on table public.church_groups from public, anon;
grant select, insert, update, delete on table public.church_groups to authenticated;
grant all on table public.church_groups to service_role;

drop policy if exists church_groups_select_org on public.church_groups;
create policy church_groups_select_org
  on public.church_groups
  for select
  to authenticated
  using (
    public.is_platform_creator()
    or public.has_organization_access(organization_id)
  );

drop policy if exists church_groups_admin_manage on public.church_groups;
create policy church_groups_admin_manage
  on public.church_groups
  for all
  to authenticated
  using (
    public.is_platform_creator()
    or public.has_organization_any_role(organization_id, array['owner', 'admin', 'pastor'])
  )
  with check (
    public.is_platform_creator()
    or public.has_organization_any_role(organization_id, array['owner', 'admin', 'pastor'])
  );

commit;

notify pgrst, 'reload schema';

