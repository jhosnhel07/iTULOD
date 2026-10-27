-- 050_fixed_fare_receipt.sql
-- ---------------------------------------------------------------------------
-- The total a customer books is the total they pay. Riders no longer set a
-- "final fare" (the Set fare step is gone from the website and the app).
--
-- booking_before_update()   as live (sql/035), plus:
--   * when a rider accepts a food / parcel / hauling booking, final_fare is set
--     to the booked total (less any items already marked out of stock). That
--     is what shows the customer "Pay ₱X" for GCash / wallet, so paying still
--     never happens before a rider is found. Released unpaid jobs go back to
--     no final fare until the next rider accepts.
--   * the completion check has no minimum for food any more: out-of-stock
--     items lower its total.
-- food_require_receipt()    a food order's trip can only start once the rider
--   has saved a photo of the receipt (receipt_photo_url); only the assigned
--   rider can set it.
-- food_item_out_of_stock()  marking an order item out of stock takes its price
--   off the order's total (refunded to the customer's iTULOD wallet when they
--   already paid online) and tells the customer. Riders can't change anything
--   else on an order line, or put an item back.
-- notify_booking_change()   as live, plus "Pay ₱X from Booking history" in the
--   "A rider accepted" notification when the customer pays online.
-- The finalize-fare Edge Function now refuses (the total is fixed).
-- Accepted / ongoing jobs that have no final fare yet get their booked total.
--
-- is_trusted_writer()       the live copy only accepted itulod.system_sweep =
--   'on', but the functions that write as the system (expire_stale_bookings,
--   settle_unpaid_fees, and food_item_out_of_stock here) set
--   itulod.system_write = 'true' (sql/009, /036) — so their writes were
--   refused whenever they had something to change. It now accepts both, and
--   the database's own maintenance sessions (the expiry cron runs as postgres).
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.is_trusted_writer()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
AS $function$
  select coalesce(auth.role(), '') = 'service_role'
      or auth.jwt() ->> 'role' = 'service_role'
      or public.is_admin()
      or coalesce(current_setting('itulod.system_sweep', true), '') = 'on'
      or coalesce(current_setting('itulod.system_write', true), '') = 'true'
      or session_user in ('postgres', 'supabase_admin');
$function$;

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

  -- ---- the booked total is the final total (sql/050) ----------------------
  -- Set when a rider accepts, so an online payment can be made from then on.
  if kind <> 'transport' then
    if old.rider_id is null and new.rider_id is not null and new.final_fare is null then
      new.final_fare := new.estimated_fare;
      if kind = 'food' then
        new.final_fare := greatest(new.final_fare - coalesce((
          select sum(coalesce(i.subtotal, i.unit_price * i.quantity))
            from public.food_order_items i
           where i.food_delivery_id = new.id and i.is_out_of_stock), 0), 0);
      end if;
    elsif old.rider_id is not null and new.rider_id is null and new.status = 'pending'
          and coalesce(new.payment_status, 'pending') <> 'paid' then
      new.final_fare := null;
    end if;
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
      -- Food: out-of-stock items come off the total (sql/050), so no minimum.
      if kind <> 'food' then
        min_fare := greatest(cfg.fare_min, round(new.estimated_fare * 0.5, 2));
        if fare < min_fare then
          raise exception 'final fare % is below the minimum %', fare, min_fare;
        end if;
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

-- ---- food: the receipt photo comes before the trip --------------------------
create or replace function public.food_require_receipt()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.is_trusted_writer() or session_user in ('postgres', 'supabase_admin') then
    return new;
  end if;
  if new.receipt_photo_url is distinct from old.receipt_photo_url
     and auth.uid() is distinct from new.rider_id then
    raise exception 'Only the rider can add the receipt.' using errcode = 'P0001';
  end if;
  if new.status = 'ongoing' and old.status is distinct from 'ongoing'
     and coalesce(new.receipt_photo_url, '') = '' then
    raise exception 'Take a photo of the receipt before starting the trip.' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_food_require_receipt on public.food_deliveries;
create trigger trg_food_require_receipt before update on public.food_deliveries
  for each row execute function public.food_require_receipt();

-- ---- food: an out-of-stock item comes off the total -------------------------
create or replace function public.food_item_out_of_stock()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  f      public.food_deliveries%rowtype;
  amt    numeric(10,2);
  total  numeric(10,2);
  prev   text := coalesce(current_setting('itulod.system_write', true), '');
  online boolean;
