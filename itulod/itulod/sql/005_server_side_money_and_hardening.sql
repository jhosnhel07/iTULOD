-- =============================================================================
-- iTULOD — migration 005: move money server-side + tighten RLS
-- Run in the Supabase SQL editor AFTER schema.sql and 002 / 003 / 004.
-- Safe to re-run (idempotent).
--
-- What this does
--   1. Payments are created by a database trigger, not the browser. Commission
--      and payout are computed from platform_config; clients can no longer
--      insert into `payments` or set fare columns.
--   2. Booking updates are policed by a trigger: customers can only cancel /
--      start a GCash checkout, riders can only advance status, and only an
--      *approved* rider can claim a job. final_fare is locked to the system.
--   3. rider_locations table for live rider tracking (migration 006 feature).
--   4. reviews can only be left for a completed booking the customer actually
--      took with that rider.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 0. platform_config — single-row table of tunable money settings
-- ---------------------------------------------------------------------------
create table if not exists public.platform_config (
  id boolean primary key default true check (id),          -- forces one row
  commission_rate      numeric(5,4) not null default 0.1500, -- 15% to the platform
  fare_min             numeric(10,2) not null default 20.00,
  fare_max_multiplier  numeric(5,2)  not null default 3.00,  -- final_fare <= estimate * this
  updated_at           timestamptz not null default now()
);
insert into public.platform_config (id) values (true) on conflict (id) do nothing;

alter table public.platform_config enable row level security;
drop policy if exists "config_read" on public.platform_config;
create policy "config_read" on public.platform_config
  for select using (auth.uid() is not null);
drop policy if exists "config_admin_write" on public.platform_config;
create policy "config_admin_write" on public.platform_config
  for all using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- 1. helper: is the caller an APPROVED rider (not just role = 'rider')
-- ---------------------------------------------------------------------------
create or replace function public.is_approved_rider()
returns boolean as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role = 'rider'
      and p.is_active
      and exists (
        select 1 from public.rider_applications ra
        where ra.rider_id = p.id and ra.status = 'approved'
      )
  );
$$ language sql security definer stable;

-- true when running as the service role (Edge Functions) or as an admin —
-- these callers are trusted and skip the client guards below.
create or replace function public.is_trusted_writer()
returns boolean as $$
  select coalesce(auth.role(), '') = 'service_role'
      or auth.jwt() ->> 'role' = 'service_role'
      or public.is_admin();
$$ language sql security definer stable;

-- ---------------------------------------------------------------------------
-- 2. one BEFORE UPDATE trigger per booking table: guard + auto-payout
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
      -- assigned rider advancing the job
      if new.rider_id is distinct from old.rider_id then
        raise exception 'riders cannot reassign a booking';
      end if;
      if new.status not in ('accepted', 'ongoing', 'completed', 'cancelled') then
        raise exception 'invalid status transition';
      end if;
      if new.payment_status is distinct from old.payment_status then
        raise exception 'payment_status is set by the system';
      end if;

    else
      raise exception 'not allowed to update this booking';
    end if;
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

create unique index if not exists uq_payments_booking
  on public.payments (booking_type, booking_id);

drop trigger if exists trg_transport_before_update on public.transport_bookings;
create trigger trg_transport_before_update before update on public.transport_bookings
  for each row execute function public.booking_before_update('transport');

drop trigger if exists trg_food_before_update on public.food_deliveries;
create trigger trg_food_before_update before update on public.food_deliveries
  for each row execute function public.booking_before_update('food');

drop trigger if exists trg_parcel_before_update on public.parcel_deliveries;
create trigger trg_parcel_before_update before update on public.parcel_deliveries
  for each row execute function public.booking_before_update('parcel');

-- ---------------------------------------------------------------------------
-- 3. payments: clients may no longer insert. The trigger above (security
--    definer) and the Edge Functions (service role) still can.
-- ---------------------------------------------------------------------------
drop policy if exists "payments_insert" on public.payments;
drop policy if exists "payments_insert_service_admin_only" on public.payments;
create policy "payments_insert_service_admin_only" on public.payments
  for insert with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- 4. only an APPROVED rider sees / claims open jobs (was: any role='rider')
