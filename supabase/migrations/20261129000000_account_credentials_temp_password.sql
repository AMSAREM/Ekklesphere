-- ============================================================================
-- Migration: 20261129000000_account_credentials_temp_password.sql
-- Purpose:
--   1. Add `temp_password_encrypted` to `public.account_credentials` so
--      organisation administrators can view & copy a member's active working
--      temporary password until the member changes it to a personal password.
--   2. Keep `public.account_credentials` strictly locked down (`service_role` only).
-- ============================================================================

alter table if exists public.account_credentials
  add column if not exists temp_password_encrypted text;

notify pgrst, 'reload schema';
