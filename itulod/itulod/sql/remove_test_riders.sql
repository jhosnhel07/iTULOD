-- remove_test_riders.sql (ad-hoc, not a numbered migration)
-- Deletes the 12 TEST rider accounts added for testing (Laoag, Batac, Solsona,
-- Pasuquin): emails *@example.com whose rider application notes start with
-- "TEST ACCOUNT". Bookings they accepted while testing keep their history but
-- lose the rider link; their profile, application, location, settlements,
-- reviews and notifications go with the account (on delete cascade).
--
-- Run: npx supabase@latest db query --linked --file sql/remove_test_riders.sql

begin;

create temp table _test_riders on commit drop as
  select p.id
  from public.profiles p
  join public.rider_applications a on a.rider_id = p.id
  where p.email like '%@example.com' and a.notes like 'TEST ACCOUNT%';

-- Booking rows are locked once finished (sql/009 trigger), so detach the
-- rider with triggers paused for this transaction only.
set local session_replication_role = replica;
update public.transport_bookings set rider_id = null where rider_id in (select id from _test_riders);
update public.food_deliveries   set rider_id = null where rider_id in (select id from _test_riders);
update public.parcel_deliveries set rider_id = null where rider_id in (select id from _test_riders);
update public.hauling_bookings  set rider_id = null where rider_id in (select id from _test_riders);
update public.payments          set rider_id = null where rider_id in (select id from _test_riders);
set local session_replication_role = origin;

delete from auth.users where id in (select id from _test_riders);

-- Stop the keep-online job from sql/test_riders_online.sql, if it was set up.
do $$
begin
  if exists (select 1 from cron.job where jobname = 'itulod-test-riders-heartbeat') then
    perform cron.unschedule('itulod-test-riders-heartbeat');
  end if;
end $$;

commit;
