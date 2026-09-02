-- =============================================================================
-- iTULOD — migration 003: additional rider application documents
-- Run this in the Supabase SQL editor AFTER sql/schema.sql.
-- =============================================================================

-- The registration wizard uploads a selfie, a vehicle photo, and an optional
-- NBI clearance alongside the driver's license and OR/CR, but only the
-- license/OR-CR URLs were ever persisted to rider_applications — the admin
-- review modal had no columns to read the other documents from.

alter table public.rider_applications
  add column if not exists selfie_url text,
  add column if not exists vehicle_url text,
  add column if not exists nbi_url text;
