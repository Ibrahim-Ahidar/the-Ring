-- Issue #60: security settings show real device activity and can sign out
-- every other device.

-- ---------------------------------------------------------------------------
-- identity_touch_device: the app layout calls this on every protected page
-- render, so it writes at most once every 5 minutes per device.
-- ---------------------------------------------------------------------------

create or replace function public.identity_touch_device(p_device_id uuid)
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

  if not exists (
    select 1
    from public.devices d
    where d.id = p_device_id
      and d.user_id = v_uid
      and d.revoked_at is null
  ) then
    raise exception 'identity.session_revoked' using errcode = 'P0001';
  end if;

  update public.devices d
  set last_seen_at = now()
  where d.id = p_device_id
    and d.user_id = v_uid
    and d.revoked_at is null
    and (d.last_seen_at is null or d.last_seen_at < now() - interval '5 minutes');
end;
$$;

-- ---------------------------------------------------------------------------
-- identity_revoke_other_devices: revoke every device except the caller's and
-- end every other auth session of the member. Returns how many devices were
-- revoked.
-- ---------------------------------------------------------------------------

create or replace function public.identity_revoke_other_devices(
  p_current_device_id uuid
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_sid uuid := nullif(auth.jwt() ->> 'session_id', '')::uuid;
  v_count integer;
begin
  if v_uid is null then
    raise exception 'platform.unauthenticated' using errcode = 'P0001';
  end if;

  with revoked as (
    update public.devices d
    set revoked_at = now()
    where d.user_id = v_uid
      and d.revoked_at is null
      and d.id is distinct from p_current_device_id
      and (v_sid is null or d.session_id is distinct from v_sid)
    returning d.session_id
  ),
  ended as (
    delete from auth.sessions s
    using revoked r
    where s.id = r.session_id
      and s.user_id = v_uid
    returning s.id
  )
  select count(*)::integer into v_count from revoked;

  -- Sessions that never registered a device are signed out too.
  if v_sid is not null then
    delete from auth.sessions s
    where s.user_id = v_uid
      and s.id <> v_sid;
  end if;

  return v_count;
end;
$$;

revoke all on function public.identity_revoke_other_devices(uuid) from public, anon;
grant execute on function public.identity_revoke_other_devices(uuid) to authenticated, service_role;
