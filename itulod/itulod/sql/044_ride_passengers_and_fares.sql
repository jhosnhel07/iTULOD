-- 044_ride_passengers_and_fares.sql
-- ---------------------------------------------------------------------------
-- Rides get a passenger count, vehicles a passenger range, and ride fares
-- follow current Philippine rates (LTFRB fare hike of Sept 28, 2026; Laoag
-- tricycle ₱20 per passenger; motorcycle-taxi provincial base).
--
-- vehicles
--   min_passengers / max_passengers  a vehicle is only offered (and bookable)
--                                    for a group in this range (no 40-seat bus
--                                    for one person, no car for five)
--   ride_base_fare / ride_per_km_rate the RIDE fare (null = base_fare /
--                                    per_km_rate). Motorcycle, Tricycle, Car,
--                                    SUV and Van also deliver food and parcels,
--                                    so their delivery rates stay base_fare /
--                                    per_km_rate, unchanged.
--   ride_base_km                     km included in the ride's minimum fare
--   extra_passenger_fee              added per passenger after the first
--   fare_per_passenger               the fare is per person (jeepney, bus)
-- Ride fare = (ride_base_fare + ride_per_km_rate × max(km − ride_base_km, 0))
--               × passengers                          if fare_per_passenger
--               + (passengers − 1) × extra_passenger_fee   otherwise
-- Food / parcel / hauling: base_fare + per_km_rate × km, as before.
--
-- transport_bookings.passengers (default 1). booking_before_insert() checks the
-- count against the vehicle's range and the fare against vehicle_fare().
-- Older app versions send no count (= 1): they can still book the vehicles
-- that take one passenger.
-- ---------------------------------------------------------------------------

alter table public.vehicles add column if not exists min_passengers int not null default 1;
alter table public.vehicles add column if not exists max_passengers int;
alter table public.vehicles add column if not exists ride_base_fare numeric(10,2);
alter table public.vehicles add column if not exists ride_per_km_rate numeric(10,2);
do $$
begin
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'vehicles' and column_name = 'base_km') then
    alter table public.vehicles rename column base_km to ride_base_km;
  end if;
end $$;
alter table public.vehicles add column if not exists ride_base_km numeric(6,2) not null default 0;
alter table public.vehicles add column if not exists extra_passenger_fee numeric(10,2) not null default 0;
alter table public.vehicles add column if not exists fare_per_passenger boolean not null default false;
update public.vehicles set max_passengers = greatest(coalesce(capacity, 1), 1) where max_passengers is null;
alter table public.vehicles alter column max_passengers set default 1;
alter table public.vehicles alter column max_passengers set not null;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'vehicles_passenger_rules') then
    alter table public.vehicles add constraint vehicles_passenger_rules check (
          min_passengers >= 1 and max_passengers >= min_passengers and max_passengers <= 60
      and ride_base_km between 0 and 50 and extra_passenger_fee between 0 and 1000);
  end if;
end $$;

-- Ride vehicles: passenger ranges + current rates (see DEPLOYMENT.md for sources)
update public.vehicles set min_passengers = 1, max_passengers = 1, capacity = 1, ride_base_fare = 20, ride_base_km = 1, ride_per_km_rate = 10, extra_passenger_fee = 0, fare_per_passenger = false, base_fare = 25, per_km_rate = 8 where name = 'Motorcycle';
update public.vehicles set min_passengers = 1, max_passengers = 3, capacity = 3, ride_base_fare = 20, ride_base_km = 1.5, ride_per_km_rate = 8, extra_passenger_fee = 20, fare_per_passenger = false, base_fare = 30, per_km_rate = 9 where name = 'Tricycle';
update public.vehicles set min_passengers = 1, max_passengers = 4, capacity = 4, ride_base_fare = 65, ride_base_km = 0, ride_per_km_rate = 15, extra_passenger_fee = 0, fare_per_passenger = false, base_fare = 40, per_km_rate = 12 where name = 'Car';
update public.vehicles set min_passengers = 3, max_passengers = 6, capacity = 6, ride_base_fare = 75, ride_base_km = 0, ride_per_km_rate = 18, extra_passenger_fee = 0, fare_per_passenger = false, base_fare = 60, per_km_rate = 15 where name = 'SUV';
update public.vehicles set min_passengers = 5, max_passengers = 8, capacity = 8, ride_base_fare = 90, ride_base_km = 0, ride_per_km_rate = 20, extra_passenger_fee = 0, fare_per_passenger = false, base_fare = 70, per_km_rate = 16 where name = 'Van';
update public.vehicles set min_passengers = 9, max_passengers = 14, capacity = 14, ride_base_fare = 14, ride_base_km = 4, ride_per_km_rate = 2, extra_passenger_fee = 0, fare_per_passenger = true, base_fare = 20, per_km_rate = 6 where name = 'Jeepney';
update public.vehicles set min_passengers = 15, max_passengers = 40, capacity = 40, ride_base_fare = 12, ride_base_km = 5, ride_per_km_rate = 2.20, extra_passenger_fee = 0, fare_per_passenger = true, base_fare = 25, per_km_rate = 5 where name = 'Bus';

