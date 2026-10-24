-- Issue #251: fixes to the device approval / QR linking flows (#224, #232). New file; the
-- earlier migrations are untouched.
--   1. get_own_device: a device can read its own row (also while pending), so QR linking works.
--   4. add_fresh_device: with no approved device left, a new Account Signing Key replaces the
--      old one and account_keys.version goes up (spec 4.3).
--   5. approve_device / deny_device: a JWT without a session id no longer skips the session check.
--   6. replace_account_key: unauthenticated callers get platform.unauthenticated / P0001.

create or replace function public.get_own_device(p_device_id uuid)
returns table (
  id uuid,
  name text,
  platform text,
  identity_key text,
  signing_key text,
  approval_status text
)
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
  return query
  select d.id, d.name, d.platform, d.identity_key, d.signing_key, d.approval_status
  from public.e2ee_devices d
  where d.id = p_device_id and d.user_id = v_uid;
end;
$$;

create or replace function public.add_fresh_device(
  p_device_id uuid,
  p_name text,
  p_platform text,
  p_identity_key text,
  p_signing_key text,
  p_account_signature text default null,
  p_account_signing_key text default null,
  p_lost_devices boolean default false
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_owner uuid;
  v_sid uuid;
  v_has_approved boolean;
  v_require boolean;
begin
  if v_uid is null then
    raise exception 'platform.unauthenticated' using errcode = 'P0001';
  end if;
  if p_device_id is null or coalesce(btrim(p_name), '') = '' or coalesce(btrim(p_platform), '') = ''
     or coalesce(p_identity_key, '') = '' or coalesce(p_signing_key, '') = '' then
    raise exception 'e2ee.invalid_device' using errcode = 'P0001';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_uid::text, 223));

  begin
    v_sid := nullif(auth.jwt() ->> 'session_id', '')::uuid;
  exception when others then
    v_sid := null;
  end;

  select d.user_id into v_owner from public.e2ee_devices d where d.id = p_device_id;
  if v_owner is not null and v_owner <> v_uid then
    raise exception 'e2ee.device_taken' using errcode = 'P0001';
  end if;

  select exists (select 1 from public.e2ee_devices d
                 where d.user_id = v_uid and d.approval_status = 'approved'
                   and d.id <> p_device_id)
    into v_has_approved;
  select coalesce((select a.require_approval from public.account_keys a where a.user_id = v_uid), true)
    into v_require;

  if v_has_approved and v_require and not coalesce(p_lost_devices, false) then
    -- Approval path: store the device as pending (refreshing an earlier request).
    if v_owner is null then
      if (select count(*) from public.e2ee_devices d where d.user_id = v_uid) >= 5 then
        raise exception 'e2ee.device_limit' using errcode = 'P0001',
          hint = 'At most 5 devices per account. Remove a device first.';
      end if;
      insert into public.e2ee_devices
        (id, user_id, name, platform, identity_key, signing_key, session_id, approval_status)
      values
        (p_device_id, v_uid, btrim(p_name), btrim(p_platform), p_identity_key, p_signing_key,
         v_sid, 'pending');
    else
      update public.e2ee_devices d
      set name = btrim(p_name), platform = btrim(p_platform),
          session_id = coalesce(v_sid, d.session_id), last_seen_at = now()
      where d.id = p_device_id;
    end if;
    return 'pending';
  end if;

  if not v_has_approved then
    -- First device (or every other approved device is gone): plain registration.
    if v_owner is null then
      insert into public.e2ee_devices
        (id, user_id, name, platform, identity_key, signing_key, account_signature, session_id)
      values
        (p_device_id, v_uid, btrim(p_name), btrim(p_platform), p_identity_key, p_signing_key,
         p_account_signature, v_sid);
    else
      update public.e2ee_devices d
      set name = btrim(p_name), platform = btrim(p_platform), identity_key = p_identity_key,
          signing_key = p_signing_key, account_signature = p_account_signature,
          approval_status = 'approved', session_id = coalesce(v_sid, d.session_id),
          last_seen_at = now()
      where d.id = p_device_id;
    end if;
    -- No approved device holds the old Account Signing Key any more: a different key
    -- replaces it and the version goes up (spec 4.3).
    if p_account_signing_key is not null then
      insert into public.account_keys (user_id, signing_key)
      values (v_uid, p_account_signing_key)
      on conflict (user_id) do update set signing_key = excluded.signing_key,
        version = public.account_keys.version + 1
        where public.account_keys.signing_key is distinct from excluded.signing_key;
    end if;
    return 'registered';
  end if;

  -- Replacement path: new Account Signing Key, older devices signed out.
  if coalesce(p_account_signing_key, '') = '' then
    raise exception 'e2ee.invalid_device' using errcode = 'P0001';
  end if;

  with gone as (
    delete from public.e2ee_devices d
    where d.user_id = v_uid and d.id <> p_device_id
    returning d.session_id
  )
  delete from auth.sessions s
  using gone g
  where s.id = g.session_id and s.user_id = v_uid and s.id is distinct from v_sid;

  if v_owner is null then
    insert into public.e2ee_devices
      (id, user_id, name, platform, identity_key, signing_key, account_signature, session_id)
    values
      (p_device_id, v_uid, btrim(p_name), btrim(p_platform), p_identity_key, p_signing_key,
       p_account_signature, v_sid);
  else
    update public.e2ee_devices d
    set name = btrim(p_name), platform = btrim(p_platform), identity_key = p_identity_key,
        signing_key = p_signing_key, account_signature = p_account_signature,
        approval_status = 'approved', session_id = coalesce(v_sid, d.session_id),
        last_seen_at = now()
    where d.id = p_device_id;
  end if;

  insert into public.account_keys (user_id, signing_key)
  values (v_uid, p_account_signing_key)
  on conflict (user_id) do update set signing_key = excluded.signing_key,
    version = public.account_keys.version + 1;
  return 'replaced';
