-- =============================================================================
-- iTULOD migration 022: Hauling — a fourth booking service
-- -----------------------------------------------------------------------------
-- Moving large / heavy items (furniture, appliances, house moves,
-- construction materials, business goods) with a hauling vehicle and
-- optional helpers. Works like Parcel end to end:
--   * the customer books with an estimated fare (vehicle base + per-km rate
--     + helpers × helper fee); cash, GCash or wallet;
--   * an approved rider with a hauling-capable vehicle (Van / Pickup /
--     Truck, from their rider application) accepts it;
--   * the rider confirms the real fare at pickup (finalize-fare) — that's
--     when GCash / wallet becomes payable — and completes with a
--     proof-of-delivery photo;
--   * booking_before_update() locks the fare, records the payout, cash
--     settlement, tips and cancellation fee exactly as for the other kinds.
--
-- Also: vehicles.service splits the passenger/courier vehicles from the
-- hauling ones, platform_config.hauling_helper_fee prices a helper, and
-- every place that lists the booking kinds now includes 'hauling'
-- (check constraints, expiry sweep, nearby-riders, chat notifications,
-- referral bonus, realtime).
--
-- Run AFTER 021. Safe to re-run (idempotent).
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Vehicles: which service a vehicle is for, plus the hauling fleet
-- ---------------------------------------------------------------------------
alter table public.vehicles add column if not exists service text not null default 'standard';
do $$ begin
  alter table public.vehicles add constraint vehicles_service_check check (service in ('standard', 'hauling'));
exception when duplicate_object then null; end $$;

insert into public.vehicles (name, icon, capacity, base_fare, per_km_rate, is_available, service)
select v.name, v.icon, v.capacity, v.base_fare, v.per_km_rate, true, 'hauling'
from (values
  ('Pickup / Multicab',        'fa-truck-pickup', 2,  250.00, 18.00),
  ('L300 Van',                 'fa-van-shuttle',  2,  400.00, 22.00),
  ('Small Truck (4-wheeler)',  'fa-truck',        2,  900.00, 30.00),
  ('6-Wheeler Truck',          'fa-truck-moving', 3, 2000.00, 45.00)
) as v(name, icon, capacity, base_fare, per_km_rate)
where not exists (select 1 from public.vehicles x where x.name = v.name);

alter table public.platform_config add column if not exists hauling_helper_fee numeric(10,2) not null default 250.00;

