-- 053_promo_claims.sql
-- ---------------------------------------------------------------------------
-- Promos reach customers, get claimed, and are picked when booking — for
-- every service, paid for by iTULOD.
--
-- promo_codes      + title, services (which bookings it works for:
--                  transport / food / parcel / hauling), recipients + sent_at
--                  (how many customers it was sent to, and when).
-- promo_claims     a customer's claimed promos ("My promos").
-- send_promo_notifications() / admin_send_promo()
--                  sends a promo as a notification (link 'promo/<id>') to every
--                  active customer; the push trigger takes it to their phones.
-- claim_promo()    claims by id (from the notification) or by a typed code.
-- my_promos()      the customer's promos with a status — ready / used /
--                  expired / ended / full — plus sent promos not yet claimed
--                  ('unclaimed'), so a missed notification isn't a lost promo.
-- booking_before_update()  as live (sql/050), with the completion split
--                  changed: iTULOD pays for promos. The rider earns their
--                  share of the full price; the discount comes out of iTULOD's
--                  commission (payments.platform_commission can go below
--                  zero = iTULOD owes the rider on a cash trip).
-- payments.promo_discount  the discount on that booking (for earnings lists).
-- rider_booking_earnings() the same split for the rider's estimate.
-- The redeem-promo Edge Function now works for every service in the promo's
-- list, never takes a fare below the minimum fare, and claims the promo.
-- ---------------------------------------------------------------------------

alter table public.promo_codes add column if not exists title text;
alter table public.promo_codes add column if not exists services text[] not null
  default array['transport', 'food', 'parcel', 'hauling'];
alter table public.promo_codes add column if not exists recipients int;
alter table public.promo_codes add column if not exists sent_at timestamptz;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'promo_codes_services_valid') then
    alter table public.promo_codes add constraint promo_codes_services_valid
      check (cardinality(services) > 0 and services <@ array['transport', 'food', 'parcel', 'hauling']);
  end if;
end $$;

alter table public.payments add column if not exists promo_discount numeric(10,2) not null default 0;

create table if not exists public.promo_claims (
  id            uuid primary key default uuid_generate_v4(),
  promo_code_id uuid not null references public.promo_codes(id) on delete cascade,
  customer_id   uuid not null references public.profiles(id) on delete cascade,
  claimed_at    timestamptz not null default now(),
  unique (promo_code_id, customer_id)
);
alter table public.promo_claims enable row level security;
drop policy if exists "promo_claims_select" on public.promo_claims;
create policy "promo_claims_select" on public.promo_claims
  for select using (customer_id = auth.uid() or public.is_admin());
-- claims are made only through claim_promo() / redeem-promo

-- "10% off rides & food · min ₱100 · until Nov 30"
create or replace function public.promo_summary(p public.promo_codes)
returns text
language sql
stable
as $$
  select case when p.discount_type = 'percent' then trim(to_char(p.discount_value, 'FM990.##')) || '% off'
              else '₱' || to_char(p.discount_value, 'FM999,990.00') || ' off' end
      || ' ' || case when cardinality(p.services) = 4 then 'any booking'
                     else array_to_string(array(
                       select case s when 'transport' then 'rides' when 'food' then 'food'
                                     when 'parcel' then 'parcels' else 'hauling' end
                         from unnest(p.services) s), ' & ') end
      || case when coalesce(p.min_fare, 0) > 0 then ' · min ₱' || to_char(p.min_fare, 'FM999,990') else '' end
      || case when p.expires_at is not null
              then ' · until ' || to_char(p.expires_at at time zone 'Asia/Manila', 'Mon DD') else '' end;
$$;

-- Sends a promo to every active customer as a notification.
create or replace function public.send_promo_notifications(p_id uuid)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  p promo_codes%rowtype;
  n int;
begin
  select * into p from promo_codes where id = p_id;
  if not found then return 0; end if;
  insert into notifications (user_id, title, message, link)
  select pr.id, '🎟️ ' || coalesce(nullif(p.title, ''), 'New promo: ' || p.code),
         'Code ' || p.code || ': ' || public.promo_summary(p) || '. Tap to claim it, then pick it when you book.',
         'promo/' || p.id
    from profiles pr
   where pr.role::text = 'customer' and coalesce(pr.is_active, true);
  get diagnostics n = row_count;
  update promo_codes set recipients = n, sent_at = now() where id = p_id;
  return n;