alter table public.transport_bookings add column if not exists passengers int not null default 1;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'transport_bookings_passengers_range') then
    alter table public.transport_bookings add constraint transport_bookings_passengers_range check (passengers between 1 and 60);
  end if;
end $$;

-- The fare a vehicle charges: for a ride (with passengers), or for a delivery.
-- Same formula as estimateFare() / estimateRideFare() in js/utils.js and
-- FareEstimator in the app.
drop function if exists public.vehicle_fare(public.vehicles, numeric, int);
create or replace function public.vehicle_fare(v public.vehicles, km numeric, pax int default 1, for_ride boolean default false)
returns numeric
language sql
stable
as $$
  select case when not for_ride then round(v.base_fare + v.per_km_rate * coalesce(km, 0), 2)
  else round(
      round(coalesce(v.ride_base_fare, v.base_fare)
        + coalesce(v.ride_per_km_rate, v.per_km_rate) * greatest(coalesce(km, 0) - coalesce(v.ride_base_km, 0), 0), 2)
        * case when v.fare_per_passenger then greatest(coalesce(pax, 1), 1) else 1 end
    + case when v.fare_per_passenger then 0
           else greatest(coalesce(pax, 1) - 1, 0) * coalesce(v.extra_passenger_fee, 0) end, 2) end;
$$;

-- booking_before_insert(): as live (sql/032, /036, /040), plus the passenger
-- range for rides and vehicle_fare() for the minimum fare check.
CREATE OR REPLACE FUNCTION public.booking_before_insert()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  kind      text := tg_argv[0];  -- 'transport' | 'food' | 'parcel' | 'hauling'
  cfg       public.platform_config%rowtype;
  v         public.vehicles%rowtype;
  rec       jsonb;
  km        numeric;
  pax       int;
  straight  numeric;
  expected  numeric;
  fee       numeric;
  owed      numeric;
  lat1 float8; lng1 float8; lat2 float8; lng2 float8;
