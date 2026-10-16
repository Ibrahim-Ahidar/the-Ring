-- list_messages: caller-sized page (p_limit), clamped to 20..60 on the server.
-- Replaces the (uuid, text) overload so a single definition remains.

drop function if exists public.list_messages(uuid, text);

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
begin
  v_uid := auth.uid();
  v_limit := greatest(20, least(60, coalesce(p_limit, 40)));
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
