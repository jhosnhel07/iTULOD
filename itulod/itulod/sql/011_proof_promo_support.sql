-- =============================================================================
-- iTULOD — migration 011: proof of delivery, promo codes, support requests
-- Run in the Supabase SQL editor AFTER 010. Safe to re-run (idempotent).
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Proof of delivery — a photo the rider takes at food/parcel drop-off.
--    (Transport has no "delivery" to photograph, so it's excluded.)
-- ---------------------------------------------------------------------------
alter table public.food_deliveries   add column if not exists delivery_proof_url text;
alter table public.parcel_deliveries add column if not exists delivery_proof_url text;

insert into storage.buckets (id, name, public)
values ('delivery-proof', 'delivery-proof', true)
on conflict (id) do nothing;

drop policy if exists "delivery_proof_public_read" on storage.objects;
create policy "delivery_proof_public_read" on storage.objects
  for select using (bucket_id = 'delivery-proof');

drop policy if exists "delivery_proof_rider_write" on storage.objects;
create policy "delivery_proof_rider_write" on storage.objects
  for insert with check (bucket_id = 'delivery-proof' and (storage.foldername(name))[1] = auth.uid()::text);

-- ---------------------------------------------------------------------------
-- 2. Promo / discount codes
-- ---------------------------------------------------------------------------
do $$ begin
  create type promo_discount_type as enum ('percent', 'flat');
exception when duplicate_object then null; end $$;

create table if not exists public.promo_codes (
  id             uuid primary key default uuid_generate_v4(),
  code           text not null unique,
  discount_type  promo_discount_type not null default 'percent',
  discount_value numeric(10,2) not null,          -- 10 = 10% if percent, ₱10 if flat
  max_uses       int,                              -- null = unlimited
  uses_count     int not null default 0,
  min_fare       numeric(10,2),                    -- booking must be at least this before discount
  active         boolean not null default true,
  expires_at     timestamptz,
  created_by     uuid references public.profiles(id),
  created_at     timestamptz not null default now()
);
alter table public.promo_codes enable row level security;

drop policy if exists "promo_codes_read" on public.promo_codes;
create policy "promo_codes_read" on public.promo_codes
  for select using (auth.uid() is not null);       -- any signed-in user can look one up to validate it

drop policy if exists "promo_codes_admin_write" on public.promo_codes;
create policy "promo_codes_admin_write" on public.promo_codes
  for all using (public.is_admin()) with check (public.is_admin());

create table if not exists public.promo_redemptions (
  id               uuid primary key default uuid_generate_v4(),
  promo_code_id    uuid not null references public.promo_codes(id) on delete cascade,
  customer_id      uuid not null references public.profiles(id) on delete cascade,
  booking_type     text not null check (booking_type in ('transport', 'food', 'parcel')),
  booking_id       uuid not null,
  discount_amount  numeric(10,2) not null,
  created_at       timestamptz not null default now(),
  unique (promo_code_id, customer_id)               -- one redemption per customer per code
);
alter table public.promo_redemptions enable row level security;

drop policy if exists "promo_redemptions_own_read" on public.promo_redemptions;
create policy "promo_redemptions_own_read" on public.promo_redemptions
  for select using (customer_id = auth.uid() or public.is_admin());
-- inserts only ever come from the redeem-promo Edge Function (service role),
-- which is how uses_count/one-per-customer stay trustworthy — no client policy.

alter table public.transport_bookings   add column if not exists promo_code text;
alter table public.food_deliveries      add column if not exists promo_code text;
alter table public.parcel_deliveries    add column if not exists promo_code text;
alter table public.transport_bookings   add column if not exists discount_amount numeric(10,2);
alter table public.food_deliveries      add column if not exists discount_amount numeric(10,2);
alter table public.parcel_deliveries    add column if not exists discount_amount numeric(10,2);

-- ---------------------------------------------------------------------------
-- 3. Self-service support requests (refunds, disputes, anything else) —
--    replaces having no way to reach admin about a specific booking.
-- ---------------------------------------------------------------------------
do $$ begin
  create type support_category as enum ('refund', 'dispute', 'other');
exception when duplicate_object then null; end $$;
do $$ begin
  create type support_status as enum ('open', 'in_progress', 'resolved');
exception when duplicate_object then null; end $$;

create table if not exists public.support_requests (
  id             uuid primary key default uuid_generate_v4(),
  customer_id    uuid not null references public.profiles(id) on delete cascade,
  booking_type   text check (booking_type in ('transport', 'food', 'parcel')),
  booking_id     uuid,
  category       support_category not null default 'other',
  subject        text not null,
  message        text not null,
  status         support_status not null default 'open',
  admin_response text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
alter table public.support_requests enable row level security;

drop policy if exists "support_requests_customer_insert" on public.support_requests;
create policy "support_requests_customer_insert" on public.support_requests
  for insert with check (customer_id = auth.uid());

drop policy if exists "support_requests_select" on public.support_requests;
create policy "support_requests_select" on public.support_requests
  for select using (customer_id = auth.uid() or public.is_admin());

-- Only admin may change status/response; the customer's own row otherwise
-- stays exactly as they submitted it.
drop policy if exists "support_requests_admin_update" on public.support_requests;
create policy "support_requests_admin_update" on public.support_requests
  for update using (public.is_admin()) with check (public.is_admin());

drop trigger if exists trg_set_updated_at on public.support_requests;
create trigger trg_set_updated_at before update on public.support_requests
  for each row execute function public.set_updated_at();
