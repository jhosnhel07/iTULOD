-- 052_admin_live_updates.sql
-- ---------------------------------------------------------------------------
-- The admin dashboard listens on one realtime channel (admin.js
-- subscribeRealtime) for bookings, rider applications, payments, support
-- requests, profile photos and rider payments. payments, support_requests and
-- rider_applications were never in the supabase_realtime publication, and a
-- channel with a table that isn't published delivers no changes at all — so
-- the admin's lists and counts only updated on refresh. Publish them.
-- (Row-level security still decides who receives which row.)
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['payments', 'support_requests', 'rider_applications'] loop
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
