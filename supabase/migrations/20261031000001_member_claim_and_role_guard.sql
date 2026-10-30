-- ============================================================================
-- Supabase Auth ↔ members linking + role escalation guard
-- ============================================================================

-- 1. claim_my_member_rows()
-- Called by the web app right after sign-in. Links unclaimed `members` rows
-- (user_id is null) whose email matches the signed-in user's VERIFIED email.
-- Admins pre-register people; people then sign in with Google and are linked.
create or replace function public.claim_my_member_rows()
returns int
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_uid uuid := auth.uid();
  v_email text;
  n int;
begin
  if v_uid is null then
    return 0;
  end if;

  select email into v_email
  from auth.users
  where id = v_uid
    and email_confirmed_at is not null;

  if v_email is null then
    return 0;
  end if;

  update public.members
     set user_id = v_uid,
         updated_at = now()
   where user_id is null
     and email is not null
     and lower(email::text) = lower(v_email)
     and status in ('active', 'pending');

  get diagnostics n = row_count;
  return n;
end;
$$;

revoke all on function public.claim_my_member_rows() from public, anon;
grant execute on function public.claim_my_member_rows() to authenticated;

-- 2. Role escalation guard
-- The existing members_update_policy lets a user update their own row, which
-- would let a plain member set role = 'admin'. Block sensitive column changes
-- unless the caller is an org admin. Service-role/server calls (auth.uid() is
-- null) are unaffected.
create or replace function public.members_guard_sensitive_columns()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if auth.uid() is null then
    return new;
  end if;

  if (new.role is distinct from old.role
      or new.status is distinct from old.status
      or new.organization_id is distinct from old.organization_id
      or new.user_id is distinct from old.user_id)
     and not public.has_organization_access(old.organization_id, 'admin') then
    raise exception 'Only an organization admin can change role, status, organization or user link'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists members_guard_sensitive_columns on public.members;
create trigger members_guard_sensitive_columns
  before update on public.members
  for each row execute function public.members_guard_sensitive_columns();

-- Same protection for self-inserts: a user may only insert themselves as a
-- plain member, never with an elevated role.
create or replace function public.members_guard_insert_role()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if auth.uid() is null then
    return new;
  end if;

  if new.role <> 'member' and not public.has_organization_access(new.organization_id, 'admin') then
    raise exception 'Only an organization admin can create members with role %', new.role
      using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists members_guard_insert_role on public.members;
create trigger members_guard_insert_role
  before insert on public.members
  for each row execute function public.members_guard_insert_role();
