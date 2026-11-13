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

-- 2. Remove hardcoded seeded licenses, dependent rows & organizations
do $$
declare
  target_org_ids uuid[] := array[
    'e0000000-0000-0000-0000-000000000001'::uuid,
    '00000000-0000-0000-0000-000000000101'::uuid,
    '00000000-0000-0000-0000-000000000102'::uuid
  ];
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

  if to_regclass('public.license_payments') is not null then
    delete from public.license_payments where organization_id = any(target_org_ids);
  end if;
  if to_regclass('public.licenses') is not null then
    delete from public.licenses
    where license_key = 'EKKLE-PIWC-KWADASO-ENT-2026'
       or key = 'EKKLE-PIWC-KWADASO-ENT-2026'
       or organization_id = any(target_org_ids)
       or tenant_id = any(target_org_ids);
  end if;
  if to_regclass('public.account_credentials') is not null then
    delete from public.account_credentials where organization_id = any(target_org_ids);
  end if;
  if to_regclass('public.attendance') is not null then
    delete from public.attendance where organization_id = any(target_org_ids);
  end if;
  if to_regclass('public.attendance_events') is not null then
    delete from public.attendance_events where organization_id = any(target_org_ids);
  end if;
  if to_regclass('public.events') is not null then
    delete from public.events where organization_id = any(target_org_ids);
  end if;
  if to_regclass('public.sites') is not null then
    delete from public.sites where organization_id = any(target_org_ids);
  end if;
  if to_regclass('public.members') is not null then
    delete from public.members where organization_id = any(target_org_ids);
  end if;
  if to_regclass('public.church_groups') is not null then
    delete from public.church_groups where organization_id = any(target_org_ids);
  end if;
  if to_regclass('public.system_settings') is not null then
    delete from public.system_settings where organization_id = any(target_org_ids);
  end if;
  if to_regclass('public.church_public_profiles') is not null then
    delete from public.church_public_profiles where organization_id = any(target_org_ids);
  end if;
  if to_regclass('public.service_times') is not null then
    delete from public.service_times where organization_id = any(target_org_ids);
  end if;
  if to_regclass('public.ministries') is not null then
    delete from public.ministries where organization_id = any(target_org_ids);
  end if;
  if to_regclass('public.church_events') is not null then
    delete from public.church_events where organization_id = any(target_org_ids);
  end if;
  if to_regclass('public.news_posts') is not null then
    delete from public.news_posts where organization_id = any(target_org_ids);
  end if;
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

  -- 3. Remove hardcoded organization references from landing CMS config if present
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
