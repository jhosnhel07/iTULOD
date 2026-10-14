-- =============================================================================
-- iTULOD migration 025: hauling driver availability
-- -----------------------------------------------------------------------------
-- Hauling jobs only reach approved riders whose vehicle is a Van, Pickup or
-- Truck (sql/022). hauling_availability() tells the booking form how many
-- such drivers exist and how many are online right now, so customers aren't
-- left waiting on a request nobody can see — the form warns them (and
-- suggests scheduling ahead) when there are none. Counts only; no rider
-- identities or locations leave the database.
--
-- Run AFTER 024. Safe to re-run.
-- =============================================================================

create or replace function public.hauling_availability()
returns table (drivers integer, online_now integer)
language sql
stable security definer
set search_path = public
as $$
  with haulers as (
    select distinct ra.rider_id
    from public.rider_applications ra
    join public.profiles p on p.id = ra.rider_id and p.role = 'rider' and p.is_active
    where ra.status = 'approved' and ra.vehicle_type in ('Van', 'Pickup', 'Truck')
  )
  select
    (select count(*) from haulers)::int,
    (select count(*) from haulers h
       join public.rider_locations rl on rl.rider_id = h.rider_id
      where rl.is_online and rl.updated_at >= now() - interval '5 minutes')::int;
$$;

grant execute on function public.hauling_availability() to authenticated;
