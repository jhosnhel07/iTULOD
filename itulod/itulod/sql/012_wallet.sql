-- =============================================================================
-- iTULOD migration 012: in-app wallet
-- -----------------------------------------------------------------------------
-- Customers top up a balance with GCash (via wallet-topup + the existing
-- paymongo-webhook / sync-payment-status pair) and can then pay for a ride
-- instantly from that balance instead of redirecting to GCash every time.
-- =============================================================================

-- 'wallet' becomes a valid payment_method alongside cash/gcash/card. Added as
-- its own statement (not inside a DO block) and not referenced anywhere else
-- in this file, since a new enum value can't be used in the same transaction
-- it was added in.
alter type payment_method add value if not exists 'wallet';

do $$ begin
  create type wallet_txn_type as enum ('topup', 'payment', 'refund', 'referral_bonus', 'admin_adjustment');
exception
  when duplicate_object then null;
end $$;

-- 1. Wallets: one row per customer.
create table if not exists public.wallets (
  customer_id uuid primary key references public.profiles(id) on delete cascade,
  balance numeric(10,2) not null default 0 check (balance >= 0),
  updated_at timestamptz not null default now()
);

alter table public.wallets enable row level security;
drop policy if exists "wallets_own_read" on public.wallets;
create policy "wallets_own_read" on public.wallets
  for select using (customer_id = auth.uid() or public.is_admin());
-- No client insert/update policy — balance only ever changes via
-- adjust_wallet_balance(), called by Edge Functions with the service-role key.

do $$
declare t text;
begin
  for t in select unnest(array['wallets']) loop
    execute format('drop trigger if exists trg_set_updated_at on public.%I;', t);
    execute format('create trigger trg_set_updated_at before update on public.%I
                    for each row execute function public.set_updated_at();', t);
  end loop;
end $$;

-- 2. Wallet transactions: append-only ledger, shown to the customer as a statement.
create table if not exists public.wallet_transactions (
  id uuid primary key default uuid_generate_v4(),
  customer_id uuid not null references public.profiles(id) on delete cascade,
  type wallet_txn_type not null,
  amount numeric(10,2) not null, -- positive = credit, negative = debit
  booking_type text check (booking_type in ('transport', 'food', 'parcel')),
  booking_id uuid,
  note text,
  created_at timestamptz not null default now()
);

alter table public.wallet_transactions enable row level security;
drop policy if exists "wallet_transactions_own_read" on public.wallet_transactions;
create policy "wallet_transactions_own_read" on public.wallet_transactions
  for select using (customer_id = auth.uid() or public.is_admin());
-- No client insert policy — rows are only ever written by Edge Functions.

-- 3. Wallet top-ups: mirrors how bookings track a GCash source, but for
-- pre-loading balance rather than paying a specific booking.
create table if not exists public.wallet_topups (
  id uuid primary key default uuid_generate_v4(),
  customer_id uuid not null references public.profiles(id) on delete cascade,
  amount numeric(10,2) not null check (amount > 0),
  status payment_status not null default 'pending',
  paymongo_reference text unique,
  created_at timestamptz not null default now()
);

alter table public.wallet_topups enable row level security;
drop policy if exists "wallet_topups_own_read" on public.wallet_topups;
create policy "wallet_topups_own_read" on public.wallet_topups
  for select using (customer_id = auth.uid() or public.is_admin());
-- No client insert/update policy — created by the wallet-topup Edge Function,
-- resolved by paymongo-webhook / sync-payment-status.

-- 4. Atomic balance adjustment. Runs as the function owner (security definer)
-- so a plain "authenticated" role can never call it directly to move money —
-- only service_role (i.e. Edge Functions using the admin client) may execute
-- it. The row-level check keeps a debit from ever taking a balance negative,
-- even under concurrent requests, since the whole read-modify-write happens
-- in one atomic UPDATE.
create or replace function public.adjust_wallet_balance(p_customer_id uuid, p_delta numeric)
returns numeric
language plpgsql
security definer
set search_path = public
as $$
declare
  new_balance numeric;
begin
  insert into public.wallets (customer_id, balance)
  values (p_customer_id, greatest(p_delta, 0))
  on conflict (customer_id) do update
    set balance = public.wallets.balance + p_delta,
        updated_at = now()
  returning balance into new_balance;

  if new_balance < 0 then
    raise exception 'Insufficient wallet balance';
  end if;

  return new_balance;
end;
$$;

revoke all on function public.adjust_wallet_balance(uuid, numeric) from public;
grant execute on function public.adjust_wallet_balance(uuid, numeric) to service_role;
