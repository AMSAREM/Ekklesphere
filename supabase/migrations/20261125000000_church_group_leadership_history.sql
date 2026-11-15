-- ============================================================================
-- Migration: 20261125000000_church_group_leadership_history.sql
-- Purpose:
--   1. Link public.church_groups primary & assistant leaders directly to
--      enrolled congregation members (public.members.id) for validation.
--   2. Create immutable public.church_group_leadership_history table tracking
--      every leadership assignment, handover, removal, and group retirement
--      across ALL categories (ministry, fellowship, cell_group).
--   3. Apply strict multi-tenant organization_id RLS and least-privilege grants.
-- ============================================================================

begin;

-- ----------------------------------------------------------------------------
-- 1. Link church_groups leaders to public.members(id)
-- ----------------------------------------------------------------------------
alter table if exists public.church_groups
  add column if not exists leader_member_id uuid references public.members(id) on delete set null,
  add column if not exists assistant_leader_member_id uuid references public.members(id) on delete set null;

create index if not exists idx_church_groups_leader_member
  on public.church_groups (organization_id, leader_member_id)
  where leader_member_id is not null;

create index if not exists idx_church_groups_assistant_member
  on public.church_groups (organization_id, assistant_leader_member_id)
  where assistant_leader_member_id is not null;

-- ----------------------------------------------------------------------------
-- 2. Create immutable public.church_group_leadership_history audit table
-- ----------------------------------------------------------------------------
create table if not exists public.church_group_leadership_history (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  group_id text not null,
  group_name text not null,
  category text not null check (category in ('ministry', 'fellowship', 'cell_group')),
  role text not null check (role in ('primary_leader', 'assistant_leader')),
  action text not null check (action in ('assigned', 'changed', 'removed', 'group_deleted')),
  previous_leader_name text,
  previous_leader_member_id text,
  new_leader_name text,
  new_leader_member_id text,
  changed_by_id text,
  changed_by_name text,
  changed_by_email text,
  changed_by_role text,
  reason text,
  created_at timestamptz not null default now()
);

create index if not exists idx_cglh_org_created
  on public.church_group_leadership_history (organization_id, created_at desc);

create index if not exists idx_cglh_org_category_created
  on public.church_group_leadership_history (organization_id, category, created_at desc);

create index if not exists idx_cglh_org_group_created
  on public.church_group_leadership_history (organization_id, group_id, created_at desc);

-- ----------------------------------------------------------------------------
-- 3. Row Level Security (Append-Only Multi-Tenant Audit Trail)
-- ----------------------------------------------------------------------------
alter table public.church_group_leadership_history enable row level security;

revoke all on table public.church_group_leadership_history from public, anon;
grant select, insert on table public.church_group_leadership_history to authenticated;
grant all on table public.church_group_leadership_history to service_role;

drop policy if exists church_group_leadership_history_select_org on public.church_group_leadership_history;
create policy church_group_leadership_history_select_org
  on public.church_group_leadership_history
  for select
  to authenticated
  using (
    public.is_platform_creator()
    or public.has_organization_access(organization_id)
  );

drop policy if exists church_group_leadership_history_insert_admin on public.church_group_leadership_history;
create policy church_group_leadership_history_insert_admin
  on public.church_group_leadership_history
  for insert
  to authenticated
  with check (
    public.is_platform_creator()
    or public.has_organization_any_role(organization_id, array['owner', 'admin', 'pastor'])
  );

commit;

notify pgrst, 'reload schema';
