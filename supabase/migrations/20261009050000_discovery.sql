-- Discovery and contacts: search, profiles, favorites, recent searches.

-- ---------------------------------------------------------------------------
-- Helpers (security definer)
-- ---------------------------------------------------------------------------

create or replace function public.discovery_resolve_username(p_raw text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_norm text;
begin
  v_norm := public.normalize_username(p_raw);
  if not public.username_is_valid(p_raw) then
    return null;
  end if;
  return v_norm;
end;
$$;

create or replace function public.discovery_trim_recent_searches(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.recent_searches rs
  where rs.user_id = p_user_id
    and rs.id not in (
      select rs2.id
      from public.recent_searches rs2
      where rs2.user_id = p_user_id
      order by rs2.created_at desc
      limit 10
    );
end;
$$;

create or replace function public.discovery_record_recent_search(
  p_user_id uuid,
  p_normalized_username text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.recent_searches rs
  where rs.user_id = p_user_id
    and rs.normalized_username = p_normalized_username;

  insert into public.recent_searches (user_id, normalized_username)
  values (p_user_id, p_normalized_username);

  perform public.discovery_trim_recent_searches(p_user_id);
end;
$$;

create or replace function public.discovery_shared_groups(
  p_viewer_id uuid,
  p_target_id uuid
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    jsonb_agg(
      jsonb_build_object('id', g.id, 'title', g.title)
      order by g.title nulls last, g.id
    ),
    '[]'::jsonb
  )
  from (
    select distinct c.id, c.title
    from public.conversations c
    join public.conversation_members cm_v
      on cm_v.conversation_id = c.id
     and cm_v.user_id = p_viewer_id
     and cm_v.left_at is null
    join public.conversation_members cm_t
      on cm_t.conversation_id = c.id
     and cm_t.user_id = p_target_id
     and cm_t.left_at is null
    where c.type = 'group'
  ) g;
$$;

create or replace function public.discovery_build_profile_json(
  p_viewer_id uuid,
  p_target_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_profile public.profiles%rowtype;
  v_presence text := 'deny';
  v_result jsonb;
  v_favorited boolean := false;
begin
  select * into v_profile
  from public.profiles p
  where p.id = p_target_id;

  if not found then
    raise exception 'discovery.not_found' using errcode = 'P0001';
  end if;

  if p_viewer_id is not null then
    if public.decide_interaction(p_viewer_id, p_target_id, 'discover') = 'deny' then
      raise exception 'discovery.not_found' using errcode = 'P0001';
    end if;

    v_presence := public.decide_interaction(p_viewer_id, p_target_id, 'presence');

    select exists (
      select 1
      from public.favorites f
      where f.user_id = p_viewer_id
        and f.favorite_user_id = p_target_id
    ) into v_favorited;
  else
    if not v_profile.discoverable
       or v_profile.profile_visibility <> 'public'::public.profile_visibility then
      raise exception 'discovery.not_found' using errcode = 'P0001';
    end if;
  end if;

  v_result := jsonb_build_object(
    'id', v_profile.id,
    'username', v_profile.username,
    'display_name', v_profile.display_name,
    'avatar_url', v_profile.avatar_url,
    'bio', v_profile.bio
  );

  if p_viewer_id is not null then
    v_result := v_result || jsonb_build_object(
      'is_favorited', v_favorited,
      'shared_groups', public.discovery_shared_groups(p_viewer_id, p_target_id)
    );

    if v_presence = 'allow' then
      v_result := v_result || jsonb_build_object('is_online', false);
      if v_profile.show_last_seen then
        v_result := v_result || jsonb_build_object(
          'last_seen_at', v_profile.last_seen_at
        );
      end if;
    end if;
  end if;

  return v_result;
end;
$$;

-- ---------------------------------------------------------------------------
-- Search card (authenticated)
-- ---------------------------------------------------------------------------

create or replace function public.discovery_search_by_username(p_raw text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_norm text;
  v_target_id uuid;
  v_profile public.profiles%rowtype;
begin
  if v_actor is null then
    raise exception 'platform.unauthenticated' using errcode = 'P0001';
  end if;

  v_norm := public.discovery_resolve_username(p_raw);
  if v_norm is null then
    return null;
  end if;

  perform public.enforce_rate_limit('search_users');

  select p.id into v_target_id
  from public.profiles p
  where p.normalized_username = v_norm;

  if v_target_id is null then
    return null;
  end if;

  if public.decide_interaction(v_actor, v_target_id, 'discover') = 'deny' then
    return null;
  end if;

  select * into v_profile
  from public.profiles p
  where p.id = v_target_id;

  perform public.discovery_record_recent_search(v_actor, v_norm);

  return jsonb_build_object(
    'id', v_profile.id,
    'username', v_profile.username,
    'display_name', v_profile.display_name,
    'avatar_url', v_profile.avatar_url,
    'bio', v_profile.bio
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Recent searches
-- ---------------------------------------------------------------------------

create or replace function public.discovery_list_recent_searches()
returns table (
  id uuid,
  normalized_username text,
  username text,
  display_name text,
  avatar_url text,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
begin
  if v_actor is null then
    raise exception 'platform.unauthenticated' using errcode = 'P0001';
  end if;

  return query
  select
    rs.id,
    rs.normalized_username,
    coalesce(p.username, rs.normalized_username) as username,
    p.display_name,
    p.avatar_url,
    rs.created_at
  from public.recent_searches rs
  left join public.profiles p
    on p.normalized_username = rs.normalized_username
  where rs.user_id = v_actor
  order by rs.created_at desc
  limit 10;
end;
$$;

create or replace function public.discovery_clear_recent_search(p_recent_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_deleted integer;
begin
  if v_actor is null then
    raise exception 'platform.unauthenticated' using errcode = 'P0001';
  end if;

  delete from public.recent_searches rs
  where rs.id = p_recent_id
    and rs.user_id = v_actor;

  get diagnostics v_deleted = row_count;
  if v_deleted = 0 then
    raise exception 'discovery.not_found' using errcode = 'P0001';
  end if;
end;
$$;

create or replace function public.discovery_clear_all_recent_searches()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
begin
  if v_actor is null then
    raise exception 'platform.unauthenticated' using errcode = 'P0001';
  end if;

  delete from public.recent_searches rs
  where rs.user_id = v_actor;
end;
$$;

-- ---------------------------------------------------------------------------
-- Profile (authenticated + anonymous public read)
-- ---------------------------------------------------------------------------

create or replace function public.discovery_get_profile(p_username text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_norm text;
  v_target_id uuid;
  v_viewer uuid := auth.uid();
begin
  v_norm := public.discovery_resolve_username(p_username);
  if v_norm is null then
    raise exception 'discovery.not_found' using errcode = 'P0001';
  end if;

  select p.id into v_target_id
  from public.profiles p
  where p.normalized_username = v_norm;

  if v_target_id is null then
    raise exception 'discovery.not_found' using errcode = 'P0001';
  end if;

  return public.discovery_build_profile_json(v_viewer, v_target_id);
end;
$$;

revoke all on function public.discovery_get_profile(text) from public;
grant execute on function public.discovery_get_profile(text) to anon;
grant execute on function public.discovery_get_profile(text) to authenticated;

-- ---------------------------------------------------------------------------
-- Favorites
-- ---------------------------------------------------------------------------

create or replace function public.discovery_list_favorites()
returns table (
  favorite_user_id uuid,
  username text,
  display_name text,
  avatar_url text,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
begin
  if v_actor is null then
    raise exception 'platform.unauthenticated' using errcode = 'P0001';
  end if;

  return query
  select
    f.favorite_user_id,
    p.username,
    p.display_name,
    p.avatar_url,
    f.created_at
  from public.favorites f
  join public.profiles p on p.id = f.favorite_user_id
  where f.user_id = v_actor
  order by f.created_at desc;
end;
$$;

create or replace function public.discovery_favorite(p_username text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_norm text;
  v_target_id uuid;
  v_created timestamptz;
begin
  if v_actor is null then
    raise exception 'platform.unauthenticated' using errcode = 'P0001';
  end if;

  v_norm := public.discovery_resolve_username(p_username);
  if v_norm is null then
    raise exception 'discovery.not_found' using errcode = 'P0001';
  end if;

  select p.id into v_target_id
  from public.profiles p
  where p.normalized_username = v_norm;

  if v_target_id is null then
    raise exception 'discovery.not_found' using errcode = 'P0001';
  end if;

  if v_target_id = v_actor then
    raise exception 'discovery.cannot_favorite_self' using errcode = 'P0001';
  end if;

  insert into public.favorites (user_id, favorite_user_id)
  values (v_actor, v_target_id)
  on conflict (user_id, favorite_user_id) do nothing;

  select f.created_at into v_created
  from public.favorites f
  where f.user_id = v_actor
    and f.favorite_user_id = v_target_id;

  return jsonb_build_object(
    'favorite_user_id', v_target_id,
    'created_at', v_created
  );
end;
$$;

create or replace function public.discovery_unfavorite(p_username text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_norm text;
  v_target_id uuid;
  v_deleted integer;
begin
  if v_actor is null then
    raise exception 'platform.unauthenticated' using errcode = 'P0001';
  end if;

  v_norm := public.discovery_resolve_username(p_username);
  if v_norm is null then
    raise exception 'discovery.not_found' using errcode = 'P0001';
  end if;

  select p.id into v_target_id
  from public.profiles p
  where p.normalized_username = v_norm;

  if v_target_id is null then
    raise exception 'discovery.not_found' using errcode = 'P0001';
  end if;

  delete from public.favorites f
  where f.user_id = v_actor
    and f.favorite_user_id = v_target_id;

  get diagnostics v_deleted = row_count;
  if v_deleted = 0 then
    raise exception 'discovery.not_found' using errcode = 'P0001';
  end if;
end;
$$;

revoke all on function public.discovery_resolve_username(text) from public, anon, authenticated;
revoke all on function public.discovery_trim_recent_searches(uuid) from public, anon, authenticated;
revoke all on function public.discovery_record_recent_search(uuid, text) from public, anon, authenticated;
revoke all on function public.discovery_shared_groups(uuid, uuid) from public, anon, authenticated;
revoke all on function public.discovery_build_profile_json(uuid, uuid) from public, anon, authenticated;
