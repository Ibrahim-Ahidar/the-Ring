-- Pulse identity: profile provisioning, settings writes, devices, account deletion.

-- ---------------------------------------------------------------------------
-- Signup rate limiting (anonymous-safe bucket by normalized email)
-- ---------------------------------------------------------------------------

create table public.identity_signup_buckets (
  bucket text not null,
  window_start timestamptz not null,
  count integer not null default 0,
  primary key (bucket, window_start)
);

revoke all on public.identity_signup_buckets from anon, authenticated, public;

-- ---------------------------------------------------------------------------
-- Username validation (mirrors @/platform/username error codes)
-- ---------------------------------------------------------------------------

create or replace function public.identity_validate_username(p_username text)
returns text
language plpgsql
immutable
as $$
declare
  v_norm text;
begin
  v_norm := public.normalize_username(p_username);

  if length(v_norm) < 3 then
    return 'identity.username_too_short';
  end if;
  if length(v_norm) > 20 then
    return 'identity.username_too_long';
  end if;
  if v_norm !~ '^[a-z]' then
    return 'identity.username_invalid_start';
  end if;
  if v_norm !~ '^[a-z][a-z0-9_]*$' then
    return 'identity.username_invalid_chars';
  end if;
  if v_norm = any (
    array[
      'admin',
      'support',
      'pulse',
      'help',
      'system',
      'everyone',
      'here',
      'null',
      'undefined'
    ]::text[]
  ) then
    return 'identity.username_reserved';
  end if;

  return null;
end;
$$;

-- ---------------------------------------------------------------------------
-- Auth user → profile row (username from raw_user_meta_data)
-- ---------------------------------------------------------------------------

create or replace function public.trg_auth_user_create_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_username text;
  v_display text;
  v_code text;
begin
  v_username := nullif(trim(new.raw_user_meta_data->>'username'), '');
  if v_username is null then
    return new;
  end if;

  v_code := public.identity_validate_username(v_username);
  if v_code is not null then
    raise exception '%', v_code using errcode = 'P0001';
  end if;

  v_display := nullif(trim(new.raw_user_meta_data->>'display_name'), '');
  if v_display is null then
    v_display := trim(v_username);
  end if;

  insert into public.profiles (
    id,
    username,
    display_name,
    username_changed_at
  )
  values (
    new.id,
    trim(v_username),
    v_display,
    now()
  );

  return new;
exception
  when unique_violation then
    raise exception 'identity.username_taken' using errcode = 'P0001';
end;
$$;

drop trigger if exists auth_users_create_profile_trg on auth.users;

create trigger auth_users_create_profile_trg
after insert on auth.users
for each row
execute function public.trg_auth_user_create_profile();

-- ---------------------------------------------------------------------------
-- Anonymous-safe reads for signup
-- ---------------------------------------------------------------------------

