-- =============================================================================
-- iTULOD — migration 006: web-push subscriptions
-- Run in the Supabase SQL editor AFTER 005. Only needed if you enable web push
-- (VAPID keys) in the Edge Function secrets; SMS-only setups can skip this.
-- =============================================================================

create table if not exists public.push_subscriptions (
  id         uuid primary key default uuid_generate_v4(),
  user_id    uuid not null references public.profiles(id) on delete cascade,
  endpoint   text not null unique,
  p256dh     text not null,
  auth       text not null,
  user_agent text,
  created_at timestamptz not null default now()
);
create index if not exists idx_push_sub_user on public.push_subscriptions(user_id);

alter table public.push_subscriptions enable row level security;

drop policy if exists "push_sub_own" on public.push_subscriptions;
create policy "push_sub_own" on public.push_subscriptions
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
