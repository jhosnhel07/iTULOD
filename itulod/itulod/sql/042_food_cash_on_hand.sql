-- 042_food_cash_on_hand.sql
-- ---------------------------------------------------------------------------
-- A rider buys a food order with their own cash on hand (profiles.float_amount)
-- and is paid back later. Until now an order costing more than that was only
-- flagged in the apps; the rider could still accept it. Like Grab / Foodpanda,
-- accepting is now refused when the order's food cost (item_subtotal) is more
-- than the rider's cash on hand. The order stays visible with a note, so the
-- rider can raise the amount on Home and then take it. Admins / Edge Functions
-- (trusted writers) are not limited.
-- ---------------------------------------------------------------------------

create or replace function public.food_require_cash_on_hand()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  cash numeric;
begin
  if public.is_trusted_writer() or session_user = 'postgres' then
    return new;
  end if;
  -- only the moment a rider takes the order
  if old.rider_id is null and new.rider_id is not null and coalesce(new.item_subtotal, 0) > 0 then
    select coalesce(float_amount, 0) into cash from public.profiles where id = new.rider_id;
    if coalesce(new.item_subtotal, 0) > coalesce(cash, 0) then
      raise exception 'This order costs ₱% — more than your ₱% cash on hand. Raise your cash on hand on Home to accept it.',
        to_char(new.item_subtotal, 'FM999,990.00'), to_char(coalesce(cash, 0), 'FM999,990.00');
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_food_require_cash_on_hand on public.food_deliveries;
create trigger trg_food_require_cash_on_hand before update on public.food_deliveries
  for each row execute function public.food_require_cash_on_hand();
