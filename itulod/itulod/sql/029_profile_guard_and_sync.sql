-- 029_profile_guard_and_sync.sql
--
-- 1. SECURITY: a signed-in user could change protected columns on their own
--    profile row (e.g. role -> 'admin', is_active) because the update policy
--    and column grants allow any column. A BEFORE UPDATE trigger now rejects
--    changes to role / is_active / email / id / created_at / referral columns
--    unless the writer is an admin or the service role. Users can still change
--    what the apps let them: full name, phone, photo and capital on hand
--    (float_amount).
-- 2. SECURITY: sign-up took the role straight from the signup metadata, so a
--    crafted sign-up could request 'admin'. handle_new_user now only accepts
--    'customer' or 'rider' (riders still need admin approval to work).
-- 3. SECURITY: profiles_insert_self allowed inserting any row; now only your
--    own row as customer/rider (the signup trigger does the real insert).
-- 4. SYNC: profiles joins the realtime publication so the web and mobile app
--    see a profile change (capital on hand, name, phone, photo) made on the
--    other one straight away.
-- Idempotent.

-- 1 ------------------------------------------------------------------------
create or replace function public.profiles_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Admins, the service role (Edge Functions) and direct database sessions
  -- (migrations, the dashboard SQL editor) may change anything.
  if public.is_trusted_writer() or session_user in ('postgres', 'supabase_admin') then
    return new;
  end if;
  if new.id is distinct from old.id
     or new.role is distinct from old.role
     or new.is_active is distinct from old.is_active
     or new.email is distinct from old.email
     or new.created_at is distinct from old.created_at
     or new.referral_code is distinct from old.referral_code
     or new.referred_by is distinct from old.referred_by then
    raise exception 'You can only change your name, phone, photo and capital on hand.'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_guard on public.profiles;
create trigger profiles_guard
  before update on public.profiles
  for each row execute function public.profiles_guard();

-- 2 ------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  wanted text := new.raw_user_meta_data->>'role';
begin
  insert into public.profiles (id, full_name, email, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', 'New User'),
    new.email,
    -- Only customer / rider can be chosen at sign-up; admins are made by an admin.
    case when wanted in ('customer', 'rider') then wanted::user_role else 'customer'::user_role end
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

-- 3 ------------------------------------------------------------------------
drop policy if exists "profiles_insert_self" on public.profiles;
create policy "profiles_insert_self" on public.profiles
  for insert to authenticated
  with check (id = auth.uid() and role in ('customer', 'rider'));

-- 4 ------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'profiles'
  ) then
    alter publication supabase_realtime add table public.profiles;
  end if;
end $$;
