-- Issue #182 (spec section 7): push-capable Devices.
--
-- public.devices already exists (login-session devices, see identity.sql).
-- It is extended with the client kind, platform, Expo push token and app
-- version. Rows created by the identity flow keep these columns null.

alter table public.devices
  add column if not exists client text,
  add column if not exists platform text,
  add column if not exists push_token text,
  add column if not exists app_version text;

alter table public.devices
  add constraint devices_client_check
    check (client is null or client in ('desktop', 'mobile')),
  -- One row per push token: a phone can never be registered twice.
  add constraint devices_push_token_key unique (push_token);

-- RLS is already enabled with devices_select_owner. Users may also delete
-- their own rows. Inserts and updates go through the RPCs below only.
drop policy if exists devices_delete_owner on public.devices;
create policy devices_delete_owner
  on public.devices
  for delete
  to authenticated
  using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- register_device: upsert on push_token. If the token was registered by
-- another account on this phone, the row moves to the caller.
-- ---------------------------------------------------------------------------

create or replace function public.register_device(
  p_client text,
  p_platform text,
  p_push_token text,
  p_app_version text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_token text := nullif(trim(p_push_token), '');
  v_id uuid;
begin
  if v_uid is null then
    raise exception 'platform.unauthenticated' using errcode = 'P0001';
  end if;
  if p_client is null or p_client not in ('desktop', 'mobile') then
    raise exception 'devices.invalid_client' using errcode = 'P0001';
  end if;
  if nullif(trim(p_platform), '') is null then
    raise exception 'devices.invalid_platform' using errcode = 'P0001';
  end if;
  if v_token is null then
    raise exception 'devices.invalid_token' using errcode = 'P0001';
  end if;

  insert into public.devices (user_id, client, platform, push_token, app_version, last_seen_at)
  values (v_uid, p_client, trim(p_platform), v_token, p_app_version, now())
  on conflict (push_token) do update
  set
    user_id = excluded.user_id,
    client = excluded.client,
    platform = excluded.platform,
    app_version = excluded.app_version,
    last_seen_at = now(),
    revoked_at = null
  returning id into v_id;

  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- unregister_device: remove the caller's own Device. Idempotent.
-- ---------------------------------------------------------------------------

create or replace function public.unregister_device(p_device_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'platform.unauthenticated' using errcode = 'P0001';
  end if;

  delete from public.devices d
  where d.id = p_device_id
    and d.user_id = v_uid;
end;
$$;

revoke all on function public.register_device(text, text, text, text) from public, anon;
revoke all on function public.unregister_device(uuid) from public, anon;
grant execute on function public.register_device(text, text, text, text) to authenticated, service_role;
grant execute on function public.unregister_device(uuid) to authenticated, service_role;