begin
  if not (public.is_trusted_writer() or session_user in ('postgres', 'supabase_admin')) then
    if new.food_delivery_id is distinct from old.food_delivery_id
       or new.menu_item_id is distinct from old.menu_item_id
       or new.name is distinct from old.name
       or new.unit_price is distinct from old.unit_price
       or new.quantity is distinct from old.quantity
       or new.subtotal is distinct from old.subtotal then
      raise exception 'Only "out of stock" can be changed on an order item.' using errcode = 'P0001';
    end if;
    if old.is_out_of_stock and not new.is_out_of_stock then
      raise exception 'An item marked out of stock can''t be put back on the order.' using errcode = 'P0001';
    end if;
  end if;

  if new.is_out_of_stock and not coalesce(old.is_out_of_stock, false) then
    select * into f from public.food_deliveries where id = new.food_delivery_id for update;
    if not found or f.status not in ('pending', 'accepted', 'ongoing') then
      return new;
    end if;
    amt := coalesce(new.subtotal, new.unit_price * new.quantity, 0);
    if f.final_fare is not null then
      total := greatest(f.final_fare - amt, 0);
      online := f.payment_status = 'paid' and coalesce(f.payment_method, 'cash') in ('gcash', 'wallet');

      -- A system write: the booking guard only lets the system set final_fare.
      perform set_config('itulod.system_write', 'true', true);
      update public.food_deliveries set final_fare = total where id = f.id;
      if online and amt > 0 then
        perform public.adjust_wallet_balance(f.customer_id, amt);
        insert into public.wallet_transactions (customer_id, type, amount, booking_type, booking_id, note)
        values (f.customer_id, 'refund', amt, 'food', f.id, 'Refund — ' || new.quantity || ' × ' || new.name || ' out of stock');
      end if;
      perform set_config('itulod.system_write', prev, true);
    end if;

    insert into public.notifications (user_id, title, message) values (f.customer_id,
      'Item out of stock',
      new.quantity || ' × ' || new.name || ' isn''t available at ' || coalesce(f.restaurant_name, 'the restaurant')
      || ', so ₱' || to_char(amt, 'FM999,990.00') || ' was taken off your order'
      || case when online and amt > 0 then ' and refunded to your iTULOD wallet.'
              when total is not null then '. Your new total is ₱' || to_char(total, 'FM999,990.00') || '.'
              else '.' end);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_food_item_out_of_stock on public.food_order_items;
create trigger trg_food_item_out_of_stock before update on public.food_order_items
  for each row execute function public.food_item_out_of_stock();

-- ---- "A rider accepted" says what to pay when paying online -----------------
CREATE OR REPLACE FUNCTION public.notify_booking_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  label text := case tg_table_name
    when 'transport_bookings' then 'ride'
    when 'food_deliveries'    then 'food delivery'
    when 'parcel_deliveries'  then 'parcel delivery'
    when 'hauling_bookings'   then 'hauling job'
    else 'booking' end;
  cap_label text := upper(left(label, 1)) || substr(label, 2);
  rider_name text;
  rider_phone text;
  rec jsonb := to_jsonb(new);
  prev jsonb := to_jsonb(old);
