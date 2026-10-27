-- 051_rider_pay_dues.sql
-- ---------------------------------------------------------------------------
-- Riders settle their balance with iTULOD themselves.
--
-- The balance (sql/024 rider_balance) already nets both ways: GCash/wallet
-- fares iTULOD holds for the rider, minus commission the rider owes on cash
-- trips, less recorded settlements. So "You owe iTULOD ₱X" is already only the
-- difference. Until now only the admin could record a settlement. Now:
--
-- rider_payments          "Pay with GCash": the rider-pay-dues Edge Function
--   creates a row (amount = what they owe, worked out on the server) and a
--   PayMongo source. When GCash confirms (paymongo-webhook / sync-payment-
--   status), settle_rider_payment() records the collection in
--   rider_settlements — the balance drops to ₱0.00 and a rider blocked by the
--   debt limit (sql/043) can accept jobs again right away. Exactly once.
-- rider_payment_claims    "I paid the admin" (cash, or GCash sent outside the
--   app): rider_claim_payment() saves it as pending (one at a time, never more
--   than they owe). The admin confirms (records the collection) or rejects it
--   with a reason — admin_review_rider_claim(). The rider is told either way.
--
-- Riders never write rider_settlements themselves. Realtime on the three
-- tables keeps the rider's Earnings and the admin's lists live.
-- ---------------------------------------------------------------------------

create table if not exists public.rider_payments (
  id                 uuid primary key default uuid_generate_v4(),
  rider_id           uuid not null references public.profiles(id) on delete cascade,
  amount             numeric(10,2) not null check (amount > 0),
  status             text not null default 'pending' check (status in ('pending', 'paid', 'failed')),
  paymongo_reference text unique,
  settlement_id      uuid references public.rider_settlements(id) on delete set null,
  created_at         timestamptz not null default now(),
  paid_at            timestamptz
);
create index if not exists idx_rider_payments_rider on public.rider_payments (rider_id, created_at desc);
alter table public.rider_payments enable row level security;
drop policy if exists "rider_payments_select" on public.rider_payments;
create policy "rider_payments_select" on public.rider_payments
  for select using (rider_id = auth.uid() or public.is_admin());

create table if not exists public.rider_payment_claims (
  id            uuid primary key default uuid_generate_v4(),
  rider_id      uuid not null references public.profiles(id) on delete cascade,
  amount        numeric(10,2) not null check (amount > 0),
  method        text not null default 'cash' check (method in ('cash', 'gcash')),
  reference     text,
  status        text not null default 'pending' check (status in ('pending', 'confirmed', 'rejected')),
  reject_reason text,
  settlement_id uuid references public.rider_settlements(id) on delete set null,
  reviewed_by   uuid references public.profiles(id),
  reviewed_at   timestamptz,
  created_at    timestamptz not null default now()
);
create unique index if not exists rider_payment_claims_one_pending
  on public.rider_payment_claims (rider_id) where status = 'pending';
alter table public.rider_payment_claims enable row level security;
drop policy if exists "rider_payment_claims_select" on public.rider_payment_claims;
create policy "rider_payment_claims_select" on public.rider_payment_claims
  for select using (rider_id = auth.uid() or public.is_admin());

