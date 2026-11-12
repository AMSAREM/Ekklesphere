-- ============================================================================
-- Proposed Supabase Migration: Congregation Church Wall & Birthday Wishes
-- File: supabase/migrations/20261113000000_church_wall_posts.sql
--
-- Multi-tenant Church Wall posts scoped strictly by organization_id with RLS.
-- ============================================================================

create table if not exists public.church_wall_posts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  author_id text not null,
  author_name text not null,
  author_initials text not null default 'MB',
  author_avatar text,
  category text not null default 'birthday' check (category in ('birthday', 'testimony', 'celebration')),
  message text not null check (char_length(trim(message)) between 1 and 600),
  target_member_id text,
  target_member_name text,
  amens jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_church_wall_posts_org_time
  on public.church_wall_posts (organization_id, created_at desc);

alter table public.church_wall_posts enable row level security;

drop policy if exists "Org members can read church wall posts" on public.church_wall_posts;
create policy "Org members can read church wall posts"
  on public.church_wall_posts
  for select
  to authenticated
  using (public.has_organization_access(organization_id, null));

drop policy if exists "Org members can create church wall posts" on public.church_wall_posts;
create policy "Org members can create church wall posts"
  on public.church_wall_posts
  for insert
  to authenticated
  with check (public.has_organization_access(organization_id, null));

drop policy if exists "Org members can react to church wall posts" on public.church_wall_posts;
create policy "Org members can react to church wall posts"
  on public.church_wall_posts
  for update
  to authenticated
  using (public.has_organization_access(organization_id, null))
  with check (public.has_organization_access(organization_id, null));
