-- =============================================================================
-- iTULOD migration 023: booking-status notifications + push delivery
-- -----------------------------------------------------------------------------
-- Before this, the only notifications ever written were chat messages and
-- finalize-fare: on-booking-change (the Edge Function meant to announce
-- "rider accepted", "trip started", …) needed a Dashboard Database Webhook
-- that was never set up, so customers heard nothing about their bookings.
--
-- 1. notify_booking_change() — an AFTER UPDATE trigger on all four booking
--    tables writes the in-app notifications directly (transactional, no
--    HTTP, can't silently drift out of config). Replaces on-booking-change.
-- 2. notify_hauling_riders() — a new hauling job pings every approved
--    Van/Pickup/Truck rider (there are few, so they shouldn't miss one).
-- 3. push_new_notification() — every notifications INSERT (booking status,
--    chat, fare confirmed, refunds, …) is handed to the send-push Edge
--    Function via pg_net, which delivers web push (+ SMS if configured).
--    The function URL and a shared secret live in Vault:
--      select vault.create_secret('<url>/functions/v1/send-push', 'push_hook_url');
--      select vault.create_secret('<random>', 'push_hook_secret');
--    and the same secret is set as the PUSH_HOOK_SECRET function secret.
--    Without those secrets the trigger is a no-op (in-app still works).
--
-- Run AFTER 022. Safe to re-run.
-- =============================================================================

create extension if not exists pg_net with schema extensions;

-- ---------------------------------------------------------------------------
-- 1. Booking status → in-app notifications
-- ---------------------------------------------------------------------------
create or replace function public.notify_booking_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  label text := case tg_table_name
    when 'transport_bookings' then 'ride'
    when 'food_deliveries'    then 'food delivery'
    when 'parcel_deliveries'  then 'parcel delivery'
    when 'hauling_bookings'   then 'hauling job'
    else 'booking' end;
  cap_label text := upper(left(label, 1)) || substr(label, 2);
  rider_name text;
  rider_phone text;

begin
  -- Rider just accepted
  if old.rider_id is null and new.rider_id is not null then
    select full_name, phone into rider_name, rider_phone from public.profiles where id = new.rider_id;
    insert into public.notifications (user_id, title, message) values (new.customer_id,
      'A rider accepted your ' || label,
      coalesce(rider_name, 'Your rider') || ' is on the way' || coalesce(' · ' || rider_phone, '') || '.');
  end if;

  -- Rider released the job back to the pool
  if old.rider_id is not null and new.rider_id is null and new.status = 'pending' then
    insert into public.notifications (user_id, title, message) values (new.customer_id,
      'Looking for a new rider',
      'Your rider had to release this ' || label || ' — we''re finding you another one.');
  end if;

  if new.status is distinct from old.status then
    if new.status = 'ongoing' then
      insert into public.notifications (user_id, title, message) values (new.customer_id,
        cap_label || ' started', 'Your ' || label || ' is now in progress.');
    elsif new.status = 'completed' then
      insert into public.notifications (user_id, title, message) values (new.customer_id,
        cap_label || ' completed', 'Thanks for using iTULOD! You can rate your rider from Booking history.');
    elsif new.status = 'cancelled' then
      -- tell whoever didn't cancel
      if auth.uid() = new.customer_id then
        if old.rider_id is not null then
          insert into public.notifications (user_id, title, message) values (old.rider_id,
            cap_label || ' cancelled', 'The customer cancelled this ' || label || '.');
        end if;
      else
        insert into public.notifications (user_id, title, message) values (new.customer_id,
          cap_label || ' cancelled', coalesce(nullif(new.cancelled_reason, ''), 'This ' || label || ' was cancelled.'));
      end if;
    elsif new.status = 'expired' then
      insert into public.notifications (user_id, title, message) values (new.customer_id,
        cap_label || ' expired',
        case when old.status = 'pending'
          then 'No rider accepted in time. Please book again.'
          else 'Your rider didn''t start in time, so this ' || label || ' expired. Please book again.' end);
    elsif new.status = 'no_show' then
      insert into public.notifications (user_id, title, message) values (new.customer_id,
        'Marked as no-show', 'Your rider arrived but couldn''t find you, so this ' || label || ' was closed.');
    end if;
  end if;

  if new.payment_status = 'paid' and old.payment_status is distinct from 'paid' and coalesce(new.payment_method, 'cash') <> 'cash' then
    insert into public.notifications (user_id, title, message) values (new.customer_id,
      'Payment received', 'We''ve received your payment of ₱' || to_char(coalesce(new.final_fare, new.estimated_fare), 'FM999,990.00') || ' for this ' || label || '.');
  end if;

  if new.tip_amount is not null and old.tip_amount is null and new.rider_id is not null then
    insert into public.notifications (user_id, title, message) values (new.rider_id,
      'You got a tip!', 'The customer added a ₱' || to_char(new.tip_amount, 'FM999,990.00') || ' tip for this ' || label || '.');
  end if;

  return new;
end;
$$;

do $$
declare
  t text;
begin
  foreach t in array array['transport_bookings', 'food_deliveries', 'parcel_deliveries', 'hauling_bookings'] loop
    execute format('drop trigger if exists trg_notify_booking_change on public.%I', t);
    execute format('create trigger trg_notify_booking_change after update on public.%I
                    for each row execute function public.notify_booking_change()', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 2. New hauling job → every approved hauling rider
-- ---------------------------------------------------------------------------
create or replace function public.notify_hauling_riders()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.notifications (user_id, title, message)
  select distinct ra.rider_id,
         'New hauling job',
         coalesce((select name from public.vehicles where id = new.vehicle_id), 'Hauling') || ' · '
           || left(new.pickup_address, 40) || ' → ' || left(new.dropoff_address, 40)
           || ' · est. ₱' || to_char(coalesce(new.estimated_fare, 0), 'FM999,990.00')
  from public.rider_applications ra
  join public.profiles p on p.id = ra.rider_id and p.role = 'rider' and p.is_active
  where ra.status = 'approved' and ra.vehicle_type in ('Van', 'Pickup', 'Truck');
  return new;
end;
$$;

drop trigger if exists trg_notify_hauling_riders on public.hauling_bookings;
create trigger trg_notify_hauling_riders after insert on public.hauling_bookings
  for each row execute function public.notify_hauling_riders();

-- ---------------------------------------------------------------------------
-- 3. Every new notification → send-push Edge Function (web push + SMS)
-- ---------------------------------------------------------------------------
create or replace function public.push_new_notification()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  hook_url text;
  hook_secret text;
begin
  select decrypted_secret into hook_url from vault.decrypted_secrets where name = 'push_hook_url';
  select decrypted_secret into hook_secret from vault.decrypted_secrets where name = 'push_hook_secret';
  if hook_url is null or hook_secret is null then
    return new;   -- push not configured; the in-app row still exists
  end if;
  perform net.http_post(
    url := hook_url,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-hook-secret', hook_secret),
    body := jsonb_build_object('notification_id', new.id)
  );
  return new;
exception when others then
  -- never let push delivery break the write that created the notification
  return new;
end;
$$;

drop trigger if exists trg_push_new_notification on public.notifications;
create trigger trg_push_new_notification after insert on public.notifications
  for each row execute function public.push_new_notification();
