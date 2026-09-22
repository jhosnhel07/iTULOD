-- =============================================================================
-- iTULOD migration 014: scheduled ("book later") rides
-- -----------------------------------------------------------------------------
-- A customer can set a future pickup time on a ride instead of booking for
-- right now. The booking still goes in as 'pending' immediately — there's no
-- separate "scheduled" status — but two things change around that plain fact:
--   1. Riders don't see it in their Requests list until its pickup time is
--      close (handled client-side in rider.js, see loadRequests()).
--   2. The 15-minute expiration grace period (sql/009) counts from the
--      scheduled pickup time instead of from when it was booked, so a ride
--      scheduled for tomorrow doesn't expire tonight.
-- =============================================================================

alter table public.transport_bookings add column if not exists scheduled_for timestamptz;

-- expire_stale_bookings(): identical to sql/009's version except the
-- transport 'pending' branch now measures the grace period from
-- coalesce(scheduled_for, created_at) instead of created_at alone, so a
-- scheduled ride's 15-minute clock starts at its pickup time, not at booking
-- time. food_deliveries / parcel_deliveries are unchanged (no scheduling
-- there yet).
create or replace function public.expire_stale_bookings()
returns integer as $$
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

  return n;
end;
$$ language plpgsql security definer;

grant execute on function public.expire_stale_bookings() to authenticated, anon;
