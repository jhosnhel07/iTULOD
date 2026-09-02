-- =============================================================================
-- iTULOD — migration 004: fix rider payout inserts + backfill missing payments
-- Run this in the Supabase SQL editor AFTER sql/schema.sql (and 002/003).
-- =============================================================================

-- The payments_insert policy only ever allowed customer_id = auth.uid(), but
-- it's the RIDER who inserts this row when they mark a booking complete
-- (rider.js updateStatus()). auth.uid() at insert time is the rider's id,
-- not the customer's, so every single rider payout insert was silently
-- rejected by RLS. That's why completed bookings never showed up in
-- Admin > Payments and rider earnings stayed at zero regardless of how many
-- bookings a rider completed.

drop policy if exists "payments_insert" on public.payments;
create policy "payments_insert" on public.payments
  for insert with check (
    customer_id = auth.uid() or rider_id = auth.uid() or public.is_admin()
  );

-- ---------------------------------------------------------------------------
-- Backfill: every booking that already completed under the broken policy
-- never got its payout row. Create it now (85% rider / 15% platform split,
-- same math the app uses at completion time) so past completions are
-- recorded and paid out retroactively instead of being lost.
-- ---------------------------------------------------------------------------

insert into public.payments (customer_id, rider_id, booking_type, booking_id, amount, platform_commission, rider_payout, method, status)
select
  b.customer_id, b.rider_id, 'transport', b.id,
  coalesce(b.final_fare, b.estimated_fare),
  round(coalesce(b.final_fare, b.estimated_fare) * 0.15, 2),
  round(coalesce(b.final_fare, b.estimated_fare) * 0.85, 2),
  coalesce(b.payment_method, 'cash'), 'paid'
from public.transport_bookings b
where b.status = 'completed' and b.rider_id is not null
  and coalesce(b.final_fare, b.estimated_fare) is not null
  and not exists (select 1 from public.payments p where p.booking_type = 'transport' and p.booking_id = b.id);

insert into public.payments (customer_id, rider_id, booking_type, booking_id, amount, platform_commission, rider_payout, method, status)
select
  b.customer_id, b.rider_id, 'food', b.id,
  coalesce(b.final_fare, b.estimated_fare),
  round(coalesce(b.final_fare, b.estimated_fare) * 0.15, 2),
  round(coalesce(b.final_fare, b.estimated_fare) * 0.85, 2),
  coalesce(b.payment_method, 'cash'), 'paid'
from public.food_deliveries b
where b.status = 'completed' and b.rider_id is not null
  and coalesce(b.final_fare, b.estimated_fare) is not null
  and not exists (select 1 from public.payments p where p.booking_type = 'food' and p.booking_id = b.id);

insert into public.payments (customer_id, rider_id, booking_type, booking_id, amount, platform_commission, rider_payout, method, status)
select
  b.customer_id, b.rider_id, 'parcel', b.id,
  coalesce(b.final_fare, b.estimated_fare),
  round(coalesce(b.final_fare, b.estimated_fare) * 0.15, 2),
  round(coalesce(b.final_fare, b.estimated_fare) * 0.85, 2),
  coalesce(b.payment_method, 'cash'), 'paid'
from public.parcel_deliveries b
where b.status = 'completed' and b.rider_id is not null
  and coalesce(b.final_fare, b.estimated_fare) is not null
  and not exists (select 1 from public.payments p where p.booking_type = 'parcel' and p.booking_id = b.id);

-- Cash bookings are only ever marked paid at completion by the app — bring
-- these backfilled ones in line so history/earnings views stay consistent.
update public.transport_bookings set payment_status = 'paid'
where status = 'completed' and (payment_method is null or payment_method = 'cash') and payment_status is distinct from 'paid';
update public.food_deliveries set payment_status = 'paid'
where status = 'completed' and (payment_method is null or payment_method = 'cash') and payment_status is distinct from 'paid';
update public.parcel_deliveries set payment_status = 'paid'
where status = 'completed' and (payment_method is null or payment_method = 'cash') and payment_status is distinct from 'paid';
