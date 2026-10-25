-- 043_rider_debt_limit.sql
-- ---------------------------------------------------------------------------
-- On cash trips the rider keeps the whole fare and owes iTULOD the commission
-- (sql/024 rider_balance). Nothing made them pay it, so a rider doing only cash
-- trips could let the debt grow forever. Like Grab / Foodpanda, a rider who
-- owes more than platform_config.rider_debt_limit (default ₱500, set in
-- Admin → Settings; 0 turns the limit off) can't accept new jobs until the
-- admin records their payment (Admin → Payments → Record payment).
--   * rider_debt_status(): what the signed-in rider owes, the limit, and
--     whether they're blocked — the apps use it for the banner + Accept button.
--   * trg_booking_require_rider_settled on all four booking tables refuses the
--     accept itself, so older app versions are covered too.
-- ---------------------------------------------------------------------------

alter table public.platform_config add column if not exists rider_debt_limit numeric(10,2) not null default 500;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'platform_config_rider_debt_limit') then
    alter table public.platform_config add constraint platform_config_rider_debt_limit check (rider_debt_limit between 0 and 100000);
  end if;
end $$;

-- What a rider owes iTULOD (same sums as rider_balance(): cash-trip commission
-- minus GCash/wallet fares iTULOD owes them, after recorded settlements).
create or replace function public.rider_debt_status(p_rider uuid default null)
returns table (owed numeric, debt_limit numeric, blocked boolean)
language plpgsql
stable security definer
set search_path = public
as $$
declare
  rid uuid := coalesce(p_rider, auth.uid());
  net numeric;
  lim numeric;
begin
  if rid is null or (rid <> auth.uid() and not public.is_trusted_writer() and session_user <> 'postgres') then
    raise exception 'not allowed';
  end if;
  select
      coalesce((select sum(rider_payout) from payments where rider_id = rid and method <> 'cash' and status = 'paid'), 0)
    - coalesce((select sum(platform_commission) from payments where rider_id = rid and method = 'cash'), 0)
    - coalesce((select sum(amount) from rider_settlements where rider_id = rid and direction = 'payout'), 0)
    + coalesce((select sum(amount) from rider_settlements where rider_id = rid and direction = 'collection'), 0)
    into net;
  select coalesce(rider_debt_limit, 0) into lim from platform_config limit 1;
  return query select greatest(-net, 0)::numeric, coalesce(lim, 0)::numeric, (coalesce(lim, 0) > 0 and greatest(-net, 0) > lim);
end;
$$;
grant execute on function public.rider_debt_status(uuid) to authenticated;

create or replace function public.booking_require_rider_settled()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  s record;
begin
  if public.is_trusted_writer() or session_user = 'postgres' then
    return new;
  end if;
  -- only the moment a rider takes a job
  if old.rider_id is null and new.rider_id is not null then
    select * into s from public.rider_debt_status(new.rider_id);
    if s.blocked then
      raise exception 'You owe iTULOD ₱% in commission — more than the ₱% limit. Settle it with the admin to keep accepting jobs.',
        to_char(s.owed, 'FM999,990.00'), to_char(s.debt_limit, 'FM999,990.00');
    end if;
  end if;
  return new;
end;
$$;

do $$
declare t text;
begin
  foreach t in array array['transport_bookings', 'food_deliveries', 'parcel_deliveries', 'hauling_bookings'] loop
    execute format('drop trigger if exists trg_booking_require_rider_settled on public.%I', t);
    execute format('create trigger trg_booking_require_rider_settled before update on public.%I
                    for each row execute function public.booking_require_rider_settled()', t);
  end loop;
end $$;
