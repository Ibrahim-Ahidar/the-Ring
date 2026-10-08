-- Reactions: add, remove, and list emoji reactions on messages.

-- ---------------------------------------------------------------------------
-- add_reaction
-- ---------------------------------------------------------------------------

create or replace function public.add_reaction(
  p_message_id uuid,
  p_emoji text
)
returns table (
  message_id uuid,
  user_id uuid,
  emoji text,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_uid uuid;
  v_conversation_id uuid;
  v_other uuid;
  v_new_id uuid;
begin
  v_uid := auth.uid();
  if v_uid is null then
    raise exception 'platform.unauthenticated' using errcode = 'P0001';
  end if;

  if p_emoji is null
     or p_emoji not in ('👍', '❤️', '😂', '😮', '😢', '🙏') then
    raise exception 'reactions.invalid_emoji' using errcode = 'P0001';
  end if;

  select m.conversation_id
  into v_conversation_id
  from public.messages m
  where m.id = p_message_id;

  if v_conversation_id is null then
    raise exception 'messaging.not_found' using errcode = 'P0001';
  end if;

  if not public.is_member(v_conversation_id, v_uid) then
    raise exception 'messaging.not_member' using errcode = 'P0001';
  end if;

  if exists (
    select 1
    from public.conversations c
    join public.conversation_members peer
      on peer.conversation_id = c.id
     and peer.user_id <> v_uid
    where c.id = v_conversation_id
      and c.type = 'direct'
      and public.is_blocked_either(v_uid, peer.user_id)
  ) then
    raise exception 'reactions.not_allowed' using errcode = 'P0001';
  end if;

  if exists (
    select 1
    from public.messages m
    where m.id = p_message_id
      and m.deletion_scope = 'everyone'
  ) then
    raise exception 'reactions.not_allowed' using errcode = 'P0001';
  end if;

  if exists (
    select 1
    from public.message_hides mh
    where mh.message_id = p_message_id
      and mh.user_id = v_uid
  ) then
    raise exception 'reactions.not_allowed' using errcode = 'P0001';
  end if;

  insert into public.message_reactions (message_id, user_id, emoji)
  values (p_message_id, v_uid, p_emoji)
  on conflict (message_id, user_id, emoji) do nothing
  returning message_id into v_new_id;

  if found then
    for v_other in
      select cm.user_id
      from public.conversation_members cm
      where cm.conversation_id = v_conversation_id
        and cm.user_id <> v_uid
        and cm.left_at is null
    loop
      perform public.notify(
        v_other,
        'reaction.created',
        v_uid,
        p_message_id,
        v_conversation_id,
        false
      );
    end loop;
  end if;

  return query
  select
    r.message_id,
    r.user_id,
    r.emoji,
    r.created_at
  from public.message_reactions r
  where r.message_id = p_message_id
    and r.user_id = v_uid
    and r.emoji = p_emoji;
end;
$$;

-- ---------------------------------------------------------------------------
-- remove_reaction
-- ---------------------------------------------------------------------------

create or replace function public.remove_reaction(
  p_message_id uuid,
  p_emoji text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid;
  v_conversation_id uuid;
  v_deleted integer;
begin
  v_uid := auth.uid();
  if v_uid is null then
    raise exception 'platform.unauthenticated' using errcode = 'P0001';
  end if;

  if p_emoji is null
     or p_emoji not in ('👍', '❤️', '😂', '😮', '😢', '🙏') then
    raise exception 'reactions.invalid_emoji' using errcode = 'P0001';
  end if;

  select m.conversation_id
  into v_conversation_id
  from public.messages m
  where m.id = p_message_id;

  if v_conversation_id is null then
    raise exception 'messaging.not_found' using errcode = 'P0001';
  end if;

  if not public.is_member(v_conversation_id, v_uid) then
    raise exception 'messaging.not_member' using errcode = 'P0001';
  end if;

  delete from public.message_reactions r
  where r.message_id = p_message_id
    and r.user_id = v_uid
    and r.emoji = p_emoji;

  get diagnostics v_deleted = row_count;
  if v_deleted = 0 then
    raise exception 'reactions.not_found' using errcode = 'P0001';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- list_reactions
-- ---------------------------------------------------------------------------

create or replace function public.list_reactions(
  p_conversation_id uuid,
  p_message_ids uuid[]
)
returns table (
  message_id uuid,
  user_id uuid,
  emoji text,
  created_at timestamptz
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

  if p_conversation_id is null then
    raise exception 'messaging.not_found' using errcode = 'P0001';
  end if;

  if not public.is_member(p_conversation_id, v_uid) then
    raise exception 'messaging.not_member' using errcode = 'P0001';
  end if;

  if p_message_ids is null or cardinality(p_message_ids) = 0 then
    return;
  end if;

  return query
  select
    r.message_id,
    r.user_id,
    r.emoji,
    r.created_at
  from public.message_reactions r
  inner join public.messages m on m.id = r.message_id
  where m.conversation_id = p_conversation_id
    and r.message_id = any (p_message_ids)
  order by r.message_id, r.emoji, r.created_at, r.user_id;
end;
$$;
