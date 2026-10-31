-- ============================================================================
-- Ekklesphere Creator Console — Phase 0/1 RLS Remediation & Nightly Rollups
-- 1. Replaces broken `auth.jwt()->>'role'` policies with `is_platform_creator()`
--    (app_metadata.creator) and `has_organization_access(organization_id, ...)`.
-- 2. Enforces creator-only access on commercial/governance tables while allowing
--    organisation admins SELECT-only access to their own license and usage_daily.
-- 3. Defines idempotent `rollup_usage_daily(date)` + proactive alert evaluation
--    and registers pg_cron nightly execution when pg_cron is installed.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Drop Broken Legacy Policies from 20261030000004_ekklesphere_master_rls.sql
-- ----------------------------------------------------------------------------

do $$
declare
  pol record;
begin
  for pol in
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname = 'public'
      and tablename in (
        'tenants', 'campuses', 'users', 'persons', 'services',
        'service_instances', 'attendance_records', 'donations',
        'system_settings', 'licenses'
      )
  loop
    execute format('drop policy if exists %I on %I.%I', pol.policyname, pol.schemaname, pol.tablename);
  end loop;
end $$;

-- Lock down deprecated legacy tables so writes only target canonical tables
do $$
declare
  t text;
begin
  foreach t in array array['tenants', 'campuses', 'users', 'persons', 'services', 'service_instances', 'attendance_records', 'donations', 'system_settings']
  loop
    if to_regclass('public.' || t) is not null then
      execute format('alter table public.%I enable row level security', t);
      execute format(
        'create policy %I on public.%I for select using (public.is_platform_creator())',
        t || '_creator_readonly_deprecated',
        t
      );
    end if;
  end loop;
end $$;

-- ----------------------------------------------------------------------------
-- 2. Enable RLS & Apply Strict Policies on Canonical Operational & Console Tables
-- ----------------------------------------------------------------------------

alter table public.organizations enable row level security;
alter table public.sites enable row level security;
alter table public.attendance_events enable row level security;
alter table public.push_subscriptions enable row level security;
alter table public.plans enable row level security;
alter table public.licenses enable row level security;
alter table public.license_payments enable row level security;
alter table public.usage_daily enable row level security;
alter table public.audit_log enable row level security;
alter table public.alerts enable row level security;
alter table public.announcements enable row level security;
alter table public.feature_flags enable row level security;
alter table public.data_requests enable row level security;
alter table public.support_grants enable row level security;
alter table public.landing_cms_config enable row level security;

-- Organizations
drop policy if exists "organizations_select_scoped" on public.organizations;
create policy "organizations_select_scoped" on public.organizations
  for select using (
    public.is_platform_creator()
    or public.has_organization_access(id)
  );

drop policy if exists "organizations_creator_all" on public.organizations;
create policy "organizations_creator_all" on public.organizations
  for all using (public.is_platform_creator())
  with check (public.is_platform_creator());

drop policy if exists "organizations_admin_update_own" on public.organizations;
create policy "organizations_admin_update_own" on public.organizations
  for update using (public.has_organization_access(id, array['owner', 'admin']))
  with check (public.has_organization_access(id, array['owner', 'admin']));

-- Sites (Geofences — scoped by organization_id, never globally readable by anon)
drop policy if exists "read sites" on public.sites;
drop policy if exists "sites_select_scoped" on public.sites;
create policy "sites_select_scoped" on public.sites
  for select using (
    public.is_platform_creator()
    or public.has_organization_access(organization_id)
  );

drop policy if exists "sites_admin_manage_scoped" on public.sites;
create policy "sites_admin_manage_scoped" on public.sites
  for all using (
    public.is_platform_creator()
    or public.has_organization_access(organization_id, array['owner', 'admin'])
  )
  with check (
    public.is_platform_creator()
    or public.has_organization_access(organization_id, array['owner', 'admin'])
  );

-- Attendance Events (Raw GPS signals — strict privacy: user own or org staff, NEVER creator console)
drop policy if exists "read own events" on public.attendance_events;
drop policy if exists "attendance_events_select_scoped" on public.attendance_events;
create policy "attendance_events_select_scoped" on public.attendance_events
  for select using (
    (select auth.uid()) = user_id
    or public.has_organization_access(organization_id, array['owner', 'admin', 'pastor', 'usher'])
  );

