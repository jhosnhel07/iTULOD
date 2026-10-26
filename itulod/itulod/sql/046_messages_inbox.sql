-- =============================================================================
-- iTULOD migration 046: Messages inbox
-- -----------------------------------------------------------------------------
-- The booking chat (015/022) becomes a Messages section in the sidebar /
-- bottom bar: one conversation per booking that has a rider.
--
-- 1. is_booking_party() / can_chat_booking() — shared checks (customer or
--    rider of the booking; chat only while accepted/ongoing).
-- 2. booking_message_reads — when each person last read each conversation:
--    unread counts, and "Seen" for the other side (they can read your row).
-- 3. Photo messages: booking_messages.image_path + private bucket
--    chat-photos (<type>/<booking id>/<file>), opened through signed links.
-- 4. my_conversations() — the inbox in one call, newest first, with the
--    other person, route, last message, unread count and their "seen" time.
--    The phone number only comes back while the trip is active.
-- 5. mark_conversation_read().
-- 6. notifications.link — a chat notification opens that conversation
--    (send-push adds it to the web push URL and the phone push data).
--
-- Run AFTER 045. Safe to re-run.
-- =============================================================================

-- 1. Shared checks ------------------------------------------------------------
-- p_id is text so a bad storage path can't raise a cast error inside a policy.
create or replace function public.booking_party_ids(p_type text, p_id text,
  out customer_id uuid, out rider_id uuid, out status text)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if p_type = 'transport' then
    select b.customer_id, b.rider_id, b.status into customer_id, rider_id, status from transport_bookings b where b.id::text = p_id;
  elsif p_type = 'food' then
    select b.customer_id, b.rider_id, b.status into customer_id, rider_id, status from food_deliveries b where b.id::text = p_id;
  elsif p_type = 'parcel' then
    select b.customer_id, b.rider_id, b.status into customer_id, rider_id, status from parcel_deliveries b where b.id::text = p_id;
  elsif p_type = 'hauling' then
    select b.customer_id, b.rider_id, b.status into customer_id, rider_id, status from hauling_bookings b where b.id::text = p_id;
  end if;
end;
$$;
revoke all on function public.booking_party_ids(text, text) from public, anon, authenticated;

