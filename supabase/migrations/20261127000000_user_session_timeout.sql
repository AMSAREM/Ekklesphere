-- Add configurable user idle session timeout column on organizations / system_settings (idempotent)
do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'organizations'
  ) then
    alter table public.organizations
      add column if not exists session_timeout_minutes integer not null default 30;
  end if;
end $$;
