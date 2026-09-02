-- =============================================================================
-- iTULOD — migration 002: PayMongo (GCash / Card) payment gateway support
-- Run this in the Supabase SQL editor AFTER sql/schema.sql.
-- =============================================================================

-- Each booking table gets its own payment tracking columns. A booking is
-- "paid" the moment PayMongo confirms the charge (via webhook), independent
-- of the ride/delivery status (pending -> accepted -> ongoing -> completed).
-- Cash bookings stay 'pending' here and are marked 'paid' by the rider at
-- completion, same as before this migration.

alter table public.transport_bookings
  add column if not exists payment_method payment_method not null default 'cash',
  add column if not exists payment_status payment_status not null default 'pending',
  add column if not exists paymongo_reference text;

alter table public.food_deliveries
  add column if not exists payment_method payment_method not null default 'cash',
  add column if not exists payment_status payment_status not null default 'pending',
  add column if not exists paymongo_reference text;

alter table public.parcel_deliveries
  add column if not exists payment_method payment_method not null default 'cash',
  add column if not exists payment_status payment_status not null default 'pending',
  add column if not exists paymongo_reference text;

-- Fast lookup from a PayMongo webhook event back to the booking row.
create index if not exists idx_transport_paymongo_ref on public.transport_bookings(paymongo_reference);
create index if not exists idx_food_paymongo_ref on public.food_deliveries(paymongo_reference);
create index if not exists idx_parcel_paymongo_ref on public.parcel_deliveries(paymongo_reference);

-- Customers may need to update their own pending booking's payment_method /
-- paymongo_reference when starting a checkout (e.g. switching from cash to
-- GCash before a rider accepts). Booking status itself is still governed by
-- the existing update policies from schema.sql.
drop policy if exists "transport_customer_update_payment" on public.transport_bookings;
create policy "transport_customer_update_payment" on public.transport_bookings
  for update using (customer_id = auth.uid() and status = 'pending')
  with check (customer_id = auth.uid());

drop policy if exists "food_customer_update_payment" on public.food_deliveries;
create policy "food_customer_update_payment" on public.food_deliveries
  for update using (customer_id = auth.uid() and status = 'pending')
  with check (customer_id = auth.uid());

drop policy if exists "parcel_customer_update_payment" on public.parcel_deliveries;
create policy "parcel_customer_update_payment" on public.parcel_deliveries
  for update using (customer_id = auth.uid() and status = 'pending')
  with check (customer_id = auth.uid());

-- Note: the Edge Functions in supabase/functions/ use the service role key,
-- which bypasses RLS entirely — the policies above only matter for direct
-- client writes (e.g. a client-side retry/cancel action).
