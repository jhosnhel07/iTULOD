-- =============================================================================
-- iTULOD migration 015: in-app chat between customer and rider
-- -----------------------------------------------------------------------------
-- A simple text thread tied to one booking. Only the booking's customer and
-- assigned rider (or an admin) can read it; only they can post to it, and
-- only while the booking is 'accepted' or 'ongoing' — once neither exists to
-- talk to, or the trip is over, the thread goes read-only. Messages are
-- append-only: no update/delete policy, so nothing can be edited after the
-- fact.
-- =============================================================================

create table if not exists public.booking_messages (
  id uuid primary key default uuid_generate_v4(),
  booking_type text not null check (booking_type in ('transport', 'food', 'parcel')),
  booking_id uuid not null,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 1000),
  created_at timestamptz not null default now()
);

create index if not exists idx_booking_messages_booking
  on public.booking_messages (booking_type, booking_id, created_at);

alter table public.booking_messages enable row level security;

drop policy if exists "booking_messages_participant_read" on public.booking_messages;
create policy "booking_messages_participant_read" on public.booking_messages
  for select using (
    public.is_admin()
    or (booking_type = 'transport' and exists (
      select 1 from public.transport_bookings b
      where b.id = booking_id and (b.customer_id = auth.uid() or b.rider_id = auth.uid())))
    or (booking_type = 'food' and exists (
      select 1 from public.food_deliveries b
      where b.id = booking_id and (b.customer_id = auth.uid() or b.rider_id = auth.uid())))
    or (booking_type = 'parcel' and exists (
      select 1 from public.parcel_deliveries b
      where b.id = booking_id and (b.customer_id = auth.uid() or b.rider_id = auth.uid())))
  );

drop policy if exists "booking_messages_participant_insert" on public.booking_messages;
create policy "booking_messages_participant_insert" on public.booking_messages
  for insert with check (
    sender_id = auth.uid()
    and (
      (booking_type = 'transport' and exists (
        select 1 from public.transport_bookings b
        where b.id = booking_id and (b.customer_id = auth.uid() or b.rider_id = auth.uid())
          and b.status in ('accepted', 'ongoing')))
      or (booking_type = 'food' and exists (
        select 1 from public.food_deliveries b
        where b.id = booking_id and (b.customer_id = auth.uid() or b.rider_id = auth.uid())
          and b.status in ('accepted', 'ongoing')))
      or (booking_type = 'parcel' and exists (
        select 1 from public.parcel_deliveries b
        where b.id = booking_id and (b.customer_id = auth.uid() or b.rider_id = auth.uid())
          and b.status in ('accepted', 'ongoing')))
    )
  );

-- Notifies whichever side didn't send the message. Runs as security definer
-- so it can write to notifications (normally admin/service-role only) on the
-- sender's behalf.
create or replace function public.notify_new_booking_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  cust uuid;
  rid uuid;
  recipient uuid;
  sender_name text;
begin
  if new.booking_type = 'transport' then
    select customer_id, rider_id into cust, rid from public.transport_bookings where id = new.booking_id;
  elsif new.booking_type = 'food' then
    select customer_id, rider_id into cust, rid from public.food_deliveries where id = new.booking_id;
  else
    select customer_id, rider_id into cust, rid from public.parcel_deliveries where id = new.booking_id;
  end if;

  recipient := case when new.sender_id = cust then rid else cust end;
  if recipient is null then
    return new;
  end if;

  select full_name into sender_name from public.profiles where id = new.sender_id;

  insert into public.notifications (user_id, title, message)
  values (recipient, 'New message from ' || coalesce(sender_name, 'the other party'), left(new.body, 120));

  return new;
end;
$$;

drop trigger if exists trg_notify_new_booking_message on public.booking_messages;
create trigger trg_notify_new_booking_message after insert on public.booking_messages
  for each row execute function public.notify_new_booking_message();
