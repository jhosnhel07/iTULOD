-- =============================================================================
-- iTULOD migration 017: "riders near you" live map
-- -----------------------------------------------------------------------------
-- Riders broadcast a coarse presence ping while online and not on a job (see
-- js/map.js goOnline()/goOffline()) so customers can see roughly how many
-- riders are nearby before they book — the same rider_locations table
-- already used for live in-trip tracking, just with a new is_online flag.
--
-- Privacy: get_nearby_riders() is the *only* way this data reaches a
-- customer. It rounds coordinates to ~3 decimal places (~110m) so a customer
-- sees "riders nearby," never an exact GPS fix, and it excludes anyone
-- currently on a job (their customer already sees their exact position via
-- the existing rider_locations RLS policy once assigned). The underlying
-- rider_locations table's own RLS is untouched — this does not grant any
-- broader read access to exact rider coordinates.
-- =============================================================================

alter table public.rider_locations add column if not exists is_online boolean not null default false;

create or replace function public.get_nearby_riders()
returns table (rider_id uuid, lat double precision, lng double precision, vehicle_type text)
language sql
security definer
set search_path = public
stable
as $$
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
    )
  order by rl.rider_id, ra.created_at desc;
$$;

revoke all on function public.get_nearby_riders() from public;
grant execute on function public.get_nearby_riders() to authenticated;
