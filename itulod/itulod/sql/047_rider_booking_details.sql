-- =============================================================================
-- iTULOD migration 047: the rider's own booking details
-- -----------------------------------------------------------------------------
-- Booking details were built for the customer (their rider, the rider's
-- vehicle and documents). The rider now gets their own view, which needs:
--
-- 1. booking_customer(type, id) — for the rider of that booking (or an
--    admin): the customer's name, photo, member since and completed bookings;
--    the phone only while the trip is accepted / ongoing. Profiles RLS only
--    lets a customer read their rider, not the other way round, and this
--    keeps the customer's email and the rest private.
-- 2. rider_booking_earnings(type, id) — fare, iTULOD commission, your payout
--    and tip (also for an approved rider looking at a waiting request): the real payments row once the trip is done, otherwise the
--    estimate by the same rule (15% of the fare; food only on the delivery
--    fee, sql/035).
-- 3. food_order_items: approved riders can read the items of waiting food
--    requests (pending, no rider yet), so they know what to buy and how much
--    cash to bring before accepting. The customer's details stay hidden
--    until they accept (booking_customer needs the rider assigned).
--
-- Run AFTER 046. Safe to re-run.
-- =============================================================================

-- 1. The customer, for their rider ----------------------------------------------
drop function if exists public.booking_customer(text, uuid);
create or replace function public.booking_customer(p_type text, p_id uuid)
returns table (full_name text, avatar_url text, phone text, member_since timestamptz, completed_bookings int)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  x record;
begin
  select * into x from public.booking_party_ids(p_type, p_id::text);
  if x.customer_id is null or x.rider_id is null or not (x.rider_id = auth.uid() or public.is_admin()) then
    return;
  end if;
  return query
    select p.full_name, p.avatar_url,
           case when x.status in ('accepted', 'ongoing') then p.phone end,
           p.created_at,
           ((select count(*) from transport_bookings b where b.customer_id = x.customer_id and b.status = 'completed')
          + (select count(*) from food_deliveries   b where b.customer_id = x.customer_id and b.status = 'completed')
          + (select count(*) from parcel_deliveries b where b.customer_id = x.customer_id and b.status = 'completed')
          + (select count(*) from hauling_bookings  b where b.customer_id = x.customer_id and b.status = 'completed'))::int
      from profiles p
     where p.id = x.customer_id;
end;
$$;
revoke all on function public.booking_customer(text, uuid) from public;
grant execute on function public.booking_customer(text, uuid) to authenticated;

-- 2. What the rider earns ------------------------------------------------------
drop function if exists public.rider_booking_earnings(text, uuid);
create or replace function public.rider_booking_earnings(p_type text, p_id uuid)
returns table (fare numeric, commission numeric, payout numeric, tip numeric, is_final boolean)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  x record;
  pay record;
  b jsonb;
  tbl text := case p_type when 'transport' then 'transport_bookings' when 'food' then 'food_deliveries'
                          when 'parcel' then 'parcel_deliveries' when 'hauling' then 'hauling_bookings' end;
  f numeric;
  base numeric;
  rate numeric;
begin
  select * into x from public.booking_party_ids(p_type, p_id::text);
  -- the rider of the booking, an admin, or an approved rider looking at a
  -- waiting request (so they see what they'd earn before accepting)
  if tbl is null or not (x.rider_id = auth.uid() or public.is_admin()
       or (x.rider_id is null and x.status = 'pending' and public.is_approved_rider())) then
    return;
  end if;
  execute format('select to_jsonb(t) from public.%I t where t.id = $1', tbl) into b using p_id;

  -- Done (or a fee was charged): the real payout row; tips are already in it.
  select p.amount, p.platform_commission, p.rider_payout into pay
    from payments p where p.booking_type = p_type and p.booking_id = p_id
   order by p.created_at desc limit 1;
  if found then
    return query select pay.amount, pay.platform_commission, pay.rider_payout,
                        nullif((b ->> 'tip_amount')::numeric, 0), true;
    return;
  end if;

  -- Not done yet: the estimate, by the completion trigger's rule.
  select commission_rate into rate from platform_config limit 1;
  f := coalesce((b ->> 'final_fare')::numeric, (b ->> 'estimated_fare')::numeric, 0);
  if p_type = 'food' then
    base := least(f, coalesce((b ->> 'delivery_fee')::numeric,
                              greatest(f - coalesce((b ->> 'item_subtotal')::numeric, 0), 0)));
  else
    base := f;
  end if;
  return query select f, round(base * coalesce(rate, 0.15), 2), f - round(base * coalesce(rate, 0.15), 2),
                      nullif((b ->> 'tip_amount')::numeric, 0), false;
end;
$$;
revoke all on function public.rider_booking_earnings(text, uuid) from public;
grant execute on function public.rider_booking_earnings(text, uuid) to authenticated;

-- 3. Order items of waiting food requests ------------------------------------------
drop policy if exists food_order_items_open_request_read on public.food_order_items;
create policy food_order_items_open_request_read on public.food_order_items
  for select using (
    public.is_approved_rider()
    and exists (select 1 from public.food_deliveries f
                 where f.id = food_order_items.food_delivery_id
                   and f.status = 'pending' and f.rider_id is null)
  );
