-- =============================================================================
-- iTULOD migration 013: referral program
-- -----------------------------------------------------------------------------
-- Every customer gets a shareable referral code. A new customer who redeems
-- one gets an instant ₱50 wallet credit; the referrer gets ₱50 back once
-- their friend completes their first booking (paid on first completion, not
-- at signup, so the bonus can't be farmed with throwaway accounts that never
-- actually book anything).
-- =============================================================================

alter table public.profiles add column if not exists referral_code text unique;
alter table public.profiles add column if not exists referred_by uuid references public.profiles(id);

-- Auto-assigns a short, unique code to every new profile so the client never
-- has to invent one or check uniqueness itself.
create or replace function public.generate_referral_code()
returns text
language sql
volatile
as $$
  select upper(substr(md5(gen_random_uuid()::text), 1, 6));
$$;

create or replace function public.set_referral_code()
returns trigger
language plpgsql
as $$
begin
  if new.referral_code is null then
    loop
      new.referral_code := public.generate_referral_code();
      exit when not exists (select 1 from public.profiles where referral_code = new.referral_code);
    end loop;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_set_referral_code on public.profiles;
create trigger trg_set_referral_code before insert on public.profiles
  for each row execute function public.set_referral_code();

-- Backfill codes for accounts created before this migration, collision-safe.
do $$
declare r record;
declare code text;
begin
  for r in select id from public.profiles where referral_code is null loop
    loop
      code := public.generate_referral_code();
      exit when not exists (select 1 from public.profiles where referral_code = code);
    end loop;
    update public.profiles set referral_code = code where id = r.id;
  end loop;
end $$;

-- One row per successful redemption. referred_id is unique — a customer can
-- only ever redeem one referral code, once.
create table if not exists public.referral_events (
  id uuid primary key default uuid_generate_v4(),
  referrer_id uuid not null references public.profiles(id) on delete cascade,
  referred_id uuid not null references public.profiles(id) on delete cascade,
  referrer_bonus numeric(10,2) not null default 50,
  referred_bonus numeric(10,2) not null default 50,
  referrer_paid boolean not null default false,
  created_at timestamptz not null default now(),
  unique (referred_id)
);

alter table public.referral_events enable row level security;
drop policy if exists "referral_events_own_read" on public.referral_events;
create policy "referral_events_own_read" on public.referral_events
  for select using (referrer_id = auth.uid() or referred_id = auth.uid() or public.is_admin());
-- No client insert/update policy — written only by the apply-referral-code
-- Edge Function (service role) and the trigger below.

-- Pays the referrer once their friend's first booking (of any kind) reaches
-- 'completed'. A separate AFTER UPDATE trigger, not folded into the existing
-- booking_before_update trigger, so this stays independent of that
-- fare/tip/cancellation logic and can't interfere with it.
create or replace function public.pay_referral_bonus_on_first_completion()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  ev record;
  already_completed boolean;
begin
  if new.status <> 'completed' or old.status = 'completed' then
    return new;
  end if;

  select * into ev from public.referral_events
    where referred_id = new.customer_id and referrer_paid = false;
  if not found then
    return new;
  end if;

  select exists (
    select 1 from public.transport_bookings where customer_id = new.customer_id and status = 'completed' and id <> new.id
    union all
    select 1 from public.food_deliveries where customer_id = new.customer_id and status = 'completed' and id <> new.id
    union all
    select 1 from public.parcel_deliveries where customer_id = new.customer_id and status = 'completed' and id <> new.id
  ) into already_completed;

  if already_completed then
    return new;
  end if;

  perform public.adjust_wallet_balance(ev.referrer_id, ev.referrer_bonus);
  insert into public.wallet_transactions (customer_id, type, amount, note)
    values (ev.referrer_id, 'referral_bonus', ev.referrer_bonus, 'Referral bonus — your friend completed their first booking');
  update public.referral_events set referrer_paid = true where id = ev.id;

  return new;
end;
$$;

do $$
declare t text;
begin
  for t in select unnest(array['transport_bookings', 'food_deliveries', 'parcel_deliveries']) loop
    execute format('drop trigger if exists trg_pay_referral_bonus on public.%I;', t);
    execute format('create trigger trg_pay_referral_bonus after update on public.%I
                    for each row execute function public.pay_referral_bonus_on_first_completion();', t);
  end loop;
end $$;