-- ---------------------------------------------------------------------------
drop policy if exists "transport_select_available" on public.transport_bookings;
create policy "transport_select_available" on public.transport_bookings
  for select using (status = 'pending' and rider_id is null and public.is_approved_rider());
drop policy if exists "food_select_available" on public.food_deliveries;
create policy "food_select_available" on public.food_deliveries
  for select using (status = 'pending' and rider_id is null and public.is_approved_rider());
drop policy if exists "parcel_select_available" on public.parcel_deliveries;
create policy "parcel_select_available" on public.parcel_deliveries
  for select using (status = 'pending' and rider_id is null and public.is_approved_rider());

-- keep the UPDATE policies permissive on the row level (the trigger does the
-- real enforcement) but require an approved rider for the "claim" path.
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
          or (rider_id = auth.uid())
        );
    $f$, t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 5. rider_locations — live position of a rider on an active job
-- ---------------------------------------------------------------------------
create table if not exists public.rider_locations (
  rider_id     uuid primary key references public.profiles(id) on delete cascade,
  booking_type text,
  booking_id   uuid,
  lat          numeric(10,6) not null,
  lng          numeric(10,6) not null,
  heading      numeric(5,1),
  updated_at   timestamptz not null default now()
);
alter table public.rider_locations enable row level security;

drop policy if exists "rl_rider_write" on public.rider_locations;
create policy "rl_rider_write" on public.rider_locations
  for all using (rider_id = auth.uid()) with check (rider_id = auth.uid());

drop policy if exists "rl_select" on public.rider_locations;
create policy "rl_select" on public.rider_locations
  for select using (
    rider_id = auth.uid() or public.is_admin()
    or exists (select 1 from public.transport_bookings b
                where b.rider_id = rider_locations.rider_id
                  and b.customer_id = auth.uid()
                  and b.status in ('accepted', 'ongoing'))
    or exists (select 1 from public.food_deliveries b
                where b.rider_id = rider_locations.rider_id
                  and b.customer_id = auth.uid()
                  and b.status in ('accepted', 'ongoing'))
    or exists (select 1 from public.parcel_deliveries b
                where b.rider_id = rider_locations.rider_id
                  and b.customer_id = auth.uid()
                  and b.status in ('accepted', 'ongoing'))
  );

do $$
begin
  execute 'alter publication supabase_realtime add table public.rider_locations';
exception when duplicate_object then null;
end $$;

-- ---------------------------------------------------------------------------
-- 6. reviews: only for a completed booking you actually took with that rider
-- ---------------------------------------------------------------------------
drop policy if exists "reviews_insert_customer" on public.reviews;
create policy "reviews_insert_customer" on public.reviews
  for insert with check (
    customer_id = auth.uid()
    and (
      exists (select 1 from public.transport_bookings b
               where b.id = reviews.booking_id and b.customer_id = auth.uid()
                 and b.rider_id = reviews.rider_id and b.status = 'completed')
      or exists (select 1 from public.food_deliveries b
               where b.id = reviews.booking_id and b.customer_id = auth.uid()
                 and b.rider_id = reviews.rider_id and b.status = 'completed')
      or exists (select 1 from public.parcel_deliveries b
               where b.id = reviews.booking_id and b.customer_id = auth.uid()
                 and b.rider_id = reviews.rider_id and b.status = 'completed')
    )
  );

-- ---------------------------------------------------------------------------
-- 7. notifications: a user may no longer insert notifications for themselves
--    (only admins + the service role, via Edge Functions, create them)
-- ---------------------------------------------------------------------------
drop policy if exists "notifications_insert_admin" on public.notifications;
create policy "notifications_insert_admin" on public.notifications
  for insert with check (public.is_admin());
