-- ============================================================================
-- Migration: 20261126000000_landing_leads_and_creator_inbox.sql
-- Purpose:
--   1. Create public.landing_leads table so every demo request, contact inquiry,
--      and quick-start lead submitted from the public landing page persists in
--      Supabase and reaches the Platform Creator Console inbox immediately.
--   2. Apply strict Creator-only RLS on public.landing_leads (server service_role
--      handles rate-limited public POST submissions; anon cannot read PII).
--   3. Allow safe public read access on default landing_cms_config and active plans
--      so the public landing page reflects live Creator Console edits & pricing.
-- ============================================================================

begin;

create table if not exists public.landing_leads (
  id uuid primary key default gen_random_uuid(),
  lead_type text not null default 'demo_request' check (
    lead_type in ('demo_request', 'contact_inquiry', 'quick_interest', 'trial_intent')
  ),
  email text not null,
  full_name text,
  phone text,
  church_name text not null,
  interest text,
  message text,
  source_section text,
  status text not null default 'new' check (
    status in ('new', 'contacted', 'qualified', 'converted', 'archived')
  ),
  creator_notes text,
  assigned_organization_id uuid references public.organizations(id) on delete set null,
  contacted_at timestamptz,
  converted_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_landing_leads_status_created
  on public.landing_leads (status, created_at desc);

create index if not exists idx_landing_leads_email_lower
  on public.landing_leads (lower(email));

alter table public.landing_leads enable row level security;

revoke all on table public.landing_leads from public, anon;
grant select, update, delete on table public.landing_leads to authenticated;
grant all on table public.landing_leads to service_role;

drop policy if exists "landing_leads_creator_only" on public.landing_leads;
create policy "landing_leads_creator_only"
  on public.landing_leads
  for all
  to authenticated
  using (public.is_platform_creator())
  with check (public.is_platform_creator());

-- Safe public read access for default Landing CMS banner/copy & active pricing tiers
drop policy if exists "landing_cms_config_public_read" on public.landing_cms_config;
create policy "landing_cms_config_public_read"
  on public.landing_cms_config
  for select
  to anon, authenticated
  using (id = 'default');

drop policy if exists "plans_public_active_read" on public.plans;
create policy "plans_public_active_read"
  on public.plans
  for select
  to anon
  using (is_active = true);

notify pgrst, 'reload schema';

commit;
