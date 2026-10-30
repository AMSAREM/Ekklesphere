-- ============================================================================
-- Supabase Multi-Tenant Migration Script
-- Migration: 20261030000002_membership_extended_fields.sql
-- Description:
--   Alters public.members and public.persons to align with the complete
--   church administration schema containing all 28 membership fields:
--   - first_name, middle_name, last_name, specific_location, remarks
--   - member_id (ID / Card Number), squads, department, member_officer_name
--   - gender, date_of_birth, phone_number (phone_e164), place_of_residence
--   - residential_digital_address (GhanaPost GPS), hometown, occupation
--   - home_cell_group, month_of_birth, marital_status, spouse_name
--   - number_of_children, emergency_contact_person, emergency_phone
--   - image_url (photo), date_of_baptism, date_of_marriage
--   - date_of_salvation, date_of_membership
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. EXTEND public.members TABLE
-- ----------------------------------------------------------------------------
alter table public.members
  add column if not exists middle_name text,
  add column if not exists specific_location text,
  add column if not exists remarks text,
  add column if not exists member_id text,
  add column if not exists squads text,
  add column if not exists department text,
  add column if not exists member_officer_name text,
  add column if not exists phone_number text,
  add column if not exists place_of_residence text,
  add column if not exists residential_digital_address text,
  add column if not exists hometown text,
  add column if not exists occupation text,
  add column if not exists home_cell_group text,
  add column if not exists month_of_birth text,
  add column if not exists marital_status text,
  add column if not exists spouse_name text,
  add column if not exists number_of_children integer default 0,
  add column if not exists emergency_contact_person text,
  add column if not exists emergency_phone text,
  add column if not exists image_url text,
  add column if not exists date_of_baptism date,
  add column if not exists date_of_marriage date,
  add column if not exists date_of_salvation date,
  add column if not exists date_of_membership date;

-- Add covering indexes for common search and filter attributes
create index if not exists members_member_id_idx on public.members (member_id);
create index if not exists members_home_cell_group_idx on public.members (organization_id, home_cell_group);
create index if not exists members_department_idx on public.members (organization_id, department);
create index if not exists members_squads_idx on public.members (organization_id, squads);
create index if not exists members_marital_status_idx on public.members (organization_id, marital_status);

-- ----------------------------------------------------------------------------
-- 2. EXTEND public.persons TABLE
-- ----------------------------------------------------------------------------
alter table public.persons
  add column if not exists middle_name text,
  add column if not exists specific_location text,
  add column if not exists remarks text,
  add column if not exists member_id text,
  add column if not exists squads text,
  add column if not exists department text,
  add column if not exists member_officer_name text,
  add column if not exists phone_number text,
  add column if not exists place_of_residence text,
  add column if not exists residential_digital_address text,
  add column if not exists hometown text,
  add column if not exists occupation text,
  add column if not exists home_cell_group text,
  add column if not exists month_of_birth text,
  add column if not exists marital_status text,
  add column if not exists spouse_name text,
  add column if not exists number_of_children integer default 0,
  add column if not exists emergency_contact_person text,
  add column if not exists emergency_phone text,
  add column if not exists image_url text,
  add column if not exists date_of_baptism date,
  add column if not exists date_of_marriage date,
  add column if not exists date_of_salvation date,
  add column if not exists date_of_membership date;

create index if not exists persons_member_id_idx on public.persons (member_id);
create index if not exists persons_home_cell_group_idx on public.persons (tenant_id, home_cell_group);
create index if not exists persons_department_idx on public.persons (tenant_id, department);

