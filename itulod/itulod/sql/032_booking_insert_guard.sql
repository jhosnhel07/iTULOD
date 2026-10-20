-- 032_booking_insert_guard.sql
-- ---------------------------------------------------------------------------
-- Server-side checks on every NEW booking (ride, food, parcel, hauling).
--
-- The web and the app work the fare out on the device and insert it; until
-- now the database took whatever arrived. Someone calling the API directly
-- could book a ₱1 ride, or insert a GCash booking already marked "paid" (the
-- rider would do the trip and iTULOD would owe them a fare nobody paid).
--
-- BEFORE INSERT trigger booking_before_insert():
--   * a new booking always starts pending, unassigned and unpaid — status,
--     rider, payment status, final fare, tips, fees, proof photo, promo and
--     review fields are reset to their starting values;
--   * the vehicle must exist, be available, and fit the service (hauling
--     vehicles only for hauling);
--   * the distance can't be shorter than a straight line between the pinned
--     pickup and drop-off (rides and hauling store coordinates);
--   * the fare can't be below the platform minimum, nor below what the
--     vehicle's rates give for that distance — the same formula both apps
--     use: base_fare + per_km_rate × km (+ helpers × the platform's
--     helper fee for hauling; for food the
--     delivery fee is checked and the total must cover items + delivery).
--
-- Admins, the service role (Edge Functions) and direct database sessions are
-- exempt. Promo discounts are applied later by redeem-promo (service role),
-- so they aren't affected.
-- ---------------------------------------------------------------------------

create or replace function public.booking_before_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  kind      text := tg_argv[0];  -- 'transport' | 'food' | 'parcel' | 'hauling'
  cfg       public.platform_config%rowtype;
  v         public.vehicles%rowtype;
  rec       jsonb;
  km        numeric;
  straight  numeric;
  expected  numeric;
  fee       numeric;
  lat1 float8; lng1 float8; lat2 float8; lng2 float8;
begin
  if public.is_trusted_writer() or session_user in ('postgres', 'supabase_admin') then
    return new;
  end if;

  select * into cfg from public.platform_config where id;

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
    if (kind = 'hauling') <> (coalesce(v.service, 'standard') = 'hauling') then
      raise exception 'That vehicle can''t be booked for this service.' using errcode = 'P0001';
    end if;
  elsif kind in ('transport', 'hauling') then
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
$$;

do $$
declare
  t record;
begin
  for t in select * from (values
    ('transport_bookings', 'transport'),
    ('food_deliveries', 'food'),
    ('parcel_deliveries', 'parcel'),
    ('hauling_bookings', 'hauling')) as x(tbl, kind)
  loop
    execute format('drop trigger if exists trg_booking_before_insert on public.%I', t.tbl);
    execute format('create trigger trg_booking_before_insert before insert on public.%I
                    for each row execute function public.booking_before_insert(%L)', t.tbl, t.kind);
  end loop;
end $$;
