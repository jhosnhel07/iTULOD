-- 034_platform_settings.sql
-- ---------------------------------------------------------------------------
-- Admin → Settings becomes a real form over platform_config.
--
-- Until now the Settings tab only displayed a hard-coded "15%" and a
-- placeholder hotline; the commission, cancellation fee and hauling helper fee
-- could only be changed in the database. Now:
--   * contact details the admin can set: support_phone, support_email,
--     office_address (shown on the public landing page);
--   * sane limits on every setting, so a typo can't make rides free or
--     charge a 500% commission;
--   * updated_at is stamped on every change;
--   * public_site_info() lets the logged-out landing page read only the
--     contact details (platform_config itself stays logged-in only).
-- The admin write policy (config_admin_write, is_admin()) already exists.
-- ---------------------------------------------------------------------------

alter table public.platform_config add column if not exists support_phone  text;
alter table public.platform_config add column if not exists support_email  text default 'support@itulod.app';
alter table public.platform_config add column if not exists office_address text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'platform_config_limits') then
    alter table public.platform_config add constraint platform_config_limits check (
          commission_rate     between 0 and 0.5
      and fare_min            between 0 and 1000
      and fare_max_multiplier between 1 and 10
      and cancellation_fee    between 0 and 1000
      and hauling_helper_fee  between 0 and 5000
      and coalesce(length(support_phone), 0)  <= 40
      and coalesce(length(support_email), 0)  <= 120
      and coalesce(length(office_address), 0) <= 200
    );
  end if;
end $$;

create or replace function public.platform_config_touch()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_platform_config_touch on public.platform_config;
create trigger trg_platform_config_touch
  before update on public.platform_config
  for each row execute function public.platform_config_touch();

create or replace function public.public_site_info()
returns table (support_phone text, support_email text, office_address text)
language sql
stable
security definer
set search_path = public
as $$
  select support_phone, support_email, office_address from public.platform_config where id;
$$;

grant execute on function public.public_site_info() to anon, authenticated;
