-- Issue #59: revoking a device must sign that device out.
--
-- Each device row now remembers the Supabase auth session (the `session_id`
-- JWT claim) it signed in with. Revoking the device deletes that
-- auth.sessions row, which takes its refresh tokens with it, so the device can
-- no longer refresh. Until its access token expires, server code asks
-- identity_assert_session_active() and is refused.

alter table public.devices add column if not exists session_id uuid;

create index if not exists devices_session_id_idx
  on public.devices (session_id)
  where session_id is not null;

-- ---------------------------------------------------------------------------
-- identity_upsert_device: bind the current session; never un-revoke the same
-- session that was revoked (a fresh sign-in has a new session id).
-- ---------------------------------------------------------------------------

create or replace function public.identity_upsert_device(
  p_device_id uuid,
  p_device_label text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_sid uuid := nullif(auth.jwt() ->> 'session_id', '')::uuid;
begin
  if v_uid is null then
    raise exception 'platform.unauthenticated' using errcode = 'P0001';
  end if;

  if v_sid is not null and exists (
    select 1
    from public.devices d
    where d.session_id = v_sid
      and d.user_id = v_uid
      and d.revoked_at is not null
  ) then
    raise exception 'identity.session_revoked' using errcode = 'P0001';
  end if;

  update public.devices d
  set
    device_label = coalesce(nullif(trim(p_device_label), ''), d.device_label),
    last_seen_at = now(),
    revoked_at = null,
    session_id = coalesce(v_sid, d.session_id)
  where d.id = p_device_id
    and d.user_id = v_uid;

  if found then
    return p_device_id;
  end if;

  if exists (
    select 1 from public.devices d where d.id = p_device_id
  ) then
    raise exception 'identity.not_found' using errcode = 'P0001';
  end if;

  insert into public.devices (id, user_id, device_label, last_seen_at, session_id)
  values (p_device_id, v_uid, nullif(trim(p_device_label), ''), now(), v_sid);

  return p_device_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- identity_assert_session_active: the caller's auth session is still live.
-- Used by every server request (getSessionContext); needs no device cookie.
-- ---------------------------------------------------------------------------

create or replace function public.identity_assert_session_active()
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_sid uuid := nullif(auth.jwt() ->> 'session_id', '')::uuid;
begin
  if v_uid is null then
    raise exception 'platform.unauthenticated' using errcode = 'P0001';
  end if;

  -- Tokens without a session claim (service tooling) carry no device binding.
  if v_sid is null then
    return;
  end if;

  if not exists (
    select 1 from auth.sessions s where s.id = v_sid and s.user_id = v_uid
  ) then
    raise exception 'identity.session_revoked' using errcode = 'P0001';
  end if;

  if exists (
    select 1
    from public.devices d
    where d.session_id = v_sid
      and d.user_id = v_uid
      and d.revoked_at is not null
  ) then
    raise exception 'identity.session_revoked' using errcode = 'P0001';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- identity_assert_device_active: also refuse a revoked session.
-- ---------------------------------------------------------------------------

create or replace function public.identity_assert_device_active(p_device_id uuid)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'platform.unauthenticated' using errcode = 'P0001';
  end if;

  if p_device_id is null then
    raise exception 'identity.session_revoked' using errcode = 'P0001';
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

  perform public.identity_assert_session_active();
end;
$$;

-- ---------------------------------------------------------------------------
-- identity_revoke_device: also end the device's auth session (and with it
-- every refresh token issued to that session).
-- ---------------------------------------------------------------------------

create or replace function public.identity_revoke_device(p_device_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_sid uuid;
begin
  if v_uid is null then
    raise exception 'platform.unauthenticated' using errcode = 'P0001';
  end if;

  update public.devices d
  set revoked_at = now()
  where d.id = p_device_id
    and d.user_id = v_uid
    and d.revoked_at is null
  returning d.session_id into v_sid;

  if not found then
    raise exception 'identity.not_found' using errcode = 'P0001';
  end if;

  if v_sid is not null then
    delete from auth.sessions s
    where s.id = v_sid
      and s.user_id = v_uid;
  end if;
end;
$$;

revoke all on function public.identity_assert_session_active() from public, anon;
grant execute on function public.identity_assert_session_active() to authenticated, service_role;