begin
  if old.rider_id is null and new.rider_id is not null then
    select full_name, phone into rider_name, rider_phone from public.profiles where id = new.rider_id;
    insert into public.notifications (user_id, title, message) values (new.customer_id,
      'A rider accepted your ' || label,
      coalesce(rider_name, 'Your rider') || ' is on the way' || coalesce(' · ' || rider_phone, '') || '.'
      || case when coalesce(new.payment_method, 'cash') in ('gcash', 'wallet')
                   and coalesce(new.payment_status, 'pending') <> 'paid'
                   and coalesce(new.final_fare, new.estimated_fare, 0) > 0
              then ' Pay ₱' || to_char(coalesce(new.final_fare, new.estimated_fare), 'FM999,990.00')
                   || case when new.payment_method = 'wallet' then ' from your wallet' else ' by GCash' end
                   || ' from Booking history.'
              else '' end);
  end if;

  if old.rider_id is not null and new.rider_id is null and new.status = 'pending' then
    insert into public.notifications (user_id, title, message) values (new.customer_id,
      'Looking for a new rider',
      'Your rider had to release this ' || label || ' — we''re finding you another one.');
  end if;

  if new.status is distinct from old.status then
    if new.status = 'ongoing' then
      insert into public.notifications (user_id, title, message) values (new.customer_id,
        cap_label || ' started', 'Your ' || label || ' is now in progress.');
    elsif new.status = 'completed' then
      insert into public.notifications (user_id, title, message) values (new.customer_id,
        cap_label || ' completed', 'Thanks for using iTULOD! You can rate your rider from Booking history.');
    elsif new.status = 'cancelled' then
      if auth.uid() = new.customer_id then
        if old.rider_id is not null then
          insert into public.notifications (user_id, title, message) values (old.rider_id,
            cap_label || ' cancelled', 'The customer cancelled this ' || label || '.'
            || case when new.cancellation_fee_paid then ' You''ll receive the ₱' || to_char(new.cancellation_fee, 'FM999,990.00') || ' cancellation fee.' else '' end);
        end if;
      else
        insert into public.notifications (user_id, title, message) values (new.customer_id,
          cap_label || ' cancelled', coalesce(nullif(new.cancelled_reason, ''), 'This ' || label || ' was cancelled.'));
      end if;
    elsif new.status = 'expired' then
      insert into public.notifications (user_id, title, message) values (new.customer_id,
        cap_label || ' expired',
        case when old.status = 'pending'
          then 'No rider accepted in time. Please book again.'
          else 'Your rider didn''t start in time, so this ' || label || ' expired. Please book again.' end);
    elsif new.status = 'no_show' then
      insert into public.notifications (user_id, title, message) values (new.customer_id,
        'Marked as no-show', 'Your rider arrived but couldn''t find you, so this ' || label || ' was closed.');
    end if;
  end if;

  if new.payment_status = 'paid' and old.payment_status is distinct from 'paid' and coalesce(new.payment_method, 'cash') <> 'cash' then
    insert into public.notifications (user_id, title, message) values (new.customer_id,
      'Payment received', 'We''ve received your payment of ₱' || to_char(coalesce(new.final_fare, new.estimated_fare), 'FM999,990.00') || ' for this ' || label || '.');
  end if;

  if new.payment_status = 'refunded' and old.payment_status is distinct from 'refunded' then
    insert into public.notifications (user_id, title, message) values (new.customer_id,
      'Refund issued',
      'Your payment for this ' || label || ' was refunded to your iTULOD wallet'
      || case when coalesce(new.cancellation_fee, 0) > 0
              then ' (less the ₱' || to_char(new.cancellation_fee, 'FM999,990.00') || ' fee).' else '.' end);
  end if;

  if new.cancellation_fee_paid is true and old.cancellation_fee_paid is distinct from true
     and new.payment_status is distinct from 'refunded' then
    insert into public.notifications (user_id, title, message) values (new.customer_id,
      'Fee charged to your wallet',
      'A ₱' || to_char(new.cancellation_fee, 'FM999,990.00') || ' fee for this ' || label || ' was taken from your iTULOD wallet.');
  elsif new.cancellation_fee_paid is false and old.cancellation_fee_paid is null then
    insert into public.notifications (user_id, title, message) values (new.customer_id,
      'Unpaid fee',
      'A ₱' || to_char(new.cancellation_fee, 'FM999,990.00') || ' fee for this ' || label || ' couldn''t be taken from your wallet. Please top up to settle it.');
  end if;

  if new.tip_amount is not null and old.tip_amount is null and new.rider_id is not null then
    insert into public.notifications (user_id, title, message) values (new.rider_id,
      'You got a tip!', 'The customer added a ₱' || to_char(new.tip_amount, 'FM999,990.00') || ' tip for this ' || label || '.');
  end if;

  -- parcel only: the rider handed the COD over to the sender
  if (rec ? 'cod_remitted_at') and rec->>'cod_remitted_at' is not null and prev->>'cod_remitted_at' is null then
    insert into public.notifications (user_id, title, message) values (new.customer_id,
      'COD handed over',
      'Your rider marked the ₱' || to_char((rec->>'cod_amount')::numeric, 'FM999,990.00') || ' cash-on-delivery as handed to you.');
  end if;

  return new;
end;
$function$;

-- ---- jobs already under way: their booked total ------------------------------
do $$
begin
  perform set_config('itulod.system_write', 'true', true); -- this transaction only
  update public.food_deliveries f
     set final_fare = greatest(f.estimated_fare - coalesce((
           select sum(coalesce(i.subtotal, i.unit_price * i.quantity))
             from public.food_order_items i
            where i.food_delivery_id = f.id and i.is_out_of_stock), 0), 0)
   where f.status in ('accepted', 'ongoing') and f.final_fare is null;
  update public.parcel_deliveries set final_fare = estimated_fare
   where status in ('accepted', 'ongoing') and final_fare is null;
  update public.hauling_bookings set final_fare = estimated_fare
   where status in ('accepted', 'ongoing') and final_fare is null;
end $$;
