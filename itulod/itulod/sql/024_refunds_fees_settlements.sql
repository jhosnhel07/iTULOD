-- =============================================================================
-- iTULOD migration 024: refunds, cancellation fees, rider settlement, COD
-- -----------------------------------------------------------------------------
-- Money that was recorded but never actually moved:
--
-- 1. REFUNDS — a GCash/wallet booking that's already paid and then gets
--    cancelled, expires or ends as a no-show is refunded automatically to
--    the customer's iTULOD wallet (instant; no PayMongo refund round-trip),
--    minus any cancellation fee. payment_status -> 'refunded'.
-- 2. CANCELLATION / NO-SHOW FEE — the fee booking_before_update() records
--    (customer cancels after a rider accepted; now also a rider-marked
--    no-show) is collected: from the prepayment if there was one, else from
--    the wallet if it covers it. A collected fee is paid to the rider as a
--    payments row (no commission). cancellation_fee_paid says whether it
--    was collected.
-- 3. RIDER SETTLEMENT — riders keep cash fares (and owe iTULOD the
--    commission on them); iTULOD holds GCash/wallet fares (and owes the rider
--    their payout). rider_balance() nets the two against recorded
--    rider_settlements (payouts to the rider / collections from the rider),
--    which admins record from the dashboard.
-- 4. PARCEL COD — the rider marks when they've handed the collected COD to
--    the sender (cod_remitted_at); the customer is notified.
--
-- Run AFTER 023. Safe to re-run.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Columns
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['transport_bookings', 'food_deliveries', 'parcel_deliveries', 'hauling_bookings'] loop
    execute format('alter table public.%I add column if not exists cancellation_fee_paid boolean', t);
  end loop;
end $$;

alter table public.parcel_deliveries add column if not exists cod_remitted_at timestamptz;
alter table public.parcel_deliveries add column if not exists cod_remit_note text;

-- ---------------------------------------------------------------------------
-- booking_before_update(): + no-show fee, + refunds, + fee collection
-- (everything above "refunds" is unchanged from 010/022)
-- ---------------------------------------------------------------------------
create or replace function public.booking_before_update()
returns trigger
language plpgsql
security definer
as $function$
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
    commission := round(fare * cfg.commission_rate, 2);

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

-- ---------------------------------------------------------------------------
-- notify_booking_change(): + refund, fee and COD notices (rest as in 023)
-- ---------------------------------------------------------------------------
create or replace function public.notify_booking_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
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
      coalesce(rider_name, 'Your rider') || ' is on the way' || coalesce(' · ' || rider_phone, '') || '.');
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
$$;

-- ---------------------------------------------------------------------------
-- Rider settlement ledger
-- ---------------------------------------------------------------------------
create table if not exists public.rider_settlements (
  id          uuid primary key default uuid_generate_v4(),
  rider_id    uuid not null references public.profiles(id) on delete cascade,
  direction   text not null check (direction in ('payout', 'collection')),
  amount      numeric(10,2) not null check (amount > 0),
  method      text not null default 'cash',
  reference   text,
  note        text,
  created_by  uuid references public.profiles(id),
  created_at  timestamptz not null default now()
);
create index if not exists idx_rider_settlements_rider on public.rider_settlements (rider_id, created_at desc);

alter table public.rider_settlements enable row level security;
drop policy if exists "rider_settlements_select" on public.rider_settlements;
create policy "rider_settlements_select" on public.rider_settlements
  for select using (rider_id = auth.uid() or public.is_admin());
drop policy if exists "rider_settlements_admin_insert" on public.rider_settlements;
create policy "rider_settlements_admin_insert" on public.rider_settlements
  for insert with check (public.is_admin());

-- Positive net = iTULOD owes the rider; negative = the rider owes iTULOD.
create or replace function public.rider_balance(p_rider uuid default null)
returns table (
  rider_id uuid,
  online_earnings numeric,
  cash_commission numeric,
  payouts_made numeric,
  collections_made numeric,
  net numeric,
  cod_unremitted numeric
)
language plpgsql
stable security definer
set search_path = public
as $$
declare
  rid uuid := coalesce(p_rider, auth.uid());
