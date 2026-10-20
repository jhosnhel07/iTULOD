-- 038_public_vehicle_catalog.sql
-- ---------------------------------------------------------------------------
-- The public landing, login and sign-up pages show the vehicle catalog (the
-- "Vehicles" grid, the "N vehicle types" count, the sample fare), but
-- vehicles were readable by signed-in users only, so logged-out visitors got
-- the hard-coded fallback — which still listed Bicycle/Jeepney/Bus after
-- they were switched off and missed the hauling vehicles.
--
-- Let anyone read the AVAILABLE vehicles (a public price list: name, rates,
-- capacity, icon). Switched-off categories and writes stay as before.
-- ---------------------------------------------------------------------------

drop policy if exists "vehicles_select_public" on public.vehicles;
create policy "vehicles_select_public" on public.vehicles
  for select to anon
  using (is_available);
