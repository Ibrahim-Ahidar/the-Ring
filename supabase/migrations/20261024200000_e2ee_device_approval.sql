-- Issue #224 (spec section 4.3): Fresh Device approval, account-key replacement and
-- the data the devices_changed notices need. New file; the #223 migration is untouched.
--
-- A device is 'pending' until an existing, approved device of the same user allows it.
-- Pending devices are invisible to list_devices and claim_keys.

alter table public.e2ee_devices
  add column approval_status text not null default 'approved'
    check (approval_status in ('pending', 'approved'));

alter table public.account_keys
  add column require_approval boolean not null default true;

-- list_devices: same shape as before, approved devices only.
create or replace function public.list_devices(p_user_ids uuid[] default null)
returns table (
  id uuid,
  user_id uuid,
  name text,
  platform text,
  identity_key text,
  signing_key text,
  account_signature text,
  created_at timestamptz,
  last_seen_at timestamptz,
  is_current_session boolean
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

  return query
  select d.id, d.user_id,
         case when d.user_id = v_uid then d.name end,
         d.platform, d.identity_key, d.signing_key, d.account_signature, d.created_at,
         case when d.user_id = v_uid then d.last_seen_at end,
         (d.user_id = v_uid and v_sid is not null and d.session_id = v_sid)
  from public.e2ee_devices d
  where d.user_id = any (coalesce(p_user_ids, array[v_uid]))
    and d.approval_status = 'approved'
    and (
      d.user_id = v_uid
      or exists (
        select 1
        from public.conversation_members a
        join public.conversation_members b on b.conversation_id = a.conversation_id
        where a.user_id = v_uid and b.user_id = d.user_id
      )
    )
  order by d.created_at, d.id;
end;
$$;

-- claim_keys: unchanged except that pending devices hand out nothing.
create or replace function public.claim_keys(p_device_ids uuid[])
returns table (
  device_id uuid,
  identity_key text,
  signing_key text,
  key_id text,
  public_key text,
  is_fallback boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_dev public.e2ee_devices;
  v_kid text;
  v_pub text;
begin
  if auth.uid() is null then
    raise exception 'platform.unauthenticated' using errcode = 'P0001';
  end if;
  if coalesce(pg_catalog.cardinality(p_device_ids), 0) > 50 then
    raise exception 'e2ee.too_many_devices' using errcode = 'P0001';
  end if;

  foreach v_id in array coalesce(p_device_ids, array[]::uuid[]) loop
    select * into v_dev from public.e2ee_devices d
     where d.id = v_id and d.approval_status = 'approved';
    if not found then
      continue;
    end if;
    v_kid := null;
    v_pub := null;
    delete from public.one_time_keys k
    where (k.device_id, k.key_id) = (
      select k2.device_id, k2.key_id from public.one_time_keys k2
      where k2.device_id = v_id
      order by k2.seq
      limit 1
      for update skip locked
    )
    returning k.key_id, k.public_key into v_kid, v_pub;

    if v_kid is not null then
      return query select v_id, v_dev.identity_key, v_dev.signing_key, v_kid, v_pub, false;
    elsif v_dev.fallback_key is not null then
      return query select v_id, v_dev.identity_key, v_dev.signing_key,
        v_dev.fallback_key_id, v_dev.fallback_key, true;
    end if;
  end loop;
end;
$$;

-- register_device: a NEW device of an account that already has approved devices must go
-- through add_fresh_device (approval or key replacement). This entry stays for the first
-- device and for refreshing a device that already exists.
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

-- add_fresh_device: the entry point for a Fresh Device (spec 4.3). Returns:
--   'registered' the account had no approved device, so this one is the first;
--   'pending'    approval is on and approved devices exist: wait for an Allow;
--   'replaced'   approval is off or p_lost_devices is true: a new Account Signing Key
--                was created, account_keys.version went up and older devices were
--                removed and signed out.
-- p_account_signing_key is used for 'registered' and 'replaced'.
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
    if p_account_signing_key is not null then
      insert into public.account_keys (user_id, signing_key)
      values (v_uid, p_account_signing_key)
      on conflict (user_id) do nothing;
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

-- list_pending_devices: the caller's own devices waiting for an Allow. Only an approved
-- device of the account sees them.
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
                   and (v_sid is null or d.session_id is not distinct from v_sid)) then
    return;
  end if;
  return query
  select d.id, d.name, d.platform, d.identity_key, d.signing_key, d.created_at
  from public.e2ee_devices d
  where d.user_id = v_uid and d.approval_status = 'pending'
  order by d.created_at, d.id;
end;
$$;

-- approve_device: an approved device of the user allows a pending one and signs it.
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
                   and (v_sid is null or d.session_id is not distinct from v_sid)) then
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

