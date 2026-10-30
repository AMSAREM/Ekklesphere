-- ============================================================================
-- Geofence org scoping
-- Adds organization_id to sites + attendance_events, tightens RLS to
-- membership-based access, and exposes org/event context to the shifts view.
-- Run AFTER 20261029000000_geofence_attendance.sql and
-- 20261030000000_multitenant_rls_organizations.sql.
-- ============================================================================

-- 1. sites.organization_id --------------------------------------------------
alter table public.sites
  add column if not exists organization_id uuid references public.organizations(id) on delete cascade;

-- Backfill the seeded demo site into the pilot organization
update public.sites
   set organization_id = 'e0000000-0000-0000-0000-000000000001'
 where organization_id is null
   and id = 'a0000000-0000-0000-0000-000000000001'
   and exists (select 1 from public.organizations where id = 'e0000000-0000-0000-0000-000000000001');

create index if not exists sites_org_idx on public.sites (organization_id);

-- 2. attendance_events.organization_id ---------------------------------------
alter table public.attendance_events
  add column if not exists organization_id uuid references public.organizations(id) on delete cascade;

update public.attendance_events ae
   set organization_id = s.organization_id
  from public.sites s
 where ae.site_id = s.id
   and ae.organization_id is null;

create index if not exists attendance_events_org_time_idx
  on public.attendance_events (organization_id, server_time desc);

-- 3. RLS: membership based -----------------------------------------------------
-- Writes still go through the API using the service role (it re-computes
-- distance and flags before inserting). Clients can only read.
drop policy if exists "read sites" on public.sites;
create policy "members read org sites" on public.sites
  for select using (public.has_organization_access(organization_id, 'member'));

drop policy if exists "read own events" on public.attendance_events;
drop policy if exists "members read own events" on public.attendance_events;
drop policy if exists "staff read org events" on public.attendance_events;

create policy "members read own events" on public.attendance_events
  for select using (
    auth.uid() = user_id
    and public.has_organization_access(organization_id, 'member')
  );

create policy "staff read org events" on public.attendance_events
  for select using (public.has_organization_access(organization_id, 'usher'));

-- 4. site_distance now also returns the owning organization ----------------------
drop function if exists public.site_distance(uuid, double precision, double precision);

create or replace function public.site_distance(
  p_site uuid,
  p_lng double precision,
  p_lat double precision
)
returns table (distance_m double precision, radius_m int, organization_id uuid)
language sql stable as $$
  select ST_Distance(location, ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography),
         radius_m,
         organization_id
  from public.sites where id = p_site;
$$;

-- The API calls this with the service role only
revoke all on function public.site_distance(uuid, double precision, double precision) from public, anon, authenticated;
grant execute on function public.site_distance(uuid, double precision, double precision) to service_role;

-- 5. travel_speed_kmh: look at the user's last located event (unchanged logic) ---
-- Already user-scoped; just lock execution to the service role.
revoke all on function public.travel_speed_kmh(uuid, double precision, double precision, timestamptz) from public, anon, authenticated;
grant execute on function public.travel_speed_kmh(uuid, double precision, double precision, timestamptz) to service_role;

-- 6. shifts view carries organization_id ---------------------------------------
drop view if exists public.shifts;

create view public.shifts
with (security_invoker = true) as
with ev as (
  select
    id, organization_id, user_id, site_id, server_time, status,
    case when type in ('enter','manual_in') then 'in' else 'out' end as dir,
    lag(case when type in ('enter','manual_in') then 'in' else 'out' end)
      over (partition by user_id, site_id order by server_time) as prev_dir
  from public.attendance_events
  where status in ('accepted','flagged')
)
select
  i.organization_id,
  i.user_id,
  i.site_id,
  i.id                              as in_event_id,
  i.server_time                     as clock_in,
  o.id                              as out_event_id,
  o.server_time                     as clock_out,
  o.server_time - i.server_time     as duration,
  (i.status = 'flagged' or coalesce(o.status = 'flagged', false)) as needs_review,
  (o.id is null)                    as is_open
from ev i
left join lateral (
  select e2.id, e2.server_time, e2.status
  from ev e2
  where e2.user_id = i.user_id
    and e2.site_id = i.site_id
    and e2.dir = 'out'
    and e2.server_time > i.server_time
  order by e2.server_time
  limit 1
) o on true
where i.dir = 'in'
  and (i.prev_dir is null or i.prev_dir = 'out');

-- 7. auto_close_open_shifts: org aware + service role only ---------------------
create or replace function public.auto_close_open_shifts(max_hours int default 12)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  n int;
begin
  with open_shifts as (
    select organization_id, user_id, site_id, clock_in
    from public.shifts
    where is_open
      and clock_in < now() - make_interval(hours => max_hours)
  ),
  closed as (
    insert into public.attendance_events
      (client_event_id, organization_id, user_id, site_id, type, source,
       server_time, status, flag_reasons)
    select gen_random_uuid(), organization_id, user_id, site_id, 'exit', 'admin_edit',
           clock_in + make_interval(hours => max_hours),
           'flagged', array['auto_closed']
    from open_shifts
    returning 1
  )
  select count(*) into n from closed;
  return n;
end;
$$;

revoke all on function public.auto_close_open_shifts(int) from public, anon, authenticated;
grant execute on function public.auto_close_open_shifts(int) to service_role;
