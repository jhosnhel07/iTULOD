-- =============================================================================
-- iTULOD — migration 009: automatic booking expiration
-- Run in the Supabase SQL editor AFTER 005. Safe to re-run (idempotent).
--
-- Context (read this before assuming a bug): iTULOD bookings are on-demand —
-- a ride/food/parcel request is always for "right now", there is no date/time
-- picker anywhere in the booking forms, and `created_at` is a server-side
-- default the client never sends. That already makes "reject a past date/time
-- typed by the user" moot: there is no such field to type into, so there is
-- nothing to validate. What genuinely applies — and is what this migration
-- implements — is automatic expiration of bookings that go stale:
--
--   * PENDING  too long (no rider accepted it)      -> expired after 15 min
--   * ACCEPTED too long (rider accepted, never       -> expired after 15 min
--     started the job — never moved it to 'ongoing')    past acceptance
--
-- An ONGOING booking (the rider is actually en route / delivering) is never
-- auto-expired — a real trip can legitimately take longer than 15 minutes,
-- and force-expiring one mid-trip would cancel real, in-progress work. That
-- would contradict the same rule this feature is built on ("completed
-- bookings must never expire") applied to the wrong stage. COMPLETED,
-- CANCELLED, EXPIRED, and NO_SHOW are terminal and are enforced as such below.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 0. new statuses + the timestamp expiration is measured from
-- ---------------------------------------------------------------------------
alter type public.booking_status add value if not exists 'expired';
alter type public.booking_status add value if not exists 'no_show';

alter table public.transport_bookings   add column if not exists accepted_at timestamptz;
alter table public.food_deliveries      add column if not exists accepted_at timestamptz;
alter table public.parcel_deliveries    add column if not exists accepted_at timestamptz;

-- ---------------------------------------------------------------------------
-- 1. is_trusted_writer(): also trust a same-transaction system-write flag.
--    expire_stale_bookings() sets this so its own UPDATEs pass the trigger's
--    client-write guard below — it has no auth.uid()/JWT context of its own
--    when run from pg_cron or a plain SQL call.
-- ---------------------------------------------------------------------------
create or replace function public.is_trusted_writer()
returns boolean as $$
  select coalesce(auth.role(), '') = 'service_role'
      or auth.jwt() ->> 'role' = 'service_role'
      or coalesce(current_setting('itulod.system_write', true), '') = 'true'
      or public.is_admin();
$$ language sql security definer stable;

-- ---------------------------------------------------------------------------
-- 2. booking_before_update(): add the terminal-state lock, stamp accepted_at,
--    and let a rider mark a no-show. Everything else is unchanged from 005.
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
  -- Once a booking is completed / cancelled / expired / a no-show, an ordinary
  -- client can never change its status again — "expired bookings should no
  -- longer be editable, confirmed, or used". Trusted writers are exempt so a
  -- GCash webhook can still flip payment_status on an already-completed ride
  -- (paying after the trip is a supported flow) and an admin can correct a
  -- mistake by hand.
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

    if uid = old.customer_id then
      -- customer: may cancel, and may set payment fields while still pending
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
      -- assigned rider advancing the job (now includes marking a no-show —
      -- the customer never showed up for pickup/handoff)
      if new.rider_id is distinct from old.rider_id then
        raise exception 'riders cannot reassign a booking';
      end if;
      if new.status not in ('accepted', 'ongoing', 'completed', 'cancelled', 'no_show') then
        raise exception 'invalid status transition';
      end if;
      if new.status = 'no_show' and old.status <> 'accepted' then
        raise exception 'a no-show can only be marked before the trip starts';
      end if;
      if new.payment_status is distinct from old.payment_status then
        raise exception 'payment_status is set by the system';
      end if;

    else
      raise exception 'not allowed to update this booking';
    end if;
  end if;

  -- ---- a booking just became accepted: start its 15-minute "must start by"
  -- grace period. Stamped regardless of caller so it's accurate even for an
  -- admin-driven change, but only on the actual transition (not re-stamped on
  -- every later edit while still accepted).
  if new.status = 'accepted' and old.status is distinct from 'accepted' then
    new.accepted_at := now();
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

  return new;
end;
$$ language plpgsql security definer;

-- ---------------------------------------------------------------------------
-- 2b. Best-effort backfill: a booking that was already 'accepted' before this
--     migration ran has accepted_at = null, which would otherwise exempt it
--     from ever expiring. Approximate it from updated_at (set by the same
--     claim that put it in 'accepted'). Needs the system-write flag, same as
--     expire_stale_bookings() below — this is a plain UPDATE with no
--     auth.uid() context, so it would otherwise hit the trigger's guard above.
-- ---------------------------------------------------------------------------
do $$
begin
  perform set_config('itulod.system_write', 'true', true);
  update public.transport_bookings set accepted_at = updated_at where status = 'accepted' and accepted_at is null;
  update public.food_deliveries      set accepted_at = updated_at where status = 'accepted' and accepted_at is null;
  update public.parcel_deliveries    set accepted_at = updated_at where status = 'accepted' and accepted_at is null;
end $$;

-- ---------------------------------------------------------------------------
-- 3. expire_stale_bookings(): the actual sweep. Uses the database server's
--    clock (now()) exclusively — never anything sent by a client — so it
--    can't be gamed by a manipulated browser clock. Safe to call from
--    anywhere (pg_cron, an Edge Function, or opportunistically from the
--    logged-in app) since it takes no input and only ever moves a booking
--    from pending/accepted to expired under the exact time rule above.
-- ---------------------------------------------------------------------------
create or replace function public.expire_stale_bookings()
returns integer as $$
declare
  n int := 0;
  r int;
begin
  perform set_config('itulod.system_write', 'true', true); -- this transaction only

  update public.transport_bookings set status = 'expired'
    where (status = 'pending'  and created_at  <= now() - interval '15 minutes')
       or (status = 'accepted' and accepted_at <= now() - interval '15 minutes');
  get diagnostics r = row_count; n := n + r;

  update public.food_deliveries set status = 'expired'
    where (status = 'pending'  and created_at  <= now() - interval '15 minutes')
       or (status = 'accepted' and accepted_at <= now() - interval '15 minutes');
  get diagnostics r = row_count; n := n + r;

  update public.parcel_deliveries set status = 'expired'
    where (status = 'pending'  and created_at  <= now() - interval '15 minutes')
       or (status = 'accepted' and accepted_at <= now() - interval '15 minutes');
  get diagnostics r = row_count; n := n + r;

  return n; -- number of bookings just expired, for logging/debugging
end;
$$ language plpgsql security definer;

-- Callable directly from the browser (customer.js / rider.js call this once
-- on dashboard load, and every ~60s while the tab is open) so the UI reflects
-- an expiration immediately rather than waiting for the next cron tick. This
-- is safe to expose: no arguments, no data returned beyond a count, and it
-- can only ever do the one thing defined above.
grant execute on function public.expire_stale_bookings() to authenticated, anon;

-- ---------------------------------------------------------------------------
-- 4. Background sweep so expiration happens even with nobody looking at the
--    app — via pg_cron if the project has it enabled (Database -> Extensions
--    -> pg_cron, on by default on most Supabase plans). If it isn't enabled,
--    this is a no-op notice, not an error — use the expire-bookings Edge
--    Function on a schedule instead (see DEPLOYMENT.md).
-- ---------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('itulod-expire-bookings', '* * * * *', 'select public.expire_stale_bookings();');
  else
    raise notice 'pg_cron is not enabled on this project — skipping the schedule. Enable it under Database > Extensions and re-run this file, or trigger the expire-bookings Edge Function on a schedule instead (see DEPLOYMENT.md).';
  end if;
end $$;
