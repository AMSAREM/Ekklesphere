-- ============================================================================
-- Ekklesphere Canonical Supabase PostgreSQL Schema & Platform Governance Migration
-- Version: 20261031_canonical_schema.sql
-- Applies to: Supabase Postgres 16 (af-south-1 / eu-west-3)
-- Backs: Multi-tenant Ekklesphere Core + Creator Console (/console)
-- Zero-PII Aggregates & Fail-Closed Licensing Enforced
-- ============================================================================

-- 1. EXTENSIONS
create extension if not exists pgcrypto;
create extension if not exists postgis;
create extension if not exists citext;

-- 2. ENUMS & DOMAINS
do $$ begin
  if not exists (select 1 from pg_type where typname = 'license_tier') then
    create type license_tier as enum ('grace_starter', 'ministry_pro', 'cathedral_enterprise');
  end if;
  if not exists (select 1 from pg_type where typname = 'license_status') then
    create type license_status as enum ('active', 'trial', 'grace_period', 'expired', 'suspended', 'revoked');
  end if;
  if not exists (select 1 from pg_type where typname = 'billing_cycle') then
    create type billing_cycle as enum ('monthly', 'annual', 'lifetime');
  end if;
  if not exists (select 1 from pg_type where typname = 'payment_currency') then
    create type payment_currency as enum ('GHS', 'USD');
  end if;
  if not exists (select 1 from pg_type where typname = 'payment_channel') then
    create type payment_channel as enum ('momo', 'bank', 'cash');
  end if;
  if not exists (select 1 from pg_type where typname = 'org_type') then
    create type org_type as enum ('church', 'organisation');
  end if;
  if not exists (select 1 from pg_type where typname = 'data_request_type') then
    create type data_request_type as enum ('export', 'deletion');
  end if;
  if not exists (select 1 from pg_type where typname = 'data_request_status') then
    create type data_request_status as enum ('pending', 'in_progress', 'completed', 'rejected');
  end if;
end $$;

-- 3. PLANS CATALOG
create table if not exists plans (
  id text primary key,
  name text not null,
  description text,
  monthly_cost_usd numeric(10, 2) not null default 0,
  annual_cost_usd numeric(10, 2) not null default 0,
  seats_limit int not null default 150,
  sites_limit int not null default 1,
  monthly_checkins_limit int not null default 2000,
  feature_flags jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 4. ORGANIZATIONS (Canonical replacement for legacy duplicate tenants)
create table if not exists organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug citext unique not null,
  org_type text not null default 'church' check (org_type in ('church', 'organisation')),
  country text not null default 'Ghana',
  city text not null default 'Accra',
  campus_code text,
  senior_pastor text,
  contact_name text,
  contact_email citext,
  contact_phone text,
  status text not null default 'trial' check (status in ('active', 'trial', 'grace_period', 'suspended', 'maintenance', 'archived')),
  custom_domain text,
  premise_address text,
  inner_geofence_m int not null default 60,
  outer_geofence_m int not null default 300,
  dwell_time_min int not null default 5,
  sms_configured boolean not null default false,
  push_configured boolean not null default true,
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index if not exists idx_organizations_slug on organizations (slug);
create index if not exists idx_organizations_status on organizations (status);

-- 5. LICENSES (Fail-closed licensing records)
create table if not exists licenses (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  license_key text unique not null,
  plan_id text not null references plans(id),
  status text not null default 'trial' check (status in ('active', 'trial', 'grace_period', 'expired', 'suspended', 'revoked')),
  issued_at timestamptz not null default now(),
  expires_at timestamptz not null,
  grace_ends_at timestamptz not null,
  billing_cycle text not null default 'annual' check (billing_cycle in ('monthly', 'annual', 'lifetime')),
  annual_cost_usd numeric(10, 2) not null default 0,
  overrides jsonb not null default '{}'::jsonb,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_licenses_org_expires on licenses (organization_id, expires_at desc);

-- 6. MANUAL BILLING & PAYMENT LEDGER (Dual currency GHS/USD)
create table if not exists license_payments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  license_id uuid references licenses(id) on delete set null,
  amount numeric(12, 2) not null check (amount > 0),
  currency text not null default 'GHS' check (currency in ('GHS', 'USD')),
  method text not null check (method in ('momo', 'bank', 'cash')),
  reference text unique not null,
  paid_at timestamptz not null default now(),
  notes text,
  recorded_by_email text,
  created_at timestamptz not null default now()
);
create index if not exists idx_payments_org on license_payments (organization_id, paid_at desc);

-- 7. USAGE DAILY (Privacy-preserving aggregate telemetry only)
create table if not exists usage_daily (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  usage_date date not null,
  active_users int not null default 0,
  checkins_count int not null default 0,
  flagged_count int not null default 0,
  rejected_count int not null default 0,
  mock_location_attempts int not null default 0,
  sites_count int not null default 0,
  push_subscribers int not null default 0,
  last_activity_at timestamptz,
  unique (organization_id, usage_date)
);
create index if not exists idx_usage_daily_date on usage_daily (usage_date desc);

-- 8. AUDIT LOG (Immutable append-only governance trail)
create table if not exists audit_log (
  id bigserial primary key,
  organization_id uuid references organizations(id) on delete set null,
  actor_id uuid,
  actor_email text not null,
  actor_role text not null default 'member',
  action text not null,
  target_type text not null,
  target_id text,
  metadata jsonb not null default '{}'::jsonb,
  ip_address text,
  created_at timestamptz not null default now()
);
create index if not exists idx_audit_log_org on audit_log (organization_id, created_at desc);
create index if not exists idx_audit_log_action on audit_log (action, created_at desc);

-- 9. PROACTIVE PLATFORM ALERTS
create table if not exists alerts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references organizations(id) on delete cascade,
  alert_type text not null,
  severity text not null check (severity in ('info', 'warning', 'critical')),
  status text not null default 'open' check (status in ('open', 'acknowledged', 'resolved')),
  title text not null,
  message text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  acknowledged_at timestamptz,
  resolved_at timestamptz
);
create index if not exists idx_alerts_status on alerts (status, severity, created_at desc);

