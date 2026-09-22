-- =============================================================================
-- iTULOD — migration 010: saved addresses, tips, cancellation fee, rider release
-- Run in the Supabase SQL editor AFTER 009. Safe to re-run (idempotent).
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Saved / favorite addresses ("Home", "Work", or any custom label)
-- ---------------------------------------------------------------------------
create table if not exists public.saved_addresses (
  id          uuid primary key default uuid_generate_v4(),
  customer_id uuid not null references public.profiles(id) on delete cascade,
  label       text not null,
  address     text not null,
  lat         numeric(10,6),
  lng         numeric(10,6),
  created_at  timestamptz not null default now()
);
alter table public.saved_addresses enable row level security;

drop policy if exists "saved_addresses_own" on public.saved_addresses;
create policy "saved_addresses_own" on public.saved_addresses
  for all using (customer_id = auth.uid()) with check (customer_id = auth.uid());

-- ---------------------------------------------------------------------------
-- 2. Tips + cancellation fee columns on all three booking tables
-- ---------------------------------------------------------------------------
alter table public.transport_bookings add column if not exists tip_amount numeric(10,2);
alter table public.food_deliveries    add column if not exists tip_amount numeric(10,2);
alter table public.parcel_deliveries  add column if not exists tip_amount numeric(10,2);

alter table public.transport_bookings add column if not exists cancellation_fee numeric(10,2);
alter table public.food_deliveries    add column if not exists cancellation_fee numeric(10,2);
alter table public.parcel_deliveries  add column if not exists cancellation_fee numeric(10,2);

-- ---------------------------------------------------------------------------
-- 3. platform_config: the flat cancellation fee amount (admin-tunable)
-- ---------------------------------------------------------------------------
alter table public.platform_config add column if not exists cancellation_fee numeric(10,2) not null default 30.00;

-- ---------------------------------------------------------------------------
-- 4. booking_before_update(): let a customer set tip_amount on their own
--    completed booking, record a cancellation_fee when cancelling an already-
--    accepted booking, and let an assigned rider "release" a job back to
--    pending (rider_id -> null) instead of only ever ending it outright —
--    so one rider backing out doesn't strand the customer.
-- ---------------------------------------------------------------------------
create or replace function public.booking_before_update()
returns trigger as $$
declare
  kind        text := tg_argv[0];               -- 'transport' | 'food' | 'parcel'
  uid         uuid := auth.uid();
  cfg         public.platform_config%rowtype;
  fare        numeric(10,2);
  commission  numeric(10,2);
  min_fare    numeric(10,2);
begin
  -- ---- terminal-state lock --------------------------------------------------
  if not public.is_trusted_writer()
     and old.status in ('completed', 'cancelled', 'expired', 'no_show')
     and new.status is distinct from old.status then
    raise exception 'this booking is % and its status can no longer be changed', old.status;
  end if;

  -- ---- client-write guard --------------------------------------------------
  if not public.is_trusted_writer() then
    -- fare columns are never set from the browser
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

    if uid = old.customer_id then
      -- customer: may cancel, may set payment fields while still pending,
      -- and may leave a tip once the trip is completed.
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
      -- rider claiming an open job
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
      -- assigned rider advancing the job, marking a no-show, or releasing it
      -- back to the pool for another rider (rider_id -> null, status -> pending)
      -- instead of stranding the customer.
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

  -- ---- cancelling an already-accepted booking records a fee -----------------
  -- Recorded for admin visibility / a future automatic-collection mechanism
  -- (e.g. once a stored wallet exists) — not auto-charged yet, so cancelling
  -- never fails just because collection isn't wired up.
  if new.status = 'cancelled' and old.status = 'accepted' and uid = old.customer_id then
    select * into cfg from public.platform_config where id;
    new.cancellation_fee := cfg.cancellation_fee;
  end if;

  -- ---- a booking just became accepted: start its 15-minute grace period,
  -- or clear it if the rider released the job (the clock restarts once a
  -- new rider accepts) --------------------------------------------------
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

    -- food / parcel fares can be adjusted by the rider at pickup — keep them sane
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

    -- cash is handed over at drop-off
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

  -- ---- a tip was just added: fold it into the existing payout row. There's
  -- exactly one payments row per booking (uq_payments_booking), created by
  -- the completion block above — a tip always arrives after that, so it's
  -- an update, not a second insert. The rider keeps 100% of the tip; no
  -- commission is taken from it.
  if old.tip_amount is null and new.tip_amount is not null then
    update public.payments
      set amount = amount + new.tip_amount,
          rider_payout = rider_payout + new.tip_amount
      where booking_type = kind and booking_id = new.id;
  end if;

  return new;
end;
$$ language plpgsql security definer;

-- ---------------------------------------------------------------------------
-- 5. The UPDATE policy's WITH CHECK (from 005) requires rider_id = auth.uid()
--    on the resulting row — which "release" deliberately violates (it sets
--    rider_id to null). USING already confirmed the caller was the assigned
--    rider on this exact row before the update, and the trigger above is
--    what actually decides whether "released back to pending" is legal, so
--    this just stops RLS from blocking a transition the trigger already
--    validated — it grants no capability beyond what USING + the trigger
--    already permit together.
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['transport_bookings','food_deliveries','parcel_deliveries'] loop
    execute format($f$
      drop policy if exists "%1$s_update" on public.%1$s;
      create policy "%1$s_update" on public.%1$s
        for update using (
          customer_id = auth.uid() or rider_id = auth.uid() or public.is_admin()
          or (status = 'pending' and rider_id is null and public.is_approved_rider())
        ) with check (
          customer_id = auth.uid() or rider_id = auth.uid() or public.is_admin()
          or (rider_id is null and status = 'pending')
        );
    $f$, t);
  end loop;
end $$;
