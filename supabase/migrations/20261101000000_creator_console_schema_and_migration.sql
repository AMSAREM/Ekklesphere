-- ============================================================================
-- Ekklesphere Creator Console — Phase 1 Canonical Data Model & Tenant Migration
-- Unifies tenants -> organizations, adds commercial licensing, manual payments,
-- aggregate-only usage_daily, append-only audit_log, alerts, announcements,
-- feature_flags, data_requests, support_grants, and landing_cms_config.
-- Safe & idempotent (re-runnable) with explicit dry-run migration function.
-- ============================================================================

create extension if not exists pgcrypto;

-- ----------------------------------------------------------------------------
-- 1. Canonical Auth & RLS Helper Functions (app_metadata claims ONLY)
-- ----------------------------------------------------------------------------

create or replace function public.is_platform_creator()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(
    (auth.jwt() -> 'app_metadata' ->> 'creator')::boolean,
    (auth.jwt() -> 'app_metadata' ->> 'is_super_admin')::boolean,
    false
  );
$$;

revoke all on function public.is_platform_creator() from public;
grant execute on function public.is_platform_creator() to authenticated, service_role;

create or replace function public.has_organization_access(
  target_org_id uuid,
  required_roles text[] default null
)
returns boolean
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if target_org_id is null then
    return false;
  end if;

  if public.is_platform_creator() then
    return true;
  end if;

  if auth.uid() is null then
    return false;
  end if;

  return exists (
    select 1
    from public.members m
    where m.organization_id = target_org_id
      and m.user_id = auth.uid()
      and coalesce(m.status, 'active') not in ('suspended', 'inactive', 'deceased')
      and (
        required_roles is null
        or array_length(required_roles, 1) is null
        or m.role = any(required_roles)
      )
  );
end;
$$;

revoke all on function public.has_organization_access(uuid, text[]) from public;
grant execute on function public.has_organization_access(uuid, text[]) to authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 2. Extend Canonical public.organizations Table
-- ----------------------------------------------------------------------------

create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  created_at timestamptz not null default now()
);

alter table public.organizations
  add column if not exists org_type text not null default 'church',
  add column if not exists country text not null default 'Ghana',
  add column if not exists city text not null default 'Accra',
  add column if not exists campus_code text,
  add column if not exists senior_pastor text,
  add column if not exists contact_name text,
  add column if not exists contact_email text,
  add column if not exists contact_phone text,
  add column if not exists status text not null default 'trial',
  add column if not exists custom_domain text,
  add column if not exists sms_configured boolean not null default false,
  add column if not exists push_configured boolean not null default false,
  add column if not exists premise_address text,
  add column if not exists inner_geofence_m int not null default 60,
  add column if not exists outer_geofence_m int not null default 300,
  add column if not exists dwell_time_min int not null default 5,
  add column if not exists updated_at timestamptz not null default now();

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'organizations_org_type_check'
      and conrelid = 'public.organizations'::regclass
  ) then
    alter table public.organizations
      add constraint organizations_org_type_check
      check (org_type in ('church', 'organisation'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'organizations_status_check'
      and conrelid = 'public.organizations'::regclass
  ) then
    alter table public.organizations
      add constraint organizations_status_check
      check (status in ('active', 'trial', 'suspended', 'archived'));
  end if;
end $$;

-- Ensure default primary church organization exists
insert into public.organizations (
  id, name, slug, org_type, country, city, campus_code,
  senior_pastor, contact_email, contact_phone, status
)
values (
  'e0000000-0000-0000-0000-000000000001',
  'PIWC KWADASO',
  'piwc-kwadaso',
  'church',
  'Ghana',
  'Kumasi',
  'PIWC-01',
  'Pastor in Charge',
  'admin@piwckwadaso.org',
  '+233240000000',
  'active'
)
on conflict (id) do nothing;

-- ----------------------------------------------------------------------------
-- 3. Operational Tables (Sites, Raw Geofence Events, Push Subscriptions)
--    Replaces all volatile in-memory / os.tmpdir() server state.
-- ----------------------------------------------------------------------------

alter table if exists public.sites
  add column if not exists organization_id uuid references public.organizations(id) on delete cascade,
  add column if not exists address text,
  add column if not exists lat double precision,
  add column if not exists lng double precision,
  add column if not exists outer_radius_m int not null default 300,
  add column if not exists dwell_min int not null default 5,
  add column if not exists updated_by text,
  add column if not exists updated_at timestamptz not null default now();

create index if not exists idx_sites_organization_id on public.sites(organization_id);

alter table if exists public.attendance_events
  add column if not exists organization_id uuid references public.organizations(id) on delete cascade,
  add column if not exists person_id text,
  add column if not exists person_name text,
  add column if not exists service_instance_id text,
  add column if not exists lat double precision,
  add column if not exists lng double precision;

create index if not exists idx_attendance_events_org_time
  on public.attendance_events(organization_id, server_time desc);

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  person_id text,
  person_name text,
  endpoint text not null,
  p256dh text,
  auth_key text,
  user_agent text,
  subscribed_at timestamptz not null default now(),
  unique (organization_id, endpoint)
);

