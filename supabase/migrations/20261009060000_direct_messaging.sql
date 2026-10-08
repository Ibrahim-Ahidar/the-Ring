-- Direct messaging: open, send, list, read cursor.

-- ---------------------------------------------------------------------------
-- Cursor helpers (internal)
-- ---------------------------------------------------------------------------

create or replace function public.messaging_base64url_to_bytea(p_encoded text)
returns bytea
language plpgsql
immutable
as $$
declare
  v_pad text;
  v_std text;
begin
  if p_encoded is null or p_encoded = '' then
    return null;
  end if;
  v_std := translate(p_encoded, '-_', '+/');
  v_pad := v_std || repeat('=', (4 - length(v_std) % 4) % 4);
  return decode(v_pad, 'base64');
end;
$$;

create or replace function public.messaging_decode_message_cursor(p_cursor text)
returns table(created_at timestamptz, message_id uuid)
language plpgsql
immutable
as $$
declare
  v_payload text;
  v_sep int;
begin
  if p_cursor is null or btrim(p_cursor) = '' then
    return;
  end if;
  v_payload := convert_from(public.messaging_base64url_to_bytea(p_cursor), 'UTF8');
  v_sep := position('|' in v_payload);
  if v_sep <= 0 then
    return;
  end if;
  created_at := substring(v_payload from 1 for v_sep - 1)::timestamptz;
  message_id := substring(v_payload from v_sep + 1)::uuid;
  return next;
end;
$$;

create or replace function public.messaging_decode_conversation_cursor(p_cursor text)
returns table(
  pinned_at timestamptz,
  last_message_at timestamptz,
  conversation_id uuid
)
language plpgsql
immutable
as $$
declare
  v_payload text;
  v_parts text[];
begin
  if p_cursor is null or btrim(p_cursor) = '' then
    return;
  end if;
  v_payload := convert_from(public.messaging_base64url_to_bytea(p_cursor), 'UTF8');
  v_parts := string_to_array(v_payload, '|');
  if coalesce(array_length(v_parts, 1), 0) < 3 then
    return;
  end if;
  if v_parts[1] = '' or v_parts[1] = 'null' then
    pinned_at := null;
  else
    pinned_at := v_parts[1]::timestamptz;
  end if;
  if v_parts[2] = '' or v_parts[2] = 'null' then
    last_message_at := null;
  else
    last_message_at := v_parts[2]::timestamptz;
  end if;
  conversation_id := v_parts[3]::uuid;
  return next;
end;
$$;

create or replace function public.messaging_unread_count(
  p_conversation_id uuid,
  p_user_id uuid
)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(count(*)::integer, 0)
  from public.messages m
  join public.conversation_members cm
    on cm.conversation_id = m.conversation_id
   and cm.user_id = p_user_id
   and cm.left_at is null
  left join public.messages cursor_msg
    on cursor_msg.id = cm.last_read_message_id
  where m.conversation_id = p_conversation_id
    and m.sender_id is distinct from p_user_id
    and m.deletion_scope <> 'everyone'
    and coalesce(m.metadata->>'upload', 'ready') = 'ready'
    and not exists (
      select 1
      from public.message_hides mh
      where mh.message_id = m.id
        and mh.user_id = p_user_id
    )
    and (
      cm.last_read_message_id is null
      or m.created_at > cursor_msg.created_at
      or (
        m.created_at = cursor_msg.created_at
        and m.id > cursor_msg.id
      )
    );
$$;

