-- Notifications feature: inbox reads/writes, preferences, notify mentions-only.

-- ---------------------------------------------------------------------------
-- notify (mentions-only filtering; same signature as platform_ports)
-- ---------------------------------------------------------------------------

create or replace function public.notify(
  p_recipient_id uuid,
  p_type text,
  p_actor_id uuid,
  p_entity_id uuid,
  p_conversation_id uuid default null,
  p_mention boolean default false
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_in_app_enabled boolean := true;
  v_mentions_only boolean := false;
  v_muted_until timestamptz;
begin
  if not exists (
    select 1 from public.profiles p where p.id = p_recipient_id
  ) then
    return 'notifications.recipient_missing';
  end if;

  select coalesce(np.in_app_enabled, true),
         coalesce(np.mentions_only, false)
  into v_in_app_enabled, v_mentions_only
  from public.notification_preferences np
  where np.user_id = p_recipient_id;

  if not v_in_app_enabled then
    return 'notifications.skipped_disabled';
  end if;

  if v_mentions_only and not p_mention then
    return 'notifications.skipped_mentions_only';
  end if;

  if p_conversation_id is not null then
    select cm.muted_until
    into v_muted_until
    from public.conversation_members cm
    where cm.conversation_id = p_conversation_id
      and cm.user_id = p_recipient_id
      and cm.left_at is null;

    if v_muted_until is not null and v_muted_until > now() then
      return 'notifications.skipped_muted';
    end if;
  end if;

  insert into public.notifications (
    recipient_id,
    type,
    actor_id,
    entity_id,
    conversation_id
  )
  values (
    p_recipient_id,
    p_type,
    p_actor_id,
    p_entity_id,
    p_conversation_id
  );

  return 'notifications.created';
end;
$$;

revoke all on function public.notify(uuid, text, uuid, uuid, uuid, boolean) from public;
revoke all on function public.notify(uuid, text, uuid, uuid, uuid, boolean) from anon;
revoke all on function public.notify(uuid, text, uuid, uuid, uuid, boolean) from authenticated;
grant execute on function public.notify(uuid, text, uuid, uuid, uuid, boolean) to service_role;

-- ---------------------------------------------------------------------------
-- Inbox reads (RLS-scoped invoker)
-- ---------------------------------------------------------------------------

create or replace function public.list_notifications(
  p_cursor_created_at timestamptz default null,
  p_cursor_id uuid default null
)
returns table (
  id uuid,
  type text,
  actor_id uuid,
  actor_username text,
  entity_id uuid,
  conversation_id uuid,
  read_at timestamptz,
  created_at timestamptz
)
language sql
security invoker
set search_path = ''
stable
as $$
  select
    n.id,
    n.type,
    n.actor_id,
    p.username as actor_username,
    n.entity_id,
    n.conversation_id,
    n.read_at,
    n.created_at
  from public.notifications n
  left join public.profiles p on p.id = n.actor_id
  where n.recipient_id = auth.uid()
    and (
      p_cursor_created_at is null
      or (n.created_at, n.id) < (p_cursor_created_at, p_cursor_id)
    )
  order by n.created_at desc, n.id desc
  limit 30;
$$;

create or replace function public.get_notifications_unread_count()
returns integer
language sql
security invoker
set search_path = ''
stable
as $$
  select count(*)::integer
  from public.notifications n
  where n.recipient_id = auth.uid()
    and n.read_at is null;
$$;

-- ---------------------------------------------------------------------------
-- Inbox writes (security definer)
-- ---------------------------------------------------------------------------

create or replace function public.mark_notification_read(p_notification_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'platform.unauthenticated' using errcode = 'P0001';
  end if;

  update public.notifications n
  set read_at = coalesce(n.read_at, now())
  where n.id = p_notification_id
    and n.recipient_id = auth.uid();

  if not found then
    raise exception 'notifications.not_found' using errcode = 'P0001';
  end if;
end;
$$;

create or replace function public.mark_all_notifications_read()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'platform.unauthenticated' using errcode = 'P0001';
  end if;

  update public.notifications n
  set read_at = now()
  where n.recipient_id = auth.uid()
    and n.read_at is null;
end;
$$;

-- ---------------------------------------------------------------------------
-- Preferences
-- ---------------------------------------------------------------------------

create or replace function public.get_notification_preferences()
returns table (
  in_app_enabled boolean,
  push_enabled boolean,
  mentions_only boolean
)
language sql
security invoker
set search_path = ''
stable
as $$
  select
    coalesce(np.in_app_enabled, true) as in_app_enabled,
    coalesce(np.push_enabled, false) as push_enabled,
    coalesce(np.mentions_only, false) as mentions_only
  from (select auth.uid() as uid) caller
  left join public.notification_preferences np on np.user_id = caller.uid;
$$;

create or replace function public.upsert_notification_preferences(
  p_in_app_enabled boolean,
  p_push_enabled boolean,
  p_mentions_only boolean
)
returns table (
  in_app_enabled boolean,
  push_enabled boolean,
  mentions_only boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'platform.unauthenticated' using errcode = 'P0001';
  end if;

  insert into public.notification_preferences as np (
    user_id,
    in_app_enabled,
    push_enabled,
    mentions_only
  )
  values (
    v_uid,
    p_in_app_enabled,
    p_push_enabled,
    p_mentions_only
  )
  on conflict (user_id) do update
  set
    in_app_enabled = excluded.in_app_enabled,
    push_enabled = excluded.push_enabled,
    mentions_only = excluded.mentions_only;

  return query
  select
    np.in_app_enabled,
    np.push_enabled,
    np.mentions_only
  from public.notification_preferences np
  where np.user_id = v_uid;
end;
$$;