begin
  if rid is null or (rid <> auth.uid() and not public.is_admin()) then
    raise exception 'not allowed';
  end if;
  return query
  with p as (
    select
      coalesce(sum(rider_payout) filter (where method <> 'cash' and status = 'paid'), 0) as online,
      coalesce(sum(platform_commission) filter (where method = 'cash'), 0) as cash_comm
    from public.payments where payments.rider_id = rid
  ), s as (
    select
      coalesce(sum(amount) filter (where direction = 'payout'), 0) as paid_out,
      coalesce(sum(amount) filter (where direction = 'collection'), 0) as collected
    from public.rider_settlements where rider_settlements.rider_id = rid
  ), c as (
    select coalesce(sum(cod_amount), 0) as cod
    from public.parcel_deliveries
    where parcel_deliveries.rider_id = rid and status = 'completed' and cod_amount > 0 and cod_remitted_at is null
  )
  select rid, p.online, p.cash_comm, s.paid_out, s.collected,
         p.online - p.cash_comm - s.paid_out + s.collected, c.cod
  from p, s, c;
end;
$$;

create or replace function public.admin_rider_balances()
returns table (
  rider_id uuid, full_name text, phone text,
  online_earnings numeric, cash_commission numeric, payouts_made numeric,
  collections_made numeric, net numeric, cod_unremitted numeric
)
language plpgsql
stable security definer
set search_path = public
as $$
begin
  if not public.is_admin() then raise exception 'admins only'; end if;
  return query
  select pr.id, pr.full_name, pr.phone, b.online_earnings, b.cash_commission, b.payouts_made,
         b.collections_made, b.net, b.cod_unremitted
  from public.profiles pr
  cross join lateral public.rider_balance(pr.id) b
  where pr.role = 'rider'
  order by abs(b.net) desc, pr.full_name;
end;
$$;

create or replace function public.admin_record_settlement(
  p_rider uuid, p_direction text, p_amount numeric, p_method text, p_reference text, p_note text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare new_id uuid;
begin
  if not public.is_admin() then raise exception 'admins only'; end if;
  insert into public.rider_settlements (rider_id, direction, amount, method, reference, note, created_by)
  values (p_rider, p_direction, round(p_amount, 2), coalesce(nullif(p_method, ''), 'cash'),
          nullif(p_reference, ''), nullif(p_note, ''), auth.uid())
  returning id into new_id;
  insert into public.notifications (user_id, title, message) values (p_rider,
    case when p_direction = 'payout' then 'Payout sent' else 'Payment received' end,
    case when p_direction = 'payout'
      then 'iTULOD sent you ₱' || to_char(p_amount, 'FM999,990.00') || ' via ' || coalesce(nullif(p_method, ''), 'cash') || '.'
      else 'iTULOD recorded your ₱' || to_char(p_amount, 'FM999,990.00') || ' commission payment.' end);
  return new_id;
end;
$$;

-- Manual refund / goodwill credit from a support request
create or replace function public.admin_refund_to_wallet(
  p_customer uuid, p_amount numeric, p_note text, p_booking_type text default null, p_booking_id uuid default null)
returns numeric
language plpgsql
security definer
set search_path = public
as $$
declare new_balance numeric;
begin
  if not public.is_admin() then raise exception 'admins only'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'enter an amount greater than zero'; end if;
  new_balance := public.adjust_wallet_balance(p_customer, round(p_amount, 2));
  insert into public.wallet_transactions (customer_id, type, amount, booking_type, booking_id, note)
  values (p_customer, 'refund', round(p_amount, 2), p_booking_type, p_booking_id, coalesce(nullif(p_note, ''), 'Refund from iTULOD support'));
  insert into public.notifications (user_id, title, message) values (p_customer,
    'Refund issued', '₱' || to_char(p_amount, 'FM999,990.00') || ' was added to your iTULOD wallet. ' || coalesce(nullif(p_note, ''), ''));
  return new_balance;
end;
$$;

grant execute on function public.rider_balance(uuid) to authenticated;
grant execute on function public.admin_rider_balances() to authenticated;
grant execute on function public.admin_record_settlement(uuid, text, numeric, text, text, text) to authenticated;
grant execute on function public.admin_refund_to_wallet(uuid, numeric, text, text, uuid) to authenticated;
