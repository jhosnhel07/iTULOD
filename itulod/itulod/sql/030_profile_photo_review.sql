-- 030_profile_photo_review.sql
-- ---------------------------------------------------------------------------
-- Profile photos at sign-up, and admin review of an approved rider's new photo.
--
-- Customers see their rider's photo on the booking, so it has to be the
-- person the admin approved. A rider's first photo (their sign-up face photo)
-- is reviewed with the rest of the application. After approval, a new photo
-- doesn't replace the current one straight away: it waits in
-- avatar_pending_url until an admin approves it (review_rider_photo).
-- Customers (and riders still waiting for approval) change their photo freely.
--
-- 1. profiles.avatar_pending_url
-- 2. profiles_photo_review: BEFORE UPDATE trigger that holds an approved
--    rider's new avatar_url back as avatar_pending_url. Runs after
--    profiles_guard (triggers fire in name order).
-- 3. review_rider_photo(rider, approve): admin-only approve / reject, with a
--    notification to the rider.
-- ---------------------------------------------------------------------------

-- 1 ------------------------------------------------------------------------
alter table public.profiles add column if not exists avatar_pending_url text;

-- 2 ------------------------------------------------------------------------
create or replace function public.profiles_photo_review()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Admins, the service role and direct database sessions decide as they like.
  if public.is_trusted_writer() or session_user in ('postgres', 'supabase_admin') then
    return new;
  end if;

  -- Only the photo change below (or an admin) fills the pending slot.
  new.avatar_pending_url := old.avatar_pending_url;

  if new.role = 'rider'
     and new.avatar_url is distinct from old.avatar_url
     and exists (
       select 1 from public.rider_applications ra
       where ra.rider_id = new.id and ra.status = 'approved'
     ) then
    new.avatar_pending_url := new.avatar_url;
    new.avatar_url := old.avatar_url;
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_photo_review on public.profiles;
create trigger profiles_photo_review
  before update on public.profiles
  for each row execute function public.profiles_photo_review();

-- 3 ------------------------------------------------------------------------
create or replace function public.review_rider_photo(p_rider uuid, p_approve boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  pending text;
begin
  if not public.is_admin() then
    raise exception 'Only an admin can review photos.' using errcode = '42501';
  end if;

  select avatar_pending_url into pending from public.profiles where id = p_rider;
  if pending is null then
    raise exception 'This rider has no photo waiting for review.';
  end if;

  update public.profiles
     set avatar_url = case when p_approve then pending else avatar_url end,
         avatar_pending_url = null
   where id = p_rider;

  insert into public.notifications (user_id, title, message)
  values (
    p_rider,
    case when p_approve then 'New profile photo approved' else 'Profile photo not approved' end,
    case when p_approve
      then 'Your new profile photo is now shown to customers.'
      else 'Your new profile photo wasn''t approved, so your previous photo stays. Please upload a clear photo of your face (no sunglasses, helmet or mask).'
    end
  );
end;
$$;

revoke all on function public.review_rider_photo(uuid, boolean) from public, anon;
grant execute on function public.review_rider_photo(uuid, boolean) to authenticated;