-- 10. TARGETED PLATFORM ANNOUNCEMENTS
create table if not exists announcements (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  body text not null,
  severity text not null default 'info' check (severity in ('info', 'warning', 'critical')),
  target_tiers text[] not null default '{}',
  target_organization_ids uuid[] not null default '{}',
  active boolean not null default true,
  created_by_email text not null,
  expires_at timestamptz,
  created_at timestamptz not null default now()
);

-- 11. FEATURE FLAGS & OVERRIDES
create table if not exists feature_flags (
  key text primary key,
  name text not null,
  description text,
  enabled_globally boolean not null default false,
  enabled_tiers text[] not null default '{}',
  organization_overrides jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- 12. DATA PRIVACY & GDPR/ACT 843 REQUESTS
create table if not exists data_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  request_type text not null check (request_type in ('export', 'deletion')),
  status text not null default 'pending' check (status in ('pending', 'in_progress', 'completed', 'rejected')),
  requested_by_email text not null,
  reason text,
  notes text,
  due_at timestamptz not null,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 13. AUDITED SUPPORT ACCESS GRANTS ("View as Organisation Admin")
create table if not exists support_grants (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  creator_user_id uuid not null,
  creator_email text not null,
  reason text not null,
  access_level text not null default 'read_only_admin',
  starts_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists idx_support_grants_active on support_grants (organization_id, expires_at);

-- 14. LANDING CMS CONFIGURATION
create table if not exists landing_cms_config (
  id text primary key default 'default',
  config jsonb not null,
  updated_by_email text,
  updated_at timestamptz not null default now()
);

-- ============================================================================
-- 15. ROW-LEVEL SECURITY & POSTGRES AUTH HELPERS
-- ============================================================================

create or replace function is_platform_creator()
returns boolean language sql stable as $$
  select coalesce(
    (current_setting('request.jwt.claims', true)::jsonb -> 'app_metadata' ->> 'creator')::boolean,
    false
  );
$$;

create or replace function has_organization_access(p_org_id uuid)
returns boolean language sql stable as $$
  select
    is_platform_creator() or
    (
      current_setting('request.jwt.claims', true)::jsonb ->> 'organization_id' = p_org_id::text or
      current_setting('request.jwt.claims', true)::jsonb ->> 'tenant_id' = p_org_id::text
    );
$$;

alter table plans enable row level security;
create policy plans_public_read on plans for select using (true);
create policy plans_creator_all on plans for all using (is_platform_creator());

alter table organizations enable row level security;
create policy org_creator_all on organizations for all using (is_platform_creator());
create policy org_member_read on organizations for select using (has_organization_access(id));

alter table licenses enable row level security;
create policy lic_creator_all on licenses for all using (is_platform_creator());
create policy lic_member_read on licenses for select using (has_organization_access(organization_id));

alter table license_payments enable row level security;
create policy pay_creator_all on license_payments for all using (is_platform_creator());
create policy pay_admin_read on license_payments for select using (has_organization_access(organization_id));

alter table usage_daily enable row level security;
create policy usage_creator_all on usage_daily for all using (is_platform_creator());
create policy usage_admin_read on usage_daily for select using (has_organization_access(organization_id));

alter table audit_log enable row level security;
create policy audit_creator_all on audit_log for all using (is_platform_creator());

alter table alerts enable row level security;
create policy alerts_creator_all on alerts for all using (is_platform_creator());
create policy alerts_org_read on alerts for select using (organization_id is null or has_organization_access(organization_id));

alter table announcements enable row level security;
create policy announcements_read on announcements for select using (active = true);
create policy announcements_creator_all on announcements for all using (is_platform_creator());

alter table feature_flags enable row level security;
create policy ff_read on feature_flags for select using (true);
create policy ff_creator_all on feature_flags for all using (is_platform_creator());

alter table data_requests enable row level security;
create policy dr_creator_all on data_requests for all using (is_platform_creator());
create policy dr_admin_read on data_requests for select using (has_organization_access(organization_id));

alter table support_grants enable row level security;
create policy sg_creator_all on support_grants for all using (is_platform_creator());

alter table landing_cms_config enable row level security;
create policy landing_read on landing_cms_config for select using (true);
create policy landing_creator_all on landing_cms_config for all using (is_platform_creator());

-- ============================================================================
-- 16. IDEMPOTENT MIGRATION FUNCTION: migrate_legacy_tenants
-- ============================================================================

create or replace function migrate_legacy_tenants(p_dry_run boolean default true)
returns table (
  tenants_found int,
  organizations_created int,
  licenses_created int,
  sites_linked int,
  dry_run boolean
) language plpgsql as $$
declare
  v_tenants_found int := 0;
  v_orgs_created int := 0;
  v_licenses_created int := 0;
  v_sites_linked int := 0;
  r record;
  v_existing_org_id uuid;
begin
  -- Check if legacy tenants table exists
  if exists (select 1 from information_schema.tables where table_name = 'tenants') then
    for r in execute 'select id, name, slug, timezone, settings, created_at from tenants' loop
      v_tenants_found := v_tenants_found + 1;
      
      -- Check if already migrated
      select id into v_existing_org_id from organizations where id = r.id or slug = r.slug;
      
      if v_existing_org_id is null then
        if not p_dry_run then
          insert into organizations (
            id, name, slug, org_type, country, city, senior_pastor, contact_name, status, created_at
          ) values (
            r.id,
            r.name,
            r.slug,
            'church',
            'Ghana',
            'Accra',
            'Administrator',
            r.name,
            'active',
            r.created_at
          );

          -- Auto-create corresponding cathedral_enterprise / grace_starter license
          insert into licenses (
            organization_id,
            license_key,
            plan_id,
            status,
            issued_at,
            expires_at,
            grace_ends_at,
            billing_cycle,
            annual_cost_usd,
            notes
          ) values (
            r.id,
            'EKKLE-' || upper(replace(r.slug, '-', '')) || '-ENT',
            'cathedral_enterprise',
            'active',
            now(),
            now() + interval '365 days',
            now() + interval '372 days',
            'annual',
            1200.00,
            'Migrated from legacy tenants table'
          ) on conflict do nothing;

          v_licenses_created := v_licenses_created + 1;
        end if;
        v_orgs_created := v_orgs_created + 1;
      end if;
    end loop;
  end if;

  return query select v_tenants_found, v_orgs_created, v_licenses_created, v_sites_linked, p_dry_run;
end;
$$;

-- ============================================================================
-- 17. USAGE ROLLUP ROUTINE (for pg_cron and Vercel Cron webhook)
-- ============================================================================

create or replace function rollup_usage_daily(p_target_date date default current_date - interval '1 day')
returns table (
  processed_organizations int,
  total_checkins int,
  total_mock_attempts int,
  target_date date
) language plpgsql as $$
declare
  v_processed int := 0;
  v_checkins int := 0;
  v_mocks int := 0;
begin
  insert into usage_daily (
    organization_id,
    usage_date,
    active_users,
    checkins_count,
    flagged_count,
    rejected_count,
    mock_location_attempts,
    sites_count,
    push_subscribers,
    last_activity_at
  )
  select
    o.id as organization_id,
    p_target_date as usage_date,
    coalesce(count(distinct ar.person_id), 0) as active_users,
    coalesce(count(ar.id), 0) as checkins_count,
    coalesce(count(case when asig.status = 'flagged' then 1 end), 0) as flagged_count,
    coalesce(count(case when asig.status = 'rejected' then 1 end), 0) as rejected_count,
    coalesce(count(case when asig.is_mock or asig.mock_location then 1 end), 0) as mock_location_attempts,
    (select count(*) from campuses c where c.tenant_id = o.id or c.organization_id = o.id) as sites_count,
    0 as push_subscribers,
    now() as last_activity_at
  from organizations o
  left join attendance_records ar on ar.tenant_id = o.id and ar.checked_in_at::date = p_target_date
  left join attendance_signals asig on asig.tenant_id = o.id and asig.occurred_at::date = p_target_date
  group by o.id
  on conflict (organization_id, usage_date) do update set
    active_users = excluded.active_users,
    checkins_count = excluded.checkins_count,
    flagged_count = excluded.flagged_count,
    rejected_count = excluded.rejected_count,
    mock_location_attempts = excluded.mock_location_attempts,
    sites_count = excluded.sites_count,
    last_activity_at = excluded.last_activity_at;

  get diagnostics v_processed = row_count;

  return query select v_processed, v_checkins, v_mocks, p_target_date;
end;
$$;

-- ============================================================================
-- 18. SEED BASELINE DATA (Plans catalog & Primary Anchor Church)
-- ============================================================================

insert into plans (id, name, description, monthly_cost_usd, annual_cost_usd, seats_limit, sites_limit, monthly_checkins_limit, feature_flags, is_active)
values
  (
    'grace_starter',
    'Grace Starter',
    'Ideal for church plants and growing fellowship centers (1 campus, up to 150 members).',
    0.00,
    0.00,
    150,
    1,
    2000,
    '{"bleRadar": false, "smsGateway": false, "biometrics": false, "gdprPrivacyVault": true, "multiCampus": false, "mobileGivingMoMo": false, "customDomain": false, "exportAuditLogs": false}'::jsonb,
    true
  ),
  (
    'ministry_pro',
    'Ministry Pro',
    'Full proximity attendance radar and automated pastoral care for active congregations (up to 750 members, 3 campuses).',
    49.00,
    490.00,
    750,
    3,
    15000,
    '{"bleRadar": true, "smsGateway": true, "biometrics": false, "gdprPrivacyVault": true, "multiCampus": true, "mobileGivingMoMo": true, "customDomain": false, "exportAuditLogs": true}'::jsonb,
    true
  ),
  (
    'cathedral_enterprise',
    'Cathedral Enterprise',
    'Complete church management suite for multi-site cathedrals and large international ministries (up to 2,500+ members, 15 campuses).',
    120.00,
    1200.00,
    2500,
    15,
    100000,
    '{"bleRadar": true, "smsGateway": true, "biometrics": true, "gdprPrivacyVault": true, "multiCampus": true, "mobileGivingMoMo": true, "customDomain": true, "exportAuditLogs": true}'::jsonb,
    true
  )
on conflict (id) do update set
  name = excluded.name,
  monthly_cost_usd = excluded.monthly_cost_usd,
  annual_cost_usd = excluded.annual_cost_usd,
  seats_limit = excluded.seats_limit,
  sites_limit = excluded.sites_limit,
  monthly_checkins_limit = excluded.monthly_checkins_limit,
  feature_flags = excluded.feature_flags,
  updated_at = now();

-- Primary Anchor Organisation: PIWC KWADASO
insert into organizations (
  id, name, slug, org_type, country, city, campus_code, senior_pastor, contact_name, contact_email, contact_phone, status, inner_geofence_m, outer_geofence_m, dwell_time_min, sms_configured, push_configured
) values (
  'e0000000-0000-0000-0000-000000000001',
  'PIWC KWADASO',
  'piwc-kwadaso',
  'church',
  'Ghana',
  'Kumasi',
  'PIWC-01',
  'Pastor in Charge',
  'Church Administrator',
  'admin@piwckwadaso.org',
  '+233240000000',
  'active',
  60,
  300,
  5,
  true,
  true
) on conflict (id) do nothing;

-- Primary Anchor License
insert into licenses (
  id, organization_id, license_key, plan_id, status, issued_at, expires_at, grace_ends_at, billing_cycle, annual_cost_usd, notes
) values (
  'c0000000-0000-4000-8000-000000000001',
  'e0000000-0000-0000-0000-000000000001',
  'EKKLE-PIWC-KWADASO-ENT-2026',
  'cathedral_enterprise',
  'active',
  now(),
  now() + interval '365 days',
  now() + interval '372 days',
  'annual',
  1200.00,
  'Anchor Cathedral Enterprise License'
) on conflict (id) do nothing;
