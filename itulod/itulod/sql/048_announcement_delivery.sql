-- =============================================================================
-- iTULOD migration 048: announcements actually reach people
-- -----------------------------------------------------------------------------
-- Admin → Announcements only saved a row in `announcements`; nothing read it,
-- so no customer or rider ever saw one. Now each announcement is delivered as
-- a notification to everyone in its audience (all = customers + riders,
-- or just one of them). That puts it in their Notifications on the web and in
-- the app, and the existing push trigger (sql/023, sql/037) sends it to their
-- phones / browsers too.
--
-- announcements.recipients records how many it reached (null = never sent —
-- the ones published before this); deliver_announcement() sends one of those
-- from the admin list. link = 'announcement/<id>'.
--
-- Run AFTER 047. Safe to re-run.
-- =============================================================================

alter table public.announcements add column if not exists recipients int;

-- Sends one announcement as notifications; returns how many people got it.
create or replace function public.send_announcement_notifications(p_id uuid)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  a record;
  n int;
begin
  select * into a from announcements where id = p_id;
  if not found then return 0; end if;
  insert into notifications (user_id, title, message, link)
  select p.id, '📢 ' || a.title, a.body, 'announcement/' || a.id
    from profiles p
   where coalesce(p.is_active, true)
     and p.role::text in ('customer', 'rider')
     and (a.audience = 'all' or p.role::text = a.audience);
  get diagnostics n = row_count;
  update announcements set recipients = n where id = p_id;
  return n;
end;
$$;
revoke all on function public.send_announcement_notifications(uuid) from public, anon, authenticated;

create or replace function public.announcement_after_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.send_announcement_notifications(new.id);
  return new;
end;
$$;

drop trigger if exists trg_announcement_deliver on public.announcements;
create trigger trg_announcement_deliver after insert on public.announcements
  for each row execute function public.announcement_after_insert();

-- Admin → "Send now" for an announcement that was never delivered.
create or replace function public.deliver_announcement(p_id uuid)
returns int
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Only an admin can send announcements.';
  end if;
  if exists (select 1 from announcements where id = p_id and recipients is not null) then
    raise exception 'This announcement was already sent.';
  end if;
  return public.send_announcement_notifications(p_id);
end;
$$;
revoke all on function public.deliver_announcement(uuid) from public, anon;
grant execute on function public.deliver_announcement(uuid) to authenticated;
