-- Media: attachment uploads, downloads, shared browser.

-- ---------------------------------------------------------------------------
-- Internal helpers (revoked from callers)
-- ---------------------------------------------------------------------------

create or replace function public.media_classify_mime(p_mime text)
returns public.message_type
language plpgsql
immutable
as $$
begin
  if p_mime in ('image/jpeg', 'image/png', 'image/webp', 'image/gif') then
    return 'image';
  end if;
  if p_mime in ('application/pdf', 'text/plain') then
    return 'file';
  end if;
  if p_mime in ('audio/webm', 'audio/ogg', 'audio/mp4', 'audio/mpeg') then
    return 'audio';
  end if;
  raise exception 'media.unsupported_type' using errcode = 'P0001';
end;
$$;

create or replace function public.media_assert_size(
  p_kind public.message_type,
  p_size_bytes bigint,
  p_duration_ms integer default null
)
returns void
language plpgsql
immutable
as $$
begin
  if p_kind = 'image' and p_size_bytes > 8388608 then
    raise exception 'media.too_large' using errcode = 'P0001';
  end if;
  if p_kind = 'file' and p_size_bytes > 20971520 then
    raise exception 'media.too_large' using errcode = 'P0001';
  end if;
  if p_kind = 'audio' then
    if p_size_bytes > 8388608 then
      raise exception 'media.too_large' using errcode = 'P0001';
    end if;
    if p_duration_ms is not null and p_duration_ms > 180000 then
      raise exception 'media.too_long' using errcode = 'P0001';
    end if;
  end if;
end;
$$;

