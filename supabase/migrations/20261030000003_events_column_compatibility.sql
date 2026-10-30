-- ============================================================================
-- Supabase Multi-Tenant Migration Script
-- Migration: 20261030000003_events_column_compatibility.sql
-- Description:
--   Ensures public.events has starts_at and ends_at columns aligned with
--   start_time and end_time, resolving "Could not find ends_at column of events
--   in schema cache" error and supporting dual nomenclature.
-- ============================================================================

-- 1. ADD COMPATIBILITY COLUMNS IF NOT PRESENT
alter table if exists public.events
  add column if not exists starts_at timestamptz,
  add column if not exists ends_at timestamptz,
  add column if not exists site_id uuid;

-- 2. BACKFILL DATA FOR EXISTING ROWS
update public.events
set
  starts_at = coalesce(starts_at, start_time, now()),
  ends_at = coalesce(ends_at, end_time, starts_at + interval '90 minutes'),
  start_time = coalesce(start_time, starts_at, now()),
  end_time = coalesce(end_time, ends_at, starts_at + interval '90 minutes')
where starts_at is null or ends_at is null or start_time is null or end_time is null;

-- 3. BIDIRECTIONAL SYNC TRIGGER FUNCTION
create or replace function public.sync_events_timestamps()
returns trigger
language plpgsql
as $$
begin
  -- If starts_at provided but start_time missing
  if NEW.starts_at is not null and NEW.start_time is null then
    NEW.start_time := NEW.starts_at;
  elsif NEW.start_time is not null and NEW.starts_at is null then
    NEW.starts_at := NEW.start_time;
  end if;

  -- If ends_at provided but end_time missing
  if NEW.ends_at is not null and NEW.end_time is null then
    NEW.end_time := NEW.ends_at;
  elsif NEW.end_time is not null and NEW.ends_at is null then
    NEW.ends_at := NEW.end_time;
  end if;

  -- Default safety
  if NEW.starts_at is null then
    NEW.starts_at := now();
    NEW.start_time := NEW.starts_at;
  end if;
  if NEW.ends_at is null then
    NEW.ends_at := NEW.starts_at + interval '90 minutes';
    NEW.end_time := NEW.ends_at;
  end if;

  -- Allow status 'open' or map to valid status check
  if NEW.status = 'open' then
    NEW.status := 'active';
  end if;

  return NEW;
end;
$$;

drop trigger if exists trg_sync_events_timestamps on public.events;
create trigger trg_sync_events_timestamps
  before insert or update on public.events
  for each row execute function public.sync_events_timestamps();

-- Add covering indexes
create index if not exists events_starts_at_idx on public.events (organization_id, starts_at desc);
create index if not exists events_ends_at_idx on public.events (organization_id, ends_at);
