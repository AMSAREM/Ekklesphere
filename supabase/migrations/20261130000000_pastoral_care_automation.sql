-- ============================================================================
-- Migration: 20261130000000_pastoral_care_automation.sql
-- Purpose:
--   1. Extend public.followup_tasks with leader assignment & reminder tracking.
--   2. Create public.pastoral_care_dispatches (absent member outreach + leader reminders).
--   3. Create public.service_absence_runs (idempotent per-service absence sweep ledger).
--   4. Reload PostgREST schema cache.
-- ============================================================================

do $$
begin
  if to_regclass('public.followup_tasks') is not null then
    alter table public.followup_tasks
      add column if not exists assigned_to_member_id uuid references public.members(id) on delete set null,
      add column if not exists assigned_to_role text,
      add column if not exists assigned_to_phone text,
      add column if not exists assigned_to_email text,
      add column if not exists auto_assigned boolean not null default false,
      add column if not exists last_reminder_at timestamptz,
      add column if not exists reminder_count integer not null default 0,
      add column if not exists service_event_id uuid,
      add column if not exists service_name text,
      add column if not exists acknowledged_at timestamptz;
  end if;
end
$$;

create table if not exists public.pastoral_care_dispatches (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  dispatch_type text not null check (dispatch_type in ('absent_member_alert', 'leader_reminder')),
  service_event_id uuid,
  service_name text,
  followup_task_id uuid references public.followup_tasks(id) on delete set null,
  member_id uuid references public.members(id) on delete set null,
  member_name text not null,
  recipient_name text not null,
  recipient_role text,
  recipient_phone text,
  recipient_email text,
  channel text not null check (channel in ('sms', 'email', 'push', 'in_app')),
  status text not null check (status in ('sent', 'queued', 'skipped_unconfigured', 'skipped_opt_out', 'skipped_no_contact', 'failed')),
  message_body text not null,
  provider text,
  error_message text,
  acknowledged_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_pastoral_dispatches_org_created
  on public.pastoral_care_dispatches (organization_id, created_at desc);

create index if not exists idx_pastoral_dispatches_org_type
  on public.pastoral_care_dispatches (organization_id, dispatch_type, created_at desc);

alter table public.pastoral_care_dispatches enable row level security;

drop policy if exists "Org oversight can access pastoral care dispatches" on public.pastoral_care_dispatches;
create policy "Org oversight can access pastoral care dispatches"
  on public.pastoral_care_dispatches
  for all
  to authenticated
  using (public.has_organization_access(organization_id, null))
  with check (public.has_organization_access(organization_id, null));

create table if not exists public.service_absence_runs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  event_id uuid not null,
  event_name text,
  trigger_source text not null default 'service_closed',
  absent_members_count integer not null default 0,
  member_messages_sent integer not null default 0,
  tasks_created_count integer not null default 0,
  leader_reminders_sent integer not null default 0,
  triggered_by text,
  created_at timestamptz not null default now(),
  unique (organization_id, event_id)
);

create index if not exists idx_service_absence_runs_org_created
  on public.service_absence_runs (organization_id, created_at desc);

alter table public.service_absence_runs enable row level security;

drop policy if exists "Org oversight can access service absence runs" on public.service_absence_runs;
create policy "Org oversight can access service absence runs"
  on public.service_absence_runs
  for all
  to authenticated
  using (public.has_organization_access(organization_id, null))
  with check (public.has_organization_access(organization_id, null));

notify pgrst, 'reload schema';