revoke all on function public.messaging_base64url_to_bytea(text) from public;
revoke all on function public.messaging_decode_message_cursor(text) from public;
revoke all on function public.messaging_decode_conversation_cursor(text) from public;
revoke all on function public.messaging_unread_count(uuid, uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- open_direct
-- ---------------------------------------------------------------------------

create or replace function public.open_direct(p_username text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid;
  v_norm text;
  v_target_id uuid;
  v_decision text;
  v_pair_key text;
  v_conversation_id uuid;
begin
  v_uid := auth.uid();
  if v_uid is null then
    raise exception 'platform.unauthenticated' using errcode = 'P0001';
  end if;

  v_norm := public.normalize_username(p_username);
  if v_norm is null or v_norm = '' then
    raise exception 'messaging.not_found' using errcode = 'P0001';
  end if;

  select p.id
  into v_target_id
  from public.profiles p
  where p.normalized_username = v_norm;

  if not found then
    raise exception 'messaging.not_found' using errcode = 'P0001';
  end if;

  if v_target_id = v_uid then
    raise exception 'messaging.not_allowed' using errcode = 'P0001';
  end if;

  v_decision := public.decide_interaction(v_uid, v_target_id, 'message');

  if v_decision = 'deny' then
    raise exception 'messaging.not_allowed' using errcode = 'P0001';
  end if;

  if v_decision = 'request' then
    raise exception 'messaging.request_required' using errcode = 'P0001';
  end if;

  v_pair_key := public.direct_pair_key(v_uid, v_target_id);

  select c.id
  into v_conversation_id
  from public.conversations c
  where c.type = 'direct'
    and c.direct_pair_key = v_pair_key;

  if found then
    return v_conversation_id;
  end if;

  perform public.enforce_rate_limit('create_conversation');

  begin
    insert into public.conversations (type, created_by, direct_pair_key)
    values ('direct', v_uid, v_pair_key)
    returning id into v_conversation_id;

    insert into public.conversation_members (conversation_id, user_id, role)
    values
      (v_conversation_id, v_uid, 'member'),
      (v_conversation_id, v_target_id, 'member');
  exception
    when unique_violation then
      select c.id
      into v_conversation_id
      from public.conversations c
      where c.type = 'direct'
        and c.direct_pair_key = v_pair_key;
      if not found then
        raise;
      end if;
  end;

  return v_conversation_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- send_text
-- ---------------------------------------------------------------------------

create or replace function public.send_text(
  p_conversation_id uuid,
  p_client_id uuid,
  p_body text,
  p_reply_to_id uuid default null
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
  v_trimmed text;
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

  perform public.enforce_rate_limit('send_message');

  select *
  into v_member
  from public.conversation_members cm
  where cm.conversation_id = p_conversation_id
    and cm.user_id = v_uid;

  if not found or v_member.left_at is not null then
    raise exception 'messaging.not_member' using errcode = 'P0001';
  end if;

  if v_member.messaging_restricted then
    raise exception 'messaging.send_not_allowed' using errcode = 'P0001';
  end if;

  if exists (
    select 1
    from public.conversations c
    join public.conversation_members peer
      on peer.conversation_id = c.id
     and peer.user_id <> v_uid
    where c.id = p_conversation_id
      and c.type = 'direct'
      and public.is_blocked_either(v_uid, peer.user_id)
  ) then
    raise exception 'messaging.send_not_allowed' using errcode = 'P0001';
  end if;

  v_trimmed := btrim(coalesce(p_body, ''));
  if v_trimmed = '' then
    raise exception 'messaging.body_required' using errcode = 'P0001';
  end if;

  if char_length(v_trimmed) > 4000 then
    raise exception 'messaging.body_too_long' using errcode = 'P0001';
  end if;

  if p_reply_to_id is not null then
    if not exists (
      select 1
      from public.messages rm
      where rm.id = p_reply_to_id
        and rm.conversation_id = p_conversation_id
    ) then
      raise exception 'messaging.reply_not_found' using errcode = 'P0001';
    end if;
  end if;

  begin
    insert into public.messages (
      conversation_id,
      sender_id,
      client_id,
      type,
      body,
      reply_to_id
    )
    values (
      p_conversation_id,
      v_uid,
      p_client_id,
      'text',
      v_trimmed,
      p_reply_to_id
    )
    returning messages.id into v_message_id;
  exception
    when unique_violation then
      -- A concurrent retry with the same client id won the insert; return its row.
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
      where m.sender_id = v_uid
        and m.client_id = p_client_id;
      return;
  end;

  update public.conversations c
  set
    last_message_id = v_message_id,
    last_message_at = (select m.created_at from public.messages m where m.id = v_message_id),
    updated_at = now()
  where c.id = p_conversation_id;

  for v_other in
    select cm.user_id
    from public.conversation_members cm
    where cm.conversation_id = p_conversation_id
      and cm.user_id <> v_uid
      and cm.left_at is null
  loop
    perform public.notify(
      v_other,
      'message.created',
      v_uid,
      v_message_id,
      p_conversation_id,
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
-- list_messages
-- ---------------------------------------------------------------------------

create or replace function public.list_messages(
  p_conversation_id uuid,
  p_cursor text default null
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
  metadata jsonb,
  attachments jsonb,
  reactions jsonb,
  has_more boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid;
  v_cursor_created timestamptz;
  v_cursor_id uuid;
  v_limit integer := 50;
begin
  v_uid := auth.uid();
  if v_uid is null then
    raise exception 'platform.unauthenticated' using errcode = 'P0001';
  end if;

  if not public.is_member(p_conversation_id, v_uid) then
    raise exception 'messaging.not_member' using errcode = 'P0001';
  end if;

  select dc.created_at, dc.message_id
  into v_cursor_created, v_cursor_id
  from public.messaging_decode_message_cursor(p_cursor) dc;

  return query
  with page as (
    select m.*
    from public.messages m
    where m.conversation_id = p_conversation_id
      and not exists (
        select 1
        from public.message_hides mh
        where mh.message_id = m.id
          and mh.user_id = v_uid
      )
      and (
        v_cursor_created is null
        or (m.created_at, m.id) < (v_cursor_created, v_cursor_id)
      )
    order by m.created_at desc, m.id desc
    limit v_limit + 1
  ),
  trimmed as (
    select *
    from page
    order by created_at desc, id desc
    limit v_limit
  )
  select
    t.id,
    t.conversation_id,
    t.sender_id,
    t.client_id,
    t.type,
    case when t.deletion_scope = 'everyone' then null else t.body end as body,
    t.reply_to_id,
    t.created_at,
    t.edited_at,
    t.deleted_at,
    t.deletion_scope,
    t.pinned_at,
    t.forwarded,
    case when t.deletion_scope = 'everyone' then '{}'::jsonb else t.metadata end as metadata,
    case
      when t.deletion_scope = 'everyone' then '[]'::jsonb
      else coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'id', a.id,
            'message_id', a.message_id,
            'storage_path', a.storage_path,
            'mime_type', a.mime_type,
            'size_bytes', a.size_bytes,
            'file_name', a.file_name,
            'width', a.width,
            'height', a.height,
            'duration_ms', a.duration_ms,
            'waveform', a.waveform,
            'created_at', a.created_at
          )
          order by a.created_at, a.id
        )
        from public.attachments a
        where a.message_id = t.id
      ), '[]'::jsonb)
    end as attachments,
    coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'message_id', r.message_id,
          'user_id', r.user_id,
          'emoji', r.emoji,
          'created_at', r.created_at
        )
        order by r.created_at, r.user_id, r.emoji
      )
      from public.message_reactions r
      where r.message_id = t.id
    ), '[]'::jsonb) as reactions,
    (select count(*) > v_limit from page) as has_more
  from trimmed t
  order by t.created_at desc, t.id desc;