end;
$$;

create or replace function public.approve_device(p_device_id uuid, p_account_signature text)
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
  begin
    v_sid := nullif(auth.jwt() ->> 'session_id', '')::uuid;
  exception when others then
    v_sid := null;
  end;
  if not exists (select 1 from public.e2ee_devices d
                 where d.user_id = v_uid and d.approval_status = 'approved'
                   and v_sid is not null and d.session_id = v_sid) then
    raise exception 'e2ee.not_approved_device' using errcode = 'P0001';
  end if;
  if coalesce(p_account_signature, '') = '' then
    raise exception 'e2ee.invalid_device' using errcode = 'P0001';
  end if;
  update public.e2ee_devices d
  set approval_status = 'approved', account_signature = p_account_signature
  where d.id = p_device_id and d.user_id = v_uid and d.approval_status = 'pending';
  if not found then
    raise exception 'e2ee.device_not_found' using errcode = 'P0001';
  end if;
end;
$$;

create or replace function public.deny_device(p_device_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_sid uuid;
  v_dsid uuid;
begin
  if v_uid is null then
    raise exception 'platform.unauthenticated' using errcode = 'P0001';
  end if;
  begin
    v_sid := nullif(auth.jwt() ->> 'session_id', '')::uuid;
  exception when others then
    v_sid := null;
  end;
  if not exists (select 1 from public.e2ee_devices d
                 where d.user_id = v_uid and d.approval_status = 'approved'
                   and v_sid is not null and d.session_id = v_sid) then
    raise exception 'e2ee.not_approved_device' using errcode = 'P0001';
  end if;
  delete from public.e2ee_devices d
  where d.id = p_device_id and d.user_id = v_uid and d.approval_status = 'pending'
  returning d.session_id into v_dsid;
  if not found then
    raise exception 'e2ee.device_not_found' using errcode = 'P0001';
  end if;
  if v_dsid is not null then
    delete from auth.sessions s where s.id = v_dsid and s.user_id = v_uid;
  end if;
end;
$$;

create or replace function public.replace_account_key(
  p_device_id uuid,
  p_name text,
  p_platform text,
  p_identity_key text,
  p_signing_key text,
  p_account_signature text default null,
  p_account_signing_key text default null
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'platform.unauthenticated' using errcode = 'P0001';
  end if;
  return public.add_fresh_device(
    p_device_id, p_name, p_platform, p_identity_key, p_signing_key,
    p_account_signature, p_account_signing_key, true);
end;
$$;


revoke all on function public.get_own_device(uuid) from public, anon;
grant execute on function public.get_own_device(uuid) to authenticated;