-- deny_device: refuses a pending device (removed, with its auth session).
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
                   and (v_sid is null or d.session_id is not distinct from v_sid)) then
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

-- device_approval_status: what the waiting Fresh Device polls. 'pending', 'approved', or
-- 'gone' (denied, removed, or signed out by an account-key replacement).
create or replace function public.device_approval_status(p_device_id uuid)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_status text;
begin
  if v_uid is null then
    raise exception 'platform.unauthenticated' using errcode = 'P0001';
  end if;
  select d.approval_status into v_status
  from public.e2ee_devices d where d.id = p_device_id and d.user_id = v_uid;
  return coalesce(v_status, 'gone');
end;
$$;

-- set_device_approval: turn "ask an existing device first" on or off for the account.
create or replace function public.set_device_approval(p_required boolean)
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
  update public.account_keys a set require_approval = coalesce(p_required, true)
  where a.user_id = v_uid;
  if not found then
    raise exception 'e2ee.device_not_found' using errcode = 'P0001';
  end if;
end;
$$;

-- account_key_versions: the Account Signing Key version for the caller and for users who
-- share a conversation with the caller. Contacts compare it after a devices_changed event
-- to tell "security code changed" from "new device".
create or replace function public.account_key_versions(p_user_ids uuid[] default null)
returns table (user_id uuid, version integer)
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
  select a.user_id, a.version
  from public.account_keys a
  where a.user_id = any (coalesce(p_user_ids, array[v_uid]))
    and (
      a.user_id = v_uid
      or exists (
        select 1
        from public.conversation_members m1
        join public.conversation_members m2 on m2.conversation_id = m1.conversation_id
        where m1.user_id = v_uid and m2.user_id = a.user_id
      )
    )
  order by a.user_id;
end;
$$;

-- replace_account_key: the "I lost my devices" path. Same as add_fresh_device with the
-- replacement forced: new Account Signing Key, version up, older devices signed out.
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
    raise exception 'not authenticated';
  end if;
  return public.add_fresh_device(
    p_device_id, p_name, p_platform, p_identity_key, p_signing_key,
    p_account_signature, p_account_signing_key, true);
end;
$$;

revoke all on function public.replace_account_key(uuid, text, text, text, text, text, text) from public, anon;
revoke all on function public.register_device(uuid, text, text, text, text, text, text) from public, anon;
revoke all on function public.list_devices(uuid[]) from public, anon;
revoke all on function public.claim_keys(uuid[]) from public, anon;
revoke all on function public.add_fresh_device(uuid, text, text, text, text, text, text, boolean) from public, anon;
revoke all on function public.list_pending_devices() from public, anon;
revoke all on function public.approve_device(uuid, text) from public, anon;
revoke all on function public.deny_device(uuid) from public, anon;
revoke all on function public.device_approval_status(uuid) from public, anon;
revoke all on function public.set_device_approval(boolean) from public, anon;
revoke all on function public.account_key_versions(uuid[]) from public, anon;
grant execute on function public.register_device(uuid, text, text, text, text, text, text) to authenticated;
grant execute on function public.list_devices(uuid[]) to authenticated;
grant execute on function public.claim_keys(uuid[]) to authenticated;
grant execute on function public.add_fresh_device(uuid, text, text, text, text, text, text, boolean) to authenticated;
grant execute on function public.list_pending_devices() to authenticated;
grant execute on function public.approve_device(uuid, text) to authenticated;
grant execute on function public.deny_device(uuid) to authenticated;
grant execute on function public.device_approval_status(uuid) to authenticated;
grant execute on function public.set_device_approval(boolean) to authenticated;
grant execute on function public.account_key_versions(uuid[]) to authenticated;
grant execute on function public.replace_account_key(uuid, text, text, text, text, text, text) to authenticated;
