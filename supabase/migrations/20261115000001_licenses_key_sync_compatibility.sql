-- ============================================================================
-- Migration: 20261115000001_licenses_key_sync_compatibility.sql
-- Purpose:
--   Resolves SQL ERROR 23502: null value in column "key" of relation "licenses"
--   when legacy master_rls columns (key, tier, tenant_id, issued_date, expires_date)
--   coexist with Creator Console canonical columns (license_key, plan_id,
--   organization_id, issued_at, expires_at).
-- Safe & idempotent (re-runnable).
-- ============================================================================

-- 1. Relax legacy NOT NULL constraints if those legacy columns exist
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'licenses' and column_name = 'key'
  ) then
    alter table public.licenses alter column key drop not null;
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'licenses' and column_name = 'tier'
  ) then
    alter table public.licenses alter column tier drop not null;
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'licenses' and column_name = 'tenant_id'
  ) then
    alter table public.licenses alter column tenant_id drop not null;
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'licenses' and column_name = 'issued_date'
  ) then
    alter table public.licenses alter column issued_date drop not null;
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'licenses' and column_name = 'expires_date'
  ) then
    alter table public.licenses alter column expires_date drop not null;
  end if;
end $$;

-- 2. Backfill legacy <-> canonical columns on any existing rows
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'licenses' and column_name = 'key'
  ) and exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'licenses' and column_name = 'license_key'
  ) then
    update public.licenses
       set key = coalesce(key, license_key),
           license_key = coalesce(license_key, key)
     where key is null or license_key is null;
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'licenses' and column_name = 'tier'
  ) and exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'licenses' and column_name = 'plan_id'
  ) then
    update public.licenses
       set tier = coalesce(tier, plan_id, 'grace_starter'),
           plan_id = coalesce(plan_id, tier, 'grace_starter')
     where tier is null or plan_id is null;
  end if;
end $$;

-- 3. Trigger to keep legacy and canonical columns synchronized on all writes
create or replace function public.sync_licenses_legacy_columns()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_row jsonb;
begin
  v_row := to_jsonb(new);

  if v_row ? 'key' and v_row ? 'license_key' then
    if new.key is null and new.license_key is not null then
      new.key := new.license_key;
    elsif new.license_key is null and new.key is not null then
      new.license_key := new.key;
    end if;
  end if;

  if v_row ? 'tier' and v_row ? 'plan_id' then
    if new.tier is null and new.plan_id is not null then
      new.tier := new.plan_id;
    elsif new.plan_id is null and new.tier is not null then
      new.plan_id := new.tier;
    end if;
  end if;

  if v_row ? 'issued_date' and v_row ? 'issued_at' then
    if new.issued_date is null and new.issued_at is not null then
      new.issued_date := new.issued_at;
    elsif new.issued_at is null and new.issued_date is not null then
      new.issued_at := new.issued_date;
    end if;
  end if;

  if v_row ? 'expires_date' and v_row ? 'expires_at' then
    if new.expires_date is null and new.expires_at is not null then
      new.expires_date := new.expires_at;
    elsif new.expires_at is null and new.expires_date is not null then
      new.expires_at := new.expires_date;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_sync_licenses_legacy_columns on public.licenses;
create trigger trg_sync_licenses_legacy_columns
  before insert or update on public.licenses
  for each row
  execute function public.sync_licenses_legacy_columns();

-- 4. Update auto_issue_trial_license_for_org to populate license_key + plan_id (sync trigger fills legacy columns automatically)
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

-- 5. Idempotently seed primary anchor organization license only if the anchor org still exists
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
where exists (
  select 1 from public.organizations
  where id = 'e0000000-0000-0000-0000-000000000001'
)
  and not exists (
    select 1 from public.licenses
    where organization_id = 'e0000000-0000-0000-0000-000000000001'
       or license_key = 'EKKLE-PIWC-KWADASO-ENT-2026'
  );
