-- 037_device_push.sql
-- ---------------------------------------------------------------------------
-- Phone push notifications (Firebase Cloud Messaging) for app_itulod.
--
-- 1. device_tokens: each phone's FCM registration token, saved by the app
--    after login and removed on logout. send-push (which already delivers
--    every new `notifications` row as a web push) now also sends to these
--    tokens, so notifications reach the phone even when the app is closed.
-- 2. New ride / food / parcel job → a "New … request" notification for every
--    ONLINE approved rider whose vehicle matches (rider_can_take, sql/033).
--    That row is pushed like any other, so riders hear about jobs with the
--    app closed (and on the web). Hauling already does this (sql/023).
--    Bookings scheduled more than 30 minutes ahead are skipped — they only
--    appear in Requests 30 minutes before pickup.
-- ---------------------------------------------------------------------------

-- 1 ------------------------------------------------------------------------
create table if not exists public.device_tokens (
  token      text primary key,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  platform   text not null default 'android',
  updated_at timestamptz not null default now()
);

create index if not exists idx_device_tokens_user on public.device_tokens (user_id);

alter table public.device_tokens enable row level security;

drop policy if exists "device_tokens_own" on public.device_tokens;
create policy "device_tokens_own" on public.device_tokens
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- 2 ------------------------------------------------------------------------
create or replace function public.notify_new_job_riders()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  kind  text := tg_argv[0];   -- 'ride' | 'food delivery' | 'parcel delivery'
  rec   jsonb := to_jsonb(new);
  sched timestamptz := nullif(rec ->> 'scheduled_for', '')::timestamptz;
  from_ text := coalesce(rec ->> 'pickup_address', rec ->> 'sender_address', rec ->> 'restaurant_name', '');
  to_   text := coalesce(rec ->> 'destination_address', rec ->> 'delivery_address', rec ->> 'receiver_address', '');
begin
  if new.status <> 'pending' or new.rider_id is not null then
    return new;
  end if;
  if sched is not null and sched > now() + interval '30 minutes' then
    return new;
  end if;

  insert into public.notifications (user_id, title, message)
  select ra.rider_id,
         'New ' || kind || ' request',
         left(from_, 40) || ' → ' || left(to_, 40)
           || ' · est. ₱' || to_char(coalesce(new.estimated_fare, 0), 'FM999,990.00')
  from public.rider_applications ra
  join public.profiles p on p.id = ra.rider_id and p.role = 'rider' and p.is_active
  join public.rider_locations rl on rl.rider_id = ra.rider_id
  where ra.status = 'approved'
    and rl.is_online
    and rl.updated_at > now() - interval '10 minutes'
    and public.rider_can_take(new.vehicle_id, ra.rider_id);
  return new;
end;
$$;

drop trigger if exists trg_notify_new_job_riders on public.transport_bookings;
create trigger trg_notify_new_job_riders after insert on public.transport_bookings
  for each row execute function public.notify_new_job_riders('ride');

drop trigger if exists trg_notify_new_job_riders on public.food_deliveries;
create trigger trg_notify_new_job_riders after insert on public.food_deliveries
  for each row execute function public.notify_new_job_riders('food delivery');

drop trigger if exists trg_notify_new_job_riders on public.parcel_deliveries;
create trigger trg_notify_new_job_riders after insert on public.parcel_deliveries
  for each row execute function public.notify_new_job_riders('parcel delivery');

-- 3 ------------------------------------------------------------------------
-- The app registers its token through these (a phone can change hands: the
-- token then moves to whoever is logged in now, which a plain upsert
-- couldn't do under the per-user policy above).
create or replace function public.register_device(p_token text, p_platform text default 'android')
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.device_tokens (token, user_id, platform, updated_at)
  select p_token, auth.uid(), coalesce(p_platform, 'android'), now()
  where auth.uid() is not null and length(coalesce(p_token, '')) between 20 and 4096
  on conflict (token) do update
    set user_id = excluded.user_id, platform = excluded.platform, updated_at = now();
$$;

create or replace function public.unregister_device(p_token text)
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.device_tokens where token = p_token and user_id = auth.uid();
$$;

revoke all on function public.register_device(text, text) from public, anon;
revoke all on function public.unregister_device(text) from public, anon;
grant execute on function public.register_device(text, text) to authenticated;
grant execute on function public.unregister_device(text) to authenticated;
