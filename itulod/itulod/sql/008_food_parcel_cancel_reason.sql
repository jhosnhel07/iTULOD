-- =============================================================================
-- iTULOD — migration 008: cancelled_reason on food / parcel deliveries
-- Run in the Supabase SQL editor AFTER 005.
--
-- cancelBooking() (js/customer.js) sets cancelled_reason on any booking kind,
-- but only transport_bookings had the column — cancelling a food or parcel
-- delivery failed with "column cancelled_reason does not exist". This adds it
-- to the other two tables so cancellation works everywhere.
-- =============================================================================

alter table public.food_deliveries
  add column if not exists cancelled_reason text;

alter table public.parcel_deliveries
  add column if not exists cancelled_reason text;