end;
$$;
revoke all on function public.send_promo_notifications(uuid) from public, anon, authenticated;

create or replace function public.admin_send_promo(p_id uuid)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare p promo_codes%rowtype;
begin
  if not public.is_admin() then raise exception 'Only an admin can send promos.'; end if;
  select * into p from promo_codes where id = p_id;
  if not found then raise exception 'That promo was not found.' using errcode = 'P0001'; end if;
  if p.sent_at is not null then raise exception 'This promo was already sent.' using errcode = 'P0001'; end if;
  if not p.active or (p.expires_at is not null and p.expires_at < now()) then
    raise exception 'Only an active, unexpired promo can be sent.' using errcode = 'P0001';
  end if;
  return public.send_promo_notifications(p_id);
end;
$$;
revoke all on function public.admin_send_promo(uuid) from public, anon;
grant execute on function public.admin_send_promo(uuid) to authenticated;

-- Claim by id (the notification) or by a typed code.
create or replace function public.claim_promo(p_promo uuid default null, p_code text default null)
returns table (id uuid, code text)
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  p promo_codes%rowtype;
begin
  if uid is null or not exists (select 1 from profiles where profiles.id = uid and role::text = 'customer') then
    raise exception 'Only customers can claim promos.' using errcode = 'P0001';
  end if;
  if p_promo is not null then
    select * into p from promo_codes where promo_codes.id = p_promo;
  else
    select * into p from promo_codes where upper(promo_codes.code) = upper(trim(coalesce(p_code, '')));
  end if;
  if not found then raise exception 'That promo code was not found.' using errcode = 'P0001'; end if;
  if not p.active then raise exception 'That promo has ended.' using errcode = 'P0001'; end if;
  if p.expires_at is not null and p.expires_at < now() then raise exception 'That promo has expired.' using errcode = 'P0001'; end if;
  if exists (select 1 from promo_redemptions r where r.promo_code_id = p.id and r.customer_id = uid) then
    raise exception 'You''ve already used this promo.' using errcode = 'P0001';
  end if;
  if p.max_uses is not null and p.uses_count >= p.max_uses then
    raise exception 'That promo has been fully used.' using errcode = 'P0001';
  end if;
  insert into promo_claims (promo_code_id, customer_id) values (p.id, uid)
  on conflict (promo_code_id, customer_id) do nothing;
  return query select p.id, p.code;
end;
$$;
revoke all on function public.claim_promo(uuid, text) from public, anon;
grant execute on function public.claim_promo(uuid, text) to authenticated;

-- The customer's promos: claimed ones with a status, plus sent ones to claim.
create or replace function public.my_promos()
returns table (
  id uuid, code text, title text, summary text, discount_type text, discount_value numeric,
  min_fare numeric, services text[], expires_at timestamptz,
  claimed_at timestamptz, used_at timestamptz, used_booking_type text, status text)
language sql
stable
security definer
set search_path = public
as $$
  with mine as (
    select p.*, public.promo_summary(p) as summary_text, c.claimed_at, r.created_at as used_at, r.booking_type as used_type
      from promo_codes p
      left join promo_claims c on c.promo_code_id = p.id and c.customer_id = auth.uid()
      left join promo_redemptions r on r.promo_code_id = p.id and r.customer_id = auth.uid()
     where c.id is not null or r.id is not null
        or (p.sent_at is not null and p.active and (p.expires_at is null or p.expires_at > now())
            and (p.max_uses is null or p.uses_count < p.max_uses))
  )
  select m.id, m.code, coalesce(nullif(m.title, ''), m.code), m.summary_text,
         m.discount_type::text, m.discount_value, m.min_fare, m.services, m.expires_at,
         m.claimed_at, m.used_at, m.used_type,
         case when m.used_at is not null then 'used'
              when m.claimed_at is null then 'unclaimed'
              when not m.active then 'ended'
              when m.expires_at is not null and m.expires_at < now() then 'expired'
              when m.max_uses is not null and m.uses_count >= m.max_uses then 'full'
              else 'ready' end
    from mine m
   where auth.uid() is not null
   order by case when m.used_at is null and m.claimed_at is not null and m.active
                  and (m.expires_at is null or m.expires_at > now())
                  and (m.max_uses is null or m.uses_count < m.max_uses) then 0
                 when m.claimed_at is null and m.used_at is null then 1 else 2 end,
            m.expires_at nulls last, m.created_at desc;
