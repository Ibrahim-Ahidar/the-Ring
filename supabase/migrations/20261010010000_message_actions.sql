-- Message actions: edit, hide, delete for everyone, forward, pin/unpin

-- ---------------------------------------------------------------------------
-- edit_message
-- ---------------------------------------------------------------------------

create or replace function public.edit_message(
  p_message_id uuid,
  p_body text
)
returns table(
  id uuid,
  conversation_id uuid,
  sender_id uuid,
  client_id uuid,
  type public.message_type,
  body text,
  reply_to_id uuid,
  created_at timestamptz,
  edited_at timestamptz,
  deleted_at timestamptz,
  deletion_scope public.deletion_scope,
  pinned_at timestamptz,
  forwarded boolean,
  metadata jsonb
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid;
  v_message public.messages%rowtype;
  v_trimmed text;
begin
  v_uid := auth.uid();
  if v_uid is null then
    raise exception 'platform.unauthenticated' using errcode = 'P0001';
  end if;

  select m.*
  into v_message
  from public.messages m
  where m.id = p_message_id;

  if not found then
    raise exception 'message_actions.not_allowed' using errcode = 'P0001';
  end if;

  if not public.is_member(v_message.conversation_id, v_uid) then
    raise exception 'message_actions.not_allowed' using errcode = 'P0001';
  end if;

  if v_message.sender_id is distinct from v_uid
     or v_message.type <> 'text'
     or v_message.deleted_at is not null
     or v_message.deletion_scope = 'everyone' then
    raise exception 'message_actions.not_allowed' using errcode = 'P0001';
  end if;

  if v_message.created_at <= now() - interval '15 minutes' then
    raise exception 'message_actions.not_allowed' using errcode = 'P0001';
  end if;

  v_trimmed := btrim(coalesce(p_body, ''));
  if v_trimmed = '' then
    raise exception 'message_actions.invalid_body' using errcode = 'P0001';
  end if;

  if char_length(v_trimmed) > 4000 then
    raise exception 'message_actions.invalid_body' using errcode = 'P0001';
  end if;

  update public.messages m
  set
    body = v_trimmed,
    edited_at = now()
  where m.id = p_message_id;

  return query
  select
    m.id,
    m.conversation_id,
    m.sender_id,
    m.client_id,
    m.type,
    m.body,
    m.reply_to_id,
    m.created_at,
    m.edited_at,
    m.deleted_at,
    m.deletion_scope,
    m.pinned_at,
    m.forwarded,
    m.metadata
  from public.messages m
  where m.id = p_message_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- hide_message (delete for me)
-- ---------------------------------------------------------------------------

create or replace function public.hide_message(p_message_id uuid)
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

  select m.conversation_id
  into v_conversation_id
  from public.messages m
  where m.id = p_message_id;

  if not found then
    raise exception 'message_actions.not_allowed' using errcode = 'P0001';
  end if;

  if not public.is_member(v_conversation_id, v_uid) then
    raise exception 'message_actions.not_allowed' using errcode = 'P0001';
  end if;

  insert into public.message_hides (message_id, user_id)
  values (p_message_id, v_uid)
  on conflict (message_id, user_id) do nothing;
end;
$$;

-- ---------------------------------------------------------------------------
-- delete_for_everyone
-- ---------------------------------------------------------------------------

create or replace function public.delete_for_everyone(p_message_id uuid)
returns table(
  id uuid,
  conversation_id uuid,
  sender_id uuid,
  client_id uuid,
  type public.message_type,
  body text,
  reply_to_id uuid,
  created_at timestamptz,
  edited_at timestamptz,
  deleted_at timestamptz,
  deletion_scope public.deletion_scope,
  pinned_at timestamptz,
  forwarded boolean,
  metadata jsonb
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid;
  v_message public.messages%rowtype;
  v_conv public.conversations%rowtype;
  v_role public.member_role;
  v_allowed boolean := false;
begin
  v_uid := auth.uid();
  if v_uid is null then
    raise exception 'platform.unauthenticated' using errcode = 'P0001';
  end if;

  select m.*
  into v_message
  from public.messages m
  where m.id = p_message_id;

  if not found then
    raise exception 'message_actions.not_allowed' using errcode = 'P0001';
  end if;

  if not public.is_member(v_message.conversation_id, v_uid) then
    raise exception 'message_actions.not_allowed' using errcode = 'P0001';
  end if;

  if v_message.deletion_scope = 'everyone' then
    return query
    select
      m.id,
      m.conversation_id,
      m.sender_id,
      m.client_id,
      m.type,
      null::text as body,
      m.reply_to_id,
      m.created_at,
      m.edited_at,
      m.deleted_at,
      m.deletion_scope,
      m.pinned_at,
      m.forwarded,
      '{}'::jsonb as metadata
    from public.messages m
    where m.id = p_message_id;
    return;
  end if;

  select c.*
  into v_conv
  from public.conversations c
  where c.id = v_message.conversation_id;

  select cm.role
  into v_role
  from public.conversation_members cm
  where cm.conversation_id = v_message.conversation_id
    and cm.user_id = v_uid
    and cm.left_at is null;

  if v_message.sender_id = v_uid
     and v_message.created_at > now() - interval '48 hours' then
    v_allowed := true;
  elsif v_conv.type = 'group' and v_role in ('admin', 'owner') then
    v_allowed := true;
  end if;

  if not v_allowed then
    raise exception 'message_actions.not_allowed' using errcode = 'P0001';
  end if;

  update public.messages m
  set
    body = null,
    metadata = '{}'::jsonb,
    deleted_at = now(),
    deletion_scope = 'everyone'
  where m.id = p_message_id;

  return query
  select
    m.id,
    m.conversation_id,
    m.sender_id,
    m.client_id,
    m.type,
    null::text as body,
    m.reply_to_id,
    m.created_at,
    m.edited_at,
    m.deleted_at,
    m.deletion_scope,
    m.pinned_at,
    m.forwarded,
    '{}'::jsonb as metadata
  from public.messages m
  where m.id = p_message_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- forward_message
-- ---------------------------------------------------------------------------

create or replace function public.forward_message(
  p_source_message_id uuid,
  p_target_conversation_id uuid,
  p_client_id uuid
)
returns table(
  id uuid,
  conversation_id uuid,
  sender_id uuid,
  client_id uuid,
  type public.message_type,
  body text,
  reply_to_id uuid,
  created_at timestamptz,
  edited_at timestamptz,
  deleted_at timestamptz,
  deletion_scope public.deletion_scope,
  pinned_at timestamptz,
  forwarded boolean,
  metadata jsonb
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid;
  v_source public.messages%rowtype;
  v_existing public.messages%rowtype;
  v_message_id uuid;
  v_member public.conversation_members%rowtype;
  v_other uuid;
begin
  v_uid := auth.uid();
  if v_uid is null then
    raise exception 'platform.unauthenticated' using errcode = 'P0001';
  end if;

  select m.*
  into v_existing
  from public.messages m
  where m.sender_id = v_uid
    and m.client_id = p_client_id;

  if found then
    return query
    select
      v_existing.id,
      v_existing.conversation_id,
      v_existing.sender_id,
      v_existing.client_id,
      v_existing.type,
      v_existing.body,
      v_existing.reply_to_id,
      v_existing.created_at,
      v_existing.edited_at,
      v_existing.deleted_at,
      v_existing.deletion_scope,
      v_existing.pinned_at,
      v_existing.forwarded,
      v_existing.metadata;
    return;
  end if;

  select m.*
  into v_source
  from public.messages m
  where m.id = p_source_message_id;

  if not found then
    raise exception 'message_actions.not_allowed' using errcode = 'P0001';
  end if;

  if not public.is_member(v_source.conversation_id, v_uid) then
    raise exception 'message_actions.not_allowed' using errcode = 'P0001';
  end if;

  if not public.is_member(p_target_conversation_id, v_uid) then
    raise exception 'message_actions.not_allowed' using errcode = 'P0001';
  end if;

  if v_source.type <> 'text'
     or v_source.deletion_scope = 'everyone'
     or v_source.body is null then
    raise exception 'message_actions.not_allowed' using errcode = 'P0001';
  end if;

  if exists (
    select 1
    from public.message_hides mh
    where mh.message_id = p_source_message_id
      and mh.user_id = v_uid
  ) then
    raise exception 'message_actions.not_allowed' using errcode = 'P0001';
  end if;

  perform public.enforce_rate_limit('send_message');

  select *
  into v_member
  from public.conversation_members cm
  where cm.conversation_id = p_target_conversation_id
    and cm.user_id = v_uid;

  if not found or v_member.left_at is not null then
    raise exception 'message_actions.not_allowed' using errcode = 'P0001';
  end if;

  if v_member.messaging_restricted then
    raise exception 'message_actions.not_allowed' using errcode = 'P0001';
  end if;

  if exists (
    select 1
    from public.conversations c
    join public.conversation_members peer
      on peer.conversation_id = c.id
     and peer.user_id <> v_uid
    where c.id = p_target_conversation_id
      and c.type = 'direct'
      and public.is_blocked_either(v_uid, peer.user_id)
  ) then
    raise exception 'message_actions.not_allowed' using errcode = 'P0001';
  end if;

  insert into public.messages (
    conversation_id,
    sender_id,
    client_id,
    type,
    body,
    forwarded
  )
  values (
    p_target_conversation_id,
    v_uid,
    p_client_id,
    'text',
    v_source.body,
    true
  )
  returning messages.id into v_message_id;

  update public.conversations c
  set
    last_message_id = v_message_id,
    last_message_at = (select m.created_at from public.messages m where m.id = v_message_id),
    updated_at = now()
  where c.id = p_target_conversation_id;

  for v_other in
    select cm.user_id
    from public.conversation_members cm
    where cm.conversation_id = p_target_conversation_id
      and cm.user_id <> v_uid
      and cm.left_at is null
  loop
    perform public.notify(
      v_other,
      'message.created',
      v_uid,
      v_message_id,
      p_target_conversation_id,
      false
    );
  end loop;

  return query
  select
    m.id,
    m.conversation_id,
    m.sender_id,
    m.client_id,
    m.type,
    m.body,
    m.reply_to_id,
    m.created_at,
    m.edited_at,
    m.deleted_at,
    m.deletion_scope,
    m.pinned_at,
    m.forwarded,
    m.metadata
  from public.messages m
  where m.id = v_message_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- pin_message / unpin_message
-- ---------------------------------------------------------------------------

create or replace function public.pin_message(p_message_id uuid)
returns table(
  id uuid,
  conversation_id uuid,
  sender_id uuid,
  client_id uuid,
  type public.message_type,
  body text,
  reply_to_id uuid,
  created_at timestamptz,
  edited_at timestamptz,
  deleted_at timestamptz,
  deletion_scope public.deletion_scope,
  pinned_at timestamptz,
  forwarded boolean,
  metadata jsonb
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid;
  v_message public.messages%rowtype;
  v_conv public.conversations%rowtype;
  v_role public.member_role;
begin
  v_uid := auth.uid();
  if v_uid is null then
    raise exception 'platform.unauthenticated' using errcode = 'P0001';
  end if;

  select m.*
  into v_message
  from public.messages m
  where m.id = p_message_id;

  if not found then
    raise exception 'message_actions.not_allowed' using errcode = 'P0001';
  end if;

  if not public.is_member(v_message.conversation_id, v_uid) then
    raise exception 'message_actions.not_allowed' using errcode = 'P0001';
  end if;

  select c.*
  into v_conv
  from public.conversations c
  where c.id = v_message.conversation_id;

  if v_conv.type = 'group' then
    select cm.role
    into v_role
    from public.conversation_members cm
    where cm.conversation_id = v_message.conversation_id
      and cm.user_id = v_uid
      and cm.left_at is null;

    if v_role is null or v_role not in ('admin', 'owner') then
      raise exception 'message_actions.not_allowed' using errcode = 'P0001';
    end if;
  end if;

  update public.messages m
  set pinned_at = now()
  where m.id = p_message_id;

  return query
  select
    m.id,
    m.conversation_id,
    m.sender_id,
    m.client_id,
    m.type,
    case when m.deletion_scope = 'everyone' then null else m.body end as body,
    m.reply_to_id,
    m.created_at,
    m.edited_at,
    m.deleted_at,
    m.deletion_scope,
    m.pinned_at,
    m.forwarded,
    case when m.deletion_scope = 'everyone' then '{}'::jsonb else m.metadata end as metadata
  from public.messages m
  where m.id = p_message_id;
end;
$$;

create or replace function public.unpin_message(p_message_id uuid)
returns table(
  id uuid,
  conversation_id uuid,
  sender_id uuid,
  client_id uuid,
  type public.message_type,
  body text,
  reply_to_id uuid,
  created_at timestamptz,
  edited_at timestamptz,
  deleted_at timestamptz,
  deletion_scope public.deletion_scope,
  pinned_at timestamptz,
  forwarded boolean,
  metadata jsonb
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid;
  v_message public.messages%rowtype;
  v_conv public.conversations%rowtype;
  v_role public.member_role;
begin
  v_uid := auth.uid();
  if v_uid is null then
    raise exception 'platform.unauthenticated' using errcode = 'P0001';
  end if;

  select m.*
  into v_message
  from public.messages m
  where m.id = p_message_id;

  if not found then
    raise exception 'message_actions.not_allowed' using errcode = 'P0001';
  end if;

  if not public.is_member(v_message.conversation_id, v_uid) then
    raise exception 'message_actions.not_allowed' using errcode = 'P0001';
  end if;

  select c.*
  into v_conv
  from public.conversations c
  where c.id = v_message.conversation_id;

  if v_conv.type = 'group' then
    select cm.role
    into v_role
    from public.conversation_members cm
    where cm.conversation_id = v_message.conversation_id
      and cm.user_id = v_uid
      and cm.left_at is null;

    if v_role is null or v_role not in ('admin', 'owner') then
      raise exception 'message_actions.not_allowed' using errcode = 'P0001';
    end if;
  end if;

  update public.messages m
  set pinned_at = null
  where m.id = p_message_id;

  return query
  select
    m.id,
    m.conversation_id,
    m.sender_id,
    m.client_id,
    m.type,
    case when m.deletion_scope = 'everyone' then null else m.body end as body,
    m.reply_to_id,
    m.created_at,
    m.edited_at,
    m.deleted_at,
    m.deletion_scope,
    m.pinned_at,
    m.forwarded,
    case when m.deletion_scope = 'everyone' then '{}'::jsonb else m.metadata end as metadata
  from public.messages m
  where m.id = p_message_id;
end;
$$;
