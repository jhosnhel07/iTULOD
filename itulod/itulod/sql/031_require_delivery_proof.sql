-- 031_require_delivery_proof.sql
-- ---------------------------------------------------------------------------
-- A food / parcel / hauling drop-off can only be marked completed once the
-- rider has saved a proof-of-delivery photo (delivery_proof_url).
--
-- The rider app and web take the photo as its own step ("Take proof of
-- delivery"), and "Mark complete" stays locked until it's saved. This
-- trigger enforces the same rule for every client. Admins, the service role
-- and system sweeps (is_trusted_writer) are exempt.
-- ---------------------------------------------------------------------------

create or replace function public.require_delivery_proof()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'completed'
     and old.status is distinct from 'completed'
     and coalesce(new.delivery_proof_url, '') = ''
     and not public.is_trusted_writer()
     and session_user not in ('postgres', 'supabase_admin') then
    raise exception 'Take a proof-of-delivery photo before marking this complete.'
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_require_delivery_proof on public.food_deliveries;
create trigger trg_require_delivery_proof
  before update on public.food_deliveries
  for each row execute function public.require_delivery_proof();

drop trigger if exists trg_require_delivery_proof on public.parcel_deliveries;
create trigger trg_require_delivery_proof
  before update on public.parcel_deliveries
  for each row execute function public.require_delivery_proof();

drop trigger if exists trg_require_delivery_proof on public.hauling_bookings;
create trigger trg_require_delivery_proof
  before update on public.hauling_bookings
  for each row execute function public.require_delivery_proof();