drop policy if exists "attendance_events_insert_scoped" on public.attendance_events;
create policy "attendance_events_insert_scoped" on public.attendance_events
  for insert with check (
    (select auth.uid()) = user_id
    or public.has_organization_access(organization_id, array['owner', 'admin', 'pastor', 'usher'])
  );

-- Push Subscriptions
drop policy if exists "push_subscriptions_scoped" on public.push_subscriptions;
create policy "push_subscriptions_scoped" on public.push_subscriptions
  for all using (
    public.has_organization_access(organization_id, array['owner', 'admin', 'pastor'])
  )
  with check (
    public.has_organization_access(organization_id)
  );

-- Plans (Authenticated users can read active plan catalog; only Creator mutates)
drop policy if exists "plans_select_authenticated" on public.plans;
create policy "plans_select_authenticated" on public.plans
  for select using (
    public.is_platform_creator()
    or ((select auth.role()) = 'authenticated' and is_active = true)
  );

drop policy if exists "plans_creator_manage" on public.plans;
create policy "plans_creator_manage" on public.plans
  for all using (public.is_platform_creator())
  with check (public.is_platform_creator());

-- Licenses (Creator full control; Org Admins may read ONLY their own license)
drop policy if exists "licenses_creator_all" on public.licenses;
create policy "licenses_creator_all" on public.licenses
  for all using (public.is_platform_creator())
  with check (public.is_platform_creator());

drop policy if exists "licenses_org_admin_read_own" on public.licenses;
create policy "licenses_org_admin_read_own" on public.licenses
  for select using (
    public.has_organization_access(organization_id, array['owner', 'admin', 'pastor'])
  );

-- License Payments (Creator-only)
drop policy if exists "license_payments_creator_only" on public.license_payments;
create policy "license_payments_creator_only" on public.license_payments
  for all using (public.is_platform_creator())
  with check (public.is_platform_creator());

-- Usage Daily (Creator full access; Org Admins may read ONLY their own aggregate usage)
drop policy if exists "usage_daily_creator_all" on public.usage_daily;
create policy "usage_daily_creator_all" on public.usage_daily
  for all using (public.is_platform_creator())
  with check (public.is_platform_creator());

drop policy if exists "usage_daily_org_admin_read_own" on public.usage_daily;
create policy "usage_daily_org_admin_read_own" on public.usage_daily
  for select using (
    public.has_organization_access(organization_id, array['owner', 'admin', 'pastor'])
  );

-- Audit Log (Creator-only SELECT and INSERT; append-only enforced by trigger)
drop policy if exists "audit_log_creator_select" on public.audit_log;
create policy "audit_log_creator_select" on public.audit_log
  for select using (public.is_platform_creator());

drop policy if exists "audit_log_creator_insert" on public.audit_log;
create policy "audit_log_creator_insert" on public.audit_log
  for insert with check (public.is_platform_creator());

-- Alerts, Data Requests, Support Grants (Creator-only)
drop policy if exists "alerts_creator_only" on public.alerts;
create policy "alerts_creator_only" on public.alerts
  for all using (public.is_platform_creator())
  with check (public.is_platform_creator());

drop policy if exists "data_requests_creator_only" on public.data_requests;
create policy "data_requests_creator_only" on public.data_requests
  for all using (public.is_platform_creator())
  with check (public.is_platform_creator());

drop policy if exists "support_grants_creator_only" on public.support_grants;
create policy "support_grants_creator_only" on public.support_grants
  for all using (public.is_platform_creator())
  with check (public.is_platform_creator());

-- Announcements (Creator manages; Org Admins read active targeted/global announcements)
drop policy if exists "announcements_creator_all" on public.announcements;
create policy "announcements_creator_all" on public.announcements
  for all using (public.is_platform_creator())
  with check (public.is_platform_creator());

