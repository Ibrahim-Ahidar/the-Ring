-- Conversation organization: pin, mute, archive, and chat folders.

-- ---------------------------------------------------------------------------
-- Helpers (not callable by authenticated)
-- ---------------------------------------------------------------------------

create or replace function public.organization_validate_folder_name(p_name text)
returns text
language plpgsql
immutable
security definer
set search_path = ''
as $$
declare
  v_trimmed text;
begin
  v_trimmed := btrim(p_name);
  if char_length(v_trimmed) < 1 or char_length(v_trimmed) > 40 then
    raise exception 'organization.invalid_name' using errcode = 'P0001';
  end if;
  return v_trimmed;
end;
$$;

revoke all on function public.organization_validate_folder_name(text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Membership organization (caller only)
-- ---------------------------------------------------------------------------

create or replace function public.pin_conversation(p_conversation_id uuid)
returns table (
  pinned_at timestamptz,
  muted_until timestamptz,
  archived_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid;
begin
  v_uid := auth.uid();
  if v_uid is null then
    raise exception 'platform.unauthenticated' using errcode = 'P0001';
  end if;

  if not public.is_member(p_conversation_id, v_uid) then
    raise exception 'organization.not_found' using errcode = 'P0001';
  end if;

  update public.conversation_members cm
  set pinned_at = now()
  where cm.conversation_id = p_conversation_id
    and cm.user_id = v_uid
    and cm.left_at is null;

  return query
  select cm.pinned_at, cm.muted_until, cm.archived_at
  from public.conversation_members cm
  where cm.conversation_id = p_conversation_id
    and cm.user_id = v_uid;
end;
$$;

create or replace function public.unpin_conversation(p_conversation_id uuid)
returns table (
  pinned_at timestamptz,
  muted_until timestamptz,
  archived_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid;
begin
  v_uid := auth.uid();
  if v_uid is null then
    raise exception 'platform.unauthenticated' using errcode = 'P0001';
  end if;

  if not public.is_member(p_conversation_id, v_uid) then
    raise exception 'organization.not_found' using errcode = 'P0001';
  end if;

  update public.conversation_members cm
  set pinned_at = null
  where cm.conversation_id = p_conversation_id
    and cm.user_id = v_uid
    and cm.left_at is null;

  return query
  select cm.pinned_at, cm.muted_until, cm.archived_at
  from public.conversation_members cm
  where cm.conversation_id = p_conversation_id
    and cm.user_id = v_uid;
end;
$$;

create or replace function public.archive_conversation(p_conversation_id uuid)
returns table (
  pinned_at timestamptz,
  muted_until timestamptz,
  archived_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid;
begin
  v_uid := auth.uid();
  if v_uid is null then
    raise exception 'platform.unauthenticated' using errcode = 'P0001';
  end if;

  if not public.is_member(p_conversation_id, v_uid) then
    raise exception 'organization.not_found' using errcode = 'P0001';
  end if;

  update public.conversation_members cm
  set archived_at = now(), pinned_at = null
  where cm.conversation_id = p_conversation_id
    and cm.user_id = v_uid
    and cm.left_at is null;

  return query
  select cm.pinned_at, cm.muted_until, cm.archived_at
  from public.conversation_members cm
  where cm.conversation_id = p_conversation_id
    and cm.user_id = v_uid;
end;
$$;

create or replace function public.unarchive_conversation(p_conversation_id uuid)
returns table (
  pinned_at timestamptz,
  muted_until timestamptz,
  archived_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid;
begin
  v_uid := auth.uid();
  if v_uid is null then
    raise exception 'platform.unauthenticated' using errcode = 'P0001';
  end if;

  if not public.is_member(p_conversation_id, v_uid) then
    raise exception 'organization.not_found' using errcode = 'P0001';
  end if;

  update public.conversation_members cm
  set archived_at = null
  where cm.conversation_id = p_conversation_id
    and cm.user_id = v_uid
    and cm.left_at is null;

  return query
  select cm.pinned_at, cm.muted_until, cm.archived_at
  from public.conversation_members cm
  where cm.conversation_id = p_conversation_id
    and cm.user_id = v_uid;
end;
$$;

create or replace function public.mute_conversation(
  p_conversation_id uuid,
  p_muted_until timestamptz
)
returns table (
  pinned_at timestamptz,
  muted_until timestamptz,
  archived_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid;
begin
  v_uid := auth.uid();
  if v_uid is null then
    raise exception 'platform.unauthenticated' using errcode = 'P0001';
  end if;

  if p_muted_until is null then
    raise exception 'organization.invalid_mute' using errcode = 'P0001';
  end if;

  if not public.is_member(p_conversation_id, v_uid) then
    raise exception 'organization.not_found' using errcode = 'P0001';
  end if;

  update public.conversation_members cm
  set muted_until = p_muted_until
  where cm.conversation_id = p_conversation_id
    and cm.user_id = v_uid
    and cm.left_at is null;

  return query
  select cm.pinned_at, cm.muted_until, cm.archived_at
  from public.conversation_members cm
  where cm.conversation_id = p_conversation_id
    and cm.user_id = v_uid;
end;
$$;

create or replace function public.unmute_conversation(p_conversation_id uuid)
returns table (
  pinned_at timestamptz,
  muted_until timestamptz,
  archived_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid;
begin
  v_uid := auth.uid();
  if v_uid is null then
    raise exception 'platform.unauthenticated' using errcode = 'P0001';
  end if;

  if not public.is_member(p_conversation_id, v_uid) then
    raise exception 'organization.not_found' using errcode = 'P0001';
  end if;

  update public.conversation_members cm
  set muted_until = null
  where cm.conversation_id = p_conversation_id
    and cm.user_id = v_uid
    and cm.left_at is null;

  return query
  select cm.pinned_at, cm.muted_until, cm.archived_at
  from public.conversation_members cm
  where cm.conversation_id = p_conversation_id
    and cm.user_id = v_uid;
end;
$$;

-- ---------------------------------------------------------------------------
-- Chat folders (owner only)
-- ---------------------------------------------------------------------------

create or replace function public.list_chat_folders()
returns table (
  id uuid,
  name text,
  folder_position integer
)
language sql
stable
security invoker
set search_path = ''
as $$
  select f.id, f.name, f.position as folder_position
  from public.chat_folders f
  where f.user_id = auth.uid()
  order by f.position asc, f.created_at asc;
$$;

create or replace function public.create_chat_folder(p_name text)
returns table (
  id uuid,
  name text,
  folder_position integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid;
  v_name text;
  v_position integer;
  v_id uuid;
begin
  v_uid := auth.uid();
  if v_uid is null then
    raise exception 'platform.unauthenticated' using errcode = 'P0001';
  end if;

  v_name := public.organization_validate_folder_name(p_name);

  select coalesce(max(f.position), -1) + 1
  into v_position
  from public.chat_folders f
  where f.user_id = v_uid;

  v_id := gen_random_uuid();

  insert into public.chat_folders (id, user_id, name, position)
  values (v_id, v_uid, v_name, v_position);

  return query
  select v_id, v_name, v_position as folder_position;
end;
$$;

create or replace function public.rename_chat_folder(
  p_folder_id uuid,
  p_name text
)
returns table (
  id uuid,
  name text,
  folder_position integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid;
  v_name text;
begin
  v_uid := auth.uid();
  if v_uid is null then
    raise exception 'platform.unauthenticated' using errcode = 'P0001';
  end if;

  v_name := public.organization_validate_folder_name(p_name);

  update public.chat_folders f
  set name = v_name
  where f.id = p_folder_id
    and f.user_id = v_uid;

  if not found then
    raise exception 'organization.not_found' using errcode = 'P0001';
  end if;

  return query
  select f.id, f.name, f.position as folder_position
  from public.chat_folders f
  where f.id = p_folder_id;
end;
$$;

create or replace function public.delete_chat_folder(p_folder_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid;
begin
  v_uid := auth.uid();
  if v_uid is null then
    raise exception 'platform.unauthenticated' using errcode = 'P0001';
  end if;

  if not exists (
    select 1 from public.chat_folders f
    where f.id = p_folder_id and f.user_id = v_uid
  ) then
    raise exception 'organization.not_found' using errcode = 'P0001';
  end if;

  delete from public.chat_folders f
  where f.id = p_folder_id
    and f.user_id = v_uid;
end;
$$;

create or replace function public.reorder_chat_folders(p_folder_ids uuid[])
returns table (
  id uuid,
  name text,
  folder_position integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid;
  v_expected integer;
  v_actual integer;
  v_idx integer;
begin
  v_uid := auth.uid();
  if v_uid is null then
    raise exception 'platform.unauthenticated' using errcode = 'P0001';
  end if;

  if p_folder_ids is null or array_length(p_folder_ids, 1) is null then
    return;
  end if;

  select count(*)
  into v_expected
  from public.chat_folders f
  where f.user_id = v_uid;

  select count(distinct fid)
  into v_actual
  from unnest(p_folder_ids) as fid
  join public.chat_folders f on f.id = fid and f.user_id = v_uid;

  if v_actual <> v_expected or v_actual <> array_length(p_folder_ids, 1) then
    raise exception 'organization.invalid_order' using errcode = 'P0001';
  end if;

  for v_idx in 1..array_length(p_folder_ids, 1) loop
    update public.chat_folders f
    set position = v_idx - 1
    where f.id = p_folder_ids[v_idx]
      and f.user_id = v_uid;
  end loop;

  return query
  select f.id, f.name, f.position as folder_position
  from public.chat_folders f
  where f.user_id = v_uid
  order by f.position asc, f.created_at asc;
end;
$$;

create or replace function public.move_conversation_to_folder(
  p_conversation_id uuid,
  p_folder_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid;
begin
  v_uid := auth.uid();
  if v_uid is null then
    raise exception 'platform.unauthenticated' using errcode = 'P0001';
  end if;

  if not public.is_member(p_conversation_id, v_uid) then
    raise exception 'organization.not_found' using errcode = 'P0001';
  end if;

  if not exists (
    select 1 from public.chat_folders f
    where f.id = p_folder_id and f.user_id = v_uid
  ) then
    raise exception 'organization.not_found' using errcode = 'P0001';
  end if;

  delete from public.conversation_folder_items cfi
  using public.chat_folders f
  where cfi.folder_id = f.id
    and f.user_id = v_uid
    and cfi.conversation_id = p_conversation_id;

  insert into public.conversation_folder_items (folder_id, conversation_id)
  values (p_folder_id, p_conversation_id);
end;
$$;

create or replace function public.remove_conversation_from_folder(p_conversation_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid;
begin
  v_uid := auth.uid();
  if v_uid is null then
    raise exception 'platform.unauthenticated' using errcode = 'P0001';
  end if;

  if not public.is_member(p_conversation_id, v_uid) then
    raise exception 'organization.not_found' using errcode = 'P0001';
  end if;

  delete from public.conversation_folder_items cfi
  using public.chat_folders f
  where cfi.folder_id = f.id
    and f.user_id = v_uid
    and cfi.conversation_id = p_conversation_id;
end;
$$;