-- ----------------------------------------------------------------------------
-- 3. VALIDATION RPC FUNCTION FOR MEMBERSHIP BATCH IMPORT
-- ----------------------------------------------------------------------------
create or replace function public.import_members_batch(
  target_org_id uuid,
  members_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  item jsonb;
  inserted_count int := 0;
  skipped_count int := 0;
  err_messages text[] := array[]::text[];
begin
  -- Ensure calling user has admin/owner/pastor access
  if not public.has_organization_access(target_org_id, 'pastor') then
    raise exception 'Unauthorized: Only pastors and admins may import members.';
  end if;

  for item in select * from jsonb_array_elements(members_payload)
  loop
    begin
      insert into public.members (
        organization_id,
        first_name,
        middle_name,
        last_name,
        specific_location,
        remarks,
        member_id,
        squads,
        department,
        member_officer_name,
        gender,
        date_of_birth,
        phone_e164,
        phone_number,
        place_of_residence,
        residential_digital_address,
        hometown,
        occupation,
        home_cell_group,
        month_of_birth,
        marital_status,
        spouse_name,
        number_of_children,
        emergency_contact_person,
        emergency_phone,
        image_url,
        date_of_baptism,
        date_of_marriage,
        date_of_salvation,
        date_of_membership,
        status,
        role
      ) values (
        target_org_id,
        coalesce(item->>'first_name', item->>'FIRST NAME', 'Unknown'),
        item->>'middle_name',
        coalesce(item->>'last_name', item->>'LASTNAME', 'Member'),
        coalesce(item->>'specific_location', item->>'SPECIFIC LOCATION'),
        coalesce(item->>'remarks', item->>'REMARKS'),
        coalesce(item->>'member_id', item->>'ID'),
        coalesce(item->>'squads', item->>'SQUADS'),
        coalesce(item->>'department', item->>'DEPARTMENT'),
        coalesce(item->>'member_officer_name', item->>'MEMBERS/OFFICERS NAME'),
        coalesce(item->>'gender', item->>'GENDER', 'other'),
        case when (item->>'date_of_birth') ~ '^\d{4}-\d{2}-\d{2}$' then (item->>'date_of_birth')::date else null end,
        coalesce(item->>'phone_e164', item->>'phone_number', item->>'PHONE NUMBER'),
        coalesce(item->>'phone_number', item->>'PHONE NUMBER'),
        coalesce(item->>'place_of_residence', item->>'PLACE OF RESIDENCE'),
        coalesce(item->>'residential_digital_address', item->>'RESIDENTIAL/DIGITAL ADDRESS'),
        coalesce(item->>'hometown', item->>'HOMETOWN'),
        coalesce(item->>'occupation', item->>'OCCUPATION'),
        coalesce(item->>'home_cell_group', item->>'HOME CELL GROUP', 'Osu North cell'),
        coalesce(item->>'month_of_birth', item->>'MONTH OF BIRTH'),
        coalesce(item->>'marital_status', item->>'MARITAL STATUS', 'Single'),
        coalesce(item->>'spouse_name', item->>'NAME OF SPOUSE'),
        coalesce((item->>'number_of_children')::int, 0),
        coalesce(item->>'emergency_contact_person', item->>'NAME OF PERSON TO CONTACT IN CASE OF EMERGENCY'),
        coalesce(item->>'emergency_phone', item->>'EMERGENCY', item->>'EMERGENCY PHONE'),
        coalesce(item->>'image_url', item->>'IMAGE'),
        case when (item->>'date_of_baptism') ~ '^\d{4}-\d{2}-\d{2}$' then (item->>'date_of_baptism')::date else null end,
        case when (item->>'date_of_marriage') ~ '^\d{4}-\d{2}-\d{2}$' then (item->>'date_of_marriage')::date else null end,
        case when (item->>'date_of_salvation') ~ '^\d{4}-\d{2}-\d{2}$' then (item->>'date_of_salvation')::date else null end,
        case when (item->>'date_of_membership') ~ '^\d{4}-\d{2}-\d{2}$' then (item->>'date_of_membership')::date else current_date end,
        'active',
        'member'
      )
      on conflict (organization_id, phone_e164) where phone_e164 is not null
      do update set
        first_name = excluded.first_name,
        last_name = excluded.last_name,
        middle_name = excluded.middle_name,
        specific_location = excluded.specific_location,
        remarks = excluded.remarks,
        department = excluded.department,
        home_cell_group = excluded.home_cell_group,
        residential_digital_address = excluded.residential_digital_address,
        updated_at = now();

      inserted_count := inserted_count + 1;
    exception when others then
      skipped_count := skipped_count + 1;
      err_messages := array_append(err_messages, sqlerrm);
    end;
  end loop;

  return jsonb_build_object(
    'success', true,
    'inserted', inserted_count,
    'skipped', skipped_count,
    'errors', err_messages
  );
end;
$$;