-- ---- "I paid the admin" ------------------------------------------------------
create or replace function public.rider_claim_payment(p_amount numeric, p_method text default 'cash', p_reference text default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  uid   uuid := auth.uid();
  owed  numeric;
  amt   numeric := round(coalesce(p_amount, 0), 2);
  new_id uuid;
begin
  if uid is null or not exists (select 1 from profiles where id = uid and role = 'rider') then
    raise exception 'Only riders can do this.' using errcode = 'P0001';
  end if;
  select s.owed into owed from public.rider_debt_status(uid) s;
  if coalesce(owed, 0) <= 0 then
    raise exception 'You don''t owe iTULOD anything right now.' using errcode = 'P0001';
  end if;
  if amt <= 0 then
    raise exception 'Enter the amount you paid.' using errcode = 'P0001';
  end if;
  if amt > owed then
    raise exception 'That''s more than you owe (₱%).', to_char(owed, 'FM999,990.00') using errcode = 'P0001';
  end if;
  if exists (select 1 from rider_payment_claims where rider_id = uid and status = 'pending') then
    raise exception 'You already have a payment waiting for the admin to confirm.' using errcode = 'P0001';
  end if;
  insert into rider_payment_claims (rider_id, amount, method, reference)
  values (uid, amt, case when p_method = 'gcash' then 'gcash' else 'cash' end, nullif(trim(coalesce(p_reference, '')), ''))
  returning id into new_id;
  return new_id;
end;
$$;
revoke all on function public.rider_claim_payment(numeric, text, text) from public, anon;
grant execute on function public.rider_claim_payment(numeric, text, text) to authenticated;

-- ---- the admin confirms or rejects a claim ----------------------------------
create or replace function public.admin_review_rider_claim(p_claim uuid, p_confirm boolean, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  c   rider_payment_claims%rowtype;
  sid uuid;
begin
  if not public.is_admin() then raise exception 'admins only'; end if;
  select * into c from rider_payment_claims where id = p_claim for update;
  if not found then raise exception 'That payment was not found.' using errcode = 'P0001'; end if;
  if c.status <> 'pending' then raise exception 'That payment was already %.', c.status using errcode = 'P0001'; end if;

  if p_confirm then
    -- records the collection and tells the rider (sql/024)
    sid := public.admin_record_settlement(c.rider_id, 'collection', c.amount, c.method, c.reference, 'Rider''s payment, confirmed');
    update rider_payment_claims
       set status = 'confirmed', settlement_id = sid, reviewed_by = auth.uid(), reviewed_at = now()
     where id = c.id;
  else
    if coalesce(trim(p_reason), '') = '' then
      raise exception 'Say why it wasn''t confirmed.' using errcode = 'P0001';
    end if;
    update rider_payment_claims
       set status = 'rejected', reject_reason = trim(p_reason), reviewed_by = auth.uid(), reviewed_at = now()
     where id = c.id;
    insert into notifications (user_id, title, message) values (c.rider_id,
      'Payment not confirmed',
      'The admin couldn''t confirm your ₱' || to_char(c.amount, 'FM999,990.00') || ' payment: ' || trim(p_reason)
      || '. Your balance is unchanged — check Earnings.');
  end if;
end;
$$;
revoke all on function public.admin_review_rider_claim(uuid, boolean, text) from public, anon;
grant execute on function public.admin_review_rider_claim(uuid, boolean, text) to authenticated;

-- ---- GCash went through: record it (Edge Functions only) ---------------------
create or replace function public.settle_rider_payment(p_reference text)
returns public.rider_payments
language plpgsql
security definer
set search_path = public
as $$
declare
  p    rider_payments%rowtype;
  sid  uuid;
  left_owed numeric;
begin
  if not public.is_trusted_writer() then raise exception 'not allowed'; end if;
  select * into p from rider_payments where paymongo_reference = p_reference for update;
  if not found or p.status = 'paid' then return p; end if; -- exactly once

  insert into rider_settlements (rider_id, direction, amount, method, reference, note)
  values (p.rider_id, 'collection', p.amount, 'gcash', p_reference, 'Paid by GCash in the app')
  returning id into sid;
  update rider_payments set status = 'paid', paid_at = now(), settlement_id = sid where id = p.id
  returning * into p;

  select s.owed into left_owed from public.rider_debt_status(p.rider_id) s;
  insert into notifications (user_id, title, message) values (p.rider_id,
    'Payment received',
    'Your ₱' || to_char(p.amount, 'FM999,990.00') || ' GCash payment to iTULOD went through. '
    || case when coalesce(left_owed, 0) > 0
            then 'You still owe ₱' || to_char(left_owed, 'FM999,990.00') || ' from trips since.'
            else 'You''re all settled.' end);
  return p;
end;
$$;
revoke all on function public.settle_rider_payment(text) from public, anon, authenticated;
grant execute on function public.settle_rider_payment(text) to service_role;

-- ---- live updates -------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['rider_settlements', 'rider_payment_claims', 'rider_payments'] loop
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
