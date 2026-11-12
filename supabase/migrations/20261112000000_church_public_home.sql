-- ============================================================================
-- Proposed Supabase Migration: Multi-Tenant Public Church Home Screen
-- File: supabase/migrations/20261112000000_church_public_home.sql
--
-- IMPORTANT: Proposed migration only (NOT auto-applied).
-- Enables multi-tenant public Home page content (profiles, service times,
-- ministries, events, news posts, and per-church theme tokens) with Row Level
-- Security (RLS) enabled and public read-only SELECT policies strictly for
-- published content (`is_published = true`).
-- ============================================================================

-- 1. Public profile & theme settings per organization
create table if not exists public.church_public_profiles (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  short_name text,
  tagline text not null default '',
  hero_headline text not null default '',
  hero_subheadline text not null default '',
  mission_heading text not null default '',
  mission_statement text not null default '',
  mission_highlights jsonb not null default '[]'::jsonb,
  address text not null default '',
  city text not null default '',
  phone text,
  email citext,
  map_query text,
  map_url text,
  livestream_url text,
  social_links jsonb not null default '{}'::jsonb,
  theme jsonb not null default '{
    "brand": "#D97706",
    "deep": "#102A22",
    "bg": "#FAF8F4",
    "text": "#16221D",
    "darkBrand": "#F59E0B",
    "darkDeep": "#0B1D17",
    "darkBg": "#0E1714",
    "darkText": "#F1F5F2"
  }'::jsonb,
  is_published boolean not null default false,
  updated_at timestamptz not null default now()
);

-- 2. Weekly recurring service times
create table if not exists public.service_times (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  day_of_week smallint not null check (day_of_week between 0 and 6),
  label text not null,
  start_time time not null,
  duration_minutes int not null default 90 check (duration_minutes > 0),
  campus text,
  description text,
  is_livestreamed boolean not null default false,
  is_published boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_service_times_org_pub
  on public.service_times (organization_id, is_published, sort_order);

-- 3. Ministries & fellowship groups
create table if not exists public.ministries (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  category text not null default 'Belong & grow',
  summary text not null default '',
  meeting_cadence text,
  leader_name text,
  image_url text,
  accent_gradient text,
  link_href text,
  is_published boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_ministries_org_pub
  on public.ministries (organization_id, is_published, sort_order);

-- 4. Public church calendar events
create table if not exists public.church_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  title text not null,
  starts_at timestamptz not null,
  ends_at timestamptz,
  time_label text not null default '',
  location text not null default '',
  category text not null default 'Gathering',
  summary text not null default '',
  image_url text,
  is_featured boolean not null default false,
  registration_href text,
  is_published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_church_events_org_pub
  on public.church_events (organization_id, is_published, starts_at);

-- 5. Parish news & community updates
create table if not exists public.news_posts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  title text not null,
  published_at timestamptz not null default now(),
  category text not null default 'Updates',
  summary text not null default '',
  author_name text,
  external_href text,
  is_published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_news_posts_org_pub
  on public.news_posts (organization_id, is_published, published_at desc);

-- ============================================================================
-- Enable Row Level Security (RLS)
-- ============================================================================

alter table public.church_public_profiles enable row level security;
alter table public.service_times enable row level security;
alter table public.ministries enable row level security;
alter table public.church_events enable row level security;
alter table public.news_posts enable row level security;

-- ============================================================================
-- Public Read-Only Policies (Published Content Only)
-- ============================================================================

-- Allow anonymous & authenticated visitors to resolve basic metadata of an organization
-- only when it has a published public Home profile.
drop policy if exists "Public can read published organization directory entries" on public.organizations;
create policy "Public can read published organization directory entries"
  on public.organizations
  for select
  to anon, authenticated
  using (
    exists (
      select 1
      from public.church_public_profiles cpp
      where cpp.organization_id = organizations.id
        and cpp.is_published = true
    )
  );

drop policy if exists "Public can read published church profiles" on public.church_public_profiles;
create policy "Public can read published church profiles"
  on public.church_public_profiles
  for select
  to anon, authenticated
  using (is_published = true);

drop policy if exists "Public can read published service times" on public.service_times;
create policy "Public can read published service times"
  on public.service_times
  for select
  to anon, authenticated
  using (
    is_published = true
    and exists (
      select 1
      from public.church_public_profiles cpp
      where cpp.organization_id = service_times.organization_id
        and cpp.is_published = true
    )
  );

drop policy if exists "Public can read published ministries" on public.ministries;
create policy "Public can read published ministries"
  on public.ministries
  for select
  to anon, authenticated
  using (
    is_published = true
    and exists (
      select 1
      from public.church_public_profiles cpp
      where cpp.organization_id = ministries.organization_id
        and cpp.is_published = true
    )
  );

drop policy if exists "Public can read published church events" on public.church_events;
create policy "Public can read published church events"
  on public.church_events
  for select
  to anon, authenticated
  using (
    is_published = true
    and exists (
      select 1
      from public.church_public_profiles cpp
      where cpp.organization_id = church_events.organization_id
        and cpp.is_published = true
    )
  );

drop policy if exists "Public can read published news posts" on public.news_posts;
create policy "Public can read published news posts"
  on public.news_posts
  for select
  to anon, authenticated
  using (
    is_published = true
    and exists (
      select 1
      from public.church_public_profiles cpp
      where cpp.organization_id = news_posts.organization_id
        and cpp.is_published = true
    )
  );

-- ============================================================================
-- Tenant Admin Write Policies (Scoped via public.has_organization_access)
-- ============================================================================

drop policy if exists "Org admins manage church profiles" on public.church_public_profiles;
create policy "Org admins manage church profiles"
  on public.church_public_profiles
  for all
  to authenticated
  using (public.has_organization_access(organization_id, 'admin'))
  with check (public.has_organization_access(organization_id, 'admin'));

drop policy if exists "Org admins manage service times" on public.service_times;
create policy "Org admins manage service times"
  on public.service_times
  for all
  to authenticated
  using (public.has_organization_access(organization_id, 'admin'))
  with check (public.has_organization_access(organization_id, 'admin'));

drop policy if exists "Org admins manage ministries" on public.ministries;
create policy "Org admins manage ministries"
  on public.ministries
  for all
  to authenticated
  using (public.has_organization_access(organization_id, 'admin'))
  with check (public.has_organization_access(organization_id, 'admin'));

drop policy if exists "Org admins manage church events" on public.church_events;
create policy "Org admins manage church events"
  on public.church_events
  for all
  to authenticated
  using (public.has_organization_access(organization_id, 'admin'))
  with check (public.has_organization_access(organization_id, 'admin'));

drop policy if exists "Org admins manage news posts" on public.news_posts;
create policy "Org admins manage news posts"
  on public.news_posts
  for all
  to authenticated
  using (public.has_organization_access(organization_id, 'admin'))
  with check (public.has_organization_access(organization_id, 'admin'));
