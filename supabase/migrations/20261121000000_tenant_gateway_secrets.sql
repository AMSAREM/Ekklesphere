-- ============================================================================
-- Migration: 20261121000000_tenant_gateway_secrets.sql
-- Purpose:
--   1. Create public.tenant_gateway_secrets to store AES-256-GCM encrypted
--      per-tenant Arkesel SMS API keys and Paystack payment keys scoped by
--      organization_id with strict RLS (never readable by anon/regular members).
--   2. Add payment reference and gateway metadata columns on public.donations
--      for idempotent Paystack checkout & webhook settlement.
-- ============================================================================

begin;

create table if not exists public.tenant_gateway_secrets (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  arkesel_api_key_enc text,
  arkesel_api_key_masked text,
  paystack_public_key text,
  paystack_secret_key_enc text,
  paystack_secret_key_masked text,
  updated_by text,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

alter table public.tenant_gateway_secrets enable row level security;

revoke all on table public.tenant_gateway_secrets from public, anon, authenticated;
grant all on table public.tenant_gateway_secrets to service_role;

drop policy if exists tenant_gateway_secrets_service_only on public.tenant_gateway_secrets;
create policy tenant_gateway_secrets_service_only
  on public.tenant_gateway_secrets
  for all
  to service_role
  using (true)
  with check (true);

do $$
begin
  if to_regclass('public.donations') is not null then
    alter table public.donations
      add column if not exists reference text,
      add column if not exists gateway_provider text,
      add column if not exists gateway_metadata jsonb;
  end if;
end
$$;

create unique index if not exists idx_donations_org_reference_unique
  on public.donations (organization_id, reference)
  where reference is not null;

commit;

notify pgrst, 'reload schema';
