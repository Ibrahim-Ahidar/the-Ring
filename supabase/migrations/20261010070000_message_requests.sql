-- Message requests: create, list, accept, decline.

alter table public.message_requests
  add column if not exists note text;

-- ---------------------------------------------------------------------------
-- Internal: first message from requester on accept (mirrors send_text effects)
-- ---------------------------------------------------------------------------

create or replace function public.message_requests_send_note_as_sender(
  p_conversation_id uuid,
  p_sender_id uuid,
  p_client_id uuid,
  p_body text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_trimmed text;
  v_existing_id uuid;
  v_message_id uuid;
  v_other uuid;
begin
  v_trimmed := btrim(coalesce(p_body, ''));
  if v_trimmed = '' then
    return;
  end if;

  select m.id
  into v_existing_id
  from public.messages m
  where m.sender_id = p_sender_id
    and m.client_id = p_client_id;

  if found then
    return;
  end if;

  if char_length(v_trimmed) > 4000 then
    raise exception 'messaging.body_too_long' using errcode = 'P0001';
  end if;

  if not exists (
    select 1
    from public.conversation_members cm
    where cm.conversation_id = p_conversation_id
      and cm.user_id = p_sender_id
      and cm.left_at is null
  ) then
    raise exception 'messaging.not_member' using errcode = 'P0001';
  end if;

  insert into public.messages (
    conversation_id,
    sender_id,
    client_id,
    type,
    body
  )
  values (
    p_conversation_id,
    p_sender_id,
    p_client_id,
    'text',
    v_trimmed
  )
  returning id into v_message_id;

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
      and cm.user_id <> p_sender_id
      and cm.left_at is null
  loop
    perform public.notify(
      v_other,
      'message.created',
      p_sender_id,
      v_message_id,
      p_conversation_id,
      false
    );
  end loop;
end;
$$;

revoke all on function public.message_requests_send_note_as_sender(uuid, uuid, uuid, text)
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- create_message_request
-- ---------------------------------------------------------------------------

create or replace function public.create_message_request(
  p_username text,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid;
  v_norm text;
  v_target_id uuid;
  v_decision text;
  v_note text;
  v_row public.message_requests%rowtype;
begin
  v_uid := auth.uid();
  if v_uid is null then
    raise exception 'platform.unauthenticated' using errcode = 'P0001';
  end if;

  v_norm := public.normalize_username(p_username);
  if v_norm is null or v_norm = '' then
    raise exception 'message_requests.not_found' using errcode = 'P0001';
  end if;

  select p.id
  into v_target_id
  from public.profiles p
  where p.normalized_username = v_norm;

  if not found then
    raise exception 'message_requests.not_found' using errcode = 'P0001';
  end if;

  if v_target_id = v_uid then
    raise exception 'message_requests.not_allowed' using errcode = 'P0001';
  end if;

  v_decision := public.decide_interaction(v_uid, v_target_id, 'message');

  if v_decision = 'deny' then
    raise exception 'message_requests.not_allowed' using errcode = 'P0001';
  end if;

  if v_decision = 'allow' then
    raise exception 'message_requests.not_required' using errcode = 'P0001';
  end if;

  v_note := btrim(coalesce(p_note, ''));
  if char_length(v_note) > 300 then
    raise exception 'message_requests.note_too_long' using errcode = 'P0001';
  end if;

  select mr.*
  into v_row
  from public.message_requests mr
  where mr.from_user_id = v_uid
    and mr.to_user_id = v_target_id
    and mr.status = 'pending';

  if found then
    return jsonb_build_object(
      'id', v_row.id,
      'from_user_id', v_row.from_user_id,
      'to_user_id', v_row.to_user_id,
      'conversation_id', v_row.conversation_id,
      'status', v_row.status,
      'note', v_row.note,
      'created_at', v_row.created_at
    );
  end if;

  insert into public.message_requests (
    from_user_id,
    to_user_id,
    note,
    status
  )
  values (
    v_uid,
    v_target_id,
    nullif(v_note, ''),
    'pending'
  )
  returning * into v_row;

  perform public.notify(
    v_target_id,
    'message_request.created',
    v_uid,
    v_row.id,
    null,
    false
  );

  return jsonb_build_object(
    'id', v_row.id,
    'from_user_id', v_row.from_user_id,
    'to_user_id', v_row.to_user_id,
    'conversation_id', v_row.conversation_id,
    'status', v_row.status,
    'note', v_row.note,
    'created_at', v_row.created_at
  );
exception
  when unique_violation then
    select mr.*
    into v_row
    from public.message_requests mr
    where mr.from_user_id = v_uid
      and mr.to_user_id = v_target_id
      and mr.status = 'pending';
    if not found then
      raise;
    end if;
    return jsonb_build_object(
      'id', v_row.id,
      'from_user_id', v_row.from_user_id,
      'to_user_id', v_row.to_user_id,
      'conversation_id', v_row.conversation_id,
      'status', v_row.status,
      'note', v_row.note,
      'created_at', v_row.created_at
    );
end;
$$;

-- ---------------------------------------------------------------------------
-- list_incoming_message_requests / list_outgoing_message_requests
-- ---------------------------------------------------------------------------

create or replace function public.list_incoming_message_requests()
returns table (
  id uuid,
  from_user_id uuid,
  username text,
  display_name text,
  note text,
  status public.message_request_status,
  conversation_id uuid,
  created_at timestamptz
)
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

  return query
  select
    mr.id,
    mr.from_user_id,
    p.username,
    p.display_name,
    mr.note,
    mr.status,
    mr.conversation_id,
    mr.created_at
  from public.message_requests mr
  join public.profiles p on p.id = mr.from_user_id
  where mr.to_user_id = v_uid
  order by mr.created_at desc;
end;
$$;

create or replace function public.list_outgoing_message_requests()
returns table (
  id uuid,
  to_user_id uuid,
  username text,
  display_name text,
  note text,
  status public.message_request_status,
  conversation_id uuid,
  created_at timestamptz
)
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

  return query
  select
    mr.id,
    mr.to_user_id,
    p.username,
    p.display_name,
    mr.note,
    mr.status,
    mr.conversation_id,
    mr.created_at
  from public.message_requests mr
  join public.profiles p on p.id = mr.to_user_id
  where mr.from_user_id = v_uid
  order by mr.created_at desc;
end;
$$;

create or replace function public.count_pending_incoming_message_requests()
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(count(*)::integer, 0)
  from public.message_requests mr
  where mr.to_user_id = auth.uid()
    and mr.status = 'pending';
$$;

-- ---------------------------------------------------------------------------
-- accept_message_request
-- ---------------------------------------------------------------------------

create or replace function public.accept_message_request(p_request_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid;
  v_row public.message_requests%rowtype;
  v_decision text;
  v_pair_key text;
  v_conversation_id uuid;
  v_sender_id uuid;
  v_note text;
begin
  v_uid := auth.uid();
  if v_uid is null then
    raise exception 'platform.unauthenticated' using errcode = 'P0001';
  end if;

  select mr.*
  into v_row
  from public.message_requests mr
  where mr.id = p_request_id
    and mr.to_user_id = v_uid;

  if not found then
    raise exception 'message_requests.not_found' using errcode = 'P0001';
  end if;

  if v_row.status = 'declined' then
    raise exception 'message_requests.not_found' using errcode = 'P0001';
  end if;

  if v_row.status = 'accepted' and v_row.conversation_id is not null then
    return jsonb_build_object(
      'request_id', v_row.id,
      'conversation_id', v_row.conversation_id,
      'status', v_row.status
    );
  end if;

  v_sender_id := v_row.from_user_id;

  v_decision := public.decide_interaction(v_uid, v_sender_id, 'message');
  if v_decision = 'deny' then
    raise exception 'message_requests.not_allowed' using errcode = 'P0001';
  end if;

  v_pair_key := public.direct_pair_key(v_uid, v_sender_id);

  select c.id
  into v_conversation_id
  from public.conversations c
  where c.type = 'direct'
    and c.direct_pair_key = v_pair_key;

  if not found then
    perform public.enforce_rate_limit('create_conversation');

    begin
      insert into public.conversations (type, created_by, direct_pair_key)
      values ('direct', v_uid, v_pair_key)
      returning id into v_conversation_id;

      insert into public.conversation_members (conversation_id, user_id, role)
      values
        (v_conversation_id, v_uid, 'member'),
        (v_conversation_id, v_sender_id, 'member');
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
  end if;

  v_note := coalesce(v_row.note, '');
  if btrim(v_note) <> '' then
    perform public.message_requests_send_note_as_sender(
      v_conversation_id,
      v_sender_id,
      v_row.id,
      v_note
    );
  end if;

  update public.message_requests mr
  set
    status = 'accepted',
    conversation_id = v_conversation_id
  where mr.id = v_row.id;

  perform public.notify(
    v_sender_id,
    'message_request.accepted',
    v_uid,
    v_row.id,
    v_conversation_id,
    false
  );

  return jsonb_build_object(
    'request_id', v_row.id,
    'conversation_id', v_conversation_id,
    'status', 'accepted'::public.message_request_status
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- decline_message_request
-- ---------------------------------------------------------------------------

create or replace function public.decline_message_request(p_request_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid;
  v_row public.message_requests%rowtype;
begin
  v_uid := auth.uid();
  if v_uid is null then
    raise exception 'platform.unauthenticated' using errcode = 'P0001';
  end if;

  select mr.*
  into v_row
  from public.message_requests mr
  where mr.id = p_request_id
    and mr.to_user_id = v_uid;

  if not found then
    raise exception 'message_requests.not_found' using errcode = 'P0001';
  end if;

  if v_row.status = 'declined' then
    return jsonb_build_object(
      'request_id', v_row.id,
      'status', v_row.status
    );
  end if;

  if v_row.status = 'accepted' then
    raise exception 'message_requests.not_found' using errcode = 'P0001';
  end if;

  update public.message_requests mr
  set status = 'declined'
  where mr.id = v_row.id;

  return jsonb_build_object(
    'request_id', v_row.id,
    'status', 'declined'::public.message_request_status
  );
end;
$$;
