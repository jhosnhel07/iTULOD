-- 035_food_commission_on_delivery_fee.sql
-- ---------------------------------------------------------------------------
-- Food orders: iTULOD's commission is taken from the DELIVERY FEE only.
--
-- A food order's fare is the food (bought by the rider for the customer) plus
-- the delivery fee. The completion trigger used to take 15% of the whole
-- total, so on a ₱420 meal + ₱49 delivery the rider lost about ₱70 — more
-- than the delivery fee itself. Now the commission is commission_rate × the
-- booking's delivery_fee (capped at the fare; older orders without one use
-- fare − item_subtotal). Rides, parcels and hauling are unchanged.
--
-- This is booking_before_update() exactly as it was live, with only the
-- commission line changed.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.booking_before_update()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
declare
  kind        text := tg_argv[0];               -- 'transport' | 'food' | 'parcel' | 'hauling'
  uid         uuid := auth.uid();
  cfg         public.platform_config%rowtype;
  fare        numeric(10,2);
  commission  numeric(10,2);
  min_fare    numeric(10,2);
  paid        numeric(10,2);
  fee         numeric(10,2);
  refund      numeric(10,2);
  bal         numeric(10,2);
  fee_rider   uuid;
  base        numeric(10,2);
begin
  -- ---- terminal-state lock --------------------------------------------------
  if not public.is_trusted_writer()
     and old.status in ('completed', 'cancelled', 'expired', 'no_show')
     and new.status is distinct from old.status then
    raise exception 'this booking is % and its status can no longer be changed', old.status;
  end if;

  -- ---- client-write guard --------------------------------------------------
  if not public.is_trusted_writer() then
    if new.estimated_fare is distinct from old.estimated_fare then
      raise exception 'estimated_fare is immutable';
    end if;
    if new.final_fare is distinct from old.final_fare then
      raise exception 'final_fare is set by the system';
    end if;
    if new.customer_id is distinct from old.customer_id then
      raise exception 'customer_id is immutable';
    end if;
    if new.cancellation_fee is distinct from old.cancellation_fee then
      raise exception 'cancellation_fee is set by the system';
    end if;
    if new.cancellation_fee_paid is distinct from old.cancellation_fee_paid then
      raise exception 'cancellation_fee_paid is set by the system';
    end if;

    if uid = old.customer_id then
      if new.status is distinct from old.status
         and new.status <> 'cancelled' then
        raise exception 'customers can only cancel a booking';
      end if;
      if new.rider_id is distinct from old.rider_id then
        raise exception 'customers cannot assign a rider';
      end if;
      if new.payment_status is distinct from old.payment_status then
        raise exception 'payment_status is set by the payment system';
      end if;
      if (new.payment_method is distinct from old.payment_method
          or new.paymongo_reference is distinct from old.paymongo_reference)
         and old.status <> 'pending' then
        raise exception 'payment method can only change while the booking is pending';
      end if;
      if new.tip_amount is distinct from old.tip_amount then
        if old.status <> 'completed' then
          raise exception 'a tip can only be added once the trip is completed';
        end if;
        if old.tip_amount is not null then
          raise exception 'a tip has already been recorded for this booking';
        end if;
        if new.tip_amount <= 0 then
          raise exception 'enter a tip amount greater than zero';
        end if;
      end if;

    elsif old.rider_id is null and new.rider_id = uid then
      if not public.is_approved_rider() then
        raise exception 'only an approved rider can accept bookings';
      end if;
      if new.status <> 'accepted' then
        raise exception 'a claimed booking must move to "accepted"';
      end if;
      if new.payment_status is distinct from old.payment_status
         or new.payment_method is distinct from old.payment_method then
        raise exception 'riders cannot change payment fields';
      end if;

    elsif uid = old.rider_id then
      if new.rider_id is distinct from old.rider_id and new.rider_id is not null then
        raise exception 'riders cannot reassign a booking to someone else';
      end if;
      if new.rider_id is null then
        if old.status <> 'accepted' then
          raise exception 'a job already in progress can only be released before it starts';
        end if;
        if new.status <> 'pending' then
          raise exception 'releasing a job must set its status back to pending';
        end if;
      else
        if new.status not in ('accepted', 'ongoing', 'completed', 'cancelled', 'no_show') then
          raise exception 'invalid status transition';
        end if;
        if new.status = 'no_show' and old.status <> 'accepted' then
          raise exception 'a no-show can only be marked before the trip starts';
        end if;
      end if;
      if new.payment_status is distinct from old.payment_status then
        raise exception 'payment_status is set by the system';
      end if;

    else
      raise exception 'not allowed to update this booking';
    end if;
  end if;

  -- ---- cancelling an accepted booking / a no-show records a fee ------------
  if new.status = 'cancelled' and old.status = 'accepted' and uid = old.customer_id then
    select * into cfg from public.platform_config where id;
    new.cancellation_fee := cfg.cancellation_fee;
  elsif new.status = 'no_show' and old.status = 'accepted' then
    select * into cfg from public.platform_config where id;
    new.cancellation_fee := cfg.cancellation_fee;
  end if;

  -- ---- grace period clock ---------------------------------------------------
  if new.status = 'accepted' and old.status is distinct from 'accepted' then
    new.accepted_at := now();
  elsif new.status = 'pending' and new.rider_id is null and old.rider_id is not null then
    new.accepted_at := null;
  end if;

  -- ---- on completion: lock the fare + create the payout -------------------
  if new.status = 'completed' and old.status is distinct from 'completed' then
    select * into cfg from public.platform_config where id;

    fare := coalesce(new.final_fare, new.estimated_fare);
    if fare is null or fare <= 0 then
      raise exception 'cannot complete a booking with no fare';
    end if;

    if kind <> 'transport' and new.estimated_fare is not null then
      if fare > new.estimated_fare * cfg.fare_max_multiplier then
        raise exception 'final fare % is more than %x the % estimate',
          fare, cfg.fare_max_multiplier, new.estimated_fare;
      end if;
      min_fare := greatest(cfg.fare_min, round(new.estimated_fare * 0.5, 2));
      if fare < min_fare then
        raise exception 'final fare % is below the minimum %', fare, min_fare;
      end if;
    end if;

    new.final_fare := fare;
    -- Food: the commission is on the delivery fee only — the rest of the
    -- fare is the food the rider bought for the customer (sql/035).
    if kind = 'food' then
      base := least(fare, coalesce(
        (to_jsonb(new) ->> 'delivery_fee')::numeric,
        greatest(fare - coalesce((to_jsonb(new) ->> 'item_subtotal')::numeric, 0), 0)));
    else
      base := fare;
    end if;
    commission := round(base * cfg.commission_rate, 2);

    if coalesce(new.payment_method, 'cash') = 'cash' then
      new.payment_status := 'paid';
    end if;

    insert into public.payments
      (customer_id, rider_id, booking_type, booking_id, amount,
       platform_commission, rider_payout, method, status)
    values
      (new.customer_id, new.rider_id, kind, new.id, fare,
       commission, fare - commission, coalesce(new.payment_method, 'cash'),
       case when coalesce(new.payment_method, 'cash') = 'cash'
            then 'paid' else new.payment_status end)
    on conflict (booking_type, booking_id) do nothing;
  end if;

  -- ---- tips fold into the payout row --------------------------------------
  if old.tip_amount is null and new.tip_amount is not null then
    update public.payments
      set amount = amount + new.tip_amount,
          rider_payout = rider_payout + new.tip_amount
      where booking_type = kind and booking_id = new.id;
  end if;

  -- ---- refunds + fee collection when a booking ends without completing ----
  if new.status in ('cancelled', 'expired', 'no_show')
     and old.status not in ('completed', 'cancelled', 'expired', 'no_show') then
    fee := coalesce(new.cancellation_fee, 0);
    fee_rider := coalesce(new.rider_id, old.rider_id);

    if new.payment_status = 'paid' and coalesce(new.payment_method, 'cash') in ('gcash', 'wallet') then
      -- already paid online: refund to the wallet, keeping the fee
      paid := coalesce(old.final_fare, old.estimated_fare, 0);
      fee := least(fee, paid);
      refund := paid - fee;
      if refund > 0 then
        perform public.adjust_wallet_balance(new.customer_id, refund);
        insert into public.wallet_transactions (customer_id, type, amount, booking_type, booking_id, note)
        values (new.customer_id, 'refund', refund, kind, new.id,
                'Refund — booking ' || replace(new.status::text, '_', '-')
                || case when fee > 0 then ' (less ₱' || to_char(fee, 'FM999,990.00') || ' fee)' else '' end);
      end if;
      new.payment_status := 'refunded';
      if fee > 0 then new.cancellation_fee_paid := true; end if;

    elsif fee > 0 then
      -- not prepaid: take the fee from the wallet if it covers it
      select balance into bal from public.wallets where customer_id = new.customer_id;
      if coalesce(bal, 0) >= fee then
        perform public.adjust_wallet_balance(new.customer_id, -fee);
        insert into public.wallet_transactions (customer_id, type, amount, booking_type, booking_id, note)
        values (new.customer_id, 'payment', -fee, kind, new.id,
                case when new.status = 'no_show' then 'No-show fee' else 'Cancellation fee' end);
        new.cancellation_fee_paid := true;
      else
        new.cancellation_fee_paid := false;
      end if;
    end if;

    -- a collected fee goes to the rider who was assigned (no commission)
    if fee > 0 and new.cancellation_fee_paid and fee_rider is not null then
      insert into public.payments
        (customer_id, rider_id, booking_type, booking_id, amount,
         platform_commission, rider_payout, method, status)
      values (new.customer_id, fee_rider, kind, new.id, fee, 0, fee, 'wallet', 'paid')
      on conflict (booking_type, booking_id) do nothing;
    end if;
  end if;

  return new;
end;
$function$;