-- ---------------------------------------------------------------------------
-- 2. hauling_bookings
-- ---------------------------------------------------------------------------
create table if not exists public.hauling_bookings (
  id                  uuid primary key default uuid_generate_v4(),
  customer_id         uuid not null references public.profiles(id) on delete cascade,
  rider_id            uuid references public.profiles(id),
  vehicle_id          uuid references public.vehicles(id),

  pickup_address      text not null,
  pickup_lat          numeric,
  pickup_lng          numeric,
  dropoff_address     text not null,
  dropoff_lat         numeric,
  dropoff_lng         numeric,

  -- contact at pickup / person receiving at drop-off
  sender_name         text not null,
  sender_phone        text,
  receiver_name       text not null,
  receiver_phone      text,

  item_category       text not null default 'other'
                      check (item_category in ('furniture', 'appliances', 'moving', 'construction', 'goods', 'other')),
  item_description    text not null,
  estimated_weight_kg numeric,
  helpers             integer not null default 0 check (helpers between 0 and 4),
  helper_fee          numeric(10,2) not null default 0,   -- per helper, at booking time
  instructions        text,
  scheduled_for       timestamptz,

  distance_km         numeric,
  estimated_fare      numeric(10,2),
  final_fare          numeric(10,2),
  status              public.booking_status not null default 'pending',
  payment_method      public.payment_method default 'cash',
  payment_status      public.payment_status default 'pending',
  paymongo_reference  text,
  accepted_at         timestamptz,
  rating              integer check (rating between 1 and 5),
  review              text,
  tip_amount          numeric(10,2),
  cancellation_fee    numeric(10,2),
  cancelled_reason    text,
  delivery_proof_url  text,
  promo_code          text,
  discount_amount     numeric(10,2),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index if not exists idx_hauling_customer on public.hauling_bookings (customer_id, created_at desc);
create index if not exists idx_hauling_rider    on public.hauling_bookings (rider_id, status);
create index if not exists idx_hauling_open     on public.hauling_bookings (status) where rider_id is null;

-- ---------------------------------------------------------------------------
-- 3. Who can haul: an approved rider whose vehicle can carry big loads
-- ---------------------------------------------------------------------------
create or replace function public.is_hauling_rider()
returns boolean
language sql
stable security definer
set search_path = public
as $$
  select public.is_approved_rider() and exists (
    select 1 from public.rider_applications ra
    where ra.rider_id = auth.uid()
      and ra.status = 'approved'
      and ra.vehicle_type in ('Van', 'Pickup', 'Truck')
  );
$$;

-- ---------------------------------------------------------------------------
-- 4. RLS — same model as parcel_deliveries, open jobs limited to haulers
-- ---------------------------------------------------------------------------
alter table public.hauling_bookings enable row level security;

drop policy if exists "hauling_select" on public.hauling_bookings;
create policy "hauling_select" on public.hauling_bookings
  for select using (customer_id = auth.uid() or rider_id = auth.uid() or public.is_admin());

drop policy if exists "hauling_select_available" on public.hauling_bookings;
create policy "hauling_select_available" on public.hauling_bookings
  for select using (status = 'pending' and rider_id is null and public.is_hauling_rider());

drop policy if exists "hauling_insert" on public.hauling_bookings;
create policy "hauling_insert" on public.hauling_bookings
  for insert with check (customer_id = auth.uid());

drop policy if exists "hauling_update" on public.hauling_bookings;
create policy "hauling_update" on public.hauling_bookings
  for update
  using (customer_id = auth.uid() or rider_id = auth.uid() or public.is_admin()
         or (status = 'pending' and rider_id is null and public.is_hauling_rider()))
  with check (customer_id = auth.uid() or rider_id = auth.uid() or public.is_admin());

-- ---------------------------------------------------------------------------
-- 5. Triggers — the shared booking lifecycle (fare lock, payout, tips,
--    cancellation fee, grace period), referral bonus, updated_at
-- ---------------------------------------------------------------------------
drop trigger if exists trg_hauling_before_update on public.hauling_bookings;
create trigger trg_hauling_before_update before update on public.hauling_bookings
  for each row execute function public.booking_before_update('hauling');

drop trigger if exists trg_pay_referral_bonus on public.hauling_bookings;
create trigger trg_pay_referral_bonus after update on public.hauling_bookings
  for each row execute function public.pay_referral_bonus_on_first_completion();

drop trigger if exists trg_set_updated_at on public.hauling_bookings;
create trigger trg_set_updated_at before update on public.hauling_bookings
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 6. booking_type checks now accept 'hauling'
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array['booking_messages', 'payments', 'promo_redemptions', 'reviews', 'support_requests', 'wallet_transactions'] loop
    execute format('alter table public.%I drop constraint if exists %I', t, t || '_booking_type_check');
    execute format(
      'alter table public.%I add constraint %I check (booking_type in (''transport'', ''food'', ''parcel'', ''hauling''))',
      t, t || '_booking_type_check');
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 7. Functions that list the booking tables
-- ---------------------------------------------------------------------------
create or replace function public.expire_stale_bookings()
returns integer
language plpgsql
security definer
as $function$
declare
  n int := 0;
  r int;
begin
  perform set_config('itulod.system_write', 'true', true); -- this transaction only

  update public.transport_bookings set status = 'expired'
    where (status = 'pending'  and coalesce(scheduled_for, created_at) <= now() - interval '15 minutes')
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

  -- Hauling can be scheduled ahead, like rides.
  update public.hauling_bookings set status = 'expired'
    where (status = 'pending'  and coalesce(scheduled_for, created_at) <= now() - interval '15 minutes')
       or (status = 'accepted' and accepted_at <= now() - interval '15 minutes');
  get diagnostics r = row_count; n := n + r;

  return n;
end;
$function$;

create or replace function public.get_nearby_riders()
returns table(rider_id uuid, lat double precision, lng double precision, vehicle_type text)
language sql
stable security definer
set search_path to 'public'
as $function$
  select distinct on (rl.rider_id)
    rl.rider_id,
    round(rl.lat::numeric, 3)::float8 as lat,
    round(rl.lng::numeric, 3)::float8 as lng,
    ra.vehicle_type
  from public.rider_locations rl
  join public.profiles p on p.id = rl.rider_id and p.role = 'rider' and p.is_active
  join public.rider_applications ra on ra.rider_id = rl.rider_id and ra.status = 'approved'
  where rl.is_online = true
    and rl.updated_at >= now() - interval '2 minutes'
    and rl.rider_id not in (
      select rider_id from public.transport_bookings where rider_id is not null and status in ('accepted', 'ongoing')
      union
      select rider_id from public.food_deliveries    where rider_id is not null and status in ('accepted', 'ongoing')
      union
      select rider_id from public.parcel_deliveries   where rider_id is not null and status in ('accepted', 'ongoing')
      union
      select rider_id from public.hauling_bookings    where rider_id is not null and status in ('accepted', 'ongoing')
    )
  order by rl.rider_id, ra.created_at desc;
$function$;

create or replace function public.notify_new_booking_message()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  cust uuid;
  rid uuid;
  recipient uuid;
  sender_name text;
begin
  if new.booking_type = 'transport' then
    select customer_id, rider_id into cust, rid from public.transport_bookings where id = new.booking_id;
  elsif new.booking_type = 'food' then
    select customer_id, rider_id into cust, rid from public.food_deliveries where id = new.booking_id;
  elsif new.booking_type = 'hauling' then
    select customer_id, rider_id into cust, rid from public.hauling_bookings where id = new.booking_id;
  else
    select customer_id, rider_id into cust, rid from public.parcel_deliveries where id = new.booking_id;
  end if;

  recipient := case when new.sender_id = cust then rid else cust end;
  if recipient is null then
    return new;
  end if;

  select full_name into sender_name from public.profiles where id = new.sender_id;

  insert into public.notifications (user_id, title, message)
  values (recipient, 'New message from ' || coalesce(sender_name, 'the other party'), left(new.body, 120));

  return new;
end;
$function$;

create or replace function public.pay_referral_bonus_on_first_completion()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  ev record;
  already_completed boolean;
begin
  if new.status <> 'completed' or old.status = 'completed' then
    return new;
  end if;

  select * into ev from public.referral_events
    where referred_id = new.customer_id and referrer_paid = false;
  if not found then
    return new;
  end if;

  select exists (
    select 1 from public.transport_bookings where customer_id = new.customer_id and status = 'completed' and id <> new.id
    union all
    select 1 from public.food_deliveries where customer_id = new.customer_id and status = 'completed' and id <> new.id
    union all
    select 1 from public.parcel_deliveries where customer_id = new.customer_id and status = 'completed' and id <> new.id
    union all
    select 1 from public.hauling_bookings where customer_id = new.customer_id and status = 'completed' and id <> new.id
  ) into already_completed;

  if already_completed then
    return new;
  end if;

  perform public.adjust_wallet_balance(ev.referrer_id, ev.referrer_bonus);
  insert into public.wallet_transactions (customer_id, type, amount, note)
    values (ev.referrer_id, 'referral_bonus', ev.referrer_bonus, 'Referral bonus — your friend completed their first booking');
  update public.referral_events set referrer_paid = true where id = ev.id;

  return new;
end;
$function$;

-- ---------------------------------------------------------------------------
-- 8. Realtime
-- ---------------------------------------------------------------------------
do $$ begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'hauling_bookings'
  ) then
    alter publication supabase_realtime add table public.hauling_bookings;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 9. Policies on other tables that check "is this my booking" — add hauling
