-- Pulse platform ports: notify, rate limits.
--
-- Rate limiting: feature write functions should call
--   perform public.enforce_rate_limit('<action>');
-- as their first step. enforce_rate_limit raises platform.rate_limited when over.
-- consume_rate_limit is the atomic counter (internal); limit checks use fixed windows:
--   send_message 30/min, search_users 20/min, create_conversation 10/min,
--   submit_report 5/hour, start_upload 20/hour.
--
-- notify is server-only (execute revoked from authenticated). Optional p_mention is
-- reserved for notifications spec (#17); mentions_only filtering is not applied here yet.

-- ---------------------------------------------------------------------------
-- notify
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
  v_muted_until timestamptz;
begin
  if not exists (
    select 1 from public.profiles p where p.id = p_recipient_id
  ) then
    return 'notifications.recipient_missing';
  end if;

  select coalesce(np.in_app_enabled, true)
  into v_in_app_enabled
  from public.notification_preferences np
  where np.user_id = p_recipient_id;

  if not v_in_app_enabled then
    return 'notifications.skipped_disabled';
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
-- Rate limits
-- ---------------------------------------------------------------------------

create or replace function public.consume_rate_limit(
  p_user_id uuid,
  p_action text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_window_start timestamptz;
  v_limit integer;
  v_new_count integer;
begin
  case p_action
    when 'send_message' then
      v_window_start := date_trunc('minute', now());
      v_limit := 30;
    when 'search_users' then
      v_window_start := date_trunc('minute', now());
      v_limit := 20;
    when 'create_conversation' then
      v_window_start := date_trunc('minute', now());
      v_limit := 10;
    when 'submit_report' then
      v_window_start := date_trunc('hour', now());
      v_limit := 5;
    when 'start_upload' then
      v_window_start := date_trunc('hour', now());
      v_limit := 20;
    else
      raise exception 'platform.invalid_action' using errcode = 'P0001';
  end case;

  insert into public.rate_limit_counters as rlc (
    user_id,
    action,
    window_start,
    count
  )
  values (p_user_id, p_action, v_window_start, 1)
  on conflict (user_id, action, window_start)
  do update set count = rlc.count + 1
  returning count into v_new_count;

  delete from public.rate_limit_counters
  where user_id = p_user_id
    and window_start < now() - interval '2 hours';

  return v_new_count <= v_limit;
end;
$$;

create or replace function public.enforce_rate_limit(p_action text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'platform.forbidden' using errcode = 'P0001';
  end if;

  if not public.consume_rate_limit(auth.uid(), p_action) then
    raise exception 'platform.rate_limited' using errcode = 'P0001';
  end if;
end;
$$;

revoke all on function public.consume_rate_limit(uuid, text) from public;
revoke all on function public.consume_rate_limit(uuid, text) from anon;
revoke all on function public.consume_rate_limit(uuid, text) from authenticated;
grant execute on function public.consume_rate_limit(uuid, text) to service_role;

revoke all on function public.enforce_rate_limit(text) from public;
revoke all on function public.enforce_rate_limit(text) from anon;
revoke all on function public.enforce_rate_limit(text) from authenticated;
grant execute on function public.enforce_rate_limit(text) to service_role;