create or replace function public.is_booking_party(p_type text, p_id text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() is not null
     and auth.uid() in (select x.customer_id from public.booking_party_ids(p_type, p_id) x
                        union all select x.rider_id from public.booking_party_ids(p_type, p_id) x);
$$;
revoke all on function public.is_booking_party(text, text) from public;
grant execute on function public.is_booking_party(text, text) to authenticated;

create or replace function public.can_chat_booking(p_type text, p_id text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_booking_party(p_type, p_id)
     and exists (select 1 from public.booking_party_ids(p_type, p_id) x
                 where x.rider_id is not null and x.status in ('accepted', 'ongoing'));
$$;
revoke all on function public.can_chat_booking(text, text) from public;
grant execute on function public.can_chat_booking(text, text) to authenticated;

-- 2. Read receipts ------------------------------------------------------------
create table if not exists public.booking_message_reads (
  user_id uuid not null references public.profiles(id) on delete cascade,
  booking_type text not null check (booking_type in ('transport', 'food', 'parcel', 'hauling')),
  booking_id uuid not null,
  last_read_at timestamptz not null default now(),
  primary key (user_id, booking_type, booking_id)
);
alter table public.booking_message_reads enable row level security;

drop policy if exists booking_message_reads_read on public.booking_message_reads;
create policy booking_message_reads_read on public.booking_message_reads
  for select using (
    user_id = auth.uid() or public.is_admin() or public.is_booking_party(booking_type, booking_id::text));
drop policy if exists booking_message_reads_write on public.booking_message_reads;
create policy booking_message_reads_write on public.booking_message_reads
  for insert with check (user_id = auth.uid() and public.is_booking_party(booking_type, booking_id::text));
drop policy if exists booking_message_reads_update on public.booking_message_reads;
create policy booking_message_reads_update on public.booking_message_reads
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

-- 3. Photo messages -------------------------------------------------------------
alter table public.booking_messages add column if not exists image_path text;
alter table public.booking_messages alter column body set default '';
alter table public.booking_messages drop constraint if exists booking_messages_body_check;
alter table public.booking_messages add constraint booking_messages_body_check
  check (char_length(body) <= 1000 and (char_length(body) >= 1 or image_path is not null));
alter table public.booking_messages drop constraint if exists booking_messages_image_path_check;
alter table public.booking_messages add constraint booking_messages_image_path_check
  check (image_path is null or image_path like booking_type || '/' || booking_id::text || '/%');

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('chat-photos', 'chat-photos', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists chat_photos_send on storage.objects;
create policy chat_photos_send on storage.objects
  for insert to authenticated
  with check (bucket_id = 'chat-photos'
    and public.can_chat_booking((storage.foldername(name))[1], (storage.foldername(name))[2]));
drop policy if exists chat_photos_read on storage.objects;
create policy chat_photos_read on storage.objects
  for select to authenticated
  using (bucket_id = 'chat-photos'
    and (public.is_admin() or public.is_booking_party((storage.foldername(name))[1], (storage.foldername(name))[2])));

-- 4. The inbox ------------------------------------------------------------------
drop function if exists public.my_conversations();
create or replace function public.my_conversations()
returns table (
  booking_type text, booking_id uuid, status text, i_am text,
  other_id uuid, other_name text, other_avatar text, other_phone text,
  vehicle text, route text,
  last_body text, last_has_photo boolean, last_mine boolean, last_at timestamptz,
  unread int, other_read_at timestamptz, can_send boolean, sort_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  with b as (
    select 'transport'::text t, id, customer_id, rider_id, status, created_at, accepted_at,
           pickup_address || ' → ' || destination_address route
      from transport_bookings where rider_id is not null and auth.uid() in (customer_id, rider_id)
    union all
    select 'food', id, customer_id, rider_id, status, created_at, accepted_at,
           coalesce(nullif(restaurant_name, ''), nullif(pabili_store_name, ''), pickup_address) || ' → ' || delivery_address
      from food_deliveries where rider_id is not null and auth.uid() in (customer_id, rider_id)
    union all
    select 'parcel', id, customer_id, rider_id, status, created_at, accepted_at,
           sender_address || ' → ' || receiver_address
      from parcel_deliveries where rider_id is not null and auth.uid() in (customer_id, rider_id)
    union all
    select 'hauling', id, customer_id, rider_id, status, created_at, accepted_at,
           pickup_address || ' → ' || dropoff_address
      from hauling_bookings where rider_id is not null and auth.uid() in (customer_id, rider_id)
  )
  select b.t, b.id, b.status,
         case when b.customer_id = auth.uid() then 'customer' else 'rider' end,
         o.other, p.full_name, p.avatar_url,
         case when b.status in ('accepted', 'ongoing') then p.phone end,
         case when b.customer_id = auth.uid() then nullif(concat_ws(' · ', ra.vehicle_type, ra.vehicle_plate), '') end,
         b.route,
         lm.body, lm.image_path is not null, lm.sender_id = auth.uid(), lm.created_at,
         (select count(*)::int from booking_messages x
           where x.booking_type = b.t and x.booking_id = b.id and x.sender_id <> auth.uid()
             and x.created_at > coalesce(mine.last_read_at, '-infinity'::timestamptz)),
         theirs.last_read_at,
         b.status in ('accepted', 'ongoing'),
         coalesce(lm.created_at, b.accepted_at, b.created_at)
    from b
    cross join lateral (select case when b.customer_id = auth.uid() then b.rider_id else b.customer_id end other) o
    join profiles p on p.id = o.other
    left join lateral (select x.body, x.image_path, x.sender_id, x.created_at from booking_messages x
                        where x.booking_type = b.t and x.booking_id = b.id
                        order by x.created_at desc limit 1) lm on true
    left join booking_message_reads mine on mine.user_id = auth.uid() and mine.booking_type = b.t and mine.booking_id = b.id
    left join booking_message_reads theirs on theirs.user_id = o.other and theirs.booking_type = b.t and theirs.booking_id = b.id
    left join lateral (select a.vehicle_type, a.vehicle_plate from rider_applications a
                        where a.rider_id = b.rider_id order by a.created_at desc limit 1) ra on true
   where lm.created_at is not null or b.status in ('accepted', 'ongoing')
   order by coalesce(lm.created_at, b.accepted_at, b.created_at) desc
   limit 100;
$$;
revoke all on function public.my_conversations() from public;
grant execute on function public.my_conversations() to authenticated;

-- 5. Mark a conversation read -----------------------------------------------------
create or replace function public.mark_conversation_read(p_type text, p_id uuid)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  insert into booking_message_reads (user_id, booking_type, booking_id, last_read_at)
  values (auth.uid(), p_type, p_id, now())
  on conflict (user_id, booking_type, booking_id) do update set last_read_at = now();
end;
$$;
revoke all on function public.mark_conversation_read(text, uuid) from public;
grant execute on function public.mark_conversation_read(text, uuid) to authenticated;

-- live "Seen" and unread counts
do $$
begin
  if not exists (select 1 from pg_publication_tables
                  where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'booking_message_reads') then
    alter publication supabase_realtime add table public.booking_message_reads;
  end if;
end $$;

-- 6. A chat notification opens its conversation ------------------------------------
alter table public.notifications add column if not exists link text;

create or replace function public.notify_new_booking_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  parties record;
  recipient uuid;
  sender_name text;
begin
  select * into parties from public.booking_party_ids(new.booking_type, new.booking_id::text);
  recipient := case when new.sender_id = parties.customer_id then parties.rider_id else parties.customer_id end;
  if recipient is null then
    return new;
  end if;

  select full_name into sender_name from public.profiles where id = new.sender_id;

  insert into public.notifications (user_id, title, message, link)
  values (recipient,
          'New message from ' || coalesce(sender_name, 'the other party'),
          case when char_length(new.body) > 0 then left(new.body, 120) else '📷 Photo' end,
          'messages/' || new.booking_type || '/' || new.booking_id);

  return new;
end;
$$;
