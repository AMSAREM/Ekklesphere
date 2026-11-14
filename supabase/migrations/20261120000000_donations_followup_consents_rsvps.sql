-- ============================================================================
-- Migration: 20261120000000_donations_followup_consents_rsvps.sql
-- Purpose:
--   1. Reconcile public.donations & public.followup_tasks with organization_id
--      and public.members(id) so MemberApp giving and Pastoral Care follow-up
--      queues persist cleanly in Supabase Postgres.
--   2. Add public.member_consents and public.event_rsvps (org-scoped with RLS).
--   3. Reload PostgREST schema cache.
-- ============================================================================

-- 1. Reconcile public.donations
create table if not exists public.donations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete cascade,
  tenant_id uuid,
  member_id uuid references public.members(id) on delete set null,
  person_id uuid,
  person_name text,
  fund_key text,
  fund_name text not null default 'General Tithe',
  amount_minor bigint not null check (amount_minor > 0),
  currency text not null default 'GHS',
  method text not null check (method in ('momo', 'card', 'cash', 'bank')),
  provider text not null default 'MTN MoMo',
  status text not null default 'paid' check (status in ('pending', 'paid', 'failed')),
  paid_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

do $$
begin
  if to_regclass('public.donations') is not null then
    alter table public.donations
      drop constraint if exists donations_tenant_id_fkey,
      drop constraint if exists donations_person_id_fkey,
      drop constraint if exists donations_fund_id_fkey;

    if exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'donations' and column_name = 'tenant_id'
    ) then
      alter table public.donations alter column tenant_id drop not null;
    end if;

    alter table public.donations
      add column if not exists organization_id uuid references public.organizations(id) on delete cascade,
      add column if not exists member_id uuid references public.members(id) on delete set null,
      add column if not exists person_name text,
      add column if not exists fund_key text,
      add column if not exists fund_name text;
  end if;
end
$$;

create index if not exists idx_donations_org_paid_at
  on public.donations (organization_id, paid_at desc);
create index if not exists idx_donations_org_member
  on public.donations (organization_id, member_id);

alter table if exists public.donations enable row level security;

drop policy if exists "Org members can access donations" on public.donations;
create policy "Org members can access donations"
  on public.donations
  for all
  to authenticated
  using (public.has_organization_access(coalesce(organization_id, tenant_id), null))
  with check (public.has_organization_access(coalesce(organization_id, tenant_id), null));

-- 2. Reconcile public.followup_tasks
create table if not exists public.followup_tasks (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete cascade,
  tenant_id uuid,
  member_id uuid references public.members(id) on delete set null,
  person_id uuid,
  person_name text not null default 'Member',
  group_name text not null default 'General',
  reason text not null default 'manual' check (reason in ('absent_2', 'absent_3', 'first_timer', 'manual')),
  assigned_to uuid,
  assigned_to_name text not null default 'Pastoral Care Team',
  status text not null default 'open' check (status in ('open', 'contacted', 'resolved', 'dismissed')),
  due_on date,
  due_label text default 'In 3 days',
  notes text,
  outcome text,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

do $$
begin
  if to_regclass('public.followup_tasks') is not null then
    alter table public.followup_tasks
      drop constraint if exists followup_tasks_tenant_id_fkey,
      drop constraint if exists followup_tasks_person_id_fkey,
      drop constraint if exists followup_tasks_assigned_to_fkey;

    if exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'followup_tasks' and column_name = 'tenant_id'
    ) then
      alter table public.followup_tasks alter column tenant_id drop not null;
    end if;

    if exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'followup_tasks' and column_name = 'person_id'
    ) then
      alter table public.followup_tasks alter column person_id drop not null;
    end if;

    alter table public.followup_tasks
      add column if not exists organization_id uuid references public.organizations(id) on delete cascade,
      add column if not exists member_id uuid references public.members(id) on delete set null,
      add column if not exists person_name text,
      add column if not exists group_name text default 'General',
      add column if not exists assigned_to_name text default 'Pastoral Care Team',
      add column if not exists due_label text default 'In 3 days',
      add column if not exists notes text;
  end if;
end
$$;

create index if not exists idx_followup_tasks_org_created
  on public.followup_tasks (organization_id, created_at desc);

alter table if exists public.followup_tasks enable row level security;

drop policy if exists "Org staff can access followup tasks" on public.followup_tasks;
create policy "Org staff can access followup tasks"
  on public.followup_tasks
  for all
  to authenticated
  using (public.has_organization_access(coalesce(organization_id, tenant_id), null))
  with check (public.has_organization_access(coalesce(organization_id, tenant_id), null));

-- 3. Create public.member_consents
create table if not exists public.member_consents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id text not null,
  member_id uuid references public.members(id) on delete set null,
  auto_checkin boolean not null default true,
  push boolean not null default true,
  sms boolean not null default false,
  email boolean not null default true,
  updated_at timestamptz not null default now(),
  unique (organization_id, user_id)
);

create index if not exists idx_member_consents_org_user
  on public.member_consents (organization_id, user_id);

alter table public.member_consents enable row level security;

drop policy if exists "Org members can access own consents" on public.member_consents;
create policy "Org members can access own consents"
  on public.member_consents
  for all
  to authenticated
  using (public.has_organization_access(organization_id, null))
  with check (public.has_organization_access(organization_id, null));

-- 4. Create public.event_rsvps
create table if not exists public.event_rsvps (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  event_id text,
  event_title text not null,
  user_id text not null,
  member_id uuid references public.members(id) on delete set null,
  attending boolean not null default true,
  updated_at timestamptz not null default now(),
  unique (organization_id, user_id, event_title)
);

create index if not exists idx_event_rsvps_org_user
  on public.event_rsvps (organization_id, user_id);

alter table public.event_rsvps enable row level security;

drop policy if exists "Org members can access event rsvps" on public.event_rsvps;
create policy "Org members can access event rsvps"
  on public.event_rsvps
  for all
  to authenticated
  using (public.has_organization_access(organization_id, null))
  with check (public.has_organization_access(organization_id, null));

notify pgrst, 'reload schema';
