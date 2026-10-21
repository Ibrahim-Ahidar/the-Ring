-- Issue #185 (spec section 8): latest published mobile version.
--
-- Adds a `mobile_latest_version` key to app_config and exposes it through the
-- existing read-only get_mobile_compat() RPC so the app can show a dismissible
-- "update available" notice. Update the value after publishing a release.

insert into public.app_config (key, value)
values ('mobile_latest_version', '')
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
    'latest_version', (select nullif(value, '') from public.app_config where key = 'mobile_latest_version'),
    'download_url', (select nullif(value, '') from public.app_config where key = 'mobile_download_url')
  );
$$;

revoke all on function public.get_mobile_compat() from public;
grant execute on function public.get_mobile_compat() to anon, authenticated;
