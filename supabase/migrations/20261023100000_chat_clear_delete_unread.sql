-- Per-member chat state: clear chat, delete chat for me, mark as unread.
--
-- conversation_members gains (all per member, purely additive):
--   cleared_at    messages created at or before it are hidden for that member
--   hidden_at     the chat is dropped from that member's list until a newer
--                 message arrives (delete for me also sets cleared_at)
--   manual_unread forced unread flag, cleared by mark_read / set_conversation_unread
--
-- Honoured in: messaging_unread_count, list_messages, list_conversations.

alter table public.conversation_members
  add column if not exists cleared_at timestamptz,
  add column if not exists hidden_at timestamptz,
  add column if not exists manual_unread boolean not null default false;

-- ---------------------------------------------------------------------------
-- RPCs (caller's own member row only)
-- ---------------------------------------------------------------------------

create or replace function public.clear_chat(p_conversation_id uuid)
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

  update public.conversation_members cm
  set cleared_at = now(), manual_unread = false
  where cm.conversation_id = p_conversation_id
    and cm.user_id = v_uid
    and cm.left_at is null;
end;
$$;

create or replace function public.delete_chat_for_me(p_conversation_id uuid)
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

  update public.conversation_members cm
  set cleared_at = now(),
      hidden_at = now(),
      manual_unread = false,
      pinned_at = null
  where cm.conversation_id = p_conversation_id
    and cm.user_id = v_uid
    and cm.left_at is null;
end;
$$;

create or replace function public.set_conversation_unread(
  p_conversation_id uuid,
  p_unread boolean
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

  update public.conversation_members cm
  set manual_unread = coalesce(p_unread, false)
  where cm.conversation_id = p_conversation_id
    and cm.user_id = v_uid
    and cm.left_at is null;
end;
$$;

revoke all on function public.clear_chat(uuid) from public, anon;
grant execute on function public.clear_chat(uuid) to authenticated;
revoke all on function public.delete_chat_for_me(uuid) from public, anon;
grant execute on function public.delete_chat_for_me(uuid) to authenticated;
revoke all on function public.set_conversation_unread(uuid, boolean) from public, anon;
grant execute on function public.set_conversation_unread(uuid, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- messaging_unread_count: ignore cleared messages.
-- ---------------------------------------------------------------------------

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
    and (cm.cleared_at is null or m.created_at > cm.cleared_at)
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

revoke all on function public.messaging_unread_count(uuid, uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- mark_read: also clears manual_unread (even when the cursor does not move).
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

  update public.conversation_members cm
  set manual_unread = false
  where cm.conversation_id = p_conversation_id
    and cm.user_id = v_uid
    and cm.manual_unread;

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
    last_read_at = now(),
    last_delivered_at = greatest(
      coalesce(cm.last_delivered_at, v_target.created_at),
      v_target.created_at
    )
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
-- list_conversations: manual_unread column; chats deleted for me stay hidden
-- until a newer message; previews ignore cleared messages.
-- ---------------------------------------------------------------------------

drop function if exists public.list_conversations(text, boolean, uuid, text, boolean);

create or replace function public.list_conversations(
  p_cursor text default null,
  p_archived_only boolean default false,
  p_folder_id uuid default null,
  p_type text default null,
  p_unread_only boolean default false
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
  manual_unread boolean,
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

  if p_type is not null and p_type not in ('direct', 'group') then
    raise exception 'platform.invalid_action' using errcode = 'P0001';
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
      cm.manual_unread,
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
        and (cm.cleared_at is null or m.created_at > cm.cleared_at)
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
    where (cm.hidden_at is null or c.last_message_at > cm.hidden_at)
      and (
        case when coalesce(p_archived_only, false)
          then cm.archived_at is not null
          else cm.archived_at is null
        end
      )
      and (p_type is null or c.type::text = p_type)
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
        not coalesce(p_unread_only, false)
        or public.messaging_unread_count(c.id, v_uid) > 0
        or cm.manual_unread
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
      when t.last_type is null then null
      when t.last_deletion_scope = 'everyone' then null
      when t.last_type = 'system' then null
      else t.last_body
    end as last_message_preview,
    coalesce(t.last_deletion_scope, 'none'::public.deletion_scope) as last_message_deletion_scope,
    public.messaging_unread_count(t.id, v_uid) as unread_count,
    t.pinned_at,
    t.archived_at,
    t.muted_until,
    t.manual_unread,
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

revoke all on function public.list_conversations(text, boolean, uuid, text, boolean)
  from public, anon;
grant execute on function public.list_conversations(text, boolean, uuid, text, boolean)
  to authenticated;


-- ---------------------------------------------------------------------------
-- list_messages: hide messages at or before the member's cleared_at.
-- ---------------------------------------------------------------------------

create or replace function public.list_messages(
  p_conversation_id uuid,
  p_cursor text default null,
  p_limit integer default 40
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
  v_limit integer;
  v_cleared timestamptz;
begin
  v_uid := auth.uid();
  v_limit := greatest(20, least(60, coalesce(p_limit, 40)));
  if v_uid is null then
    raise exception 'platform.unauthenticated' using errcode = 'P0001';
  end if;

  if not public.is_member(p_conversation_id, v_uid) then
    raise exception 'messaging.not_member' using errcode = 'P0001';
  end if;

  select cm.cleared_at
  into v_cleared
  from public.conversation_members cm
  where cm.conversation_id = p_conversation_id
    and cm.user_id = v_uid;

  select dc.created_at, dc.message_id
  into v_cursor_created, v_cursor_id
  from public.messaging_decode_message_cursor(p_cursor) dc;

  return query
  with page as (
    select m.*
    from public.messages m
    where m.conversation_id = p_conversation_id
      and (v_cleared is null or m.created_at > v_cleared)
      and not exists (
        select 1
        from public.message_hides mh
        where mh.message_id = m.id
          and mh.user_id = v_uid
      )
      and (
        coalesce(m.metadata->>'upload', 'ready') in ('ready', '')
        or m.sender_id = v_uid
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

revoke all on function public.list_messages(uuid, text, integer) from public, anon;
grant execute on function public.list_messages(uuid, text, integer) to authenticated;
