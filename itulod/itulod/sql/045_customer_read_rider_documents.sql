-- 045: Booking details → Rider documents for customers.
--
-- rider-documents is a private bucket (only the rider and admins could read
-- it), but booking details linked the saved public URL, which answers
-- "Bucket not found". The apps now open the files through short-lived signed
-- links; this lets a customer sign the driver's license and OR/CR of a rider
-- who took one of their bookings. Only those two files (license-*, orcr-*):
-- the selfie, vehicle photo and NBI clearance stay with the rider and admins.

-- Did this rider take one of my bookings? (security definer: reads the four
-- booking tables directly; compares as text so a non-uuid folder can't error)
create or replace function public.is_my_rider(p_rider text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() is not null and (
       exists (select 1 from public.transport_bookings where customer_id = auth.uid() and rider_id::text = p_rider)
    or exists (select 1 from public.food_deliveries   where customer_id = auth.uid() and rider_id::text = p_rider)
    or exists (select 1 from public.parcel_deliveries where customer_id = auth.uid() and rider_id::text = p_rider)
    or exists (select 1 from public.hauling_bookings  where customer_id = auth.uid() and rider_id::text = p_rider));
$$;
revoke all on function public.is_my_rider(text) from public;
grant execute on function public.is_my_rider(text) to authenticated;

drop policy if exists rider_docs_customer_read on storage.objects;
create policy rider_docs_customer_read on storage.objects
  for select to authenticated
  using (
    bucket_id = 'rider-documents'
    and (storage.filename(name) like 'license-%' or storage.filename(name) like 'orcr-%')
    and public.is_my_rider((storage.foldername(name))[1])
  );
