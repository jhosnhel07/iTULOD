-- 054_remove_promos.sql
-- ---------------------------------------------------------------------------
-- Promos are removed (the user decided against them). Undoes sql/053 and the
-- older promo pieces (sql/011):
--   * booking_before_update() goes back to sql/050: the rider's share and
--     iTULOD's commission come from what the customer paid; no promo guard.
--   * rider_booking_earnings() goes back to sql/047.
--   * claim_promo / my_promos / admin_send_promo / send_promo_notifications /
--     promo_summary, the promo_claims / promo_redemptions / promo_codes tables
--     and the promo_discount_type enum are dropped; promo notifications are
--     deleted.
--   * bookings lose promo_code / discount_amount, payments lose promo_discount.
-- The redeem-promo Edge Function now answers 410 (older app versions).
-- No real customer had claimed or used a promo.
-- ---------------------------------------------------------------------------

-- ---- the completion split without promos (as sql/050) -------------------------
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

-- ---- what the rider earns (as sql/047) -------------------------------------------
drop function if exists public.rider_booking_earnings(text, uuid);
create or replace function public.rider_booking_earnings(p_type text, p_id uuid)
returns table (fare numeric, commission numeric, payout numeric, tip numeric, is_final boolean)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  x record;
  pay record;
  b jsonb;
  tbl text := case p_type when 'transport' then 'transport_bookings' when 'food' then 'food_deliveries'
                          when 'parcel' then 'parcel_deliveries' when 'hauling' then 'hauling_bookings' end;
  f numeric;
  base numeric;
  rate numeric;
begin
  select * into x from public.booking_party_ids(p_type, p_id::text);
  -- the rider of the booking, an admin, or an approved rider looking at a
  -- waiting request (so they see what they'd earn before accepting)
  if tbl is null or not (x.rider_id = auth.uid() or public.is_admin()
       or (x.rider_id is null and x.status = 'pending' and public.is_approved_rider())) then
    return;
  end if;
  execute format('select to_jsonb(t) from public.%I t where t.id = $1', tbl) into b using p_id;

  -- Done (or a fee was charged): the real payout row; tips are already in it.
  select p.amount, p.platform_commission, p.rider_payout into pay
    from payments p where p.booking_type = p_type and p.booking_id = p_id
   order by p.created_at desc limit 1;
  if found then
    return query select pay.amount, pay.platform_commission, pay.rider_payout,
                        nullif((b ->> 'tip_amount')::numeric, 0), true;
    return;
  end if;

  -- Not done yet: the estimate, by the completion trigger's rule.
  select commission_rate into rate from platform_config limit 1;
  f := coalesce((b ->> 'final_fare')::numeric, (b ->> 'estimated_fare')::numeric, 0);
  if p_type = 'food' then
    base := least(f, coalesce((b ->> 'delivery_fee')::numeric,
                              greatest(f - coalesce((b ->> 'item_subtotal')::numeric, 0), 0)));
  else
    base := f;
  end if;
  return query select f, round(base * coalesce(rate, 0.15), 2), f - round(base * coalesce(rate, 0.15), 2),
                      nullif((b ->> 'tip_amount')::numeric, 0), false;
end;
$$;
revoke all on function public.rider_booking_earnings(text, uuid) from public;
grant execute on function public.rider_booking_earnings(text, uuid) to authenticated;

-- ---- the promo steps and tables --------------------------------------------------
drop function if exists public.claim_promo(uuid, text);
drop function if exists public.my_promos();
drop function if exists public.admin_send_promo(uuid);
drop function if exists public.send_promo_notifications(uuid);
drop function if exists public.promo_summary(public.promo_codes);

do $$
begin
  if exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'promo_claims') then
    alter publication supabase_realtime drop table public.promo_claims;
  end if;
end $$;

delete from public.notifications where link like 'promo/%';
drop table if exists public.promo_claims;
drop table if exists public.promo_redemptions;
drop table if exists public.promo_codes;
drop type if exists public.promo_discount_type;

-- ---- the promo fields ------------------------------------------------------------
alter table public.transport_bookings drop column if exists promo_code;
alter table public.transport_bookings drop column if exists discount_amount;
alter table public.food_deliveries    drop column if exists promo_code;
alter table public.food_deliveries    drop column if exists discount_amount;
alter table public.parcel_deliveries  drop column if exists promo_code;
alter table public.parcel_deliveries  drop column if exists discount_amount;
alter table public.hauling_bookings   drop column if exists promo_code;
alter table public.hauling_bookings   drop column if exists discount_amount;
alter table public.payments           drop column if exists promo_discount;
