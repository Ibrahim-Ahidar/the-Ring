-- Chat list filters and archive redesign.
--
-- list_conversations: the archive flag now means "archived chats only"
-- (p_archived_only). Without it, archived chats are hidden from every list,
-- folder views included. New p_unread_only keeps only chats with unread
-- messages. Both filters run in SQL before the page limit, so keyset
-- pagination stays intact.
--
-- archived_summary: count and unread total of the caller's archived chats, for
-- the "Archived" row at the top of the chat list.

drop function if exists public.list_conversations(text, boolean, uuid, text);

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
    where (
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

revoke all on function public.list_conversations(text, boolean, uuid, text, boolean)
  from public, anon;
grant execute on function public.list_conversations(text, boolean, uuid, text, boolean)
  to authenticated;

create or replace function public.archived_summary()
returns table(chat_count integer, unread integer)
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

  return query
  select
    count(*)::integer,
    coalesce(sum(public.messaging_unread_count(cm.conversation_id, v_uid)), 0)::integer
  from public.conversation_members cm
  where cm.user_id = v_uid
    and cm.left_at is null
    and cm.archived_at is not null;
end;
$$;

revoke all on function public.archived_summary() from public, anon;
grant execute on function public.archived_summary() to authenticated;