end;
$$;

-- ---------------------------------------------------------------------------
-- mark_read
-- ---------------------------------------------------------------------------

create or replace function public.mark_read(
  p_conversation_id uuid,
  p_message_id uuid
)
returns table(
  last_read_message_id uuid,
  last_read_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid;
  v_target public.messages%rowtype;
  v_current_id uuid;
  v_current_created timestamptz;
begin
  v_uid := auth.uid();
  if v_uid is null then
    raise exception 'platform.unauthenticated' using errcode = 'P0001';
  end if;

  if not public.is_member(p_conversation_id, v_uid) then
    raise exception 'messaging.not_member' using errcode = 'P0001';
  end if;

  select m.*
  into v_target
  from public.messages m
  where m.id = p_message_id
    and m.conversation_id = p_conversation_id;

  if not found then
    raise exception 'messaging.not_found' using errcode = 'P0001';
  end if;

  select cm.last_read_message_id
  into v_current_id
  from public.conversation_members cm
  where cm.conversation_id = p_conversation_id
    and cm.user_id = v_uid;

  if v_current_id is not null then
    select m.created_at into v_current_created
    from public.messages m
    where m.id = v_current_id;

    if (v_target.created_at, v_target.id) <= (v_current_created, v_current_id) then
      return query
      select cm.last_read_message_id, cm.last_read_at
      from public.conversation_members cm
      where cm.conversation_id = p_conversation_id
        and cm.user_id = v_uid;
      return;
    end if;
  end if;

  update public.conversation_members cm
  set
    last_read_message_id = p_message_id,
    last_read_at = now()
  where cm.conversation_id = p_conversation_id
    and cm.user_id = v_uid;

  return query
  select cm.last_read_message_id, cm.last_read_at
  from public.conversation_members cm
  where cm.conversation_id = p_conversation_id
    and cm.user_id = v_uid;
end;
$$;

-- ---------------------------------------------------------------------------
-- get_conversation
-- ---------------------------------------------------------------------------

create or replace function public.get_conversation(p_conversation_id uuid)
returns table(
  id uuid,
  type public.conversation_type,
  title text,
  last_message_at timestamptz,
  last_message_id uuid,
  last_read_message_id uuid,
  last_read_at timestamptz,
  pinned_at timestamptz,
  archived_at timestamptz,
  muted_until timestamptz,
  other_user_id uuid,
  other_username text,
  other_display_name text,
  other_avatar_url text,
  other_last_read_message_id uuid,
  other_last_read_created_at timestamptz,
  other_send_read_receipts boolean,
  role public.member_role
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid;
  v_type public.conversation_type;
begin
  v_uid := auth.uid();
  if v_uid is null then
    raise exception 'platform.unauthenticated' using errcode = 'P0001';
  end if;

  if not public.is_member(p_conversation_id, v_uid) then
    raise exception 'messaging.not_member' using errcode = 'P0001';
  end if;

  select c.type into v_type
  from public.conversations c
  where c.id = p_conversation_id;

  return query
  select
    c.id,
    c.type,
    c.title,
    c.last_message_at,
    c.last_message_id,
    cm.last_read_message_id,
    cm.last_read_at,
    cm.pinned_at,
    cm.archived_at,
    cm.muted_until,
    other_cm.user_id as other_user_id,
    op.username as other_username,
    op.display_name as other_display_name,
    op.avatar_url as other_avatar_url,
    case when op.send_read_receipts then other_cm.last_read_message_id end as other_last_read_message_id,
    case when op.send_read_receipts then other_cursor.created_at end as other_last_read_created_at,
    op.send_read_receipts as other_send_read_receipts,
    cm.role
  from public.conversations c
  join public.conversation_members cm
    on cm.conversation_id = c.id
   and cm.user_id = v_uid
   and cm.left_at is null
  left join public.conversation_members other_cm
    on other_cm.conversation_id = c.id
   and other_cm.user_id <> v_uid
   and other_cm.left_at is null
   and c.type = 'direct'
  left join public.profiles op
    on op.id = other_cm.user_id
  left join public.messages other_cursor
    on other_cursor.id = other_cm.last_read_message_id
  where c.id = p_conversation_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- list_conversations
-- ---------------------------------------------------------------------------

create or replace function public.list_conversations(
  p_cursor text default null,
  p_include_archived boolean default false,
  p_folder_id uuid default null
)
returns table(
  id uuid,
  type public.conversation_type,
  title text,
  last_message_at timestamptz,
  last_message_id uuid,
  last_message_preview text,
  last_message_deletion_scope public.deletion_scope,
  unread_count integer,
  pinned_at timestamptz,
  archived_at timestamptz,
  muted_until timestamptz,
  other_user_id uuid,
  other_username text,
  other_display_name text,
  other_avatar_url text,
  has_more boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid;
  v_pinned timestamptz;
  v_last_at timestamptz;
  v_conv_id uuid;
  v_limit integer := 30;
begin
  v_uid := auth.uid();
  if v_uid is null then
    raise exception 'platform.unauthenticated' using errcode = 'P0001';
  end if;

  if p_folder_id is not null then
    if not exists (
      select 1
      from public.chat_folders f
      where f.id = p_folder_id
        and f.user_id = v_uid
    ) then
      raise exception 'messaging.not_found' using errcode = 'P0001';
    end if;
  end if;

  select dc.pinned_at, dc.last_message_at, dc.conversation_id
  into v_pinned, v_last_at, v_conv_id
  from public.messaging_decode_conversation_cursor(p_cursor) dc;

  return query
  with base as (
    select
      c.id,
      c.type,
      c.title,
      c.last_message_at,
      c.last_message_id,
      cm.pinned_at,
      cm.archived_at,
      cm.muted_until,
      lm.body as last_body,
      lm.deletion_scope as last_deletion_scope,
      lm.type as last_type
    from public.conversations c
    join public.conversation_members cm
      on cm.conversation_id = c.id
     and cm.user_id = v_uid
     and cm.left_at is null
    left join lateral (
      select m.body, m.deletion_scope, m.type
      from public.messages m
      where m.conversation_id = c.id
        and (
          coalesce(m.metadata->>'upload', 'ready') = 'ready'
          or m.sender_id = v_uid
        )
        and not exists (
          select 1
          from public.message_hides mh
          where mh.message_id = m.id
            and mh.user_id = v_uid
        )
      order by m.created_at desc, m.id desc
      limit 1
    ) lm on true
    where (p_include_archived or cm.archived_at is null)
      and (
        p_folder_id is null
        or exists (
          select 1
          from public.conversation_folder_items cfi
          where cfi.folder_id = p_folder_id
            and cfi.conversation_id = c.id
        )
      )
      and (
        v_conv_id is null
        or (
          case when cm.pinned_at is not null then 1 else 0 end,
          coalesce(cm.pinned_at, '-infinity'::timestamptz),
          coalesce(c.last_message_at, '-infinity'::timestamptz),
          c.id
        ) < (
          case when v_pinned is not null then 1 else 0 end,
          coalesce(v_pinned, '-infinity'::timestamptz),
          coalesce(v_last_at, '-infinity'::timestamptz),
          v_conv_id
        )
      )
    order by cm.pinned_at desc nulls last, c.last_message_at desc nulls last, c.id desc
    limit v_limit + 1
  ),
  trimmed as (
    select * from base
    order by pinned_at desc nulls last, last_message_at desc nulls last, id desc
    limit v_limit
  )
  select
    t.id,
    t.type,
    t.title,
    t.last_message_at,
    t.last_message_id,
    case
      when t.last_deletion_scope = 'everyone' then null
      when t.last_type = 'system' then null
      else t.last_body
    end as last_message_preview,
    coalesce(t.last_deletion_scope, 'none'::public.deletion_scope) as last_message_deletion_scope,
    public.messaging_unread_count(t.id, v_uid) as unread_count,
    t.pinned_at,
    t.archived_at,
    t.muted_until,
    other_cm.user_id as other_user_id,
    op.username as other_username,
    op.display_name as other_display_name,
    op.avatar_url as other_avatar_url,
    (select count(*) > v_limit from base) as has_more
  from trimmed t
  left join public.conversation_members other_cm
    on other_cm.conversation_id = t.id
   and other_cm.user_id <> v_uid
   and other_cm.left_at is null
   and t.type = 'direct'
  left join public.profiles op on op.id = other_cm.user_id
  order by t.pinned_at desc nulls last, t.last_message_at desc nulls last, t.id desc;
end;
$$;
