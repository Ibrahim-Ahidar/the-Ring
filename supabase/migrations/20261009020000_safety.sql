-- Safety: privacy settings, blocks, and reports.

-- ---------------------------------------------------------------------------
-- get_privacy
-- ---------------------------------------------------------------------------

create or replace function public.get_privacy()
returns table (
  discoverable boolean,
  profile_visibility public.profile_visibility,
  show_last_seen boolean,
  show_online boolean,
  send_read_receipts boolean,
  who_can_message public.who_can_message,
  who_can_add_to_groups public.who_can_add_to_groups
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    p.discoverable,
    p.profile_visibility,
    p.show_last_seen,
    p.show_online,
    p.send_read_receipts,
    p.who_can_message,
    p.who_can_add_to_groups
  from public.profiles p
  where p.id = auth.uid();
$$;

-- ---------------------------------------------------------------------------
-- update_privacy
-- ---------------------------------------------------------------------------

create or replace function public.update_privacy(
  p_discoverable boolean default null,
  p_profile_visibility text default null,
  p_show_last_seen boolean default null,
  p_show_online boolean default null,
  p_send_read_receipts boolean default null,
  p_who_can_message text default null,
  p_who_can_add_to_groups text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid;
  v_vis public.profile_visibility;
  v_msg public.who_can_message;
  v_add public.who_can_add_to_groups;
begin
  v_uid := auth.uid();
  if v_uid is null then
    raise exception 'platform.unauthenticated' using errcode = 'P0001';
  end if;

  if p_discoverable is null
     and p_profile_visibility is null
     and p_show_last_seen is null
     and p_show_online is null
     and p_send_read_receipts is null
     and p_who_can_message is null
     and p_who_can_add_to_groups is null then
    raise exception 'safety.invalid_setting' using errcode = 'P0001';
  end if;

  if p_profile_visibility is not null then
    if p_profile_visibility not in ('public', 'contacts', 'private') then
      raise exception 'safety.invalid_setting' using errcode = 'P0001';
    end if;
    v_vis := p_profile_visibility::public.profile_visibility;
  end if;

  if p_who_can_message is not null then
    if p_who_can_message not in ('everyone', 'requests', 'nobody') then
      raise exception 'safety.invalid_setting' using errcode = 'P0001';
    end if;
    v_msg := p_who_can_message::public.who_can_message;
  end if;

  if p_who_can_add_to_groups is not null then
    if p_who_can_add_to_groups not in ('everyone', 'contacts', 'nobody') then
      raise exception 'safety.invalid_setting' using errcode = 'P0001';
    end if;
    v_add := p_who_can_add_to_groups::public.who_can_add_to_groups;
  end if;

  update public.profiles as prof
  set
    discoverable = coalesce(p_discoverable, prof.discoverable),
    profile_visibility = coalesce(v_vis, prof.profile_visibility),
    show_last_seen = coalesce(p_show_last_seen, prof.show_last_seen),
    show_online = coalesce(p_show_online, prof.show_online),
    send_read_receipts = coalesce(p_send_read_receipts, prof.send_read_receipts),
    who_can_message = coalesce(v_msg, prof.who_can_message),
    who_can_add_to_groups = coalesce(v_add, prof.who_can_add_to_groups)
  where prof.id = v_uid;
end;
$$;

-- ---------------------------------------------------------------------------
-- block_user
-- ---------------------------------------------------------------------------

create or replace function public.block_user(p_blocked_id uuid)
returns table (
  blocked_id uuid,
  username text,
  display_name text,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_uid uuid;
  v_blocked uuid;
begin
  v_uid := auth.uid();
  if v_uid is null then
    raise exception 'platform.unauthenticated' using errcode = 'P0001';
  end if;

  v_blocked := p_blocked_id;

  if v_blocked is null then
    raise exception 'safety.not_found' using errcode = 'P0001';
  end if;

  if v_blocked = v_uid then
    raise exception 'safety.cannot_block_self' using errcode = 'P0001';
  end if;

  if not exists (select 1 from public.profiles pr where pr.id = v_blocked) then
    raise exception 'safety.not_found' using errcode = 'P0001';
  end if;

  insert into public.blocks (blocker_id, blocked_id)
  values (v_uid, v_blocked)
  on conflict (blocker_id, blocked_id) do nothing;

  return query
  select b.blocked_id, pr.username, pr.display_name, b.created_at
  from public.blocks b
  join public.profiles pr on pr.id = b.blocked_id
  where b.blocker_id = v_uid
    and b.blocked_id = v_blocked;
end;
$$;

-- ---------------------------------------------------------------------------
-- unblock_user
-- ---------------------------------------------------------------------------

create or replace function public.unblock_user(p_blocked_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid;
  v_blocked uuid;
begin
  v_uid := auth.uid();
  if v_uid is null then
    raise exception 'platform.unauthenticated' using errcode = 'P0001';
  end if;

  v_blocked := p_blocked_id;

  delete from public.blocks b
  where b.blocker_id = v_uid
    and b.blocked_id = v_blocked;

  if not found then
    raise exception 'safety.not_found' using errcode = 'P0001';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- list_blocks
-- ---------------------------------------------------------------------------

create or replace function public.list_blocks()
returns table (
  blocked_id uuid,
  username text,
  display_name text,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    b.blocked_id,
    p.username,
    p.display_name,
    b.created_at
  from public.blocks b
  join public.profiles p on p.id = b.blocked_id
  where b.blocker_id = auth.uid()
  order by b.created_at desc;
$$;

-- ---------------------------------------------------------------------------
-- submit_report
-- ---------------------------------------------------------------------------

create or replace function public.submit_report(
  p_category text,
  p_target_user_id uuid default null,
  p_target_message_id uuid default null,
  p_details text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid;
  v_id uuid;
  v_conversation_id uuid;
begin
  v_uid := auth.uid();
  if v_uid is null then
    raise exception 'platform.unauthenticated' using errcode = 'P0001';
  end if;

  perform public.enforce_rate_limit('submit_report');

  if p_category is null
     or p_category not in ('spam', 'harassment', 'impersonation', 'other') then
    raise exception 'safety.invalid_setting' using errcode = 'P0001';
  end if;

  if p_details is not null and char_length(p_details) > 1000 then
    raise exception 'safety.invalid_setting' using errcode = 'P0001';
  end if;

  if p_target_user_id is null and p_target_message_id is null then
    raise exception 'safety.invalid_setting' using errcode = 'P0001';
  end if;

  if p_target_message_id is not null then
    select m.conversation_id
    into v_conversation_id
    from public.messages m
    where m.id = p_target_message_id;

    if not found then
      raise exception 'safety.not_found' using errcode = 'P0001';
    end if;

    if not public.is_member(v_conversation_id, v_uid) then
      raise exception 'safety.not_found' using errcode = 'P0001';
    end if;
  end if;

  if p_target_user_id is not null then
    if not exists (select 1 from public.profiles p where p.id = p_target_user_id) then
      raise exception 'safety.not_found' using errcode = 'P0001';
    end if;
  end if;

  insert into public.reports (
    reporter_id,
    target_user_id,
    target_message_id,
    category,
    details,
    status
  )
  values (
    v_uid,
    p_target_user_id,
    p_target_message_id,
    p_category,
    nullif(btrim(p_details), ''),
    'open'::public.report_status
  )
  returning id into v_id;

  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- list_my_reports
-- ---------------------------------------------------------------------------

create or replace function public.list_my_reports()
returns table (
  id uuid,
  target_user_id uuid,
  target_message_id uuid,
  category text,
  details text,
  status public.report_status,
  created_at timestamptz
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    r.id,
    r.target_user_id,
    r.target_message_id,
    r.category,
    r.details,
    r.status,
    r.created_at
  from public.reports r
  where r.reporter_id = auth.uid()
  order by r.created_at desc;
$$;

-- ---------------------------------------------------------------------------
-- list_group_reports
-- ---------------------------------------------------------------------------

create or replace function public.list_group_reports(p_conversation_id uuid)
returns table (
  id uuid,
  reporter_id uuid,
  target_user_id uuid,
  target_message_id uuid,
  category text,
  details text,
  status public.report_status,
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

  if not exists (
    select 1
    from public.conversations c
    join public.conversation_members cm on cm.conversation_id = c.id
    where c.id = p_conversation_id
      and c.type = 'group'
      and cm.user_id = v_uid
      and cm.left_at is null
      and cm.role in ('owner', 'admin')
  ) then
    raise exception 'safety.not_found' using errcode = 'P0001';
  end if;

  return query
  select
    r.id,
    r.reporter_id,
    r.target_user_id,
    r.target_message_id,
    r.category,
    r.details,
    r.status,
    r.created_at
  from public.reports r
  join public.messages m on m.id = r.target_message_id
  where m.conversation_id = p_conversation_id
  order by r.created_at desc;
end;
$$;

-- ---------------------------------------------------------------------------
-- mark_report_reviewed
-- ---------------------------------------------------------------------------

create or replace function public.mark_report_reviewed(p_report_id uuid)
returns public.report_status
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid;
  v_reporter_id uuid;
  v_message_id uuid;
  v_conversation_id uuid;
  v_allowed boolean := false;
begin
  v_uid := auth.uid();
  if v_uid is null then
    raise exception 'platform.unauthenticated' using errcode = 'P0001';
  end if;

  select r.reporter_id, r.target_message_id
  into v_reporter_id, v_message_id
  from public.reports r
  where r.id = p_report_id;

  if not found then
    raise exception 'safety.not_found' using errcode = 'P0001';
  end if;

  if v_reporter_id = v_uid then
    v_allowed := true;
  elsif v_message_id is not null then
    select m.conversation_id
    into v_conversation_id
    from public.messages m
    where m.id = v_message_id;

    if found then
      select exists (
        select 1
        from public.conversations c
        join public.conversation_members cm on cm.conversation_id = c.id
        where c.id = v_conversation_id
          and c.type = 'group'
          and cm.user_id = v_uid
          and cm.left_at is null
          and cm.role in ('owner', 'admin')
      ) into v_allowed;
    end if;
  end if;

  if not v_allowed then
    raise exception 'safety.not_found' using errcode = 'P0001';
  end if;

  update public.reports r
  set status = 'reviewed'::public.report_status
  where r.id = p_report_id;

  return 'reviewed'::public.report_status;
end;
$$;

revoke all on function public.get_privacy() from public;
revoke all on function public.update_privacy(boolean, text, boolean, boolean, boolean, text, text) from public;
revoke all on function public.block_user(uuid) from public;
revoke all on function public.unblock_user(uuid) from public;
revoke all on function public.list_blocks() from public;
revoke all on function public.submit_report(text, uuid, uuid, text) from public;
revoke all on function public.list_my_reports() from public;
revoke all on function public.list_group_reports(uuid) from public;
revoke all on function public.mark_report_reviewed(uuid) from public;

grant execute on function public.get_privacy() to authenticated;
grant execute on function public.update_privacy(boolean, text, boolean, boolean, boolean, text, text) to authenticated;
grant execute on function public.block_user(uuid) to authenticated;
grant execute on function public.unblock_user(uuid) to authenticated;
grant execute on function public.list_blocks() to authenticated;
grant execute on function public.submit_report(text, uuid, uuid, text) to authenticated;
grant execute on function public.list_my_reports() to authenticated;
grant execute on function public.list_group_reports(uuid) to authenticated;
grant execute on function public.mark_report_reviewed(uuid) to authenticated;