--    (rider profile/vehicle for the customer, live tracking, reviews, chat)
-- ---------------------------------------------------------------------------
drop policy if exists "profiles_select_own_admin_or_assigned_rider" on public.profiles;
create policy "profiles_select_own_admin_or_assigned_rider" on public.profiles
  for select using (
    id = auth.uid() or public.is_admin()
    or exists (select 1 from public.transport_bookings b where b.rider_id = profiles.id and b.customer_id = auth.uid())
    or exists (select 1 from public.food_deliveries    b where b.rider_id = profiles.id and b.customer_id = auth.uid())
    or exists (select 1 from public.parcel_deliveries  b where b.rider_id = profiles.id and b.customer_id = auth.uid())
    or exists (select 1 from public.hauling_bookings   b where b.rider_id = profiles.id and b.customer_id = auth.uid())
  );

drop policy if exists "rider_app_select" on public.rider_applications;
create policy "rider_app_select" on public.rider_applications
  for select using (
    rider_id = auth.uid() or public.is_admin()
    or exists (select 1 from public.transport_bookings b where b.rider_id = rider_applications.rider_id and b.customer_id = auth.uid())
    or exists (select 1 from public.food_deliveries    b where b.rider_id = rider_applications.rider_id and b.customer_id = auth.uid())
    or exists (select 1 from public.parcel_deliveries  b where b.rider_id = rider_applications.rider_id and b.customer_id = auth.uid())
    or exists (select 1 from public.hauling_bookings   b where b.rider_id = rider_applications.rider_id and b.customer_id = auth.uid())
  );

