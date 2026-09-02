-- =====================================================================
-- iTULOD — Intelligent Transport and Unified Logistics On-Demand Delivery
-- Supabase (PostgreSQL) schema
-- Run this once in the Supabase SQL Editor on a fresh project.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Extensions
-- ---------------------------------------------------------------------
create extension if not exists "uuid-ossp";
create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- Enum types
-- ---------------------------------------------------------------------
do $$ begin
  create type user_role as enum ('admin', 'customer', 'rider');
exception when duplicate_object then null; end $$;

do $$ begin
  create type application_status as enum ('pending', 'approved', 'rejected');
exception when duplicate_object then null; end $$;

do $$ begin
  create type booking_status as enum ('pending', 'accepted', 'ongoing', 'completed', 'cancelled');
exception when duplicate_object then null; end $$;

do $$ begin
  create type payment_method as enum ('cash', 'gcash', 'card');
exception when duplicate_object then null; end $$;

do $$ begin
  create type payment_status as enum ('pending', 'paid', 'failed', 'refunded');
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------
-- profiles: one row per auth.users row, holds role + shared fields
-- ---------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  email text not null,
  phone text,
  role user_role not null default 'customer',
  avatar_url text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- rider_applications: onboarding documents + admin approval
-- ---------------------------------------------------------------------
create table if not exists public.rider_applications (
  id uuid primary key default uuid_generate_v4(),
  rider_id uuid not null references public.profiles(id) on delete cascade,
  license_number text,
  license_url text,
  or_cr_url text,
  vehicle_type text not null,
  vehicle_plate text,
  vehicle_model text,
  status application_status not null default 'pending',
  reviewed_by uuid references public.profiles(id),
  reviewed_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- vehicles: category catalog managed by admin
-- ---------------------------------------------------------------------
create table if not exists public.vehicles (
  id uuid primary key default uuid_generate_v4(),
  name text not null unique,
  icon text not null default 'fa-car',
  capacity int not null default 1,
  base_fare numeric(10,2) not null default 0,
  per_km_rate numeric(10,2) not null default 0,
  is_available boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- transport_bookings
-- ---------------------------------------------------------------------
create table if not exists public.transport_bookings (
  id uuid primary key default uuid_generate_v4(),
  customer_id uuid not null references public.profiles(id) on delete cascade,
  rider_id uuid references public.profiles(id),
  vehicle_id uuid references public.vehicles(id),
  pickup_address text not null,
  pickup_lat numeric(10,6),
  pickup_lng numeric(10,6),
  destination_address text not null,
  destination_lat numeric(10,6),
  destination_lng numeric(10,6),
  distance_km numeric(6,2),
  estimated_fare numeric(10,2),
  final_fare numeric(10,2),
  status booking_status not null default 'pending',
  rating int check (rating between 1 and 5),
  review text,
  cancelled_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- food_deliveries
-- ---------------------------------------------------------------------
create table if not exists public.food_deliveries (
  id uuid primary key default uuid_generate_v4(),
  customer_id uuid not null references public.profiles(id) on delete cascade,
  rider_id uuid references public.profiles(id),
  restaurant_name text not null,
  pickup_address text not null,
  delivery_address text not null,
  instructions text,
  estimated_fare numeric(10,2),
  final_fare numeric(10,2),
  status booking_status not null default 'pending',
  rating int check (rating between 1 and 5),
  review text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- parcel_deliveries
-- ---------------------------------------------------------------------
create table if not exists public.parcel_deliveries (
  id uuid primary key default uuid_generate_v4(),
  customer_id uuid not null references public.profiles(id) on delete cascade,
  rider_id uuid references public.profiles(id),
  sender_name text not null,
  sender_phone text,
  sender_address text not null,
  receiver_name text not null,
  receiver_phone text,
  receiver_address text not null,
  parcel_description text,
  parcel_size text,
  parcel_weight numeric(6,2),
  instructions text,
  estimated_fare numeric(10,2),
  final_fare numeric(10,2),
  status booking_status not null default 'pending',
  rating int check (rating between 1 and 5),
  review text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- payments: one row per completed booking of any type
-- ---------------------------------------------------------------------
create table if not exists public.payments (
  id uuid primary key default uuid_generate_v4(),
  customer_id uuid not null references public.profiles(id) on delete cascade,
  rider_id uuid references public.profiles(id),
  booking_type text not null check (booking_type in ('transport', 'food', 'parcel')),
  booking_id uuid not null,
  amount numeric(10,2) not null,
  platform_commission numeric(10,2) not null default 0,
  rider_payout numeric(10,2) not null default 0,
  method payment_method not null default 'cash',
  status payment_status not null default 'pending',
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- reviews: normalized ratings for riders (mirrors booking rating fields)
-- ---------------------------------------------------------------------
create table if not exists public.reviews (
  id uuid primary key default uuid_generate_v4(),
  customer_id uuid not null references public.profiles(id) on delete cascade,
  rider_id uuid not null references public.profiles(id) on delete cascade,
  booking_type text not null check (booking_type in ('transport', 'food', 'parcel')),
  booking_id uuid not null,
  rating int not null check (rating between 1 and 5),
  comment text,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- notifications
-- ---------------------------------------------------------------------
create table if not exists public.notifications (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  message text not null,
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- announcements: admin broadcast, visible to all
-- ---------------------------------------------------------------------
create table if not exists public.announcements (
  id uuid primary key default uuid_generate_v4(),
  title text not null,
  body text not null,
  audience text not null default 'all' check (audience in ('all', 'customer', 'rider')),
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- updated_at trigger helper
-- ---------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

do $$
declare t text;
begin
  for t in select unnest(array[
    'profiles','rider_applications','vehicles',
    'transport_bookings','food_deliveries','parcel_deliveries'
  ]) loop
    execute format('drop trigger if exists trg_set_updated_at on public.%I;', t);
    execute format('create trigger trg_set_updated_at before update on public.%I
                    for each row execute function public.set_updated_at();', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- auto-create a profile row whenever a new auth user signs up
-- role & name are read from the signup metadata set by the frontend
-- ---------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, full_name, email, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', 'New User'),
    new.email,
    coalesce((new.raw_user_meta_data->>'role')::user_role, 'customer')
  );
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------
-- default admin account: username "admin" / password "admin"
-- (login maps username "admin" → admin@itulod.local in js/config.js)
-- ---------------------------------------------------------------------
do $$
declare
  admin_id uuid := 'e07c4caf-4cb8-4f5f-a1e9-1a4f0479b0d0';
begin
  insert into auth.users (
    id, instance_id, aud, role, email, encrypted_password,
    email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at
  )
  values (
    admin_id,
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    'admin@itulod.local',
    crypt('admin', gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}',
    '{"full_name":"Administrator","role":"admin"}',
    now(),
    now()
  )
  on conflict (id) do nothing;

  insert into auth.identities (
    id, user_id, identity_data, provider, provider_id,
    last_sign_in_at, created_at, updated_at
  )
  values (
    admin_id,
    admin_id,
    format('{"sub":"%s","email":"admin@itulod.local"}', admin_id)::jsonb,
    'email',
    'admin@itulod.local',
    now(),
    now(),
    now()
  )
  on conflict (provider, provider_id) do nothing;

  insert into public.profiles (id, full_name, email, role)
  values (admin_id, 'Administrator', 'admin@itulod.local', 'admin')
  on conflict (id) do update
    set role = 'admin', full_name = 'Administrator', email = 'admin@itulod.local';
end $$;

-- =====================================================================
-- Row Level Security
-- =====================================================================
alter table public.profiles enable row level security;
alter table public.rider_applications enable row level security;
alter table public.vehicles enable row level security;
alter table public.transport_bookings enable row level security;
alter table public.food_deliveries enable row level security;
alter table public.parcel_deliveries enable row level security;
alter table public.payments enable row level security;
alter table public.reviews enable row level security;
alter table public.notifications enable row level security;
alter table public.announcements enable row level security;

-- helper: is the current user an admin?
create or replace function public.is_admin()
returns boolean as $$
  select exists (
    select 1 from public.profiles where id = auth.uid() and role = 'admin'
  );
$$ language sql security definer stable;

-- profiles ------------------------------------------------------------
create policy "profiles_select_own_or_admin" on public.profiles
  for select using (id = auth.uid() or public.is_admin());
create policy "profiles_update_own_or_admin" on public.profiles
  for update using (id = auth.uid() or public.is_admin());
create policy "profiles_insert_self" on public.profiles
  for insert with check (id = auth.uid());

-- rider_applications ---------------------------------------------------
create policy "rider_app_select" on public.rider_applications
  for select using (rider_id = auth.uid() or public.is_admin());
create policy "rider_app_insert" on public.rider_applications
  for insert with check (rider_id = auth.uid());
create policy "rider_app_update" on public.rider_applications
  for update using (rider_id = auth.uid() or public.is_admin());

-- vehicles: readable by everyone signed in, writable by admin only ----
create policy "vehicles_select_all" on public.vehicles
  for select using (auth.uid() is not null);
create policy "vehicles_admin_write" on public.vehicles
  for all using (public.is_admin()) with check (public.is_admin());

-- helper: is the current user an approved, active rider?
create or replace function public.is_rider()
returns boolean as $$
  select exists (
    select 1 from public.profiles where id = auth.uid() and role = 'rider'
  );
$$ language sql security definer stable;

-- transport_bookings ----------------------------------------------------
create policy "transport_select" on public.transport_bookings
  for select using (customer_id = auth.uid() or rider_id = auth.uid() or public.is_admin());
create policy "transport_select_available" on public.transport_bookings
  for select using (status = 'pending' and rider_id is null and public.is_rider());
create policy "transport_insert" on public.transport_bookings
  for insert with check (customer_id = auth.uid());
create policy "transport_update" on public.transport_bookings
  for update using (
    customer_id = auth.uid() or rider_id = auth.uid() or public.is_admin()
    or (status = 'pending' and rider_id is null and public.is_rider())
  ) with check (
    customer_id = auth.uid() or rider_id = auth.uid() or public.is_admin()
  );

-- food_deliveries ---------------------------------------------------------
create policy "food_select" on public.food_deliveries
  for select using (customer_id = auth.uid() or rider_id = auth.uid() or public.is_admin());
create policy "food_select_available" on public.food_deliveries
  for select using (status = 'pending' and rider_id is null and public.is_rider());
create policy "food_insert" on public.food_deliveries
  for insert with check (customer_id = auth.uid());
create policy "food_update" on public.food_deliveries
  for update using (
    customer_id = auth.uid() or rider_id = auth.uid() or public.is_admin()
    or (status = 'pending' and rider_id is null and public.is_rider())
  ) with check (
    customer_id = auth.uid() or rider_id = auth.uid() or public.is_admin()
  );

-- parcel_deliveries -----------------------------------------------------
create policy "parcel_select" on public.parcel_deliveries
  for select using (customer_id = auth.uid() or rider_id = auth.uid() or public.is_admin());
create policy "parcel_select_available" on public.parcel_deliveries
  for select using (status = 'pending' and rider_id is null and public.is_rider());
create policy "parcel_insert" on public.parcel_deliveries
  for insert with check (customer_id = auth.uid());
create policy "parcel_update" on public.parcel_deliveries
  for update using (
    customer_id = auth.uid() or rider_id = auth.uid() or public.is_admin()
    or (status = 'pending' and rider_id is null and public.is_rider())
  ) with check (
    customer_id = auth.uid() or rider_id = auth.uid() or public.is_admin()
  );

-- payments --------------------------------------------------------------
create policy "payments_select" on public.payments
  for select using (customer_id = auth.uid() or rider_id = auth.uid() or public.is_admin());
create policy "payments_insert" on public.payments
  for insert with check (customer_id = auth.uid() or public.is_admin());
create policy "payments_admin_update" on public.payments
  for update using (public.is_admin());

-- reviews -----------------------------------------------------------------
create policy "reviews_select_all" on public.reviews
  for select using (auth.uid() is not null);
create policy "reviews_insert_customer" on public.reviews
  for insert with check (customer_id = auth.uid());

-- notifications -------------------------------------------------------
create policy "notifications_select_own" on public.notifications
  for select using (user_id = auth.uid() or public.is_admin());
create policy "notifications_insert_admin" on public.notifications
  for insert with check (public.is_admin() or user_id = auth.uid());
create policy "notifications_update_own" on public.notifications
  for update using (user_id = auth.uid());

-- announcements ---------------------------------------------------------
create policy "announcements_select_all" on public.announcements
  for select using (auth.uid() is not null);
create policy "announcements_admin_write" on public.announcements
  for all using (public.is_admin()) with check (public.is_admin());

-- =====================================================================
-- Sample / seed data (vehicle categories)
-- =====================================================================
insert into public.vehicles (name, icon, capacity, base_fare, per_km_rate) values
  ('Motorcycle', 'fa-motorcycle', 1, 25.00, 8.00),
  ('Tricycle',   'fa-bicycle',    3, 30.00, 9.00),
  ('Bicycle',    'fa-bicycle',    1, 15.00, 5.00),
  ('Car',        'fa-car',        4, 40.00, 12.00),
  ('SUV',        'fa-car-side',   6, 60.00, 15.00),
  ('Van',        'fa-shuttle-van',8, 70.00, 16.00),
  ('Jeepney',    'fa-bus-alt',   14, 20.00, 6.00),
  ('Bus',        'fa-bus',       40, 25.00, 5.00),
  ('Truck',      'fa-truck',      2, 80.00, 20.00)
on conflict (name) do nothing;

-- =====================================================================
-- Storage buckets (run once; safe to ignore if already created)
-- =====================================================================
insert into storage.buckets (id, name, public)
values
  ('avatars', 'avatars', true),
  ('rider-documents', 'rider-documents', false),
  ('vehicle-icons', 'vehicle-icons', true)
on conflict (id) do nothing;

-- storage policies: users manage files inside a folder named after their uid
create policy "avatar_public_read" on storage.objects
  for select using (bucket_id = 'avatars');
create policy "avatar_owner_write" on storage.objects
  for insert with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "rider_docs_owner_rw" on storage.objects
  for all using (bucket_id = 'rider-documents' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'rider-documents' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "rider_docs_admin_read" on storage.objects
  for select using (bucket_id = 'rider-documents' and public.is_admin());
