-- 041_rider_approval_and_suspension_guards.sql
-- ---------------------------------------------------------------------------
-- Two holes found by the end-to-end test (Oct 25, 2026):
--
-- 1. A rider could approve their own application. rider_app_update let the
--    rider update their own row with no column limits, so
--      update rider_applications set status = 'approved' where rider_id = me
--    made is_approved_rider() true and unlocked every job — skipping the
--    admin's license / OR-CR check. They could also change vehicle_type after
--    approval (e.g. Bicycle → Truck) to see jobs for another vehicle. And the
--    insert policy only checked rider_id, so a new application could be sent
--    already "approved".
--    Now: only an admin can change an application, and a rider can only send
--    a pending, unreviewed one. Neither app edits an application after
--    sending it (web register.js and the Flutter auth_repository only insert
--    with status 'pending'), so nothing else changes.
--
-- 2. A suspended customer could keep booking. Suspension only blocked the next
--    login; an existing session (web or app) could still insert bookings.
--    Now every booking table refuses new bookings from an inactive customer.
--    Riders were already covered: is_approved_rider() requires is_active.
-- ---------------------------------------------------------------------------

-- 1 ------------------------------------------------------------------------
drop policy if exists "rider_app_update" on public.rider_applications;
create policy "rider_app_update" on public.rider_applications
  for update using (public.is_admin()) with check (public.is_admin());

drop policy if exists "rider_app_insert" on public.rider_applications;
create policy "rider_app_insert" on public.rider_applications
  for insert with check (
    public.is_admin()
    or (rider_id = auth.uid() and status = 'pending' and reviewed_by is null and reviewed_at is null)
  );

-- 2 ------------------------------------------------------------------------
create or replace function public.booking_require_active_customer()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.is_trusted_writer() or session_user = 'postgres' then
    return new;
  end if;
  if exists (select 1 from public.profiles p where p.id = new.customer_id and not p.is_active) then
    raise exception 'Your account is suspended, so you can''t book right now. Please contact iTULOD support.';
  end if;
  return new;
end;
$$;

do $$
declare t text;
begin
  foreach t in array array['transport_bookings', 'food_deliveries', 'parcel_deliveries', 'hauling_bookings'] loop
    execute format('drop trigger if exists trg_booking_require_active_customer on public.%I', t);
    execute format('create trigger trg_booking_require_active_customer before insert on public.%I
                    for each row execute function public.booking_require_active_customer()', t);
  end loop;
end $$;
