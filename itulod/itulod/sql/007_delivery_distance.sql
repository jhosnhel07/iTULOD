-- =============================================================================
-- iTULOD — migration 007: real distance on food / parcel deliveries
-- Run in the Supabase SQL editor AFTER 005. Safe to run before or after 006.
--
-- transport_bookings already stores distance_km (schema.sql). Food and parcel
-- deliveries now do too, so the customer form can persist the real OSRM road
-- distance it used to price the booking instead of throwing it away.
-- =============================================================================

alter table public.food_deliveries
  add column if not exists distance_km numeric(6,2);

alter table public.parcel_deliveries
  add column if not exists distance_km numeric(6,2);
