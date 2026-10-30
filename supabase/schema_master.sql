-- ============================================================================
-- SchoolSphere 3.1 Master Database Schema & Multi-Tenant RLS Architecture
-- supabase/schema_master.sql
-- ============================================================================

create extension if not exists pgcrypto;
create extension if not exists postgis;
create extension if not exists citext;

-- ----------------------------------------------------------------------------
-- 1. SCHOOLS (TENANTS)
-- ----------------------------------------------------------------------------
create table if not exists public.schools (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  code citext unique not null,
  address text,
  city text,
  country text default 'Ghana',
  currency text default 'GHS',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.schools enable row level security;

create policy "schools_select" on public.schools
  for select using (
    id = (auth.jwt() ->> 'school_id')::uuid 
    or (auth.jwt() ->> 'role') in ('super_admin', 'creator')
  );

create policy "schools_admin_all" on public.schools
  for all using (
    (auth.jwt() ->> 'role') in ('super_admin', 'creator')
  );

-- ----------------------------------------------------------------------------
-- 2. USERS
-- ----------------------------------------------------------------------------
create table if not exists public.users (
  id uuid primary key default gen_random_uuid(),
  school_id uuid references public.schools(id) on delete cascade,
  email citext unique not null,
  role text not null check (role in ('super_admin', 'creator', 'admin', 'teacher', 'accountant', 'student')),
  username citext unique,
  full_name text not null,
  status text not null default 'active' check (status in ('active', 'suspended', 'pending_reset')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.users enable row level security;

create policy "users_school_scoped_select" on public.users
  for select using (
    school_id = (auth.jwt() ->> 'school_id')::uuid 
    or id = (auth.jwt() ->> 'sub')::uuid
    or (auth.jwt() ->> 'role') in ('super_admin', 'creator')
  );

create policy "users_school_scoped_insert" on public.users
  for insert with check (
    (school_id = (auth.jwt() ->> 'school_id')::uuid and (auth.jwt() ->> 'role') in ('admin', 'super_admin', 'creator'))
    or (auth.jwt() ->> 'role') in ('super_admin', 'creator')
  );

create policy "users_school_scoped_update" on public.users
  for update using (
    (school_id = (auth.jwt() ->> 'school_id')::uuid and (auth.jwt() ->> 'role') in ('admin', 'super_admin', 'creator'))
    or id = (auth.jwt() ->> 'sub')::uuid
    or (auth.jwt() ->> 'role') in ('super_admin', 'creator')
  );

create policy "users_school_scoped_delete" on public.users
  for delete using (
    (school_id = (auth.jwt() ->> 'school_id')::uuid and (auth.jwt() ->> 'role') in ('admin', 'super_admin', 'creator'))
    or (auth.jwt() ->> 'role') in ('super_admin', 'creator')
  );

-- ----------------------------------------------------------------------------
-- 3. STUDENTS
-- ----------------------------------------------------------------------------
create table if not exists public.students (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  first_name text not null,
  last_name text not null,
  grade text not null,
  roll_number text,
  gender text check (gender in ('male', 'female', 'other')),
  parent_phone text,
  parent_email citext,
  status text not null default 'active' check (status in ('active', 'transferred', 'graduated')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.students enable row level security;

create policy "students_school_isolation_select" on public.students
  for select using (
    school_id = (auth.jwt() ->> 'school_id')::uuid 
    or (auth.jwt() ->> 'role') in ('super_admin', 'creator')
  );

create policy "students_school_isolation_insert" on public.students
  for insert with check (
    (school_id = (auth.jwt() ->> 'school_id')::uuid and (auth.jwt() ->> 'role') in ('admin', 'teacher', 'super_admin', 'creator'))
    or (auth.jwt() ->> 'role') in ('super_admin', 'creator')
  );

create policy "students_school_isolation_update" on public.students
  for update using (
    (school_id = (auth.jwt() ->> 'school_id')::uuid and (auth.jwt() ->> 'role') in ('admin', 'teacher', 'super_admin', 'creator'))
    or (auth.jwt() ->> 'role') in ('super_admin', 'creator')
  );

create policy "students_school_isolation_delete" on public.students
  for delete using (
    (school_id = (auth.jwt() ->> 'school_id')::uuid and (auth.jwt() ->> 'role') in ('admin', 'super_admin', 'creator'))
    or (auth.jwt() ->> 'role') in ('super_admin', 'creator')
  );

-- ----------------------------------------------------------------------------
-- 4. ATTENDANCE
-- ----------------------------------------------------------------------------
create table if not exists public.attendance (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  date date not null default current_date,
  status text not null check (status in ('present', 'absent', 'late', 'excused')),
  notes text,
  marked_by uuid references public.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint attendance_student_date_uq unique (student_id, date)
);

alter table public.attendance enable row level security;

create policy "attendance_school_isolation_select" on public.attendance
  for select using (
    school_id = (auth.jwt() ->> 'school_id')::uuid 
    or (auth.jwt() ->> 'role') in ('super_admin', 'creator')
  );

create policy "attendance_school_isolation_insert" on public.attendance
  for insert with check (
    (school_id = (auth.jwt() ->> 'school_id')::uuid and (auth.jwt() ->> 'role') in ('admin', 'teacher', 'super_admin', 'creator'))
    or (auth.jwt() ->> 'role') in ('super_admin', 'creator')
  );

create policy "attendance_school_isolation_update" on public.attendance
  for update using (
    (school_id = (auth.jwt() ->> 'school_id')::uuid and (auth.jwt() ->> 'role') in ('admin', 'teacher', 'super_admin', 'creator'))
    or (auth.jwt() ->> 'role') in ('super_admin', 'creator')
  );

create policy "attendance_school_isolation_delete" on public.attendance
  for delete using (
    (school_id = (auth.jwt() ->> 'school_id')::uuid and (auth.jwt() ->> 'role') in ('admin', 'super_admin', 'creator'))
    or (auth.jwt() ->> 'role') in ('super_admin', 'creator')
  );

-- ----------------------------------------------------------------------------
-- 5. FEES
-- ----------------------------------------------------------------------------
create table if not exists public.fees (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  amount numeric(12, 2) not null,
  amount_paid numeric(12, 2) not null default 0,
  term text not null,
  academic_year text not null,
  status text not null default 'unpaid' check (status in ('paid', 'partial', 'unpaid')),
  due_date date,
  receipt_number text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.fees enable row level security;

create policy "fees_school_isolation_select" on public.fees
  for select using (
    school_id = (auth.jwt() ->> 'school_id')::uuid 
    or (auth.jwt() ->> 'role') in ('super_admin', 'creator')
  );

create policy "fees_school_isolation_insert" on public.fees
  for insert with check (
    (school_id = (auth.jwt() ->> 'school_id')::uuid and (auth.jwt() ->> 'role') in ('admin', 'accountant', 'super_admin', 'creator'))
    or (auth.jwt() ->> 'role') in ('super_admin', 'creator')
  );

create policy "fees_school_isolation_update" on public.fees
  for update using (
    (school_id = (auth.jwt() ->> 'school_id')::uuid and (auth.jwt() ->> 'role') in ('admin', 'accountant', 'super_admin', 'creator'))
    or (auth.jwt() ->> 'role') in ('super_admin', 'creator')
  );

create policy "fees_school_isolation_delete" on public.fees
  for delete using (
    (school_id = (auth.jwt() ->> 'school_id')::uuid and (auth.jwt() ->> 'role') in ('admin', 'super_admin', 'creator'))
    or (auth.jwt() ->> 'role') in ('super_admin', 'creator')
  );

-- ----------------------------------------------------------------------------
-- 6. RESULTS
-- ----------------------------------------------------------------------------
create table if not exists public.results (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  subject text not null,
  score numeric(5, 2) not null,
  grade_letter text,
  term text not null,
  academic_year text not null,
  teacher_id uuid references public.users(id),
  remarks text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.results enable row level security;

create policy "results_school_isolation_select" on public.results
  for select using (
    school_id = (auth.jwt() ->> 'school_id')::uuid 
    or (auth.jwt() ->> 'role') in ('super_admin', 'creator')
  );

create policy "results_school_isolation_insert" on public.results
  for insert with check (
    (school_id = (auth.jwt() ->> 'school_id')::uuid and (auth.jwt() ->> 'role') in ('admin', 'teacher', 'super_admin', 'creator'))
    or (auth.jwt() ->> 'role') in ('super_admin', 'creator')
  );

create policy "results_school_isolation_update" on public.results
  for update using (
    (school_id = (auth.jwt() ->> 'school_id')::uuid and (auth.jwt() ->> 'role') in ('admin', 'teacher', 'super_admin', 'creator'))
    or (auth.jwt() ->> 'role') in ('super_admin', 'creator')
  );

create policy "results_school_isolation_delete" on public.results
  for delete using (
    (school_id = (auth.jwt() ->> 'school_id')::uuid and (auth.jwt() ->> 'role') in ('admin', 'super_admin', 'creator'))
    or (auth.jwt() ->> 'role') in ('super_admin', 'creator')
  );

-- ----------------------------------------------------------------------------
-- 7. LICENSES (Moved out of source code into Supabase)
-- ----------------------------------------------------------------------------
create table if not exists public.licenses (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  license_key text unique not null,
  tier text not null default 'standard' check (tier in ('trial', 'standard', 'premium', 'enterprise')),
  status text not null default 'active' check (status in ('active', 'expired', 'revoked', 'pending')),
  max_students integer not null default 500,
  valid_until timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.licenses enable row level security;

create policy "licenses_school_isolation_select" on public.licenses
  for select using (
    school_id = (auth.jwt() ->> 'school_id')::uuid 
    or (auth.jwt() ->> 'role') in ('super_admin', 'creator')
  );

create policy "licenses_admin_modify" on public.licenses
  for all using (
    (auth.jwt() ->> 'role') in ('super_admin', 'creator')
  );
