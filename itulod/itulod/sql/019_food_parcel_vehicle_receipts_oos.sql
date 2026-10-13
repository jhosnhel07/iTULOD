-- =============================================================================
-- iTULOD migration 019: food/parcel vehicle, receipts bucket, out-of-stock, realtime
-- -----------------------------------------------------------------------------
-- Four gaps found while bringing the mobile app in line with the web app.
-- Each one broke a flow on BOTH clients:
--
-- 1. food_deliveries / parcel_deliveries had no vehicle_id column, but both
--    the web (customer.js) and the app insert one — so every food and parcel
--    booking was rejected by PostgREST ("column not found"). Only
--    transport_bookings had it (schema.sql).
-- 2. The rider's food receipt photo uploads to a `receipts` bucket that was
--    never created, so the upload always failed (web fell back to confirming
--    the fare without a photo).
-- 3. food_order_items had no UPDATE policy, so a rider's "mark out of stock"
--    silently updated zero rows. Riders get an update policy scoped to their
--    own active delivery, and a column grant limits them to is_out_of_stock.
-- 4. The supabase_realtime publication only carried rider_locations, so the
--    dashboards' postgres_changes subscriptions on bookings, notifications
--    and chat never fired — screens only updated on reload. Realtime still
--    applies each table's RLS, so publishing them exposes nothing new.
--
-- Run AFTER 018. Safe to re-run (idempotent).
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. vehicle_id on food / parcel deliveries
-- ---------------------------------------------------------------------------
alter table public.food_deliveries   add column if not exists vehicle_id uuid references public.vehicles(id);
alter table public.parcel_deliveries add column if not exists vehicle_id uuid references public.vehicles(id);

-- ---------------------------------------------------------------------------
-- 2. receipts bucket — the rider uploads under their own uid folder, same
--    model as delivery-proof (011).
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('receipts', 'receipts', true)
on conflict (id) do nothing;

drop policy if exists "receipts_public_read" on storage.objects;
create policy "receipts_public_read" on storage.objects
  for select using (bucket_id = 'receipts');

drop policy if exists "receipts_rider_write" on storage.objects;
create policy "receipts_rider_write" on storage.objects
  for insert with check (bucket_id = 'receipts' and (storage.foldername(name))[1] = auth.uid()::text);

-- ---------------------------------------------------------------------------
-- 3. food_order_items: the assigned rider may flag an item out of stock
-- ---------------------------------------------------------------------------
drop policy if exists "food_order_items_rider_update" on public.food_order_items;
create policy "food_order_items_rider_update" on public.food_order_items
  for update
  using (exists (
    select 1 from public.food_deliveries fd
    where fd.id = food_delivery_id
      and fd.rider_id = auth.uid()
      and fd.status in ('accepted', 'ongoing')
  ))
  with check (exists (
    select 1 from public.food_deliveries fd
    where fd.id = food_delivery_id
      and fd.rider_id = auth.uid()
      and fd.status in ('accepted', 'ongoing')
  ));

-- The policy decides *which rows*; this decides *which columns* — a rider
-- can't touch prices or quantities, only the out-of-stock flag.
revoke update on public.food_order_items from authenticated;
grant update (is_out_of_stock) on public.food_order_items to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Realtime: publish the tables both dashboards subscribe to
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array[
    'transport_bookings', 'food_deliveries', 'parcel_deliveries',
    'notifications', 'booking_messages', 'ride_stops', 'food_order_items'
  ] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