create or replace function public.identity_is_username_available(p_username text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_norm text;
begin
  if public.identity_validate_username(p_username) is not null then
    return false;
  end if;

  v_norm := public.normalize_username(p_username);

  return not exists (
    select 1
    from public.profiles p
    where p.normalized_username = v_norm
  );
end;
$$;

create or replace function public.identity_enforce_signup_rate_limit(p_email text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_bucket text;
  v_window_start timestamptz;
  v_limit integer := 5;
  v_new_count integer;
begin
  v_bucket := lower(trim(p_email));
  if v_bucket = '' then
    raise exception 'identity.credentials_rejected' using errcode = 'P0001';
  end if;

  v_window_start := date_trunc('minute', now());

  insert into public.identity_signup_buckets as b (bucket, window_start, count)
  values (v_bucket, v_window_start, 1)
  on conflict (bucket, window_start)
  do update set count = b.count + 1
  returning count into v_new_count;

  delete from public.identity_signup_buckets
  where window_start < now() - interval '2 hours';

  if v_new_count > v_limit then
    raise exception 'platform.rate_limited' using errcode = 'P0001';
  end if;
end;
$$;

revoke all on function public.identity_is_username_available(text) from public;
grant execute on function public.identity_is_username_available(text) to anon, authenticated, service_role;

-- Server-only: browsers could otherwise exhaust another person's signup allowance.
revoke all on function public.identity_enforce_signup_rate_limit(text) from public, anon, authenticated;
grant execute on function public.identity_enforce_signup_rate_limit(text) to service_role;

revoke all on function public.identity_validate_username(text) from public;
grant execute on function public.identity_validate_username(text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Device session helpers
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
begin
  if v_uid is null then
    raise exception 'platform.unauthenticated' using errcode = 'P0001';
  end if;

  update public.devices d
  set
    device_label = coalesce(nullif(trim(p_device_label), ''), d.device_label),
    last_seen_at = now(),
    revoked_at = null
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

  insert into public.devices (id, user_id, device_label, last_seen_at)
  values (p_device_id, v_uid, nullif(trim(p_device_label), ''), now());

  return p_device_id;
end;
$$;

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

  update public.devices d
  set last_seen_at = now()
  where d.id = p_device_id
    and d.user_id = v_uid
    and d.revoked_at is null;

  if not found then
    raise exception 'identity.session_revoked' using errcode = 'P0001';
  end if;
end;
$$;

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
end;
$$;

create or replace function public.identity_list_devices()
returns table (
  id uuid,
  device_label text,
  last_seen_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    d.id,
    d.device_label,
    d.last_seen_at,
    d.revoked_at,
    d.created_at
  from public.devices d
  where d.user_id = auth.uid()
  order by coalesce(d.last_seen_at, d.created_at) desc;
$$;

create or replace function public.identity_revoke_device(p_device_id uuid)
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

  update public.devices d
  set revoked_at = now()
  where d.id = p_device_id
    and d.user_id = v_uid
    and d.revoked_at is null;

  if not found then
    raise exception 'identity.not_found' using errcode = 'P0001';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Profile reads / writes (username not client-writable)
-- ---------------------------------------------------------------------------

create or replace function public.identity_get_own_profile()
returns table (
  id uuid,
  username text,
  display_name text,
  bio text,
  avatar_url text,
  timezone text,
  username_changed_at timestamptz,
  locale text
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    p.id,
    p.username,
    p.display_name,
    p.bio,
    p.avatar_url,
    p.timezone,
    p.username_changed_at,
    p.locale
  from public.profiles p
  where p.id = auth.uid();
$$;

create or replace function public.identity_update_profile(
  p_display_name text default null,
  p_bio text default null,
  p_timezone text default null
)
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

  update public.profiles p
  set
    display_name = coalesce(nullif(trim(p_display_name), ''), p.display_name),
    bio = case
      when p_bio is null then p.bio
      else nullif(trim(p_bio), '')
    end,
    timezone = coalesce(nullif(trim(p_timezone), ''), p.timezone)
  where p.id = v_uid;

  if not found then
    raise exception 'identity.not_found' using errcode = 'P0001';
  end if;
end;
$$;

create or replace function public.identity_set_avatar_path(p_storage_path text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_path text;
begin
  if v_uid is null then
    raise exception 'platform.unauthenticated' using errcode = 'P0001';
  end if;

  v_path := nullif(trim(p_storage_path), '');
  if v_path is null then
    raise exception 'identity.avatar_rejected' using errcode = 'P0001';
  end if;

  if v_path !~ ('^avatars/' || v_uid::text || '/') then
    raise exception 'identity.avatar_rejected' using errcode = 'P0001';
  end if;

  update public.profiles p
  set avatar_url = v_path
  where p.id = v_uid;

  if not found then
    raise exception 'identity.not_found' using errcode = 'P0001';
  end if;
end;
$$;

create or replace function public.identity_change_username(p_username text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_code text;
  v_changed_at timestamptz;
  v_trimmed text;
begin
  if v_uid is null then
    raise exception 'platform.unauthenticated' using errcode = 'P0001';
  end if;

  v_code := public.identity_validate_username(p_username);
  if v_code is not null then
    raise exception '%', v_code using errcode = 'P0001';
  end if;

  select p.username_changed_at
  into v_changed_at
  from public.profiles p
  where p.id = v_uid
  for update;

  if not found then
    raise exception 'identity.not_found' using errcode = 'P0001';
  end if;

  if v_changed_at is not null and v_changed_at > now() - interval '14 days' then
    raise exception 'identity.username_cooldown' using errcode = 'P0001';
  end if;

  v_trimmed := trim(p_username);

  update public.profiles p
  set
    username = v_trimmed,
    username_changed_at = now()
  where p.id = v_uid;

exception
  when unique_violation then
    raise exception 'identity.username_taken' using errcode = 'P0001';
end;
$$;

-- ---------------------------------------------------------------------------
-- Account deletion
-- ---------------------------------------------------------------------------

create or replace function public.identity_delete_account(p_username_confirm text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_username text;
  v_marker text;
begin
  if v_uid is null then
    raise exception 'platform.unauthenticated' using errcode = 'P0001';
  end if;

  select p.username
  into v_username
  from public.profiles p
  where p.id = v_uid
  for update;

  if not found then
    raise exception 'identity.not_found' using errcode = 'P0001';
  end if;

  if trim(p_username_confirm) is distinct from v_username then
    raise exception 'identity.username_mismatch' using errcode = 'P0001';
  end if;

  update public.devices d
  set revoked_at = coalesce(d.revoked_at, now())
  where d.user_id = v_uid;

  update public.conversation_members cm
  set left_at = coalesce(cm.left_at, now())
  where cm.user_id = v_uid
    and cm.left_at is null;

  v_marker := 'deleted_' || substring(replace(v_uid::text, '-', '') from 1 for 12);

  update public.profiles p
  set
    display_name = '__deleted_member__',
    bio = null,
    avatar_url = null,
    discoverable = false,
    username = v_marker,
    username_changed_at = now()
  where p.id = v_uid;
end;
$$;
