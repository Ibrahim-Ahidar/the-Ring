-- Global and in-conversation message search (ILIKE; pg_trgm unavailable in PGlite).

-- ---------------------------------------------------------------------------
-- Internal helpers
-- ---------------------------------------------------------------------------

create or replace function public.search_escape_ilike(p_input text)
returns text
language sql
immutable
set search_path = ''
as $$
  select replace(
    replace(
      replace(coalesce(p_input, ''), E'\\', E'\\\\'),
      '%',
      E'\\%'
    ),
    '_',
    E'\\_'
  );
$$;

create or replace function public.search_compute_snippet(p_text text, p_query text)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_lower_text text := lower(coalesce(p_text, ''));
  v_lower_query text := lower(coalesce(p_query, ''));
  v_pos int;
  v_match_start int;
  v_snippet text;
  v_start int;
  v_end int;
  v_len int;
begin
  if p_text is null or p_query is null or v_lower_query = '' then
    return jsonb_build_object('snippet', '', 'match_start', 0);
  end if;

  v_pos := position(v_lower_query in v_lower_text);
  if v_pos = 0 then
    return jsonb_build_object('snippet', left(p_text, 80), 'match_start', 0);
  end if;

  v_len := length(p_text);
  v_start := greatest(1, v_pos - 40);
  v_end := least(v_len, v_pos + char_length(p_query) + 39);
  if v_end - v_start + 1 > 80 then
    v_end := v_start + 79;
  end if;

  v_snippet := substring(p_text from v_start for v_end - v_start + 1);
  v_match_start := v_pos - v_start;
  return jsonb_build_object('snippet', v_snippet, 'match_start', v_match_start);
end;
$$;