begin
  if public.is_trusted_writer() or session_user in ('postgres', 'supabase_admin') then
    return new;
  end if;

  select * into cfg from public.platform_config where id;

  -- An unpaid cancellation / no-show fee is taken from the wallet first;
  -- while one is still owed, no new booking (sql/036).
  owed := public.settle_unpaid_fees(new.customer_id);
  if owed > 0 then
    raise exception 'You have an unpaid cancellation fee of ₱%. Top up your iTULOD wallet to settle it, then book again.',
      to_char(owed, 'FM999,990.00') using errcode = 'P0001';
  end if;

  -- A new booking always starts open, unassigned and unpaid. Keys that a
  -- table doesn't have are simply ignored by jsonb_populate_record.
  new := jsonb_populate_record(new, jsonb_build_object(
    'status', 'pending',
    'rider_id', null,
    'final_fare', null,
    'payment_status', 'pending',
    'paymongo_reference', null,
    'payment_source_id', null,
    'payment_id', null,
    'accepted_at', null,
    'tip_amount', null,
    'cancellation_fee', null,
    'cancellation_fee_paid', null,
    'cancelled_reason', null,
    'delivery_proof_url', null,
    'promo_code', null,
    'discount_amount', null,
    'rating', null,
    'review', null,
    'cod_remitted_at', null,
    'cod_remit_note', null,
    'actual_food_cost', null,
    'receipt_photo_url', null,
    'helper_fee', cfg.hauling_helper_fee,
    'created_at', now(),
    'updated_at', now()
  ));
  rec := to_jsonb(new);

  if new.estimated_fare is null or new.estimated_fare < cfg.fare_min then
    raise exception 'The fare must be at least ₱%.', to_char(cfg.fare_min, 'FM999,990.00')
      using errcode = 'P0001';
  end if;

  -- The vehicle.
  if new.vehicle_id is not null then
    select * into v from public.vehicles where id = new.vehicle_id;
    if not found or not v.is_available then
      raise exception 'That vehicle type isn''t available right now. Please choose another.'
        using errcode = 'P0001';
    end if;
    -- Each vehicle lists the services it can be booked for (sql/040).
    if not (case kind when 'transport' then 'ride' else kind end) = any (v.services) then
      raise exception 'A % can''t be booked for %. Please choose another vehicle.', lower(v.name),
        case kind when 'transport' then 'rides' when 'food' then 'food delivery'
                  when 'parcel' then 'parcel delivery' else 'hauling' end
        using errcode = 'P0001';
    end if;
  else
    raise exception 'Please choose a vehicle.' using errcode = 'P0001';
  end if;

  -- Rides: the group has to fit the vehicle's passenger range (sql/044).
  pax := case when kind = 'transport' then greatest(coalesce((rec ->> 'passengers')::int, 1), 1) else 1 end;
  if kind = 'transport' and (pax < v.min_passengers or pax > v.max_passengers) then
    raise exception 'A % is for % passengers — choose another vehicle for %.', lower(v.name),
      case when v.min_passengers = v.max_passengers then v.min_passengers::text
           else v.min_passengers || '–' || v.max_passengers end,
      pax || case when pax = 1 then ' passenger' else ' passengers' end
      using errcode = 'P0001';
  end if;

  -- The distance can't be shorter than a straight line between the pins.
  lat1 := (rec ->> 'pickup_lat')::float8;
  lng1 := (rec ->> 'pickup_lng')::float8;
  lat2 := coalesce(rec ->> 'destination_lat', rec ->> 'dropoff_lat')::float8;
  lng2 := coalesce(rec ->> 'destination_lng', rec ->> 'dropoff_lng')::float8;
  if lat1 is not null and lng1 is not null and lat2 is not null and lng2 is not null then
    straight := 6371 * 2 * asin(sqrt(
      power(sin(radians(lat2 - lat1) / 2), 2)
      + cos(radians(lat1)) * cos(radians(lat2)) * power(sin(radians(lng2 - lng1) / 2), 2)));
    if coalesce(new.distance_km, 0) < straight * 0.9 then
      raise exception 'The trip distance doesn''t match the pinned locations. Please set them again.'
        using errcode = 'P0001';
    end if;
  end if;

  -- The fare can't be below the vehicle's rates for that distance.
  if v.id is not null then
    -- One-way distance: a round-trip parcel costs more, never less, and the
    -- web and the app store its distance differently (doubled / one-way).
    km := case when coalesce(new.distance_km, 0) > 0 then new.distance_km else 1 end;
    expected := public.vehicle_fare(v, km, pax, kind = 'transport');

    if kind = 'food' then
      fee := coalesce((rec ->> 'delivery_fee')::numeric, 0);
      if fee < expected - 0.05 then
        raise exception 'The delivery fee (₱%) is lower than the rate for this distance (₱%). Please place the order again.',
          to_char(fee, 'FM999,990.00'), to_char(expected, 'FM999,990.00') using errcode = 'P0001';
      end if;
      if new.estimated_fare < coalesce((rec ->> 'item_subtotal')::numeric, 0) + fee - 0.05 then
        raise exception 'The order total doesn''t add up. Please place the order again.' using errcode = 'P0001';
      end if;
    else
      if kind = 'hauling' then
        expected := expected + coalesce((rec ->> 'helpers')::int, 0) * cfg.hauling_helper_fee;
      end if;
      if new.estimated_fare < expected - 0.05 then
        raise exception 'The fare (₱%) is lower than the rate for this trip (₱%). Please book again.',
          to_char(new.estimated_fare, 'FM999,990.00'), to_char(expected, 'FM999,990.00') using errcode = 'P0001';
      end if;
    end if;
  end if;

  return new;
end;
$function$;
