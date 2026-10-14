-- Sent / delivered / seen receipts.
--
-- `last_delivered_at` is the created_at of the newest message the member's
-- client has acknowledged receiving. `last_read_*` already covers "seen" and
-- implies delivery.

alter table public.conversation_members
  add column if not exists last_delivered_at timestamptz;

-- ---------------------------------------------------------------------------
-- mark_delivered: p_conversation_id = null acknowledges every conversation.
-- ---------------------------------------------------------------------------

create or replace function public.mark_delivered(
  p_conversation_id uuid default null
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

  update public.conversation_members cm
  set last_delivered_at = c.last_message_at
  from public.conversations c
  where c.id = cm.conversation_id
    and cm.user_id = v_uid
    and cm.left_at is null
    and (p_conversation_id is null or cm.conversation_id = p_conversation_id)
    and c.last_message_at is not null
    and (cm.last_delivered_at is null or cm.last_delivered_at < c.last_message_at);
end;
$$;

revoke execute on function public.mark_delivered(uuid) from public, anon;
grant execute on function public.mark_delivered(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- mark_read: reading a message also delivers it.
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
-- get_conversation: expose the peer's delivered cursor.
-- ---------------------------------------------------------------------------

drop function if exists public.get_conversation(uuid);

create function public.get_conversation(p_conversation_id uuid)
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
  role public.member_role,
  other_last_delivered_at timestamptz
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

  if not public.is_member(p_conversation_id, v_uid) then
    raise exception 'messaging.not_member' using errcode = 'P0001';
  end if;

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
    cm.role,
    other_cm.last_delivered_at as other_last_delivered_at
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

revoke execute on function public.get_conversation(uuid) from public, anon;
grant execute on function public.get_conversation(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- conversation_receipts: status of my latest message in each direct chat, for
-- the chat list. Only rows where the newest message is mine are returned.
-- ---------------------------------------------------------------------------

create or replace function public.conversation_receipts(p_conversation_ids uuid[])
returns table(
  conversation_id uuid,
  status text
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

  return query
  select
    c.id,
    case
      when op.send_read_receipts
       and other_cursor.id is not null
       and (other_cursor.created_at, other_cursor.id) >= (lm.created_at, lm.id)
        then 'read'
      when other_cm.last_delivered_at is not null
       and other_cm.last_delivered_at >= lm.created_at
        then 'delivered'
      else 'sent'
    end
  from public.conversations c
  join public.conversation_members cm
    on cm.conversation_id = c.id
   and cm.user_id = v_uid
   and cm.left_at is null
  join public.messages lm
    on lm.id = c.last_message_id
   and lm.sender_id = v_uid
  join public.conversation_members other_cm
    on other_cm.conversation_id = c.id
   and other_cm.user_id <> v_uid
   and other_cm.left_at is null
  left join public.profiles op
    on op.id = other_cm.user_id
  left join public.messages other_cursor
    on other_cursor.id = other_cm.last_read_message_id
  where c.id = any (p_conversation_ids)
    and c.type = 'direct';
end;
$$;

revoke execute on function public.conversation_receipts(uuid[]) from public, anon;
grant execute on function public.conversation_receipts(uuid[]) to authenticated, service_role;
