-- =============================================================================
-- iTULOD migration 016: multi-stop rides
-- -----------------------------------------------------------------------------
-- Up to 3 extra stops between pickup and destination on a ride. Stops are set
-- once at booking time (while still 'pending') and never edited afterward —
-- the customer picks them, the rider works through them in order, marking
-- each arrived. Fare/distance already account for every leg: the customer's
-- browser sums pickup→stop1→...→destination via OSRM before the booking is
-- even inserted, same trust model the app already uses for a plain two-point
-- ride (estimated_fare has always been client-computed; this doesn't change
-- that boundary, just what feeds into it).
-- =============================================================================

create table if not exists public.ride_stops (
  id uuid primary key default uuid_generate_v4(),
  booking_id uuid not null references public.transport_bookings(id) on delete cascade,
  stop_order int not null check (stop_order >= 1),
  address text not null,
  lat double precision,
  lng double precision,
  arrived_at timestamptz,
  created_at timestamptz not null default now(),
  unique (booking_id, stop_order)
);

create index if not exists idx_ride_stops_booking on public.ride_stops (booking_id, stop_order);

alter table public.ride_stops enable row level security;

drop policy if exists "ride_stops_participant_read" on public.ride_stops;
create policy "ride_stops_participant_read" on public.ride_stops
  for select using (
    public.is_admin()
    or exists (
      select 1 from public.transport_bookings b
      where b.id = booking_id and (b.customer_id = auth.uid() or b.rider_id = auth.uid())
    )
  );

-- Stops are part of the booking request itself — only insertable by the
-- booking's own customer, and only while it's still 'pending' (before a
-- rider has priced their acceptance around a fixed route).
drop policy if exists "ride_stops_customer_insert" on public.ride_stops;
create policy "ride_stops_customer_insert" on public.ride_stops
  for insert with check (
    exists (
      select 1 from public.transport_bookings b
      where b.id = booking_id and b.customer_id = auth.uid() and b.status = 'pending'
    )
  );

-- The assigned rider marks a stop arrived by updating arrived_at. RLS here
-- guards *who* can touch the row and *when* (their own active job only); the
-- client is trusted to only ever send {arrived_at} in that update, same as
-- other single-purpose client writes elsewhere in this schema.
drop policy if exists "ride_stops_rider_update" on public.ride_stops;
create policy "ride_stops_rider_update" on public.ride_stops
  for update using (
    exists (
      select 1 from public.transport_bookings b
      where b.id = booking_id and b.rider_id = auth.uid() and b.status in ('accepted', 'ongoing')
    )
  )
  with check (
    exists (
      select 1 from public.transport_bookings b
      where b.id = booking_id and b.rider_id = auth.uid() and b.status in ('accepted', 'ongoing')
    )
  );