drop policy if exists "announcements_org_admin_read" on public.announcements;
create policy "announcements_org_admin_read" on public.announcements
  for select using (
    active = true
    and starts_at <= now()
    and (expires_at is null or expires_at > now())
    and (
      coalesce(array_length(target_organization_ids, 1), 0) = 0
      or exists (
        select 1
        from unnest(target_organization_ids) as target_org_id
        where public.has_organization_access(target_org_id, array['owner', 'admin', 'pastor'])
      )
    )
  );

-- Feature Flags (Creator manages; authenticated users read effective flags)
drop policy if exists "feature_flags_creator_all" on public.feature_flags;
create policy "feature_flags_creator_all" on public.feature_flags
  for all using (public.is_platform_creator())
  with check (public.is_platform_creator());

drop policy if exists "feature_flags_authenticated_read" on public.feature_flags;
create policy "feature_flags_authenticated_read" on public.feature_flags
  for select using ((select auth.role()) = 'authenticated' or public.is_platform_creator());

-- Landing Page CMS Config (Public read for marketing page; Creator-only write)
drop policy if exists "landing_cms_public_read" on public.landing_cms_config;
create policy "landing_cms_public_read" on public.landing_cms_config
  for select using (true);

drop policy if exists "landing_cms_creator_write" on public.landing_cms_config;
create policy "landing_cms_creator_write" on public.landing_cms_config
  for all using (public.is_platform_creator())
  with check (public.is_platform_creator());

-- ----------------------------------------------------------------------------
-- 3. Nightly Aggregate Rollup & Proactive Alert Generator (Privacy-Safe)
--    Computes aggregate counts ONLY — never copies names, GPS trails, or giving.
-- ----------------------------------------------------------------------------

create or replace function public.rollup_usage_daily(p_target_date date default (current_date - 1))
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_start timestamptz := p_target_date::timestamptz;
  v_end timestamptz := (p_target_date + 1)::timestamptz;
  v_orgs_processed int := 0;
  v_alerts_upserted int := 0;
