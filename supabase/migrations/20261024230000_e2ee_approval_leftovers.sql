-- E2EE approval leftovers (#255), follow-up to #251.
--  1. register_device: re-registering an existing device id with different keys used to keep
--     the old keys silently. Raise e2ee.device_keys_changed instead (the keys are what the
--     account signature vouches for, so they never change in place).
--  2. list_pending_devices: require a session id, like approve_device / deny_device.

create or replace function public.register_device(
  p_device_id uuid,
  p_name text,
  p_platform text,
  p_identity_key text,
  p_signing_key text,
  p_account_signature text default null,
  p_account_signing_key text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_owner uuid;
  v_sid uuid;
  v_idk text;
  v_sgk text;
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

  select d.user_id, d.identity_key, d.signing_key into v_owner, v_idk, v_sgk
  from public.e2ee_devices d where d.id = p_device_id;
  if v_owner is not null and v_owner <> v_uid then
    raise exception 'e2ee.device_taken' using errcode = 'P0001';
  end if;

  if v_owner is null then
    if (select count(*) from public.e2ee_devices d where d.user_id = v_uid) >= 5 then
      raise exception 'e2ee.device_limit' using errcode = 'P0001',
        hint = 'At most 5 devices per account. Remove a device first.';
    end if;
    if exists (select 1 from public.e2ee_devices d
               where d.user_id = v_uid and d.approval_status = 'approved') then
      raise exception 'e2ee.approval_required' using errcode = 'P0001';
    end if;
    insert into public.e2ee_devices
      (id, user_id, name, platform, identity_key, signing_key, account_signature, session_id)
    values
      (p_device_id, v_uid, btrim(p_name), btrim(p_platform), p_identity_key, p_signing_key,
       p_account_signature, v_sid);
  else
    if v_idk is distinct from p_identity_key or v_sgk is distinct from p_signing_key then
      raise exception 'e2ee.device_keys_changed' using errcode = 'P0001',
        hint = 'A device keeps its keys. Remove it and add it again to use new keys.';
    end if;
    update public.e2ee_devices d
    set name = btrim(p_name),
        platform = btrim(p_platform),
        account_signature = coalesce(p_account_signature, d.account_signature),
        session_id = coalesce(v_sid, d.session_id),
        last_seen_at = now()
    where d.id = p_device_id;
  end if;

  if p_account_signing_key is not null then
    insert into public.account_keys (user_id, signing_key)
    values (v_uid, p_account_signing_key)
    on conflict (user_id) do nothing;
  end if;
end;
$$;

create or replace function public.list_pending_devices()
returns table (
  id uuid,
  name text,
  platform text,
  identity_key text,
  signing_key text,
  created_at timestamptz
)
language plpgsql
stable
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
    return;
  end if;
  return query
  select d.id, d.name, d.platform, d.identity_key, d.signing_key, d.created_at
  from public.e2ee_devices d
  where d.user_id = v_uid and d.approval_status = 'pending'
  order by d.created_at, d.id;
end;
$$;

revoke all on function public.register_device(uuid, text, text, text, text, text, text) from public, anon;
revoke all on function public.list_pending_devices() from public, anon;
grant execute on function public.register_device(uuid, text, text, text, text, text, text) to authenticated;
grant execute on function public.list_pending_devices() to authenticated;