create or replace function public.media_assert_can_send(
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
  v_left_at timestamptz;
  v_restricted boolean;
begin
  select cm.left_at, cm.messaging_restricted
  into v_left_at, v_restricted
  from public.conversation_members cm
  where cm.conversation_id = p_conversation_id
    and cm.user_id = p_uid;

  if not found or v_left_at is not null then
    raise exception 'media.not_member' using errcode = 'P0001';
  end if;

  if v_restricted then
    raise exception 'messaging.send_not_allowed' using errcode = 'P0001';
  end if;

  if exists (
    select 1
    from public.conversations c
    join public.conversation_members peer
      on peer.conversation_id = c.id
     and peer.user_id <> p_uid
    where c.id = p_conversation_id
      and c.type = 'direct'
      and public.is_blocked_either(p_uid, peer.user_id)
  ) then
    raise exception 'messaging.send_not_allowed' using errcode = 'P0001';
  end if;
end;
$$;

revoke all on function public.media_classify_mime(text) from public, anon, authenticated;
revoke all on function public.media_assert_size(public.message_type, bigint, integer) from public, anon, authenticated;
revoke all on function public.media_assert_can_send(uuid, uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- list_messages: hide pending/failed uploads from non-senders
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

-- ---------------------------------------------------------------------------
-- prepare_upload
-- ---------------------------------------------------------------------------

create or replace function public.prepare_upload(
  p_conversation_id uuid,
  p_client_id uuid,
  p_mime_type text,
  p_size_bytes bigint,
  p_file_name text default null,
  p_duration_ms integer default null
)
returns table(
  message_id uuid,
  attachment_id uuid,
  storage_path text,
  message_type public.message_type
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid;
  v_kind public.message_type;
  v_existing public.messages%rowtype;
  v_attachment public.attachments%rowtype;
  v_message_id uuid;
  v_attachment_id uuid;
  v_path text;
  v_usage bigint;
  v_pending bigint;
  v_quota bigint := 104857600;
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
    perform public.media_assert_can_send(v_existing.conversation_id, v_uid);

    select a.*
    into v_attachment
    from public.attachments a
    where a.message_id = v_existing.id
    limit 1;

    if not found then
      raise exception 'media.not_found' using errcode = 'P0001';
    end if;

    return query
    select
      v_existing.id,
      v_attachment.id,
      v_attachment.storage_path,
      v_existing.type;
    return;
  end if;

  perform public.enforce_rate_limit('start_upload');

  perform public.media_assert_can_send(p_conversation_id, v_uid);

  v_kind := public.media_classify_mime(p_mime_type);
  perform public.media_assert_size(v_kind, p_size_bytes, p_duration_ms);

  insert into public.storage_usage (user_id, bytes_used)
  values (v_uid, 0)
  on conflict (user_id) do nothing;

  select coalesce(su.bytes_used, 0)
  into v_usage
  from public.storage_usage su
  where su.user_id = v_uid
  for update;

  select coalesce(sum(a.size_bytes), 0)
  into v_pending
  from public.messages m
  join public.attachments a on a.message_id = m.id
  where m.sender_id = v_uid
    and coalesce(m.metadata->>'upload', '') = 'pending';

  if coalesce(v_usage, 0) + coalesce(v_pending, 0) + p_size_bytes > v_quota then
    raise exception 'media.quota_exceeded' using errcode = 'P0001';
  end if;

  v_path := p_conversation_id::text || '/' || gen_random_uuid()::text;

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
    v_uid,
    p_client_id,
    v_kind,
    coalesce(nullif(btrim(p_file_name), ''), v_kind::text),
    jsonb_build_object('upload', 'pending')
  )
  returning id into v_message_id;

  insert into public.attachments (
    message_id,
    storage_path,
    mime_type,
    size_bytes,
    file_name,
    duration_ms
  )
  values (
    v_message_id,
    v_path,
    p_mime_type,
    p_size_bytes,
    p_file_name,
    p_duration_ms
  )
  returning id into v_attachment_id;

  return query
  select v_message_id, v_attachment_id, v_path, v_kind;
end;
$$;

-- ---------------------------------------------------------------------------
-- complete_upload
-- ---------------------------------------------------------------------------

create or replace function public.complete_upload(
  p_message_id uuid,
  p_object_size_bytes bigint,
  p_width integer default null,
  p_height integer default null,
  p_waveform jsonb default null
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
  v_attachment public.attachments%rowtype;
  v_other uuid;
  v_upload text;
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
    raise exception 'media.not_found' using errcode = 'P0001';
  end if;

  if v_message.sender_id <> v_uid then
    raise exception 'media.not_found' using errcode = 'P0001';
  end if;

  perform public.media_assert_can_send(v_message.conversation_id, v_uid);

  v_upload := coalesce(v_message.metadata->>'upload', 'pending');
  if v_upload = 'ready' then
    return query
    select
      v_message.id,
      v_message.conversation_id,
      v_message.sender_id,
      v_message.client_id,
      v_message.type,
      v_message.body,
      v_message.reply_to_id,
      v_message.created_at,
      v_message.edited_at,
      v_message.deleted_at,
      v_message.deletion_scope,
      v_message.pinned_at,
      v_message.forwarded,
      v_message.metadata;
    return;
  end if;

  if v_upload = 'failed' then
    raise exception 'media.not_ready' using errcode = 'P0001';
  end if;

  select a.*
  into v_attachment
  from public.attachments a
  where a.message_id = p_message_id;

  if not found then
    raise exception 'media.not_found' using errcode = 'P0001';
  end if;

  if p_object_size_bytes is distinct from v_attachment.size_bytes then
    raise exception 'media.rejected' using errcode = 'P0001';
  end if;

  -- Set only by media_mark_object_verified (service role), after the server
  -- has seen the object in Storage. A direct RPC call cannot set this.
  if coalesce(v_message.metadata->>'object_verified', '') <> 'true' then
    raise exception 'media.rejected' using errcode = 'P0001';
  end if;

  if p_width is not null and (p_width < 1 or p_width > 20000) then
    raise exception 'media.rejected' using errcode = 'P0001';
  end if;
  if p_height is not null and (p_height < 1 or p_height > 20000) then
    raise exception 'media.rejected' using errcode = 'P0001';
  end if;

  perform public.enforce_rate_limit('send_message');

  update public.attachments a
  set
    width = p_width,
    height = p_height,
    waveform = p_waveform
  where a.id = v_attachment.id;

  update public.messages m
  set metadata = coalesce(m.metadata, '{}'::jsonb) || jsonb_build_object('upload', 'ready')
  where m.id = p_message_id;

  insert into public.storage_usage (user_id, bytes_used)
  values (v_uid, v_attachment.size_bytes)
  on conflict (user_id) do update
  set bytes_used = public.storage_usage.bytes_used + excluded.bytes_used;

  update public.conversations c
  set
    last_message_id = p_message_id,
    last_message_at = v_message.created_at,
    updated_at = now()
  where c.id = v_message.conversation_id;

  for v_other in
    select cm.user_id
    from public.conversation_members cm
    where cm.conversation_id = v_message.conversation_id
      and cm.user_id <> v_uid
      and cm.left_at is null
  loop
    perform public.notify(
      v_other,
      'message.created',
      v_uid,
      p_message_id,
      v_message.conversation_id,
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
  where m.id = p_message_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- media_mark_object_verified: service role only, after a storage size check
-- ---------------------------------------------------------------------------

create or replace function public.media_mark_object_verified(p_message_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'platform.forbidden' using errcode = 'P0001';
  end if;

  update public.messages m
  set metadata = coalesce(m.metadata, '{}'::jsonb) || jsonb_build_object('object_verified', true)
  where m.id = p_message_id
    and coalesce(m.metadata->>'upload', 'pending') = 'pending';

  if not found then
    raise exception 'media.not_found' using errcode = 'P0001';
  end if;
end;
$$;

revoke all on function public.media_mark_object_verified(uuid) from public, anon, authenticated;
grant execute on function public.media_mark_object_verified(uuid) to service_role;

-- ---------------------------------------------------------------------------
-- fail_upload
-- ---------------------------------------------------------------------------

create or replace function public.fail_upload(p_message_id uuid)
returns table(storage_path text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid;
  v_message public.messages%rowtype;
  v_attachment public.attachments%rowtype;
  v_upload text;
begin
  v_uid := auth.uid();
  if v_uid is null then
    raise exception 'platform.unauthenticated' using errcode = 'P0001';
  end if;

  select m.*
  into v_message
  from public.messages m
  where m.id = p_message_id;

  if not found or v_message.sender_id <> v_uid then
    raise exception 'media.not_found' using errcode = 'P0001';
  end if;

  select a.*
  into v_attachment
  from public.attachments a
  where a.message_id = p_message_id;

  if not found then
    raise exception 'media.not_found' using errcode = 'P0001';
  end if;

  v_upload := coalesce(v_message.metadata->>'upload', 'pending');
  if v_upload = 'ready' then
    raise exception 'media.not_ready' using errcode = 'P0001';
  end if;

  if v_upload = 'failed' then
    return query select v_attachment.storage_path;
    return;
  end if;

  update public.messages m
  set metadata = coalesce(m.metadata, '{}'::jsonb) || jsonb_build_object('upload', 'failed')
  where m.id = p_message_id;

  return query select v_attachment.storage_path;
end;
$$;

-- ---------------------------------------------------------------------------
-- get_message_attachments
-- ---------------------------------------------------------------------------

create or replace function public.get_message_attachments(p_message_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid;
  v_message public.messages%rowtype;
  v_upload text;
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
    raise exception 'media.not_found' using errcode = 'P0001';
  end if;

  if not public.is_member(v_message.conversation_id, v_uid) then
    raise exception 'media.not_member' using errcode = 'P0001';
  end if;

  v_upload := coalesce(v_message.metadata->>'upload', 'ready');
  if v_upload in ('pending', 'failed') and v_message.sender_id <> v_uid then
    raise exception 'media.not_found' using errcode = 'P0001';
  end if;

  if v_message.deletion_scope = 'everyone' then
    return '[]'::jsonb;
  end if;

  if exists (
    select 1
    from public.message_hides mh
    where mh.message_id = p_message_id
      and mh.user_id = v_uid
  ) then
    raise exception 'media.not_found' using errcode = 'P0001';
  end if;

  return coalesce((
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
    where a.message_id = p_message_id
  ), '[]'::jsonb);
end;
$$;

-- ---------------------------------------------------------------------------
-- get_attachment_download
-- ---------------------------------------------------------------------------

create or replace function public.get_attachment_download(p_attachment_id uuid)
returns table(
  storage_path text,
  mime_type text,
  file_name text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid;
  v_attachment public.attachments%rowtype;
  v_message public.messages%rowtype;
begin
  v_uid := auth.uid();
  if v_uid is null then
    raise exception 'platform.unauthenticated' using errcode = 'P0001';
  end if;

  select a.*
  into v_attachment
  from public.attachments a
  where a.id = p_attachment_id;

  if not found then
    raise exception 'media.not_found' using errcode = 'P0001';
  end if;

  select m.*
  into v_message
  from public.messages m
  where m.id = v_attachment.message_id;

  if not public.is_member(v_message.conversation_id, v_uid) then
    raise exception 'media.not_member' using errcode = 'P0001';
  end if;

  if v_message.deletion_scope = 'everyone' then
    raise exception 'media.not_found' using errcode = 'P0001';
  end if;

  if coalesce(v_message.metadata->>'upload', 'ready') <> 'ready' then
    raise exception 'media.not_ready' using errcode = 'P0001';
  end if;

  if exists (
    select 1
    from public.message_hides mh
    where mh.message_id = v_message.id
      and mh.user_id = v_uid
  ) then
    raise exception 'media.not_found' using errcode = 'P0001';
  end if;

  return query
  select
    v_attachment.storage_path,
    v_attachment.mime_type,
    coalesce(v_attachment.file_name, v_attachment.mime_type);
end;
$$;

-- ---------------------------------------------------------------------------
-- media_reconcile_deleted_attachments (volatile; idempotent)
-- ---------------------------------------------------------------------------

create or replace function public.media_reconcile_deleted_attachments(
  p_conversation_id uuid
)
returns setof text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid;
  v_rec record;
begin
  v_uid := auth.uid();
  if v_uid is null then
    raise exception 'platform.unauthenticated' using errcode = 'P0001';
  end if;

  if not public.is_member(p_conversation_id, v_uid) then
    raise exception 'media.not_found' using errcode = 'P0001';
  end if;

  for v_rec in
    select a.id as attachment_id, a.storage_path, a.size_bytes, m.sender_id
    from public.attachments a
    join public.messages m on m.id = a.message_id
    where m.conversation_id = p_conversation_id
      and m.deletion_scope = 'everyone'
  loop
    update public.storage_usage su
    set bytes_used = greatest(0, su.bytes_used - v_rec.size_bytes)
    where su.user_id = v_rec.sender_id;

    delete from public.attachments a
    where a.id = v_rec.attachment_id;

    return next v_rec.storage_path;
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- list_shared (read-only listing)
-- ---------------------------------------------------------------------------

create or replace function public.list_shared(
  p_conversation_id uuid,
  p_tab text,
  p_cursor text default null
)
returns table(
  item_type text,
  message_id uuid,
  attachment_id uuid,
  storage_path text,
  mime_type text,
  file_name text,
  size_bytes bigint,
  width integer,
  height integer,
  duration_ms integer,
  url text,
  created_at timestamptz,
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
  v_limit integer := 30;
begin
  v_uid := auth.uid();
  if v_uid is null then
    raise exception 'platform.unauthenticated' using errcode = 'P0001';
  end if;

  if not public.is_member(p_conversation_id, v_uid) then
    raise exception 'media.not_found' using errcode = 'P0001';
  end if;

  if p_tab not in ('media', 'files', 'links') then
    raise exception 'media.not_found' using errcode = 'P0001';
  end if;

  select dc.created_at, dc.message_id
  into v_cursor_created, v_cursor_id
  from public.messaging_decode_message_cursor(p_cursor) dc;

  if p_tab in ('media', 'files') then
    return query
    with page as (
      select
        m.id as message_id,
        a.id as attachment_id,
        a.storage_path,
        a.mime_type,
        a.file_name,
        a.size_bytes,
        a.width,
        a.height,
        a.duration_ms,
        m.created_at
      from public.messages m
      join public.attachments a on a.message_id = m.id
      where m.conversation_id = p_conversation_id
        and m.deletion_scope <> 'everyone'
        and coalesce(m.metadata->>'upload', 'ready') = 'ready'
        and not exists (
          select 1
          from public.message_hides mh
          where mh.message_id = m.id
            and mh.user_id = v_uid
        )
        and (
          (p_tab = 'media' and m.type = 'image')
          or (p_tab = 'files' and m.type = 'file')
        )
        and (
          v_cursor_created is null
          or (m.created_at, m.id) < (v_cursor_created, v_cursor_id)
        )
      order by m.created_at desc, m.id desc
      limit v_limit + 1
    ),
    trimmed as (
      select * from page order by created_at desc, message_id desc limit v_limit
    )
    select
      p_tab,
      t.message_id,
      t.attachment_id,
      t.storage_path,
      t.mime_type,
      t.file_name,
      t.size_bytes,
      t.width,
      t.height,
      t.duration_ms,
      null::text,
      t.created_at,
      (select count(*) > v_limit from page)
    from trimmed t
    order by t.created_at desc, t.message_id desc;
    return;
  end if;

  return query
  with link_rows as (
    select
      m.id as message_id,
      m.created_at,
      substring(m.body from 'https?://[^ ]+') as link_url
    from public.messages m
    where m.conversation_id = p_conversation_id
      and m.type = 'text'
      and m.deletion_scope <> 'everyone'
      and m.body ~* 'https?://'
      and not exists (
        select 1
        from public.message_hides mh
        where mh.message_id = m.id
          and mh.user_id = v_uid
      )
  ),
  page as (
    select lr.*
    from link_rows lr
    where lr.link_url is not null
      and (
        v_cursor_created is null
        or (lr.created_at, lr.message_id) < (v_cursor_created, v_cursor_id)
      )
    order by lr.created_at desc, lr.message_id desc
    limit v_limit + 1
  ),
  trimmed as (
    select p.* from page p order by p.created_at desc, p.message_id desc limit v_limit
  )
  select
    'links'::text,
    t.message_id,
    null::uuid,
    null::text,
    null::text,
    null::text,
    null::bigint,
    null::integer,
    null::integer,
    null::integer,
    t.link_url,
    t.created_at,
    (select count(*) > v_limit from page)
  from trimmed t
  order by t.created_at desc, t.message_id desc;
end;
$$;

-- ---------------------------------------------------------------------------
-- RLS: hide pending/failed uploads from non-senders (Realtime + direct SELECT)
-- ---------------------------------------------------------------------------

drop policy if exists messages_select_member on public.messages;

create policy messages_select_member
  on public.messages
  for select
  to authenticated
  using (
    public.is_member(conversation_id)
    and (
      coalesce(metadata->>'upload', 'ready') in ('ready', '')
      or sender_id = auth.uid()
    )
  );

drop policy if exists attachments_select_member on public.attachments;

create policy attachments_select_member
  on public.attachments
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.messages m
      where m.id = attachments.message_id
        and public.is_member(m.conversation_id)
        and (
          coalesce(m.metadata->>'upload', 'ready') in ('ready', '')
          or m.sender_id = auth.uid()
        )
    )
  );

-- ---------------------------------------------------------------------------
-- Explicit grants (authenticated callers)
-- ---------------------------------------------------------------------------

grant execute on function public.prepare_upload(uuid, uuid, text, bigint, text, integer) to authenticated;
grant execute on function public.complete_upload(uuid, bigint, integer, integer, jsonb) to authenticated;
grant execute on function public.fail_upload(uuid) to authenticated;
grant execute on function public.get_message_attachments(uuid) to authenticated;
grant execute on function public.get_attachment_download(uuid) to authenticated;
grant execute on function public.list_shared(uuid, text, text) to authenticated;
grant execute on function public.media_reconcile_deleted_attachments(uuid) to authenticated;
grant execute on function public.list_messages(uuid, text) to authenticated;
