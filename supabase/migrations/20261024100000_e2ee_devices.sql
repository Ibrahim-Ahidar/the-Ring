-- Issue #223 (spec section 4.2): E2EE device registry and key distribution.
--
-- The foundation already has public.devices for sign-in devices, so the E2EE registry
-- is public.e2ee_devices. All writes go through the RPCs below; the tables are
-- select-only (own rows) for browser roles.

create table public.account_keys (
  user_id uuid primary key references auth.users (id) on delete cascade,
  signing_key text not null,
  version integer not null default 1,
  created_at timestamptz not null default now()
);

create table public.e2ee_devices (
  id uuid primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  platform text not null,
  identity_key text not null,
  signing_key text not null,
  account_signature text,
  fallback_key text,
  fallback_key_id text,
  session_id uuid,
  push_token text,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);
create index e2ee_devices_user_id_idx on public.e2ee_devices (user_id);
create index e2ee_devices_last_seen_idx on public.e2ee_devices (last_seen_at);

create table public.one_time_keys (
  device_id uuid not null references public.e2ee_devices (id) on delete cascade,
  key_id text not null,
  public_key text not null,
  seq bigint generated always as identity,
  primary key (device_id, key_id)
);
create index one_time_keys_claim_idx on public.one_time_keys (device_id, seq);

alter table public.account_keys enable row level security;
alter table public.e2ee_devices enable row level security;
alter table public.one_time_keys enable row level security;

create policy account_keys_select_owner on public.account_keys
  for select to authenticated using (user_id = (select auth.uid()));
create policy e2ee_devices_select_owner on public.e2ee_devices
  for select to authenticated using (user_id = (select auth.uid()));
-- one_time_keys has no client policy: keys leave only through claim_keys.

-- register_device: creates or refreshes the caller's device (idempotent per device id).
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

  -- Serialise per user so two concurrent registrations cannot both pass the limit.
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

-- upload_keys: stores up to 50 one-time keys in total; extra keys are ignored.
-- p_one_time_keys is a JSON object key_id -> public key. Returns the stored count.
create or replace function public.upload_keys(
  p_device_id uuid,
  p_one_time_keys jsonb default '{}'::jsonb,
  p_fallback_key jsonb default null
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_room integer;
  v_count integer;
begin
  if v_uid is null then
    raise exception 'platform.unauthenticated' using errcode = 'P0001';
  end if;
  perform 1 from public.e2ee_devices d
   where d.id = p_device_id and d.user_id = v_uid for update;
  if not found then
    raise exception 'e2ee.device_not_found' using errcode = 'P0001';
  end if;
  if p_one_time_keys is not null and pg_catalog.jsonb_typeof(p_one_time_keys) <> 'object' then
    raise exception 'e2ee.invalid_keys' using errcode = 'P0001';
  end if;

  select 50 - count(*) into v_room from public.one_time_keys k where k.device_id = p_device_id;
  if v_room > 0 and p_one_time_keys is not null then
    insert into public.one_time_keys (device_id, key_id, public_key)
    select p_device_id, e.key, e.value
    from pg_catalog.jsonb_each_text(p_one_time_keys) e
    order by e.key
    limit v_room
    on conflict do nothing;
  end if;

  if p_fallback_key is not null and pg_catalog.jsonb_typeof(p_fallback_key) = 'object' then
    update public.e2ee_devices d
    set fallback_key_id = e.key, fallback_key = e.value
    from (select f.key, f.value from pg_catalog.jsonb_each_text(p_fallback_key) f limit 1) e
    where d.id = p_device_id;
  end if;

  select count(*) into v_count from public.one_time_keys k where k.device_id = p_device_id;
  return v_count;
end;
$$;

create or replace function public.one_time_key_count(p_device_id uuid)
returns integer
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
  perform 1 from public.e2ee_devices d where d.id = p_device_id and d.user_id = v_uid;
  if not found then
    raise exception 'e2ee.device_not_found' using errcode = 'P0001';
  end if;
  return (select count(*)::integer from public.one_time_keys k where k.device_id = p_device_id);
end;
$$;

-- claim_keys: hands out one one-time key per device, never the same one twice
-- (DELETE ... RETURNING on a row locked with SKIP LOCKED). Falls back to the
-- device's fallback key (reusable) when none are left.
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
    select * into v_dev from public.e2ee_devices d where d.id = v_id;
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

-- list_devices: the caller's own devices in full; other users' devices (only users
-- who share a conversation with the caller) as public key material.
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

-- remove_device: deletes the device, its keys (cascade) and its auth session.
create or replace function public.remove_device(p_device_id uuid)
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
  delete from public.e2ee_devices d
  where d.id = p_device_id and d.user_id = v_uid
  returning d.session_id into v_sid;
  if not found then
    raise exception 'e2ee.device_not_found' using errcode = 'P0001';
  end if;
  if v_sid is not null then
    delete from auth.sessions s where s.id = v_sid and s.user_id = v_uid;
  end if;
end;
$$;

-- cleanup_inactive_devices: removes devices not seen for p_days days (default 30),
-- with their keys and auth sessions. Called by pg_cron; not callable by browser roles.
create or replace function public.cleanup_inactive_devices(p_days integer default 30)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  with gone as (
    delete from public.e2ee_devices d
    where d.last_seen_at < now() - pg_catalog.make_interval(days => p_days)
    returning d.session_id, d.user_id
  ), ended as (
    delete from auth.sessions s
    using gone g
    where s.id = g.session_id and s.user_id = g.user_id
  )
  select count(*)::integer into v_count from gone;
  return v_count;
end;
$$;

revoke all on function public.register_device(uuid, text, text, text, text, text, text) from public, anon;
revoke all on function public.upload_keys(uuid, jsonb, jsonb) from public, anon;
revoke all on function public.one_time_key_count(uuid) from public, anon;
revoke all on function public.claim_keys(uuid[]) from public, anon;
revoke all on function public.list_devices(uuid[]) from public, anon;
revoke all on function public.remove_device(uuid) from public, anon;
revoke all on function public.cleanup_inactive_devices(integer) from public, anon, authenticated;
grant execute on function public.register_device(uuid, text, text, text, text, text, text) to authenticated;
grant execute on function public.upload_keys(uuid, jsonb, jsonb) to authenticated;
grant execute on function public.one_time_key_count(uuid) to authenticated;
grant execute on function public.claim_keys(uuid[]) to authenticated;
grant execute on function public.list_devices(uuid[]) to authenticated;
grant execute on function public.remove_device(uuid) to authenticated;

-- Daily cleanup, only where pg_cron is available (Supabase); a no-op elsewhere.
do $$
begin
  if exists (select 1 from pg_catalog.pg_extension where extname = 'pg_cron') then
    perform cron.schedule(
      'e2ee-cleanup-inactive-devices',
      '17 3 * * *',
      'select public.cleanup_inactive_devices(30)'
    );
  end if;
exception when others then
  raise notice 'pg_cron scheduling skipped: %', sqlerrm;
end;
$$;