begin
  -- 1. Transition license statuses based on 7-day grace window
  update public.licenses
  set
    status = case
      when now() > coalesce(grace_ends_at, expires_at + interval '7 days') then 'expired'
      else 'grace_period'
    end,
    grace_ends_at = coalesce(grace_ends_at, expires_at + interval '7 days'),
    updated_at = now()
  where status in ('active', 'trial', 'grace_period')
    and expires_at < now();

  -- 2. Upsert aggregate-only daily usage per organization
  with org_rollup as (
    select
      o.id as organization_id,
      p_target_date as usage_date,
      coalesce((
        select count(distinct a.member_id)
        from public.attendance a
        where a.organization_id = o.id
          and a.checked_in_at >= v_start
          and a.checked_in_at < v_end
      ), 0) as active_users,
      coalesce((
        select count(*)
        from public.attendance a
        where a.organization_id = o.id
          and a.checked_in_at >= v_start
          and a.checked_in_at < v_end
      ), 0) as checkins_count,
      coalesce((
        select count(*)
        from public.attendance_events ae
        where ae.organization_id = o.id
          and ae.server_time >= v_start
          and ae.server_time < v_end
          and ae.status = 'flagged'
      ), 0) as flagged_count,
      coalesce((
        select count(*)
        from public.attendance_events ae
        where ae.organization_id = o.id
          and ae.server_time >= v_start
          and ae.server_time < v_end
          and ae.status = 'rejected'
      ), 0) as rejected_count,
      coalesce((
        select count(*)
        from public.attendance_events ae
        where ae.organization_id = o.id
          and ae.server_time >= v_start
          and ae.server_time < v_end
          and ae.is_mock = true
      ), 0) as mock_location_attempts,
      coalesce((
        select count(*)
        from public.sites s
        where s.organization_id = o.id
          and s.active = true
      ), 0) as sites_count,
      coalesce((
        select count(*)
        from public.push_subscriptions ps
        where ps.organization_id = o.id
      ), 0) as push_subscribers,
      greatest(
        (select max(a.checked_in_at) from public.attendance a where a.organization_id = o.id),
        (select max(ae.server_time) from public.attendance_events ae where ae.organization_id = o.id)
      ) as last_activity_at
    from public.organizations o
    where o.status <> 'archived'
  ),
  upserted as (
    insert into public.usage_daily (
      organization_id, usage_date, active_users, checkins_count,
      flagged_count, rejected_count, mock_location_attempts,
      sites_count, push_subscribers, last_activity_at, updated_at
    )
    select
      organization_id, usage_date, active_users, checkins_count,
      flagged_count, rejected_count, mock_location_attempts,
      sites_count, push_subscribers, last_activity_at, now()
    from org_rollup
    on conflict (organization_id, usage_date) do update set
      active_users = excluded.active_users,
      checkins_count = excluded.checkins_count,
      flagged_count = excluded.flagged_count,
      rejected_count = excluded.rejected_count,
      mock_location_attempts = excluded.mock_location_attempts,
      sites_count = excluded.sites_count,
      push_subscribers = excluded.push_subscribers,
      last_activity_at = excluded.last_activity_at,
      updated_at = now()
    returning 1
  )
  select count(*) into v_orgs_processed from upserted;

  -- 3. Generate proactive deduplicated alerts
  -- 3a. Expiring licenses (within 30 days)
  insert into public.alerts (organization_id, alert_type, severity, title, message, dedupe_key, metadata)
  select
    l.organization_id,
    'expiring_license',
    case when l.expires_at <= now() + interval '7 days' then 'critical' else 'warning' end,
    format('License expiring for %s', o.name),
    format('Plan %s (%s) expires on %s.', l.plan_id, l.status, to_char(l.expires_at, 'YYYY-MM-DD')),
    'expiring_license:' || l.id::text || ':' || to_char(l.expires_at, 'YYYY-MM-DD'),
    jsonb_build_object('licenseId', l.id, 'expiresAt', l.expires_at, 'planId', l.plan_id)
  from public.licenses l
  join public.organizations o on o.id = l.organization_id
  where l.status in ('active', 'trial', 'grace_period')
    and l.expires_at <= now() + interval '30 days'
  on conflict (dedupe_key) do update set
    severity = excluded.severity,
    message = excluded.message;

  get diagnostics v_alerts_upserted = row_count;

  -- 3b. Geofence not configured
  insert into public.alerts (organization_id, alert_type, severity, title, message, dedupe_key)
  select
    o.id,
    'geofence_not_configured',
    'warning',
    format('Geofence not configured for %s', o.name),
    'Organisation has zero active campus geofence coordinates configured.',
    'geofence_not_configured:' || o.id::text
  from public.organizations o
  where o.status in ('active', 'trial')
    and not exists (
      select 1 from public.sites s
      where s.organization_id = o.id and s.active = true
    )
  on conflict (dedupe_key) do nothing;

  -- 3c. High GPS spoofing rate on target date
  insert into public.alerts (organization_id, alert_type, severity, title, message, dedupe_key, metadata)
  select
    u.organization_id,
    'high_spoofing_rate',
    'critical',
    format('Elevated mock-location spoofing at %s', o.name),
    format('%s mock-location attempts detected on %s.', u.mock_location_attempts, p_target_date),
    'high_spoofing_rate:' || u.organization_id::text || ':' || p_target_date::text,
    jsonb_build_object('mockAttempts', u.mock_location_attempts, 'date', p_target_date)
  from public.usage_daily u
  join public.organizations o on o.id = u.organization_id
  where u.usage_date = p_target_date
    and u.mock_location_attempts >= 3
  on conflict (dedupe_key) do nothing;

  return jsonb_build_object(
    'targetDate', p_target_date,
    'organizationsProcessed', v_orgs_processed,
    'alertsUpserted', v_alerts_upserted,
    'completedAt', now()
  );
end;
$$;

revoke all on function public.rollup_usage_daily(date) from public;
grant execute on function public.rollup_usage_daily(date) to service_role;

-- ----------------------------------------------------------------------------
-- 4. Register Nightly pg_cron Job (when pg_cron extension is available)
-- ----------------------------------------------------------------------------

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule(
      'ekklesphere-nightly-usage-rollup',
      '15 0 * * *',
      $cron$select public.rollup_usage_daily(current_date - 1); select public.rollup_usage_daily(current_date);$cron$
    );
  end if;
exception
  when others then
    raise notice 'pg_cron schedule registration skipped (extension not active in this database instance).';
end $$;
