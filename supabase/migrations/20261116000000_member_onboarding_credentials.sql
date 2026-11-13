-- ============================================================================
-- Migration: 20261116000000_member_onboarding_credentials.sql
-- Purpose:
--   1. Add `must_change_password` and `password_updated_at` to
--      `public.account_credentials` so onboarded members (via single add or
--      bulk CSV import) receive generic temporary credentials they can change.
--   2. Allow `account_auto_provisioned` and `password_changed` in
--      `public.auth_audit_events`.
-- ============================================================================

alter table public.account_credentials
  add column if not exists must_change_password boolean not null default false,
  add column if not exists password_updated_at timestamptz;

do $$
declare
  v_constraint record;
begin
  if to_regclass('public.auth_audit_events') is not null then
    for v_constraint in
      select conname
      from pg_constraint
      where conrelid = 'public.auth_audit_events'::regclass
        and contype = 'c'
        and pg_get_constraintdef(oid) ilike '%event_type%'
    loop
      execute format('alter table public.auth_audit_events drop constraint if exists %I', v_constraint.conname);
    end loop;

    alter table public.auth_audit_events
      add constraint auth_audit_events_event_type_check
      check (
        event_type in (
          'login_success',
          'login_failed',
          'login_locked',
          'login_rate_limited',
          'register_success',
          'register_rejected',
          'token_exchanged',
          'logout',
          'account_auto_provisioned',
          'password_changed'
        )
      );
  end if;
end $$;

notify pgrst, 'reload schema';

