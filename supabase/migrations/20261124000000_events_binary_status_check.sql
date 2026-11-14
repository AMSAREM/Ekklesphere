-- Allow 'closed' alongside existing status values on public.events while remaining idempotent.
do $$
begin
  if exists (
    select 1
    from information_schema.table_constraints tc
    where tc.table_schema = 'public'
      and tc.table_name = 'events'
      and tc.constraint_name = 'events_status_check'
  ) then
    alter table public.events drop constraint events_status_check;
  end if;

  alter table public.events
    add constraint events_status_check
    check (status in ('scheduled', 'active', 'completed', 'cancelled', 'closed'));
exception
  when undefined_table then
    null;
end $$;
