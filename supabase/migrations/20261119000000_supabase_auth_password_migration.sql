-- ============================================================================
-- Migration: 20261119000000_supabase_auth_password_migration.sql
-- Purpose:
--   1. Make password_hash and password_salt nullable on public.account_credentials
--      so Supabase Auth (auth.users) is the single source of truth for passwords
--      and migrated/new accounts do not store duplicate password hashes.
--   2. Ensure indexes exist on public.users(auth_user_id) and
--      public.account_credentials(auth_user_id) for fast identity resolution.
--   3. Keep public.account_credentials strictly locked down from all client roles
--      (anon, authenticated, public) per Supabase Auth security best practices.
-- ============================================================================

do $$
begin
  if to_regclass('public.account_credentials') is not null then
    alter table public.account_credentials
      add column if not exists auth_user_id uuid;

    alter table public.account_credentials
      alter column password_hash drop not null;

    alter table public.account_credentials
      alter column password_salt drop not null;

    alter table public.account_credentials enable row level security;
    revoke all on table public.account_credentials from public, anon, authenticated;
    grant all on table public.account_credentials to service_role;

    drop policy if exists "account_credentials_deny_all_clients" on public.account_credentials;
    create policy "account_credentials_deny_all_clients"
      on public.account_credentials
      for all
      to public, anon, authenticated
      using (false)
      with check (false);
  end if;
end $$;

create index if not exists account_credentials_auth_user_idx
  on public.account_credentials (auth_user_id);

do $$
begin
  if to_regclass('public.users') is not null then
    create index if not exists idx_users_auth_user_id
      on public.users (auth_user_id);
  end if;
end $$;

notify pgrst, 'reload schema';
