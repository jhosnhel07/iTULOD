-- 033_vehicle_matching.sql
-- ---------------------------------------------------------------------------
-- Jobs go only to riders whose vehicle matches the one the customer booked.
--
-- Until now any approved rider could see and accept any ride/food/parcel job
-- (hauling was only limited to Van/Pickup/Truck as a group): a "Car" booking
-- could be taken by a motorcycle. Now:
--   * rider_type_for_vehicle(name) maps a booking vehicle (vehicles.name) to
--     the rider vehicle type (rider_applications.vehicle_type) — the same
--     mapping as riderTypeForVehicle() in the web's js/map.js and the app's
--     riders_near_you_map.dart ("L300 Van" -> Van, "6-Wheeler Truck" -> Truck…);
--   * rider_can_take(vehicle_id): the signed-in rider's approved vehicle
--     matches (a booking without a vehicle is open to everyone);
--   * the "open jobs" read policies use it, so both apps' request lists only
--     show matching jobs — no client change needed;
--   * trigger booking_vehicle_match refuses accepting a non-matching job;
--   * new hauling job alerts go only to riders with the matching vehicle;
--   * Bicycle / Jeepney / Bus are switched off for booking: riders can't
--     register those vehicles, so such bookings could never be accepted.
--     (Admin → Vehicle categories can switch them back on.)
-- ---------------------------------------------------------------------------

-- 1 ------------------------------------------------------------------------
create or replace function public.rider_type_for_vehicle(p_name text)
returns text
language sql
immutable
as $$
  select case
    when p_name is null then null
    when p_name in ('Motorcycle', 'Tricycle', 'Car', 'SUV', 'Van', 'Pickup', 'Truck', 'Bicycle', 'Jeepney', 'Bus') then p_name
    when lower(p_name) ~ 'pickup|multicab' then 'Pickup'
    when lower(p_name) ~ 'truck|wheeler' then 'Truck'
    when lower(p_name) ~ 'van' then 'Van'
    when lower(p_name) ~ 'suv' then 'SUV'
    when lower(p_name) ~ 'tricycle|trike' then 'Tricycle'
    when lower(p_name) ~ 'motor' then 'Motorcycle'
    when lower(p_name) ~ 'bicycle|bike' then 'Bicycle'
    when lower(p_name) ~ 'jeep' then 'Jeepney'
    when lower(p_name) ~ '\mbus\M' then 'Bus'
    when lower(p_name) ~ 'car|sedan' then 'Car'
    else p_name
  end;
$$;

-- 2 ------------------------------------------------------------------------
create or replace function public.rider_can_take(p_vehicle_id uuid, p_rider uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p_vehicle_id is null or exists (
    select 1
    from public.vehicles v
    join public.rider_applications ra
      on ra.rider_id = p_rider and ra.status = 'approved'
     and ra.vehicle_type = public.rider_type_for_vehicle(v.name)
    where v.id = p_vehicle_id
  );
$$;

-- Must stay callable by every role: the read policies above call it, and a
-- logged-out read of a booking table should come back empty, not fail. It
-- only answers yes/no.
grant execute on function public.rider_can_take(uuid, uuid) to anon, authenticated;

-- 3 ------------------------------------------------------------------------
drop policy if exists "transport_select_available" on public.transport_bookings;
create policy "transport_select_available" on public.transport_bookings
  for select using (status = 'pending' and rider_id is null and public.is_approved_rider()
                    and public.rider_can_take(vehicle_id));

drop policy if exists "food_select_available" on public.food_deliveries;
create policy "food_select_available" on public.food_deliveries
  for select using (status = 'pending' and rider_id is null and public.is_approved_rider()
                    and public.rider_can_take(vehicle_id));

drop policy if exists "parcel_select_available" on public.parcel_deliveries;
create policy "parcel_select_available" on public.parcel_deliveries
  for select using (status = 'pending' and rider_id is null and public.is_approved_rider()
                    and public.rider_can_take(vehicle_id));

drop policy if exists "hauling_select_available" on public.hauling_bookings;
create policy "hauling_select_available" on public.hauling_bookings
  for select using (status = 'pending' and rider_id is null and public.is_hauling_rider()
                    and public.rider_can_take(vehicle_id));

-- 4 ------------------------------------------------------------------------
create or replace function public.booking_vehicle_match()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  needed text;
  has    text;
begin
  if old.rider_id is null and new.rider_id is not null
     and not public.is_trusted_writer()
     and session_user not in ('postgres', 'supabase_admin')
     and not public.rider_can_take(new.vehicle_id, new.rider_id) then
    select public.rider_type_for_vehicle(name) into needed from public.vehicles where id = new.vehicle_id;
    select vehicle_type into has from public.rider_applications
      where rider_id = new.rider_id and status = 'approved' limit 1;
    raise exception 'This job needs a %. Your vehicle is a %.', lower(coalesce(needed, 'different vehicle')),
      lower(coalesce(has, 'different type'))
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;

do $$
declare
  t text;
begin
  foreach t in array array['transport_bookings', 'food_deliveries', 'parcel_deliveries', 'hauling_bookings'] loop
    execute format('drop trigger if exists trg_booking_vehicle_match on public.%I', t);
    execute format('create trigger trg_booking_vehicle_match before update on public.%I
                    for each row execute function public.booking_vehicle_match()', t);
  end loop;
end $$;

-- 5 ------------------------------------------------------------------------
create or replace function public.notify_hauling_riders()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.notifications (user_id, title, message)
  select distinct ra.rider_id,
         'New hauling job',
         coalesce((select name from public.vehicles where id = new.vehicle_id), 'Hauling') || ' · '
           || left(new.pickup_address, 40) || ' → ' || left(new.dropoff_address, 40)
           || ' · est. ₱' || to_char(coalesce(new.estimated_fare, 0), 'FM999,990.00')
  from public.rider_applications ra
  join public.profiles p on p.id = ra.rider_id and p.role = 'rider' and p.is_active
  where ra.status = 'approved'
    and ra.vehicle_type in ('Van', 'Pickup', 'Truck')
    and public.rider_can_take(new.vehicle_id, ra.rider_id);
  return new;
end;
$$;

-- 6 ------------------------------------------------------------------------
update public.vehicles set is_available = false
 where name in ('Bicycle', 'Jeepney', 'Bus') and coalesce(service, 'standard') <> 'hauling';
