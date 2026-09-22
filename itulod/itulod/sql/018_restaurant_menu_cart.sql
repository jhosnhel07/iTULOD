-- =============================================================================
-- iTULOD migration 018: restaurant + menu + cart (part 1 — data model)
-- -----------------------------------------------------------------------------
-- Replaces "type any restaurant name" with real, admin-managed restaurants
-- and menus. Because item prices are now known up front, a cart-based food
-- order can have its *total* price (items + distance-based delivery fee)
-- computed at booking time instead of waiting for the rider to set one at
-- pickup — food_deliveries.final_fare gets set immediately on insert, and
-- rider.js already treats "final_fare already set" as "nothing to
-- finalize" (needsFinalFare = kind !== 'transport' && final_fare == null),
-- so the existing rider accept/start/complete flow needs no changes at all
-- for these orders. This mirrors the trust model rides already use:
-- estimated_fare has always been client-computed at booking time; this just
-- feeds it real item prices instead of nothing.
-- =============================================================================

create table if not exists public.restaurants (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  address text not null,
  lat double precision,
  lng double precision,
  cuisine_type text,
  image_url text,
  is_active boolean not null default true,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.menu_items (
  id uuid primary key default uuid_generate_v4(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  name text not null,
  description text,
  price numeric(10,2) not null check (price > 0),
  image_url text,
  is_available boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_menu_items_restaurant on public.menu_items (restaurant_id);

-- Line items for a cart-based order, snapshotted at order time so a later
-- menu price change never retroactively alters a past receipt.
create table if not exists public.food_order_items (
  id uuid primary key default uuid_generate_v4(),
  food_delivery_id uuid not null references public.food_deliveries(id) on delete cascade,
  menu_item_id uuid references public.menu_items(id) on delete set null,
  name text not null,
  unit_price numeric(10,2) not null check (unit_price >= 0),
  quantity int not null check (quantity > 0),
  subtotal numeric(10,2) not null check (subtotal >= 0),
  created_at timestamptz not null default now()
);

create index if not exists idx_food_order_items_delivery on public.food_order_items (food_delivery_id);

alter table public.food_deliveries add column if not exists restaurant_id uuid references public.restaurants(id);
alter table public.food_deliveries add column if not exists item_subtotal numeric(10,2);
alter table public.food_deliveries add column if not exists delivery_fee numeric(10,2);

do $$
declare t text;
begin
  for t in select unnest(array['restaurants', 'menu_items']) loop
    execute format('drop trigger if exists trg_set_updated_at on public.%I;', t);
    execute format('create trigger trg_set_updated_at before update on public.%I
                    for each row execute function public.set_updated_at();', t);
  end loop;
end $$;

-- ---- RLS: restaurants / menu_items — browsable by anyone signed in,
-- writable only by admins (the same ownership model vehicles already use). ----
alter table public.restaurants enable row level security;
drop policy if exists "restaurants_read" on public.restaurants;
create policy "restaurants_read" on public.restaurants
  for select using (auth.uid() is not null);
drop policy if exists "restaurants_admin_write" on public.restaurants;
create policy "restaurants_admin_write" on public.restaurants
  for all using (public.is_admin()) with check (public.is_admin());

alter table public.menu_items enable row level security;
drop policy if exists "menu_items_read" on public.menu_items;
create policy "menu_items_read" on public.menu_items
  for select using (auth.uid() is not null);
drop policy if exists "menu_items_admin_write" on public.menu_items;
create policy "menu_items_admin_write" on public.menu_items
  for all using (public.is_admin()) with check (public.is_admin());

-- ---- RLS: food_order_items — same participant model as ride_stops:
-- readable by the order's own customer/rider/admin, insertable only by the
-- customer while the order is still 'pending' (i.e. at checkout time), never
-- updated or deleted afterward. ----
alter table public.food_order_items enable row level security;
drop policy if exists "food_order_items_participant_read" on public.food_order_items;
create policy "food_order_items_participant_read" on public.food_order_items
  for select using (
    public.is_admin()
    or exists (
      select 1 from public.food_deliveries f
      where f.id = food_delivery_id and (f.customer_id = auth.uid() or f.rider_id = auth.uid())
    )
  );
drop policy if exists "food_order_items_customer_insert" on public.food_order_items;
create policy "food_order_items_customer_insert" on public.food_order_items
  for insert with check (
    exists (
      select 1 from public.food_deliveries f
      where f.id = food_delivery_id and f.customer_id = auth.uid() and f.status = 'pending'
    )
  );
