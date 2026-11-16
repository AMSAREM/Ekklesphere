-- ============================================================================
-- Migration: 20261128000000_custom_group_categories.sql
-- Purpose:
--   1. Create dedicated multi-tenant public.church_group_categories table
--      (so categories like Department, Month Born, Age Band, etc. are visible
--      and queryable directly in Supabase Table Editor & SQL).
--   2. Backfill any existing custom categories from organizations.settings JSONB.
--   3. Relax hardcoded category CHECK constraints on public.church_groups and
--      public.church_group_leadership_history to accept custom category slugs.
--   4. Refresh PostgREST schema cache cleanly.
-- ============================================================================

begin;

-- ----------------------------------------------------------------------------
-- 1. Create public.church_group_categories with multi-tenant RLS
-- ----------------------------------------------------------------------------
create table if not exists public.church_group_categories (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  slug text not null check (
    char_length(trim(slug)) between 1 and 64
    and slug ~ '^[a-z0-9][a-z0-9_-]{0,63}$'
    and slug not in ('ministry', 'fellowship', 'cell_group')
  ),
  label text not null,
  plural_label text not null,
  description text not null default '',
  color text not null default 'violet',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, slug)
);

create index if not exists idx_church_group_categories_org
  on public.church_group_categories (organization_id, slug);

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

drop trigger if exists touch_church_group_categories_updated_at on public.church_group_categories;
create trigger touch_church_group_categories_updated_at
  before update on public.church_group_categories
  for each row execute function public.touch_updated_at();

alter table public.church_group_categories enable row level security;

revoke all on table public.church_group_categories from public, anon;
grant select, insert, update, delete on table public.church_group_categories to authenticated;
grant all on table public.church_group_categories to service_role;

drop policy if exists church_group_categories_select_org on public.church_group_categories;
create policy church_group_categories_select_org
  on public.church_group_categories
  for select
  to authenticated
  using (
    public.is_platform_creator()
    or public.has_organization_access(organization_id)
  );

drop policy if exists church_group_categories_admin_manage on public.church_group_categories;
create policy church_group_categories_admin_manage
  on public.church_group_categories
  for all
  to authenticated
  using (
    public.is_platform_creator()
    or public.has_organization_any_role(organization_id, array['owner', 'admin'])
  )
  with check (
    public.is_platform_creator()
    or public.has_organization_any_role(organization_id, array['owner', 'admin'])
  );

-- Backfill existing custom categories saved in organizations.settings JSONB
insert into public.church_group_categories (
  organization_id,
  slug,
  label,
  plural_label,
  description,
  color
)
select
  o.id as organization_id,
  left(trim(both '_' from regexp_replace(lower(coalesce(nullif(trim(cat->>'id'), ''), nullif(trim(cat->>'label'), ''), '')), '[^a-z0-9]+', '_', 'g')), 64) as slug,
  left(coalesce(nullif(trim(cat->>'label'), ''), 'Custom Category'), 48) as label,
  left(coalesce(nullif(trim(cat->>'pluralLabel'), ''), nullif(trim(cat->>'label'), ''), 'Custom Categories'), 56) as plural_label,
  left(coalesce(trim(cat->>'description'), 'Custom Category'), 100) as description,
  coalesce(nullif(trim(cat->>'color'), ''), 'violet') as color
from public.organizations o,
  jsonb_array_elements(coalesce(o.settings->'custom_group_categories', '[]'::jsonb)) as cat
where jsonb_typeof(coalesce(o.settings->'custom_group_categories', '[]'::jsonb)) = 'array'
  and left(trim(both '_' from regexp_replace(lower(coalesce(nullif(trim(cat->>'id'), ''), nullif(trim(cat->>'label'), ''), '')), '[^a-z0-9]+', '_', 'g')), 64) ~ '^[a-z0-9][a-z0-9_-]{0,63}$'
  and left(trim(both '_' from regexp_replace(lower(coalesce(nullif(trim(cat->>'id'), ''), nullif(trim(cat->>'label'), ''), '')), '[^a-z0-9]+', '_', 'g')), 64) not in ('ministry', 'fellowship', 'cell_group')
on conflict (organization_id, slug) do update set
  label = excluded.label,
  plural_label = excluded.plural_label,
  description = excluded.description,
  color = excluded.color,
  updated_at = now();

-- ----------------------------------------------------------------------------
-- 2. Relax & normalize category check constraint on public.church_groups
-- ----------------------------------------------------------------------------
do $$
declare
  v_con record;
begin
  if to_regclass('public.church_groups') is not null then
    for v_con in
      select conname
      from pg_constraint
      where conrelid = 'public.church_groups'::regclass
        and contype = 'c'
        and pg_get_constraintdef(oid) ~* '\ycategory\y'
    loop
      execute format('alter table public.church_groups drop constraint if exists %I', v_con.conname);
    end loop;

    alter table public.church_groups
      add constraint church_groups_category_check
      check (
        char_length(trim(category)) between 1 and 64
        and category ~ '^[a-z0-9][a-z0-9_-]{0,63}$'
      );
  end if;
end $$;

-- ----------------------------------------------------------------------------
-- 3. Relax & normalize category check constraint on leadership history table
-- ----------------------------------------------------------------------------
do $$
declare
  v_con record;
begin
  if to_regclass('public.church_group_leadership_history') is not null then
    for v_con in
      select conname
      from pg_constraint
      where conrelid = 'public.church_group_leadership_history'::regclass
        and contype = 'c'
        and pg_get_constraintdef(oid) ~* '\ycategory\y'
    loop
      execute format(
        'alter table public.church_group_leadership_history drop constraint if exists %I',
        v_con.conname
      );
    end loop;

    alter table public.church_group_leadership_history
      add constraint church_group_leadership_history_category_check
      check (
        char_length(trim(category)) between 1 and 64
        and category ~ '^[a-z0-9][a-z0-9_-]{0,63}$'
      );
  end if;
end $$;

notify pgrst, 'reload schema';

commit;