$$;
revoke all on function public.my_promos() from public, anon;
grant execute on function public.my_promos() to authenticated;

-- ---- the completion split: iTULOD pays for promos ----------------------------
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
  disc        numeric(10,2);
  full_fare   numeric(10,2);
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
    if new.promo_code is distinct from old.promo_code or new.discount_amount is distinct from old.discount_amount then
      raise exception 'promos are applied by the system';
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
  -- iTULOD pays for promos (sql/053): the rider's share is of the full price
  -- (what the customer paid + the discount), and the discount comes out of
  -- iTULOD's commission — which can go below zero (iTULOD owes the rider).
  if new.status = 'completed' and old.status is distinct from 'completed' then
    select * into cfg from public.platform_config where id;

    fare := coalesce(new.final_fare, new.estimated_fare);
    disc := greatest(coalesce(new.discount_amount, 0), 0);
    if fare is null or fare + disc <= 0 then
      raise exception 'cannot complete a booking with no fare';
    end if;
    full_fare := fare + disc;

    if kind <> 'transport' and new.estimated_fare is not null then
      if fare > new.estimated_fare * cfg.fare_max_multiplier then
        raise exception 'final fare % is more than %x the % estimate',
          fare, cfg.fare_max_multiplier, new.estimated_fare;
      end if;
      -- Food: out-of-stock items come off the total (sql/050), so no minimum.
      if kind <> 'food' then
        min_fare := greatest(cfg.fare_min, round((new.estimated_fare + disc) * 0.5, 2));
        if full_fare < min_fare then
          raise exception 'final fare % is below the minimum %', full_fare, min_fare;
        end if;
      end if;
    end if;

    new.final_fare := fare;
    -- Food: the commission is on the delivery fee only — the rest of the
    -- fare is the food the rider bought for the customer (sql/035).
    if kind = 'food' then
      base := least(full_fare, coalesce(
        (to_jsonb(new) ->> 'delivery_fee')::numeric,
        greatest(full_fare - coalesce((to_jsonb(new) ->> 'item_subtotal')::numeric, 0), 0)));
    else
      base := full_fare;
    end if;
    commission := round(base * cfg.commission_rate, 2);

    if coalesce(new.payment_method, 'cash') = 'cash' or fare <= 0 then
      new.payment_status := 'paid';
    end if;

    insert into public.payments
      (customer_id, rider_id, booking_type, booking_id, amount,
       platform_commission, rider_payout, method, status, promo_discount)
    values
      (new.customer_id, new.rider_id, kind, new.id, fare,
       commission - disc, full_fare - commission, coalesce(new.payment_method, 'cash'),
       case when coalesce(new.payment_method, 'cash') = 'cash' or fare <= 0
            then 'paid' else new.payment_status end,
       disc)
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

-- ---- what the rider earns, the same split ------------------------------------
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
  d numeric;
  base numeric;
  rate numeric;
begin
  select * into x from public.booking_party_ids(p_type, p_id::text);
  if tbl is null or not (x.rider_id = auth.uid() or public.is_admin()
       or (x.rider_id is null and x.status = 'pending' and public.is_approved_rider())) then
    return;
  end if;
  execute format('select to_jsonb(t) from public.%I t where t.id = $1', tbl) into b using p_id;
  d := greatest(coalesce((b ->> 'discount_amount')::numeric, 0), 0);

  -- Done (or a fee was charged): the real payout row; tips are already in it.
  -- Fare = the full price (a promo is paid by iTULOD), commission = iTULOD's
  -- full cut, so fare − commission = what the rider earns.
  select p.amount, p.platform_commission, p.rider_payout, p.promo_discount into pay
    from payments p where p.booking_type = p_type and p.booking_id = p_id
   order by p.created_at desc limit 1;
  if found then
    return query select pay.amount + coalesce(pay.promo_discount, 0),
                        pay.platform_commission + coalesce(pay.promo_discount, 0), pay.rider_payout,
                        nullif((b ->> 'tip_amount')::numeric, 0), true;
    return;
  end if;

  -- Not done yet: the estimate, by the completion trigger's rule.
  select commission_rate into rate from platform_config limit 1;
  f := coalesce((b ->> 'final_fare')::numeric, (b ->> 'estimated_fare')::numeric, 0) + d;
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

-- ---- live: "My promos" follows claims ------------------------------------------
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'promo_claims') then
    alter publication supabase_realtime add table public.promo_claims;
  end if;
end $$;
