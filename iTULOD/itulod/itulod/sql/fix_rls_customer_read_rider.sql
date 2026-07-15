-- =====================================================================
-- Fix: Allow customers to read the profile of the rider assigned
--      to one of their own bookings.
-- Run this once in the Supabase SQL Editor.
-- =====================================================================

-- Drop the old restrictive policy first (safe – we'll replace it)
drop policy if exists "profiles_select_own_or_admin" on public.profiles;

-- New policy: a user can read their own profile, an admin can read all,
-- OR a customer can read the profile of any rider who is currently
-- assigned to one of their transport/food/parcel bookings.
create policy "profiles_select_own_admin_or_assigned_rider" on public.profiles
  for select using (
    id = auth.uid()
    or public.is_admin()
    or exists (
      select 1 from public.transport_bookings
      where rider_id = profiles.id and customer_id = auth.uid()
    )
    or exists (
      select 1 from public.food_deliveries
      where rider_id = profiles.id and customer_id = auth.uid()
    )
    or exists (
      select 1 from public.parcel_deliveries
      where rider_id = profiles.id and customer_id = auth.uid()
    )
  );

-- Drop and recreate rider_applications select policy so customers
-- can see application details (vehicle type, plate) for their rider.
drop policy if exists "rider_app_select" on public.rider_applications;

create policy "rider_app_select" on public.rider_applications
  for select using (
    rider_id = auth.uid()
    or public.is_admin()
    or exists (
      select 1 from public.transport_bookings
      where rider_id = rider_applications.rider_id and customer_id = auth.uid()
    )
    or exists (
      select 1 from public.food_deliveries
      where rider_id = rider_applications.rider_id and customer_id = auth.uid()
    )
    or exists (
      select 1 from public.parcel_deliveries
      where rider_id = rider_applications.rider_id and customer_id = auth.uid()
    )
  );