create or replace function public.search_message_haystack(p_message_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select trim(
    both
    from coalesce(m.body, '')
      || ' '
      || coalesce((
        select string_agg(a.file_name, ' ' order by a.created_at, a.id)
        from public.attachments a
        where a.message_id = m.id
      ), '')
  )
  from public.messages m
  where m.id = p_message_id;
$$;

create or replace function public.search_message_matches(
  p_type public.message_type,
  p_body text,
  p_metadata jsonb,
  p_message_id uuid,
  p_pattern text
)
returns boolean
language plpgsql
stable
set search_path = ''
as $$
declare
  v_haystack text;
begin
  if coalesce(p_metadata->>'upload', '') = 'pending' then
    return false;
  end if;

  if p_type = 'system' then
    return coalesce(p_metadata->>'event', '') ilike p_pattern escape E'\\';
  end if;

  if p_body is not null and p_body ilike p_pattern escape E'\\' then
    return true;
  end if;

  if exists (
    select 1
    from public.attachments a
    where a.message_id = p_message_id
      and a.file_name ilike p_pattern escape E'\\'
  ) then
    return true;
  end if;

  return false;
end;
$$;

revoke all on function public.search_escape_ilike(text) from public, anon, authenticated;
revoke all on function public.search_compute_snippet(text, text) from public, anon, authenticated;
revoke all on function public.search_message_haystack(uuid) from public, anon, authenticated;
revoke all on function public.search_message_matches(public.message_type, text, jsonb, uuid, text)
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- search_global
-- ---------------------------------------------------------------------------

create or replace function public.search_global(
  p_query text,
  p_cursor text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_trim text := btrim(coalesce(p_query, ''));
  v_escaped text;
  v_pattern text;
  v_cursor_created timestamptz;
  v_cursor_id uuid;
  v_limit integer := 20;
  v_conversations jsonb := '[]'::jsonb;
  v_messages jsonb := '[]'::jsonb;
  v_has_more boolean := false;
begin
  if v_uid is null then
    raise exception 'platform.unauthenticated' using errcode = 'P0001';
  end if;

  perform public.enforce_rate_limit('search_users');

  if v_trim = '' then
    return jsonb_build_object(
      'conversations', v_conversations,
      'messages', v_messages,
      'has_more_messages', false
    );
  end if;

  v_escaped := public.search_escape_ilike(v_trim);
  v_pattern := '%' || v_escaped || '%';

  v_conversations := coalesce((
    select jsonb_agg(row_to_json(g)::jsonb order by g.sort_title nulls last, g.id)
    from (
      select
        c.id,
        c.type,
        coalesce(
          c.title,
          case when c.type = 'direct' then coalesce(op.display_name, op.username) end
        ) as title,
        case
          when c.type = 'direct' then op.username
          else null
        end as peer_username,
        coalesce(c.title, op.display_name, op.username, '') as sort_title
      from public.conversations c
      join public.conversation_members cm
        on cm.conversation_id = c.id
       and cm.user_id = v_uid
       and cm.left_at is null
      left join lateral (
        select p.username, p.display_name
        from public.conversation_members cm2
        join public.profiles p on p.id = cm2.user_id
        where cm2.conversation_id = c.id
          and cm2.user_id <> v_uid
          and cm2.left_at is null
        limit 1
      ) op on c.type = 'direct'
      where (
        (c.type = 'group' and coalesce(c.title, '') ilike v_pattern escape E'\\')
        or (
          c.type = 'direct'
          and (
            coalesce(op.display_name, '') ilike v_pattern escape E'\\'
            or coalesce(op.username, '') ilike v_pattern escape E'\\'
          )
        )
      )
      order by sort_title nulls last, c.id
      limit 20
    ) g
  ), '[]'::jsonb);

  if char_length(v_trim) < 2 then
    return jsonb_build_object(
      'conversations', v_conversations,
      'messages', v_messages,
      'has_more_messages', false
    );
  end if;

  select dc.created_at, dc.message_id
  into v_cursor_created, v_cursor_id
  from public.messaging_decode_message_cursor(p_cursor) dc;

  with candidates as (
    select
      m.id,
      m.conversation_id,
      m.created_at,
      public.search_message_haystack(m.id) as haystack
    from public.messages m
    join public.conversation_members cm
      on cm.conversation_id = m.conversation_id
     and cm.user_id = v_uid
     and cm.left_at is null
    where m.deletion_scope <> 'everyone'
      and not exists (
        select 1
        from public.message_hides mh
        where mh.message_id = m.id
          and mh.user_id = v_uid
      )
      and public.search_message_matches(
        m.type,
        m.body,
        m.metadata,
        m.id,
        v_pattern
      )
      and (
        v_cursor_created is null
        or (m.created_at, m.id) < (v_cursor_created, v_cursor_id)
      )
    order by m.created_at desc, m.id desc
    limit v_limit + 1
  ),
  page as (
    select *
    from candidates
    order by created_at desc, id desc
    limit v_limit
  )
  select
    coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'message_id', p.id,
          'conversation_id', p.conversation_id,
          'conversation_title', coalesce(
            conv.title,
            case when conv.type = 'direct' then coalesce(op.display_name, op.username) end,
            ''
          ),
          'snippet', (public.search_compute_snippet(p.haystack, v_trim)->>'snippet'),
          'match_start', (public.search_compute_snippet(p.haystack, v_trim)->>'match_start')::int,
          'created_at', p.created_at
        )
        order by p.created_at desc, p.id desc
      )
      from page p
      join public.conversations conv on conv.id = p.conversation_id
      left join lateral (
        select pr.display_name, pr.username
        from public.conversation_members cm2
        join public.profiles pr on pr.id = cm2.user_id
        where cm2.conversation_id = p.conversation_id
          and cm2.user_id <> v_uid
          and cm2.left_at is null
        limit 1
      ) op on conv.type = 'direct'
    ), '[]'::jsonb),
    (select count(*) > v_limit from candidates)
  into v_messages, v_has_more;

  return jsonb_build_object(
    'conversations', v_conversations,
    'messages', v_messages,
    'has_more_messages', coalesce(v_has_more, false)
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- search_conversation
-- ---------------------------------------------------------------------------

create or replace function public.search_conversation(
  p_conversation_id uuid,
  p_query text,
  p_cursor text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_trim text := btrim(coalesce(p_query, ''));
  v_escaped text;
  v_pattern text;
  v_cursor_created timestamptz;
  v_cursor_id uuid;
  v_limit integer := 20;
  v_messages jsonb := '[]'::jsonb;
  v_has_more boolean := false;
begin
  if v_uid is null then
    raise exception 'platform.unauthenticated' using errcode = 'P0001';
  end if;

  if not public.is_member(p_conversation_id, v_uid) then
    raise exception 'search.not_member' using errcode = 'P0001';
  end if;

  perform public.enforce_rate_limit('search_users');

  if v_trim = '' or char_length(v_trim) < 2 then
    return jsonb_build_object('messages', v_messages, 'has_more_messages', false);
  end if;

  v_escaped := public.search_escape_ilike(v_trim);
  v_pattern := '%' || v_escaped || '%';

  select dc.created_at, dc.message_id
  into v_cursor_created, v_cursor_id
  from public.messaging_decode_message_cursor(p_cursor) dc;

  with candidates as (
    select
      m.id,
      m.conversation_id,
      m.created_at,
      public.search_message_haystack(m.id) as haystack
    from public.messages m
    where m.conversation_id = p_conversation_id
      and m.deletion_scope <> 'everyone'
      and not exists (
        select 1
        from public.message_hides mh
        where mh.message_id = m.id
          and mh.user_id = v_uid
      )
      and public.search_message_matches(
        m.type,
        m.body,
        m.metadata,
        m.id,
        v_pattern
      )
      and (
        v_cursor_created is null
        or (m.created_at, m.id) < (v_cursor_created, v_cursor_id)
      )
    order by m.created_at desc, m.id desc
    limit v_limit + 1
  ),
  page as (
    select *
    from candidates
    order by created_at desc, id desc
    limit v_limit
  )
  select
    coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'message_id', p.id,
          'conversation_id', p.conversation_id,
          'snippet', (public.search_compute_snippet(p.haystack, v_trim)->>'snippet'),
          'match_start', (public.search_compute_snippet(p.haystack, v_trim)->>'match_start')::int,
          'created_at', p.created_at
        )
        order by p.created_at desc, p.id desc
      )
      from page p
    ), '[]'::jsonb),
    (select count(*) > v_limit from candidates)
  into v_messages, v_has_more;

  return jsonb_build_object(
    'messages', v_messages,
    'has_more_messages', coalesce(v_has_more, false)
  );
end;
$$;
