-- ============================================================================
-- Migration: 20261031000000_sync_events_schema_cache.sql
-- Ensures idempotent organization bootstrap and reloads PostgREST schema cache
-- ============================================================================

insert into public.organizations (
  id, name, slug, timezone
) values (
  'e0000000-0000-0000-0000-000000000001',
  'PIWC KWADASO',
  'primary-church',
  'Africa/Accra'
) on conflict do nothing;

alter table public.events
  add column if not exists start_time timestamptz default now(),
  add column if not exists end_time timestamptz default (now() + interval '90 minutes'),
  add column if not exists dwell_min int not null default 5;

notify pgrst, 'reload schema';