create index if not exists idx_push_subscriptions_org on public.push_subscriptions(organization_id);

-- ----------------------------------------------------------------------------
-- 4. Commercial Plans Catalog (3 Canonical Tiers)
-- ----------------------------------------------------------------------------

create table if not exists public.plans (
  id text primary key check (id in ('grace_starter', 'ministry_pro', 'cathedral_enterprise')),
  name text not null,
  description text not null default '',
  monthly_cost_usd numeric(10, 2) not null check (monthly_cost_usd >= 0),
  annual_cost_usd numeric(10, 2) not null check (annual_cost_usd >= 0),
  seats_limit int not null check (seats_limit > 0),
  sites_limit int not null check (sites_limit > 0),
  monthly_checkins_limit int not null check (monthly_checkins_limit > 0),
  feature_flags jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.plans (
  id, name, description, monthly_cost_usd, annual_cost_usd,
  seats_limit, sites_limit, monthly_checkins_limit, feature_flags
)
values
  (
    'grace_starter',
    'Grace Starter',
    'Essential proximity check-in and door usher headcount for growing local assemblies.',
    19.00,
    180.00,
    250,
    1,
    3000,
    '{"bleRadar": false, "smsGateway": false, "biometrics": false, "gdprPrivacyVault": true, "multiCampus": false, "mobileGivingMoMo": false, "customDomain": false, "exportAuditLogs": false}'::jsonb
  ),
  (
    'ministry_pro',
    'Ministry Pro',
    'Full pastoral care workflows, SMS/Push alerts, BLE beacons, and Mobile Money giving.',
    49.00,
    480.00,
    800,
    3,
    15000,
    '{"bleRadar": true, "smsGateway": true, "biometrics": false, "gdprPrivacyVault": true, "multiCampus": true, "mobileGivingMoMo": true, "customDomain": false, "exportAuditLogs": true}'::jsonb
  ),
  (
    'cathedral_enterprise',
    'Cathedral Enterprise',
    'Multi-campus sovereign operations, custom domains, high-capacity assemblies, and full audit SLA.',
    119.00,
    1200.00,
    2500,
    15,
    100000,
    '{"bleRadar": true, "smsGateway": true, "biometrics": true, "gdprPrivacyVault": true, "multiCampus": true, "mobileGivingMoMo": true, "customDomain": true, "exportAuditLogs": true}'::jsonb
  )
on conflict (id) do update set
  name = excluded.name,
  description = excluded.description,
  monthly_cost_usd = excluded.monthly_cost_usd,
  annual_cost_usd = excluded.annual_cost_usd,
  seats_limit = excluded.seats_limit,
  sites_limit = excluded.sites_limit,
  monthly_checkins_limit = excluded.monthly_checkins_limit,
  feature_flags = excluded.feature_flags,
  updated_at = now();

-- ----------------------------------------------------------------------------
-- 5. Licenses & Manual License Payments
-- ----------------------------------------------------------------------------

create table if not exists public.licenses (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete cascade,
  license_key text not null unique,
  plan_id text not null default 'grace_starter' references public.plans(id),
  status text not null default 'trial',
  issued_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '14 days'),
  grace_ends_at timestamptz,
  billing_cycle text not null default 'annual',
  annual_cost_usd numeric(10, 2) not null default 0,
  overrides jsonb not null default '{}'::jsonb,
  notes text,
  suspended_reason text,
  revoked_reason text,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Upgrade legacy public.licenses columns if table already existed from master_rls
alter table public.licenses
  add column if not exists organization_id uuid references public.organizations(id) on delete cascade,
  add column if not exists license_key text,
  add column if not exists plan_id text references public.plans(id),
  add column if not exists issued_at timestamptz default now(),
  add column if not exists expires_at timestamptz default (now() + interval '14 days'),
  add column if not exists grace_ends_at timestamptz,
  add column if not exists billing_cycle text default 'annual',
  add column if not exists annual_cost_usd numeric(10, 2) default 0,
  add column if not exists overrides jsonb not null default '{}'::jsonb,
  add column if not exists notes text,
  add column if not exists suspended_reason text,
  add column if not exists revoked_reason text,
  add column if not exists created_by uuid,
  add column if not exists updated_at timestamptz not null default now();

-- Normalize constraints on licenses.status and licenses.billing_cycle
do $$
begin
  alter table public.licenses drop constraint if exists licenses_status_check;
  alter table public.licenses
    add constraint licenses_status_check
    check (status in ('active', 'expired', 'revoked', 'grace_period', 'trial', 'suspended'));

  alter table public.licenses drop constraint if exists licenses_billing_cycle_check;
  alter table public.licenses
    add constraint licenses_billing_cycle_check
    check (billing_cycle in ('monthly', 'annual', 'lifetime'));
exception
  when others then null;
end $$;

create index if not exists idx_licenses_organization_id on public.licenses(organization_id);
create index if not exists idx_licenses_status_expires on public.licenses(status, expires_at);

create table if not exists public.license_payments (
  id uuid primary key default gen_random_uuid(),
  license_id uuid not null references public.licenses(id) on delete restrict,
  organization_id uuid not null references public.organizations(id) on delete restrict,
  amount numeric(12, 2) not null check (amount > 0),
  currency text not null check (currency in ('GHS', 'USD')),
  method text not null check (method in ('momo', 'bank', 'cash')),
  reference text not null,
  paid_at date not null default current_date,
  notes text,
  recorded_by uuid,
  recorded_by_email text,
  created_at timestamptz not null default now()
);

create index if not exists idx_license_payments_org on public.license_payments(organization_id, paid_at desc);
create index if not exists idx_license_payments_license on public.license_payments(license_id);

-- ----------------------------------------------------------------------------
-- 6. Auto-Issue 14-Day Trial License for Newly Created Organisations
-- ----------------------------------------------------------------------------

create or replace function public.auto_issue_trial_license_for_org()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_prefix text;
  v_key text;
begin
  if not exists (select 1 from public.licenses where organization_id = new.id) then
    v_prefix := upper(coalesce(nullif(regexp_replace(new.name, '[^A-Za-z0-9]', '', 'g'), ''), 'EKKLE'));
    v_prefix := substring(v_prefix from 1 for 6);
    v_key := 'TRIAL-' || v_prefix || '-' || upper(substring(replace(gen_random_uuid()::text, '-', '') from 1 for 8));

    insert into public.licenses (
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
    )
    values (
      new.id,
      v_key,
      'grace_starter',
      'trial',
      now(),
      now() + interval '14 days',
      now() + interval '21 days',
      'annual',
      0,
      'Auto-provisioned 14-day onboarding trial (+7d expiry grace)'
    );
  end if;
  return new;
end;
$$;

revoke all on function public.auto_issue_trial_license_for_org() from public;

drop trigger if exists trg_auto_issue_org_trial_license on public.organizations;
create trigger trg_auto_issue_org_trial_license
  after insert on public.organizations
  for each row
  execute function public.auto_issue_trial_license_for_org();

-- Ensure primary default organization has an active license
insert into public.licenses (
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
)
select
  'e0000000-0000-0000-0000-000000000001',
  'EKKLE-PIWC-KWADASO-ENT-2026',
  'cathedral_enterprise',
  'active',
  now(),
  now() + interval '365 days',
  now() + interval '372 days',
  'annual',
  1200.00,
  'Primary anchor sanctuary license'
where not exists (
  select 1 from public.licenses where organization_id = 'e0000000-0000-0000-0000-000000000001'
);

-- ----------------------------------------------------------------------------
-- 7. Aggregate-Only Daily Usage, Append-Only Audit Log & Platform Governance
-- ----------------------------------------------------------------------------

create table if not exists public.usage_daily (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  usage_date date not null,
  active_users int not null default 0 check (active_users >= 0),
  checkins_count int not null default 0 check (checkins_count >= 0),
  flagged_count int not null default 0 check (flagged_count >= 0),
  rejected_count int not null default 0 check (rejected_count >= 0),
  mock_location_attempts int not null default 0 check (mock_location_attempts >= 0),
  sites_count int not null default 0 check (sites_count >= 0),
  push_subscribers int not null default 0 check (push_subscribers >= 0),
  last_activity_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (organization_id, usage_date)
);

create index if not exists idx_usage_daily_date on public.usage_daily(usage_date desc);

create table if not exists public.audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid,
  actor_email text not null,
  actor_role text not null,
  action text not null,
  target_type text not null,
  target_id text,
  organization_id uuid references public.organizations(id) on delete set null,
  reason text,
  metadata jsonb not null default '{}'::jsonb,
  ip_address text,
  user_agent text,
  created_at timestamptz not null default now()
);

