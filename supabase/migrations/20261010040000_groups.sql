-- Groups: create, invite, links, roles, membership, system messages.

-- ---------------------------------------------------------------------------
-- Internal helpers
-- ---------------------------------------------------------------------------

create or replace function public.groups_member_count(p_conversation_id uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::integer
  from public.conversation_members cm
  where cm.conversation_id = p_conversation_id
    and cm.left_at is null;
$$;

create or replace function public.groups_insert_system_message(
  p_conversation_id uuid,
  p_actor_id uuid,
  p_event text,
  p_subject_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_message_id uuid;
begin
  insert into public.messages (
    conversation_id,
    sender_id,
    client_id,
    type,
    body,
    metadata
  )
  values (
    p_conversation_id,
    p_actor_id,
    gen_random_uuid(),
    'system',
    null,
    jsonb_build_object(
      'event', p_event,
      'subjectUserId', p_subject_user_id
    )
  )
  returning id into v_message_id;

  update public.conversations c
  set
    last_message_id = v_message_id,
    last_message_at = (select m.created_at from public.messages m where m.id = v_message_id),
    updated_at = now()
  where c.id = p_conversation_id;
end;
$$;

create or replace function public.groups_assert_active_member(
  p_conversation_id uuid,
  p_uid uuid
)
returns public.member_role
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_role public.member_role;
  v_left timestamptz;
begin
  select cm.role, cm.left_at
  into v_role, v_left
  from public.conversation_members cm
  where cm.conversation_id = p_conversation_id
    and cm.user_id = p_uid;

  if not found or v_left is not null then
    raise exception 'groups.not_member' using errcode = 'P0001';
  end if;

  return v_role;
end;
$$;

create or replace function public.groups_require_admin(
  p_conversation_id uuid,
  p_uid uuid
)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_role public.member_role;
begin
  v_role := public.groups_assert_active_member(p_conversation_id, p_uid);

  if v_role not in ('owner', 'admin') then
    raise exception 'groups.forbidden' using errcode = 'P0001';
  end if;
end;
$$;

create or replace function public.groups_require_owner(
  p_conversation_id uuid,
  p_uid uuid
)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_role public.member_role;
begin
  v_role := public.groups_assert_active_member(p_conversation_id, p_uid);

  if v_role <> 'owner' then
    raise exception 'groups.forbidden' using errcode = 'P0001';
  end if;
end;
$$;

create or replace function public.groups_assert_group(p_conversation_id uuid)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1
    from public.conversations c
    where c.id = p_conversation_id
      and c.type = 'group'
  ) then
    raise exception 'groups.not_found' using errcode = 'P0001';
  end if;
end;
$$;

create or replace function public.groups_validate_name(p_name text)
returns text
language plpgsql
immutable
as $$
declare
  v_trimmed text;
begin
  v_trimmed := btrim(coalesce(p_name, ''));
  if v_trimmed = '' then
    raise exception 'groups.name_required' using errcode = 'P0001';
  end if;
  if char_length(v_trimmed) > 80 then
    raise exception 'groups.name_too_long' using errcode = 'P0001';
  end if;
  return v_trimmed;
end;
$$;

create or replace function public.groups_validate_description(p_description text)
returns text
language plpgsql
immutable
as $$
declare
  v_trimmed text;
begin
  v_trimmed := nullif(btrim(coalesce(p_description, '')), '');
  if v_trimmed is not null and char_length(v_trimmed) > 300 then
    raise exception 'groups.description_too_long' using errcode = 'P0001';
  end if;
  return v_trimmed;
end;
$$;

revoke all on function public.groups_member_count(uuid) from public, anon, authenticated;
revoke all on function public.groups_insert_system_message(uuid, uuid, text, uuid) from public, anon, authenticated;
revoke all on function public.groups_assert_active_member(uuid, uuid) from public, anon, authenticated;
revoke all on function public.groups_require_admin(uuid, uuid) from public, anon, authenticated;
revoke all on function public.groups_require_owner(uuid, uuid) from public, anon, authenticated;
revoke all on function public.groups_assert_group(uuid) from public, anon, authenticated;
revoke all on function public.groups_validate_name(text) from public, anon, authenticated;
revoke all on function public.groups_validate_description(text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- groups_create
-- ---------------------------------------------------------------------------

create or replace function public.groups_create(
  p_name text,
  p_description text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid;
  v_name text;
  v_description text;
  v_conversation_id uuid;
begin
  v_uid := auth.uid();
  if v_uid is null then
    raise exception 'platform.unauthenticated' using errcode = 'P0001';
  end if;

  perform public.enforce_rate_limit('create_conversation');

  v_name := public.groups_validate_name(p_name);
  v_description := public.groups_validate_description(p_description);

  insert into public.conversations (
    type,
    title,
    description,
    created_by,
    direct_pair_key
  )
  values (
    'group',
    v_name,
    v_description,
    v_uid,
    null
  )
  returning id into v_conversation_id;

  insert into public.conversation_members (conversation_id, user_id, role)
  values (v_conversation_id, v_uid, 'owner');

  return v_conversation_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- groups_update
-- ---------------------------------------------------------------------------

create or replace function public.groups_update(
  p_conversation_id uuid,
  p_name text default null,
  p_description text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid;
  v_name text;
  v_description text;
begin
  v_uid := auth.uid();
  if v_uid is null then
    raise exception 'platform.unauthenticated' using errcode = 'P0001';
  end if;

  perform public.groups_assert_group(p_conversation_id);
  perform public.groups_require_admin(p_conversation_id, v_uid);

  if p_name is not null then
    v_name := public.groups_validate_name(p_name);
  end if;

  if p_description is not null then
    v_description := public.groups_validate_description(p_description);
  end if;

  update public.conversations c
  set
    title = coalesce(v_name, c.title),
    description = case
      when p_description is null then c.description
      else v_description
    end,
    updated_at = now()
  where c.id = p_conversation_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- groups_set_avatar_path
-- ---------------------------------------------------------------------------

create or replace function public.groups_set_avatar_path(
  p_conversation_id uuid,
  p_storage_path text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid;
  v_path text;
begin
  v_uid := auth.uid();
  if v_uid is null then
    raise exception 'platform.unauthenticated' using errcode = 'P0001';
  end if;

  perform public.groups_assert_group(p_conversation_id);
  perform public.groups_require_admin(p_conversation_id, v_uid);

  v_path := nullif(btrim(p_storage_path), '');
  if v_path is null then
    raise exception 'groups.avatar_rejected' using errcode = 'P0001';
  end if;

  if v_path !~ ('^group-avatars/' || p_conversation_id::text || '/') then
    raise exception 'groups.avatar_rejected' using errcode = 'P0001';
  end if;

  update public.conversations c
  set avatar_url = v_path, updated_at = now()
  where c.id = p_conversation_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- groups_get
-- ---------------------------------------------------------------------------

create or replace function public.groups_get(p_conversation_id uuid)
returns table (
  id uuid,
  title text,
  description text,
  avatar_url text,
  my_role public.member_role
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid;
  v_role public.member_role;
begin
  v_uid := auth.uid();
  if v_uid is null then
    raise exception 'platform.unauthenticated' using errcode = 'P0001';
  end if;

  perform public.groups_assert_group(p_conversation_id);
  v_role := public.groups_assert_active_member(p_conversation_id, v_uid);

  return query
  select
    c.id,
    c.title,
    c.description,
    c.avatar_url,
    v_role
  from public.conversations c
  where c.id = p_conversation_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- groups_list_members
-- ---------------------------------------------------------------------------

create or replace function public.groups_list_members(p_conversation_id uuid)
returns table (
  user_id uuid,
  username text,
  display_name text,
  avatar_url text,
  role public.member_role,
  joined_at timestamptz,
  messaging_restricted boolean
)
language plpgsql
stable
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

  perform public.groups_assert_group(p_conversation_id);
  perform public.groups_assert_active_member(p_conversation_id, v_uid);

  return query
  select
    p.id,
    p.username,
    p.display_name,
    p.avatar_url,
    cm.role,
    cm.joined_at,
    cm.messaging_restricted
  from public.conversation_members cm
  join public.profiles p on p.id = cm.user_id
  where cm.conversation_id = p_conversation_id
    and cm.left_at is null
  order by
    case cm.role
      when 'owner' then 0
      when 'admin' then 1
      else 2
    end,
    cm.joined_at asc;
end;
$$;

-- ---------------------------------------------------------------------------
-- groups_invite_member
-- ---------------------------------------------------------------------------

create or replace function public.groups_invite_member(
  p_conversation_id uuid,
  p_username text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid;
  v_norm text;
  v_target_id uuid;
  v_decision text;
  v_existing_left_at timestamptz;
  v_existing_found boolean := false;
  v_count integer;
begin
  v_uid := auth.uid();
  if v_uid is null then
    raise exception 'platform.unauthenticated' using errcode = 'P0001';
  end if;

  perform public.groups_assert_group(p_conversation_id);
  perform public.groups_require_admin(p_conversation_id, v_uid);

  v_norm := public.normalize_username(p_username);
  if v_norm is null or v_norm = '' then
    raise exception 'groups.user_not_found' using errcode = 'P0001';
  end if;

  select p.id
  into v_target_id
  from public.profiles p
  where p.normalized_username = v_norm;

  if not found then
    raise exception 'groups.user_not_found' using errcode = 'P0001';
  end if;

  if v_target_id = v_uid then
    return;
  end if;

  v_decision := public.decide_interaction(v_uid, v_target_id, 'invite');
  if v_decision <> 'allow' then
    raise exception 'groups.not_allowed' using errcode = 'P0001';
  end if;

  select cm.left_at
  into v_existing_left_at
  from public.conversation_members cm
  where cm.conversation_id = p_conversation_id
    and cm.user_id = v_target_id;

  v_existing_found := found;

  if v_existing_found and v_existing_left_at is null then
    return;
  end if;

  v_count := public.groups_member_count(p_conversation_id);
  if v_count >= 200 then
    raise exception 'groups.member_limit' using errcode = 'P0001';
  end if;

  if v_existing_found and v_existing_left_at is not null then
    update public.conversation_members cm
    set
      left_at = null,
      role = 'member',
      messaging_restricted = false,
      joined_at = now()
    where cm.conversation_id = p_conversation_id
      and cm.user_id = v_target_id;
  else
    insert into public.conversation_members (conversation_id, user_id, role)
    values (p_conversation_id, v_target_id, 'member');
  end if;

  perform public.groups_insert_system_message(
    p_conversation_id,
    v_uid,
    'joined',
    v_target_id
  );

  perform public.notify(
    v_target_id,
    'group.invited',
    v_uid,
    p_conversation_id,
    p_conversation_id,
    false
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- groups_create_invite_link
-- ---------------------------------------------------------------------------

create or replace function public.groups_create_invite_link(
  p_conversation_id uuid,
  p_expires_at timestamptz default null,
  p_max_uses integer default null
)
returns table (id uuid, code text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid;
  v_code text;
  v_link_id uuid;
begin
  v_uid := auth.uid();
  if v_uid is null then
    raise exception 'platform.unauthenticated' using errcode = 'P0001';
  end if;

  perform public.groups_assert_group(p_conversation_id);
  perform public.groups_require_admin(p_conversation_id, v_uid);

  if p_max_uses is not null and p_max_uses < 1 then
    raise exception 'groups.invalid_link_options' using errcode = 'P0001';
  end if;

  v_code := replace(gen_random_uuid()::text, '-', '')
    || replace(gen_random_uuid()::text, '-', '');

  insert into public.invite_links (
    conversation_id,
    code,
    created_by,
    expires_at,
    max_uses
  )
  values (
    p_conversation_id,
    v_code,
    v_uid,
    p_expires_at,
    p_max_uses
  )
  returning invite_links.id into v_link_id;

  return query select v_link_id, v_code;
end;
$$;

-- ---------------------------------------------------------------------------
-- groups_revoke_invite_link
-- ---------------------------------------------------------------------------

create or replace function public.groups_revoke_invite_link(p_link_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid;
  v_conversation_id uuid;
begin
  v_uid := auth.uid();
  if v_uid is null then
    raise exception 'platform.unauthenticated' using errcode = 'P0001';
  end if;

  select il.conversation_id
  into v_conversation_id
  from public.invite_links il
  where il.id = p_link_id;

  if not found then
    raise exception 'groups.invite_link_not_found' using errcode = 'P0001';
  end if;

  perform public.groups_assert_group(v_conversation_id);
  perform public.groups_require_admin(v_conversation_id, v_uid);

  update public.invite_links il
  set revoked_at = coalesce(il.revoked_at, now())
  where il.id = p_link_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- groups_join_by_code
-- ---------------------------------------------------------------------------

create or replace function public.groups_join_by_code(p_code text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid;
  v_link_id uuid;
  v_conversation_id uuid;
  v_revoked_at timestamptz;
  v_expires_at timestamptz;
  v_max_uses integer;
  v_use_count integer;
  v_existing_left_at timestamptz;
  v_member_found boolean := false;
  v_count integer;
begin
  v_uid := auth.uid();
  if v_uid is null then
    raise exception 'platform.unauthenticated' using errcode = 'P0001';
  end if;

  if nullif(btrim(p_code), '') is null then
    raise exception 'groups.invite_link_invalid' using errcode = 'P0001';
  end if;

  select il.id, il.conversation_id, il.revoked_at, il.expires_at, il.max_uses, il.use_count
  into v_link_id, v_conversation_id, v_revoked_at, v_expires_at, v_max_uses, v_use_count
  from public.invite_links il
  where il.code = btrim(p_code)
  for update;

  if not found then
    raise exception 'groups.invite_link_invalid' using errcode = 'P0001';
  end if;

  perform public.groups_assert_group(v_conversation_id);

  if v_revoked_at is not null then
    raise exception 'groups.invite_link_revoked' using errcode = 'P0001';
  end if;

  if v_expires_at is not null and v_expires_at <= now() then
    raise exception 'groups.invite_link_expired' using errcode = 'P0001';
  end if;

  if v_max_uses is not null and v_use_count >= v_max_uses then
    raise exception 'groups.invite_link_exhausted' using errcode = 'P0001';
  end if;

  select cm.left_at
  into v_existing_left_at
  from public.conversation_members cm
  where cm.conversation_id = v_conversation_id
    and cm.user_id = v_uid;

  v_member_found := found;

  if v_member_found and v_existing_left_at is null then
    return v_conversation_id;
  end if;

  v_count := public.groups_member_count(v_conversation_id);
  if v_count >= 200 then
    raise exception 'groups.member_limit' using errcode = 'P0001';
  end if;

  if v_max_uses is not null and v_use_count + 1 > v_max_uses then
    raise exception 'groups.invite_link_exhausted' using errcode = 'P0001';
  end if;

  update public.invite_links il
  set use_count = il.use_count + 1
  where il.id = v_link_id;

  if v_member_found and v_existing_left_at is not null then
    update public.conversation_members cm
    set
      left_at = null,
      role = 'member',
      messaging_restricted = false,
      joined_at = now()
    where cm.conversation_id = v_conversation_id
      and cm.user_id = v_uid;
  else
    insert into public.conversation_members (conversation_id, user_id, role)
    values (v_conversation_id, v_uid, 'member');
  end if;

  perform public.groups_insert_system_message(
    v_conversation_id,
    v_uid,
    'joined',
    v_uid
  );

  return v_conversation_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- groups_set_role
-- ---------------------------------------------------------------------------

create or replace function public.groups_set_role(
  p_conversation_id uuid,
  p_user_id uuid,
  p_role public.member_role
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid;
  v_target_role public.member_role;
  v_event text;
begin
  v_uid := auth.uid();
  if v_uid is null then
    raise exception 'platform.unauthenticated' using errcode = 'P0001';
  end if;

  perform public.groups_assert_group(p_conversation_id);
  perform public.groups_require_admin(p_conversation_id, v_uid);

  if p_role not in ('member', 'admin') then
    raise exception 'groups.forbidden' using errcode = 'P0001';
  end if;

  select cm.role
  into v_target_role
  from public.conversation_members cm
  where cm.conversation_id = p_conversation_id
    and cm.user_id = p_user_id
    and cm.left_at is null;

  if not found then
    raise exception 'groups.user_not_found' using errcode = 'P0001';
  end if;

  if v_target_role = 'owner' then
    raise exception 'groups.cannot_target_owner' using errcode = 'P0001';
  end if;

  if v_target_role = p_role then
    return;
  end if;

  update public.conversation_members cm
  set role = p_role
  where cm.conversation_id = p_conversation_id
    and cm.user_id = p_user_id;

  if p_role = 'admin' then
    v_event := 'promoted';
  else
    v_event := 'demoted';
  end if;

  perform public.groups_insert_system_message(
    p_conversation_id,
    v_uid,
    v_event,
    p_user_id
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- groups_transfer_ownership
-- ---------------------------------------------------------------------------

create or replace function public.groups_transfer_ownership(
  p_conversation_id uuid,
  p_user_id uuid
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

  perform public.groups_assert_group(p_conversation_id);
  perform public.groups_require_owner(p_conversation_id, v_uid);

  if p_user_id = v_uid then
    raise exception 'groups.forbidden' using errcode = 'P0001';
  end if;

  if not exists (
    select 1
    from public.conversation_members cm
    where cm.conversation_id = p_conversation_id
      and cm.user_id = p_user_id
      and cm.left_at is null
  ) then
    raise exception 'groups.user_not_found' using errcode = 'P0001';
  end if;

  update public.conversation_members cm
  set role = 'owner'
  where cm.conversation_id = p_conversation_id
    and cm.user_id = p_user_id;

  update public.conversation_members cm
  set role = 'admin'
  where cm.conversation_id = p_conversation_id
    and cm.user_id = v_uid;
end;
$$;

-- ---------------------------------------------------------------------------
-- groups_set_messaging_restricted
-- ---------------------------------------------------------------------------

create or replace function public.groups_set_messaging_restricted(
  p_conversation_id uuid,
  p_user_id uuid,
  p_restricted boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid;
  v_target_role public.member_role;
begin
  v_uid := auth.uid();
  if v_uid is null then
    raise exception 'platform.unauthenticated' using errcode = 'P0001';
  end if;

  perform public.groups_assert_group(p_conversation_id);
  perform public.groups_require_admin(p_conversation_id, v_uid);

  select cm.role
  into v_target_role
  from public.conversation_members cm
  where cm.conversation_id = p_conversation_id
    and cm.user_id = p_user_id
    and cm.left_at is null;

  if not found then
    raise exception 'groups.user_not_found' using errcode = 'P0001';
  end if;

  if v_target_role = 'owner' then
    raise exception 'groups.cannot_target_owner' using errcode = 'P0001';
  end if;

  update public.conversation_members cm
  set messaging_restricted = p_restricted
  where cm.conversation_id = p_conversation_id
    and cm.user_id = p_user_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- groups_remove_member
-- ---------------------------------------------------------------------------

create or replace function public.groups_remove_member(
  p_conversation_id uuid,
  p_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid;
  v_target_role public.member_role;
begin
  v_uid := auth.uid();
  if v_uid is null then
    raise exception 'platform.unauthenticated' using errcode = 'P0001';
  end if;

  perform public.groups_assert_group(p_conversation_id);
  perform public.groups_require_admin(p_conversation_id, v_uid);

  select cm.role
  into v_target_role
  from public.conversation_members cm
  where cm.conversation_id = p_conversation_id
    and cm.user_id = p_user_id
    and cm.left_at is null;

  if not found then
    raise exception 'groups.user_not_found' using errcode = 'P0001';
  end if;

  if v_target_role = 'owner' then
    raise exception 'groups.cannot_target_owner' using errcode = 'P0001';
  end if;

  update public.conversation_members cm
  set
    left_at = now(),
    messaging_restricted = false
  where cm.conversation_id = p_conversation_id
    and cm.user_id = p_user_id;

  perform public.groups_insert_system_message(
    p_conversation_id,
    v_uid,
    'removed',
    p_user_id
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- groups_leave
-- ---------------------------------------------------------------------------

create or replace function public.groups_leave(p_conversation_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid;
  v_role public.member_role;
begin
  v_uid := auth.uid();
  if v_uid is null then
    raise exception 'platform.unauthenticated' using errcode = 'P0001';
  end if;

  perform public.groups_assert_group(p_conversation_id);
  v_role := public.groups_assert_active_member(p_conversation_id, v_uid);

  if v_role = 'owner' then
    raise exception 'groups.owner_must_transfer' using errcode = 'P0001';
  end if;

  update public.conversation_members cm
  set
    left_at = now(),
    messaging_restricted = false
  where cm.conversation_id = p_conversation_id
    and cm.user_id = v_uid;

  perform public.groups_insert_system_message(
    p_conversation_id,
    v_uid,
    'left',
    v_uid
  );
end;
$$;

grant execute on function public.groups_create(text, text) to authenticated;
grant execute on function public.groups_update(uuid, text, text) to authenticated;
grant execute on function public.groups_set_avatar_path(uuid, text) to authenticated;
grant execute on function public.groups_get(uuid) to authenticated;
grant execute on function public.groups_list_members(uuid) to authenticated;
grant execute on function public.groups_invite_member(uuid, text) to authenticated;
grant execute on function public.groups_create_invite_link(uuid, timestamptz, integer) to authenticated;
grant execute on function public.groups_revoke_invite_link(uuid) to authenticated;
grant execute on function public.groups_join_by_code(text) to authenticated;
grant execute on function public.groups_set_role(uuid, uuid, public.member_role) to authenticated;
grant execute on function public.groups_transfer_ownership(uuid, uuid) to authenticated;
grant execute on function public.groups_set_messaging_restricted(uuid, uuid, boolean) to authenticated;
grant execute on function public.groups_remove_member(uuid, uuid) to authenticated;
grant execute on function public.groups_leave(uuid) to authenticated;
