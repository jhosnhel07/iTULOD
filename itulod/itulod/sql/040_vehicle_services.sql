-- 040_vehicle_services.sql
-- ---------------------------------------------------------------------------
-- Each vehicle lists exactly which services it can be booked for.
--
-- Until now vehicles.service only split 'hauling' from 'standard' (rides, food
-- and parcel together), so a vehicle couldn't be e.g. food-only. Now:
--   * vehicles.services: any of 'ride', 'food', 'parcel', 'hauling' (at least
--     one). Admin → Vehicle categories → click a vehicle to switch them.
--   * vehicles.service is kept in step by a trigger ('hauling' when the
--     vehicle is hauling-only, else 'standard') for older app versions.
--   * booking_before_insert refuses a vehicle that doesn't allow the booking's
--     service, and every booking must name a vehicle (all clients already do).
--   * Riders still only see jobs for their own vehicle type (sql/033), so a
--     bicycle rider only ever gets food orders.
--   * Bicycle is bookable again — for food delivery only.
-- ---------------------------------------------------------------------------

-- 1 ------------------------------------------------------------------------
alter table public.vehicles add column if not exists services text[];

update public.vehicles set services = case
    when coalesce(service, 'standard') = 'hauling' then array['hauling']
    when name = 'Bicycle'             then array['food']
    when name in ('SUV', 'Van')       then array['ride', 'parcel']
    when name = 'Truck'               then array['parcel']
    when name in ('Jeepney', 'Bus')   then array['ride']
    else array['ride', 'food', 'parcel']
  end
 where services is null;

-- 2 ------------------------------------------------------------------------
-- Fills services from the old column when a write leaves it out, then keeps
-- the old column in step.
create or replace function public.vehicles_sync_services()
returns trigger
language plpgsql
as $$
begin
  if new.services is null then
    new.services := case when coalesce(new.service, 'standard') = 'hauling'
                         then array['hauling'] else array['ride', 'food', 'parcel'] end;
  end if;
  select coalesce(array_agg(distinct s order by s), '{}') into new.services from unnest(new.services) s;
  new.service := case when new.services = array['hauling'] then 'hauling' else 'standard' end;
  return new;
end;
$$;

drop trigger if exists trg_vehicles_sync_services on public.vehicles;
create trigger trg_vehicles_sync_services before insert or update on public.vehicles
  for each row execute function public.vehicles_sync_services();

update public.vehicles set services = services; -- run the trigger once (sorts + syncs service)

alter table public.vehicles alter column services set not null;
alter table public.vehicles drop constraint if exists vehicles_services_valid;
alter table public.vehicles add constraint vehicles_services_valid
  check (cardinality(services) >= 1 and services <@ array['food', 'hauling', 'parcel', 'ride']);

-- 3 ------------------------------------------------------------------------
create or replace function public.booking_before_insert()
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
    expected := v.base_fare + v.per_km_rate * km;

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

-- 4 ------------------------------------------------------------------------
update public.vehicles set is_available = true where name = 'Bicycle';