create index if not exists idx_audit_log_created_at on public.audit_log(created_at desc);
create index if not exists idx_audit_log_org on public.audit_log(organization_id, created_at desc);
create index if not exists idx_audit_log_action on public.audit_log(action);

create or replace function public.prevent_audit_log_mutation()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  raise exception 'audit_log is strictly append-only; UPDATE and DELETE operations are prohibited';
end;
$$;

drop trigger if exists trg_audit_log_append_only on public.audit_log;
create trigger trg_audit_log_append_only
  before update or delete on public.audit_log
  for each row
  execute function public.prevent_audit_log_mutation();

create table if not exists public.alerts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete cascade,
  alert_type text not null check (
    alert_type in (
      'expiring_license',
      'limit_exceeded',
      'usage_drop',
      'high_spoofing_rate',
      'geofence_not_configured',
      'comms_not_configured'
    )
  ),
  severity text not null check (severity in ('info', 'warning', 'critical')),
  status text not null default 'open' check (status in ('open', 'acknowledged', 'resolved')),
  title text not null,
  message text not null,
  dedupe_key text unique,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  acknowledged_at timestamptz,
  resolved_at timestamptz,
  resolved_by uuid
);

create index if not exists idx_alerts_status_severity on public.alerts(status, severity, created_at desc);

