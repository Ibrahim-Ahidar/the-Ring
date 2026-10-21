-- Issue #184 (spec section 10): minimum supported mobile version.
--
-- A small key/value config table. Only the two mobile keys are exposed, and
-- only through a read-only RPC callable before sign-in (the update gate runs
-- before the user can authenticate). Writes need the service role.

create table if not exists public.app_config (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);

alter table public.app_config enable row level security;
-- No policies: clients cannot read or write the table directly.

insert into public.app_config (key, value)
values ('min_supported_mobile_version', '0.0.0'), ('mobile_download_url', '')
on conflict (key) do nothing;

create or replace function public.get_mobile_compat()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'min_version', (select value from public.app_config where key = 'min_supported_mobile_version'),
    'download_url', (select nullif(value, '') from public.app_config where key = 'mobile_download_url')
  );
$$;

revoke all on function public.get_mobile_compat() from public;
grant execute on function public.get_mobile_compat() to anon, authenticated;
