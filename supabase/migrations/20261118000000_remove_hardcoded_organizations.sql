-- ============================================================================
-- Migration: 20261118000000_remove_hardcoded_organizations.sql
-- Purpose:
--   1. Remove any previously seeded hardcoded organizations & licenses
--      (e.g. PIWC Kwadaso / Primary Church / Gracefield demo rows) so the
--      database starts clean with only real registered organisations.
--   2. Add `auth_user_id` column on `public.account_credentials` to link every
--      credential record to its corresponding Supabase Auth (`auth.users`) user.
-- ============================================================================

-- 1. Link account_credentials cleanly to Supabase Auth users
alter table if exists public.account_credentials
  add column if not exists auth_user_id uuid;

create index if not exists account_credentials_auth_user_idx
  on public.account_credentials (auth_user_id);

-- 2. Drop FK constraint on audit_log.organization_id if present so deleting an
--    organization does not trigger ON DELETE SET NULL against the append-only trigger.
do $$
declare
  v_fk record;
begin
  if to_regclass('public.audit_log') is not null and to_regclass('public.organizations') is not null then
    for v_fk in
      select c.conname
      from pg_constraint c
      join pg_attribute a
        on a.attrelid = c.conrelid
       and a.attnum = any(c.conkey)
      where c.conrelid = 'public.audit_log'::regclass
        and c.contype = 'f'
        and c.confrelid = 'public.organizations'::regclass
        and a.attname = 'organization_id'
    loop
      execute format('alter table public.audit_log drop constraint if exists %I', v_fk.conname);
    end loop;
  end if;
end $$;

-- 3. Remove hardcoded seeded licenses, dependent rows & organizations
do $$
declare
  target_org_ids uuid[] := array[
    'e0000000-0000-0000-0000-000000000001'::uuid,
    '00000000-0000-0000-0000-000000000101'::uuid,
    '00000000-0000-0000-0000-000000000102'::uuid
  ];
  v_table text;
  v_has_org_id boolean;
  v_has_tenant_id boolean;
  v_has_lic_key boolean;
  v_has_key boolean;
begin
  if to_regclass('public.organizations') is not null then
    select coalesce(array_agg(distinct id), target_org_ids)
    into target_org_ids
    from (
      select unnest(target_org_ids) as id
      union
      select id from public.organizations
      where lower(slug) in ('piwc-kwadaso', 'primary-church', 'accra-central', 'kumasi-grace')
    ) combined;
  end if;

  if to_regclass('public.tenants') is not null then
    select coalesce(array_agg(distinct id), target_org_ids)
    into target_org_ids
    from (
      select unnest(target_org_ids) as id
      union
      select id from public.tenants
      where lower(slug) in ('piwc-kwadaso', 'primary-church', 'accra-central', 'kumasi-grace')
    ) combined;
  end if;

  if to_regclass('public.licenses') is not null then
    select exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'licenses' and column_name = 'license_key'
    ) into v_has_lic_key;

    select exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'licenses' and column_name = 'key'
    ) into v_has_key;

    if v_has_lic_key then
      execute 'delete from public.licenses where license_key = $1' using 'EKKLE-PIWC-KWADASO-ENT-2026';
    end if;
    if v_has_key then
      execute 'delete from public.licenses where key = $1' using 'EKKLE-PIWC-KWADASO-ENT-2026';
    end if;
  end if;

  foreach v_table in array array[
    'license_payments',
    'data_requests',
    'support_grants',
    'licenses',
    'account_credentials',
    'auth_audit_events',
    'attendance',
    'attendance_records',
    'attendance_events',
    'donations',
    'service_instances',
    'services',
    'events',
    'sites',
    'campuses',
    'persons',
    'members',
    'church_groups',
    'church_wall_posts',
    'push_subscriptions',
    'usage_daily',
    'alerts',
    'system_settings',
    'church_public_profiles',
    'service_times',
    'ministries',
    'church_events',
    'news_posts',
    'users'
  ]
  loop
    if to_regclass('public.' || v_table) is not null then
      select exists (
        select 1 from information_schema.columns
        where table_schema = 'public' and table_name = v_table and column_name = 'organization_id'
      ) into v_has_org_id;

      select exists (
        select 1 from information_schema.columns
        where table_schema = 'public' and table_name = v_table and column_name = 'tenant_id'
      ) into v_has_tenant_id;

      if v_has_org_id then
        execute format('delete from public.%I where organization_id = any($1)', v_table) using target_org_ids;
      end if;
      if v_has_tenant_id then
        execute format('delete from public.%I where tenant_id = any($1)', v_table) using target_org_ids;
      end if;
    end if;
  end loop;

  if to_regclass('public.organizations') is not null then
    delete from public.organizations
    where id = any(target_org_ids)
       or lower(slug) in ('piwc-kwadaso', 'primary-church', 'accra-central', 'kumasi-grace');
  end if;
  if to_regclass('public.tenants') is not null then
    delete from public.tenants
    where id = any(target_org_ids)
       or lower(slug) in ('piwc-kwadaso', 'primary-church', 'accra-central', 'kumasi-grace');
  end if;

  -- 4. Remove hardcoded organization references from landing CMS config if present
  if to_regclass('public.landing_cms_config') is not null then
    update public.landing_cms_config
    set
      config = jsonb_set(
        jsonb_set(
          config,
          '{announcementBadge}',
          to_jsonb('Ekklesphere Sovereign Geofence Radar Live'::text),
          true
        ),
        '{contactSalesEmail}',
        to_jsonb('contact@ekklesphere.platform'::text),
        true
      ),
      updated_at = now()
    where config->>'contactSalesEmail' = 'admin@piwckwadaso.org'
       or config->>'announcementBadge' ilike '%PIWC KWADASO%';
  end if;
end $$;

-- 4. Ensure congregation church_wall_posts table exists idempotently
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

alter table if exists public.church_wall_posts enable row level security;

notify pgrst, 'reload schema';
