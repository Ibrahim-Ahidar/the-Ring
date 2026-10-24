-- Issue #254 (spec section 4.3): devices_changed is sent by the server, not by clients.
--
-- Any change to a user's device list (a device approved or added, a device removed, the
-- account key replaced) goes out as a private Broadcast event `devices_changed` on the topic
-- `devices:<recipient id>` of every contact of that user, and of the user's own devices.
-- A client listens only on its own topic; the payload names the user who changed.
-- Nobody can send on a `devices:*` topic from a client (restrictive policy below), so the
-- event cannot be forged.

-- Contacts of p_user: people sharing a conversation (both still members) or a pending or
-- accepted message request, minus anyone with a block either way. Includes p_user itself.
create or replace function public.devices_changed_recipients(p_user uuid)
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select p_user
  union
  select o.id
  from (
    select b.user_id as id
    from public.conversation_members a
    join public.conversation_members b on b.conversation_id = a.conversation_id
    where a.user_id = p_user and b.user_id <> p_user
      and a.left_at is null and b.left_at is null
    union
    select case when r.from_user_id = p_user then r.to_user_id else r.from_user_id end
    from public.message_requests r
    where r.status in ('pending', 'accepted')
      and p_user in (r.from_user_id, r.to_user_id)
  ) o
  where not public.is_blocked_either(p_user, o.id);
$$;

create or replace function public.devices_changed_send(p_user uuid, p_kind text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rcpt uuid;
  v_payload jsonb;
begin
  if pg_catalog.to_regprocedure('realtime.send(jsonb,text,text,boolean)') is null then
    return;
  end if;
  v_payload := pg_catalog.jsonb_build_object(
    'userId', p_user,
    'kind', p_kind,
    'origin', '',
    'at', (extract(epoch from pg_catalog.clock_timestamp()) * 1000)::bigint);
  for v_rcpt in select r from public.devices_changed_recipients(p_user) r loop
    begin
      execute 'select realtime.send($1, $2, $3, true)'
        using v_payload, 'devices_changed', 'devices:' || v_rcpt::text;
    exception when others then
      null;
    end;
  end loop;
end;
$$;

create or replace function public.e2ee_devices_changed_trigger()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    -- The account row goes first when a user is deleted; nobody is left to tell then.
    if exists (select 1 from auth.users u where u.id = old.user_id) then
      perform public.devices_changed_send(old.user_id, 'device_changed');
    end if;
  elsif tg_op = 'INSERT' then
    if new.approval_status = 'approved' then
      perform public.devices_changed_send(new.user_id, 'device_changed');
    end if;
  elsif old.approval_status = 'pending' and new.approval_status = 'approved' then
    perform public.devices_changed_send(new.user_id, 'device_changed');
  end if;
  return null;
end;
$$;

create or replace function public.account_key_changed_trigger()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.version > old.version then
    perform public.devices_changed_send(new.user_id, 'security_code_changed');
  end if;
  return null;
end;
$$;

revoke all on function public.devices_changed_recipients(uuid) from public, anon, authenticated;
revoke all on function public.devices_changed_send(uuid, text) from public, anon, authenticated;
revoke all on function public.e2ee_devices_changed_trigger() from public, anon, authenticated;
revoke all on function public.account_key_changed_trigger() from public, anon, authenticated;

drop trigger if exists e2ee_devices_changed_after_insert on public.e2ee_devices;
create trigger e2ee_devices_changed_after_insert
  after insert on public.e2ee_devices
  for each row execute function public.e2ee_devices_changed_trigger();

drop trigger if exists e2ee_devices_changed_after_update on public.e2ee_devices;
create trigger e2ee_devices_changed_after_update
  after update of approval_status on public.e2ee_devices
  for each row execute function public.e2ee_devices_changed_trigger();

drop trigger if exists e2ee_devices_changed_after_delete on public.e2ee_devices;
create trigger e2ee_devices_changed_after_delete
  after delete on public.e2ee_devices
  for each row execute function public.e2ee_devices_changed_trigger();

drop trigger if exists account_keys_changed_after_update on public.account_keys;
create trigger account_keys_changed_after_update
  after update of version on public.account_keys
  for each row execute function public.account_key_changed_trigger();

-- Realtime rules: a user may join only `devices:<own id>`.
create or replace function public.devices_topic_readable(p_topic text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null or p_topic is null or p_topic !~ '^devices:[0-9a-fA-F-]{36}$' then
    return false;
  end if;
  return pg_catalog.substr(p_topic, 9)::uuid = v_uid;
exception when others then
  return false;
end;
$$;

revoke all on function public.devices_topic_readable(text) from public, anon;
grant execute on function public.devices_topic_readable(text) to authenticated;

-- realtime.messages exists on Supabase but not on the PGlite test stack.
do $do$
begin
  if to_regclass('realtime.messages') is null then
    return;
  end if;

  drop policy if exists devices_topic_receive on realtime.messages;
  create policy devices_topic_receive on realtime.messages
    for select to authenticated
    using (public.devices_topic_readable((select realtime.topic())));

  -- Restrictive: no other policy can allow a client to send on a devices topic.
  drop policy if exists devices_topic_no_client_send on realtime.messages;
  create policy devices_topic_no_client_send on realtime.messages
    as restrictive
    for insert to authenticated
    with check (coalesce((select realtime.topic()), '') not like 'devices:%');
end
$do$;
