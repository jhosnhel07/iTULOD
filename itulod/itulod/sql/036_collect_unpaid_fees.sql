-- 036_collect_unpaid_fees.sql
-- ---------------------------------------------------------------------------
-- Collect unpaid cancellation / no-show fees.
--
-- When a customer cancels after a rider accepted (or is marked no-show) and
-- their wallet can't cover the fee, the booking is recorded with
-- cancellation_fee_paid = false — and until now that was the end of it.
-- Now:
--   * settle_unpaid_fees(customer): takes each unpaid fee from the wallet
--     (oldest first) while the balance covers it, records the wallet
--     transaction, marks the fee paid (→ "Fee charged to your wallet"
--     notification) and pays it to the rider who was assigned. Returns what
--     is still owed.
--   * it runs automatically whenever a wallet balance goes up (a GCash
--     top-up, a refund) — trigger trg_wallet_settle_fees;
--   * a NEW booking first tries to settle; if a fee is still owed the
--     booking is refused with a message telling the customer to top up
--     (booking_before_insert, see sql/032);
--   * my_unpaid_fees(): what the signed-in customer still owes, for the
--     reminder banner on the customer home screen (web + app).
-- ---------------------------------------------------------------------------

create or replace function public.settle_unpaid_fees(p_customer uuid)
returns numeric
language plpgsql
security definer
set search_path = public
as $$
declare
  b         record;
  bal       numeric;
  remaining numeric := 0;
  prev      text := coalesce(current_setting('itulod.system_write', true), '');
begin
  if p_customer is null then
    return 0;
  end if;

  for b in
    select * from (
      select 'transport'::text as kind, 'transport_bookings'::text as tbl, id, rider_id,
             cancellation_fee as fee, status::text as status, updated_at
        from public.transport_bookings where customer_id = p_customer and cancellation_fee_paid = false
      union all
      select 'food', 'food_deliveries', id, rider_id, cancellation_fee, status::text, updated_at
        from public.food_deliveries where customer_id = p_customer and cancellation_fee_paid = false
      union all
      select 'parcel', 'parcel_deliveries', id, rider_id, cancellation_fee, status::text, updated_at
        from public.parcel_deliveries where customer_id = p_customer and cancellation_fee_paid = false
      union all
      select 'hauling', 'hauling_bookings', id, rider_id, cancellation_fee, status::text, updated_at
        from public.hauling_bookings where customer_id = p_customer and cancellation_fee_paid = false
    ) x
    where coalesce(fee, 0) > 0
    order by updated_at
  loop
    select balance into bal from public.wallets where customer_id = p_customer for update;
    if coalesce(bal, 0) < b.fee then
      remaining := remaining + b.fee;
      continue;
    end if;

    perform public.adjust_wallet_balance(p_customer, -b.fee);
    insert into public.wallet_transactions (customer_id, type, amount, booking_type, booking_id, note)
    values (p_customer, 'payment', -b.fee, b.kind, b.id,
            case when b.status = 'no_show' then 'No-show fee (settled from wallet)'
                 else 'Cancellation fee (settled from wallet)' end);

    -- A system write: the booking guard only lets the system mark fees paid.
    -- Scoped to this one update, then put back.
    perform set_config('itulod.system_write', 'true', true);
    execute format('update public.%I set cancellation_fee_paid = true where id = $1', b.tbl) using b.id;
    perform set_config('itulod.system_write', prev, true);

    -- The fee goes to the rider who was assigned (no commission).
    if b.rider_id is not null then
      insert into public.payments
        (customer_id, rider_id, booking_type, booking_id, amount, platform_commission, rider_payout, method, status)
      values (p_customer, b.rider_id, b.kind, b.id, b.fee, 0, b.fee, 'wallet', 'paid')
      on conflict (booking_type, booking_id) do nothing;
    end if;
  end loop;

  return remaining;
end;
$$;

revoke all on function public.settle_unpaid_fees(uuid) from public, anon, authenticated;

-- What the signed-in customer still owes (for the reminder banner).
create or replace function public.my_unpaid_fees()
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(sum(cancellation_fee), 0) from (
    select cancellation_fee from public.transport_bookings where customer_id = auth.uid() and cancellation_fee_paid = false
    union all
    select cancellation_fee from public.food_deliveries where customer_id = auth.uid() and cancellation_fee_paid = false
    union all
    select cancellation_fee from public.parcel_deliveries where customer_id = auth.uid() and cancellation_fee_paid = false
    union all
    select cancellation_fee from public.hauling_bookings where customer_id = auth.uid() and cancellation_fee_paid = false
  ) f;
$$;

grant execute on function public.my_unpaid_fees() to authenticated;

-- Settle automatically whenever a wallet balance goes up.
create or replace function public.wallet_settle_fees()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' or new.balance > old.balance then
    perform public.settle_unpaid_fees(new.customer_id);
  end if;
  return null;
end;
$$;

drop trigger if exists trg_wallet_settle_fees on public.wallets;
create trigger trg_wallet_settle_fees
  after insert or update of balance on public.wallets
  for each row execute function public.wallet_settle_fees();

-- New bookings: settle first, refuse while a fee is still owed.
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