create table if not exists public.announcements (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  body text not null,
  severity text not null default 'info' check (severity in ('info', 'warning', 'critical')),
  target_tiers text[] not null default '{}',
  target_organization_ids uuid[] not null default '{}',
  active boolean not null default true,
  starts_at timestamptz not null default now(),
  expires_at timestamptz,
  created_by uuid,
  created_by_email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.feature_flags (
  key text primary key,
  name text not null,
  description text not null default '',
  enabled_globally boolean not null default false,
  enabled_tiers text[] not null default '{}',
  organization_overrides jsonb not null default '{}'::jsonb,
  updated_by uuid,
  updated_at timestamptz not null default now()
);

insert into public.feature_flags (key, name, description, enabled_globally, enabled_tiers)
values
  ('ble_beacon_radar', 'BLE Entrance Beacon Radar', 'Sub-10m sanctuary entrance Bluetooth Low Energy verification.', false, array['ministry_pro', 'cathedral_enterprise']),
  ('sms_pastoral_alerts', 'Automated Pastoral SMS Care', 'Send automated Hubtel/Arkesel SMS follow-ups after consecutive absences.', false, array['ministry_pro', 'cathedral_enterprise']),
  ('momo_giving_ledger', 'Mobile Money Giving Integration', 'Enable MTN MoMo & Telecel Cash congregation giving pass.', false, array['ministry_pro', 'cathedral_enterprise']),
  ('digital_member_qr', 'Digital Member QR Pass', 'Scannable member QR cards inside the mobile congregation portal.', true, array['grace_starter', 'ministry_pro', 'cathedral_enterprise']),
  ('multi_campus_roaming', 'Multi-Campus Roaming Check-in', 'Allow members to check in across sister campuses under one organisation.', false, array['cathedral_enterprise'])
on conflict (key) do nothing;

create table if not exists public.data_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  request_type text not null check (request_type in ('export', 'deletion')),
  status text not null default 'pending' check (status in ('pending', 'in_progress', 'completed', 'rejected')),
  requested_by_email text not null,
  reason text,
  notes text,
  due_at timestamptz not null default (now() + interval '30 days'),
  completed_at timestamptz,
  handled_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.support_grants (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  creator_user_id uuid not null,
  creator_email text not null,
  reason text not null check (char_length(trim(reason)) >= 5),
  access_level text not null default 'read_only_admin' check (access_level in ('read_only_admin')),
  starts_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_support_grants_active on public.support_grants(creator_user_id, expires_at desc);

create table if not exists public.landing_cms_config (
  id text primary key default 'default' check (id = 'default'),
  config jsonb not null,
  updated_by uuid,
  updated_by_email text,
  updated_at timestamptz not null default now()
);

insert into public.landing_cms_config (id, config)
values (
  'default',
  '{
    "heroTitle": "Next-Gen Presence Radar & Sovereign Church Management",
    "heroSubtitle": "Real-time automated geofence attendance, multi-role pastoral dashboards, usher door check-in station, and personal congregation mobile passes.",
    "announcementBadge": "PIWC KWADASO Live System Deployed & Geofence Active",
    "isAnnouncementActive": true,
    "contactSalesEmail": "admin@piwckwadaso.org",
    "demoEnabled": false,
    "showcaseHeadline": "Transforming Sanctuary Operations with Sovereign Geofence Radar",
    "featuredStats": {
      "congregationsServed": "Live",
      "checkinsRecorded": "Real-Time",
      "proximityAccuracy": "100m Dwell",
      "networkUptime": "99.98%"
    }
  }'::jsonb
)
on conflict (id) do nothing;

-- ----------------------------------------------------------------------------
-- 8. Safe, Re-Runnable Legacy public.tenants -> public.organizations Migration
--    Supports p_dry_run = true (zero writes, full preview) and p_dry_run = false
-- ----------------------------------------------------------------------------

create or replace function public.migrate_tenants_to_organizations(p_dry_run boolean default true)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_has_tenants boolean := to_regclass('public.tenants') is not null;
  v_has_campuses boolean := to_regclass('public.campuses') is not null;
  v_has_legacy_tenant_col boolean := false;
  v_tenants_total int := 0;
  v_orgs_to_insert int := 0;
  v_orgs_already_present int := 0;
  v_campuses_to_migrate int := 0;
  v_licenses_to_repoint int := 0;
  v_orgs_inserted int := 0;
  v_sites_upserted int := 0;
  v_licenses_repointed int := 0;
begin
  if v_has_tenants then
    execute 'select count(*) from public.tenants' into v_tenants_total;
    execute $q$
      select count(*)
      from public.tenants t
      where not exists (
        select 1 from public.organizations o
        where o.id = t.id or lower(o.slug) = lower(t.slug)
      )
    $q$ into v_orgs_to_insert;
    v_orgs_already_present := greatest(0, v_tenants_total - v_orgs_to_insert);
  end if;

  if v_has_campuses and to_regclass('public.sites') is not null then
    execute $q$
      select count(*)
      from public.campuses c
      where not exists (select 1 from public.sites s where s.id = c.id)
    $q$ into v_campuses_to_migrate;
  end if;

  select exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'licenses'
      and column_name = 'tenant_id'
  ) into v_has_legacy_tenant_col;

  if v_has_legacy_tenant_col then
    execute $q$
      select count(*)
      from public.licenses
      where organization_id is null and tenant_id is not null
    $q$ into v_licenses_to_repoint;
  end if;

  if p_dry_run then
    return jsonb_build_object(
      'dryRun', true,
      'legacyTenantsTableFound', v_has_tenants,
      'legacyCampusesTableFound', v_has_campuses,
      'tenantsTotal', v_tenants_total,
      'organizationsToInsert', v_orgs_to_insert,
      'organizationsAlreadyPresent', v_orgs_already_present,
      'campusesToMigrateToSites', v_campuses_to_migrate,
      'licensesToRepoint', v_licenses_to_repoint,
      'checkedAt', now()
    );
  end if;

  -- LIVE IDEMPOTENT EXECUTION (p_dry_run = false)
  if v_has_tenants then
    execute $q$
      with inserted as (
        insert into public.organizations (
          id, name, slug, org_type, country, status, created_at
        )
        select
          t.id,
          t.name,
          case
            when exists (select 1 from public.organizations o2 where lower(o2.slug) = lower(t.slug))
              then lower(t.slug) || '-' || substring(t.id::text from 1 for 6)
            else lower(t.slug)
          end,
          'church',
          'Ghana',
          'active',
          coalesce(t.created_at, now())
        from public.tenants t
        where not exists (select 1 from public.organizations o where o.id = t.id)
        on conflict (id) do nothing
        returning 1
      )
      select count(*) from inserted
    $q$ into v_orgs_inserted;

    execute 'comment on table public.tenants is ''DEPRECATED: Migrated into public.organizations. Retained read-only for historical audit rollback.''';
  end if;

  if v_has_campuses and to_regclass('public.sites') is not null then
    execute $q$
      with migrated_sites as (
        insert into public.sites (
          id, organization_id, name, address, lat, lng,
          location, radius_m, outer_radius_m, active, created_at
        )
        select
          c.id,
          c.tenant_id,
          c.name,
          c.address,
          c.latitude,
          c.longitude,
          ST_SetSRID(ST_MakePoint(c.longitude, c.latitude), 4326)::geography,
          coalesce(c.inner_radius_m, 100),
          coalesce(c.outer_radius_m, 300),
          coalesce(c.active, true),
          coalesce(c.created_at, now())
        from public.campuses c
        where exists (select 1 from public.organizations o where o.id = c.tenant_id)
          and not exists (select 1 from public.sites s where s.id = c.id)
        on conflict (id) do nothing
        returning 1
      )
      select count(*) from migrated_sites
    $q$ into v_sites_upserted;
  end if;

  if v_has_legacy_tenant_col then
    execute $q$
      with updated_lic as (
        update public.licenses l
        set
          organization_id = l.tenant_id,
          license_key = coalesce(l.license_key, l.key, 'LIC-' || substring(l.id::text from 1 for 8)),
          plan_id = coalesce(l.plan_id, l.tier, 'grace_starter'),
          issued_at = coalesce(l.issued_at, l.issued_date, now()),
          expires_at = coalesce(l.expires_at, l.expires_date, now() + interval '14 days'),
          grace_ends_at = coalesce(l.grace_ends_at, coalesce(l.expires_at, l.expires_date, now() + interval '14 days') + interval '7 days'),
          annual_cost_usd = coalesce(l.annual_cost_usd, 0),
          updated_at = now()
        where l.organization_id is null
          and l.tenant_id is not null
          and exists (select 1 from public.organizations o where o.id = l.tenant_id)
        returning 1
      )
      select count(*) from updated_lic
    $q$ into v_licenses_repointed;
  end if;

  return jsonb_build_object(
    'dryRun', false,
    'organizationsInserted', v_orgs_inserted,
    'sitesUpserted', v_sites_upserted,
    'licensesRepointed', v_licenses_repointed,
    'completedAt', now()
  );
end;
$$;

revoke all on function public.migrate_tenants_to_organizations(boolean) from public;
grant execute on function public.migrate_tenants_to_organizations(boolean) to service_role;