drop policy if exists "rl_select" on public.rider_locations;
create policy "rl_select" on public.rider_locations
  for select using (
    rider_id = auth.uid() or public.is_admin()
    or exists (select 1 from public.transport_bookings b where b.rider_id = rider_locations.rider_id and b.customer_id = auth.uid() and b.status in ('accepted', 'ongoing'))
    or exists (select 1 from public.food_deliveries    b where b.rider_id = rider_locations.rider_id and b.customer_id = auth.uid() and b.status in ('accepted', 'ongoing'))
    or exists (select 1 from public.parcel_deliveries  b where b.rider_id = rider_locations.rider_id and b.customer_id = auth.uid() and b.status in ('accepted', 'ongoing'))
    or exists (select 1 from public.hauling_bookings   b where b.rider_id = rider_locations.rider_id and b.customer_id = auth.uid() and b.status in ('accepted', 'ongoing'))
  );

drop policy if exists "reviews_insert_customer" on public.reviews;
create policy "reviews_insert_customer" on public.reviews
  for insert with check (
    customer_id = auth.uid() and (
      exists (select 1 from public.transport_bookings b where b.id = reviews.booking_id and b.customer_id = auth.uid() and b.rider_id = reviews.rider_id and b.status = 'completed')
      or exists (select 1 from public.food_deliveries   b where b.id = reviews.booking_id and b.customer_id = auth.uid() and b.rider_id = reviews.rider_id and b.status = 'completed')
      or exists (select 1 from public.parcel_deliveries b where b.id = reviews.booking_id and b.customer_id = auth.uid() and b.rider_id = reviews.rider_id and b.status = 'completed')
      or exists (select 1 from public.hauling_bookings  b where b.id = reviews.booking_id and b.customer_id = auth.uid() and b.rider_id = reviews.rider_id and b.status = 'completed')
    )
  );

drop policy if exists "booking_messages_participant_read" on public.booking_messages;
create policy "booking_messages_participant_read" on public.booking_messages
  for select using (
    public.is_admin()
    or (booking_type = 'transport' and exists (select 1 from public.transport_bookings b where b.id = booking_messages.booking_id and (b.customer_id = auth.uid() or b.rider_id = auth.uid())))
    or (booking_type = 'food'      and exists (select 1 from public.food_deliveries    b where b.id = booking_messages.booking_id and (b.customer_id = auth.uid() or b.rider_id = auth.uid())))
    or (booking_type = 'parcel'    and exists (select 1 from public.parcel_deliveries  b where b.id = booking_messages.booking_id and (b.customer_id = auth.uid() or b.rider_id = auth.uid())))
    or (booking_type = 'hauling'   and exists (select 1 from public.hauling_bookings   b where b.id = booking_messages.booking_id and (b.customer_id = auth.uid() or b.rider_id = auth.uid())))
  );

drop policy if exists "booking_messages_participant_insert" on public.booking_messages;
create policy "booking_messages_participant_insert" on public.booking_messages
  for insert with check (
    sender_id = auth.uid() and (
      (booking_type = 'transport' and exists (select 1 from public.transport_bookings b where b.id = booking_messages.booking_id and (b.customer_id = auth.uid() or b.rider_id = auth.uid()) and b.status in ('accepted', 'ongoing')))
      or (booking_type = 'food'    and exists (select 1 from public.food_deliveries    b where b.id = booking_messages.booking_id and (b.customer_id = auth.uid() or b.rider_id = auth.uid()) and b.status in ('accepted', 'ongoing')))
      or (booking_type = 'parcel'  and exists (select 1 from public.parcel_deliveries  b where b.id = booking_messages.booking_id and (b.customer_id = auth.uid() or b.rider_id = auth.uid()) and b.status in ('accepted', 'ongoing')))
      or (booking_type = 'hauling' and exists (select 1 from public.hauling_bookings   b where b.id = booking_messages.booking_id and (b.customer_id = auth.uid() or b.rider_id = auth.uid()) and b.status in ('accepted', 'ongoing')))
    )
  );
