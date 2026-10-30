-- ============================================================================
-- Geofence Attendance Tracking: Supabase + PostGIS Migration
-- Sites, Attendance Events, Shifts View, RPC Functions, & RLS Policies
-- ============================================================================

-- 1. Enable PostGIS Extension
create extension if not exists postgis;

-- 2. Sites Table
create table if not exists sites (
  id        uuid primary key default gen_random_uuid(),
  name      text not null,
  location  geography(Point, 4326) not null,
  radius_m  int not null default 150,
  created_at timestamptz not null default now()
);

create index if not exists sites_location_idx on sites using gist (location);

-- Seed default site: Accra Central Campus
insert into sites (id, name, location, radius_m)
values (
  'a0000000-0000-0000-0000-000000000001',
  'Accra Central Church Sanctuary',
  ST_SetSRID(ST_MakePoint(-0.1969, 5.5560), 4326)::geography,
  150
)
on conflict (id) do nothing;

-- 3. Custom Types
do $$
begin
  if not exists (select 1 from pg_type where typname = 'event_type') then
    create type event_type as enum ('enter','exit','manual_in','manual_out');
  end if;
  if not exists (select 1 from pg_type where typname = 'event_status') then
    create type event_status as enum ('accepted','flagged','rejected');
  end if;
end $$;

-- 4. Attendance Events Table
create table if not exists attendance_events (
  id              uuid primary key default gen_random_uuid(),
  client_event_id uuid not null,
  user_id         uuid not null,
  site_id         uuid not null references sites(id),
  type            event_type not null,
  source          text not null check (source in ('geofence','manual','web','admin_edit')),
  platform        text,
  location        geography(Point, 4326),
  accuracy_m      real,
  distance_m      real,
  is_mock         boolean not null default false,
  device_time     timestamptz,
  server_time     timestamptz not null default now(),
  status          event_status not null,
  flag_reasons    text[] not null default '{}',
  unique (user_id, client_event_id)          -- idempotency for retries
);

create index if not exists attendance_events_user_time_idx on attendance_events (user_id, server_time desc);
create index if not exists attendance_events_site_time_idx on attendance_events (site_id, server_time desc);

-- 5. Row Level Security
alter table attendance_events enable row level security;

-- Users can only read their own events; only the server (service role) can write
drop policy if exists "read own events" on attendance_events;
create policy "read own events" on attendance_events
  for select using (auth.uid() = user_id);

alter table sites enable row level security;

drop policy if exists "read sites" on sites;
create policy "read sites" on sites
  for select using (auth.role() = 'authenticated');

-- 6. RPC Function: site_distance
-- Calculates precise geodesic distance (in meters) from site center
create or replace function site_distance(
  p_site uuid,
  p_lng double precision,
  p_lat double precision
)
returns table (distance_m double precision, radius_m int)
language sql stable as $$
  select ST_Distance(location, ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography),
         radius_m
  from sites where id = p_site;
$$;

-- 7. RPC Function: travel_speed_kmh
-- Detects physically impossible travel speed (> 150 km/h) from previous located event
create or replace function travel_speed_kmh(
  p_user uuid,
  p_lng double precision,
  p_lat double precision,
  p_at timestamptz
)
returns double precision
language sql stable as $$
  select case
    when p_at - server_time > interval '1 minute' then
      (ST_Distance(location,
         ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography) / 1000.0)
      / (extract(epoch from (p_at - server_time)) / 3600.0)
  end
  from attendance_events
  where user_id = p_user
    and location is not null
    and status <> 'rejected'
  order by server_time desc
  limit 1;
$$;

-- 8. View: shifts
-- Collapses raw IN and OUT events into paired shifts with durations and review flags
create or replace view shifts
with (security_invoker = true) as
with ev as (
  select
    id, user_id, site_id, server_time, status,
    case when type in ('enter','manual_in') then 'in' else 'out' end as dir,
    lag(case when type in ('enter','manual_in') then 'in' else 'out' end)
      over (partition by user_id, site_id order by server_time) as prev_dir
  from attendance_events
  where status in ('accepted','flagged')
)
select
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

-- 9. Auto-close Open Shifts (pg_cron optional)
create or replace function auto_close_open_shifts(max_hours int default 12)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  n int;
begin
  with open_shifts as (
    select user_id, site_id, clock_in
    from shifts
    where is_open
      and clock_in < now() - make_interval(hours => max_hours)
  ),
  closed as (
    insert into attendance_events
      (client_event_id, user_id, site_id, type, source,
       server_time, status, flag_reasons)
    select gen_random_uuid(), user_id, site_id, 'exit', 'admin_edit',
           clock_in + make_interval(hours => max_hours),
           'flagged', array['auto_closed']
    from open_shifts
    returning 1
  )
  select count(*) into n from closed;
  return n;
end;
$$;
