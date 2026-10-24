-- Issue #225 (spec sections 4.2, 5.2, 5.3): the mailbox transport.
--
-- Envelopes are plaintext JSON for now (no crypto yet); the `ciphertext` column is bytea so
-- the same table carries real ciphertext later. Clients never write the table: they call
-- send_envelopes / fetch_mailbox / ack_envelopes. Each row is addressed to ONE e2ee device.

create table public.mailbox (
  seq bigint generated always as identity,
  id uuid primary key,
  recipient_device_id uuid not null references public.e2ee_devices (id) on delete cascade,
  sender_device_id uuid references public.e2ee_devices (id) on delete set null,
  sender_user_id uuid not null references auth.users (id) on delete cascade,
  conversation_id uuid references public.conversations (id) on delete set null,
  kind smallint not null default 0,
  ciphertext bytea not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '30 days'
);
create unique index mailbox_seq_idx on public.mailbox (seq);
create index mailbox_recipient_seq_idx on public.mailbox (recipient_device_id, seq);
create index mailbox_expires_idx on public.mailbox (expires_at);

alter table public.mailbox enable row level security;
revoke all on public.mailbox from anon, authenticated;
grant select on public.mailbox to authenticated;

-- A row is visible only to the signed-in user who owns the recipient device.
create policy mailbox_select_own_device on public.mailbox
  for select to authenticated
  using (
    exists (
      select 1 from public.e2ee_devices d
      where d.id = mailbox.recipient_device_id and d.user_id = (select auth.uid())
    )
  );

-- Internal: may p_from deliver to p_to? Same user, or (shared conversation with both still
-- members, or a message request between them) and no block either way.
create or replace function public.mailbox_can_reach(p_from uuid, p_to uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_from = p_to
    or (
      not public.is_blocked_either(p_from, p_to)
      and (
        exists (
          select 1
          from public.conversation_members a
          join public.conversation_members b on b.conversation_id = a.conversation_id
          where a.user_id = p_from and b.user_id = p_to
            and a.left_at is null and b.left_at is null
        )
        or exists (
          select 1 from public.message_requests r
          where r.status in ('pending', 'accepted')
            and ((r.from_user_id = p_from and r.to_user_id = p_to)
              or (r.from_user_id = p_to and r.to_user_id = p_from))
        )
      )
    );
$$;

-- send_envelopes: p_batch is a JSON array of
--   { id, recipient_device_id, sender_device_id, conversation_id?, kind?, ciphertext (base64) }
-- Returns one row per envelope: 'sent', 'duplicate' (same id already stored for this
-- sender), 'blocked' or 'forbidden'. Rejected rows do not fail the rest of the batch.
create or replace function public.send_envelopes(p_batch jsonb)
returns table (id uuid, status text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  e jsonb;
  v_id uuid;
  v_rcpt uuid;
  v_sender_dev uuid;
  v_conv uuid;
  v_kind smallint;
  v_data bytea;
  v_rcpt_user uuid;
  v_existing uuid;
  v_inserted integer;
begin
  if v_uid is null then
    raise exception 'platform.unauthenticated' using errcode = 'P0001';
  end if;
  if p_batch is null or pg_catalog.jsonb_typeof(p_batch) <> 'array' then
    raise exception 'e2ee.invalid_envelope' using errcode = 'P0001';
  end if;
  if pg_catalog.jsonb_array_length(p_batch) > 100 then
    raise exception 'e2ee.batch_too_large' using errcode = 'P0001';
  end if;

  for e in select x.value from pg_catalog.jsonb_array_elements(p_batch) x loop
    begin
      v_id := (e ->> 'id')::uuid;
      v_rcpt := (e ->> 'recipient_device_id')::uuid;
      v_sender_dev := (e ->> 'sender_device_id')::uuid;
      v_conv := nullif(e ->> 'conversation_id', '')::uuid;
      v_kind := coalesce((e ->> 'kind')::smallint, 0);
      v_data := pg_catalog.decode(e ->> 'ciphertext', 'base64');
    exception when others then
      raise exception 'e2ee.invalid_envelope' using errcode = 'P0001';
    end;
    if v_id is null or v_rcpt is null or v_sender_dev is null or v_data is null
       or pg_catalog.octet_length(v_data) = 0 or pg_catalog.octet_length(v_data) > 262144 then
      raise exception 'e2ee.invalid_envelope' using errcode = 'P0001';
    end if;

    -- The sender device must be the caller's own.
    perform 1 from public.e2ee_devices d where d.id = v_sender_dev and d.user_id = v_uid;
    if not found then
      raise exception 'e2ee.device_not_found' using errcode = 'P0001';
    end if;

    select d.user_id into v_rcpt_user from public.e2ee_devices d where d.id = v_rcpt;
    if v_rcpt_user is null then
      return query select v_id, 'forbidden'::text;
      continue;
    end if;
    if v_rcpt_user <> v_uid and public.is_blocked_either(v_uid, v_rcpt_user) then
      return query select v_id, 'blocked'::text;
      continue;
    end if;
    if not public.mailbox_can_reach(v_uid, v_rcpt_user) then
      return query select v_id, 'forbidden'::text;
      continue;
    end if;
    if v_conv is not null and v_rcpt_user <> v_uid then
      perform 1
      from public.conversation_members a
      join public.conversation_members b on b.conversation_id = a.conversation_id
      where a.conversation_id = v_conv and a.user_id = v_uid and b.user_id = v_rcpt_user
        and a.left_at is null and b.left_at is null;
      if not found then
        -- A message-request conversation is allowed only through the request itself.
        perform 1 from public.message_requests r
        where r.conversation_id = v_conv and r.status in ('pending', 'accepted')
          and ((r.from_user_id = v_uid and r.to_user_id = v_rcpt_user)
            or (r.from_user_id = v_rcpt_user and r.to_user_id = v_uid));
        if not found then
          return query select v_id, 'forbidden'::text;
          continue;
        end if;
      end if;
    end if;

    insert into public.mailbox
      (id, recipient_device_id, sender_device_id, sender_user_id, conversation_id, kind, ciphertext)
    values (v_id, v_rcpt, v_sender_dev, v_uid, v_conv, v_kind, v_data)
    on conflict on constraint mailbox_pkey do nothing;
    get diagnostics v_inserted = row_count;
    if v_inserted = 1 then
      return query select v_id, 'sent'::text;
    else
      select m.sender_user_id into v_existing from public.mailbox m where m.id = v_id;
      if v_existing is not distinct from v_uid then
        return query select v_id, 'duplicate'::text;
      else
        return query select v_id, 'forbidden'::text;
      end if;
    end if;
  end loop;
end;
$$;

-- fetch_mailbox: the device's rows after cursor p_after (a seq), oldest first, at most 500.
create or replace function public.fetch_mailbox(
  p_device_id uuid,
  p_after bigint default 0,
  p_limit integer default 500
)
returns table (
  seq bigint,
  id uuid,
  sender_device_id uuid,
  sender_user_id uuid,
  conversation_id uuid,
  kind smallint,
  ciphertext text,
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
  perform 1 from public.e2ee_devices d where d.id = p_device_id and d.user_id = v_uid;
  if not found then
    raise exception 'e2ee.device_not_found' using errcode = 'P0001';
  end if;
  return query
  select m.seq, m.id, m.sender_device_id, m.sender_user_id, m.conversation_id, m.kind,
         pg_catalog.replace(pg_catalog.encode(m.ciphertext, 'base64'), E'\n', ''),
         m.created_at
  from public.mailbox m
  where m.recipient_device_id = p_device_id
    and m.seq > coalesce(p_after, 0)
    and m.expires_at > now()
  order by m.seq
  limit greatest(1, least(coalesce(p_limit, 500), 500));
end;
$$;

-- ack_envelopes: deletes the device's own rows by id. Returns how many were removed.
create or replace function public.ack_envelopes(p_device_id uuid, p_ids uuid[])
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_count integer;
begin
  if v_uid is null then
    raise exception 'platform.unauthenticated' using errcode = 'P0001';
  end if;
  perform 1 from public.e2ee_devices d where d.id = p_device_id and d.user_id = v_uid;
  if not found then
    raise exception 'e2ee.device_not_found' using errcode = 'P0001';
  end if;
  delete from public.mailbox m
  where m.recipient_device_id = p_device_id
    and m.id = any (coalesce(p_ids, array[]::uuid[]));
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- Realtime rules for the device:<id> Broadcast fast path (spec 5.2). A user may join only
-- topics of its own devices and may send to devices of users it can reach.
create or replace function public.mailbox_topic_device(p_topic text)
returns uuid
language plpgsql
immutable
set search_path = ''
as $$
begin
  if p_topic like 'device:%' then
    return pg_catalog.substr(p_topic, 8)::uuid;
  end if;
  return null;
exception when others then
  return null;
end;
$$;

create or replace function public.mailbox_can_join_topic(p_topic text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_dev uuid := public.mailbox_topic_device(p_topic);
begin
  if v_uid is null or v_dev is null then
    return false;
  end if;
  return exists (select 1 from public.e2ee_devices d where d.id = v_dev and d.user_id = v_uid);
end;
$$;

create or replace function public.mailbox_can_send_topic(p_topic text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_dev uuid := public.mailbox_topic_device(p_topic);
  v_user uuid;
begin
  if v_uid is null or v_dev is null then
    return false;
  end if;
  select d.user_id into v_user from public.e2ee_devices d where d.id = v_dev;
  return v_user is not null and public.mailbox_can_reach(v_uid, v_user);
end;
$$;

-- cleanup_expired_mailbox: removes rows past expires_at. Called by pg_cron.
create or replace function public.cleanup_expired_mailbox()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  delete from public.mailbox m where m.expires_at < now();
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- mailbox_recipients: every device a message in this conversation must reach: the
-- caller's own devices plus the devices of the other active members, minus blocked users.
create or replace function public.mailbox_recipients(p_conversation_id uuid)
returns table (user_id uuid, device_id uuid, is_current_session boolean)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_sid uuid;
begin
  if v_uid is null then
    raise exception 'platform.unauthenticated' using errcode = 'P0001';
  end if;
  perform 1 from public.conversation_members m
  where m.conversation_id = p_conversation_id and m.user_id = v_uid and m.left_at is null;
  if not found then
    raise exception 'messaging.not_a_member' using errcode = 'P0001';
  end if;
  begin
    v_sid := nullif(auth.jwt() ->> 'session_id', '')::uuid;
  exception when others then
    v_sid := null;
  end;
  return query
  select d.user_id, d.id, (d.user_id = v_uid and v_sid is not null and d.session_id = v_sid)
  from public.e2ee_devices d
  where d.user_id = v_uid
     or (
       exists (
         select 1 from public.conversation_members m
         where m.conversation_id = p_conversation_id and m.user_id = d.user_id
           and m.left_at is null
       )
       and not public.is_blocked_either(v_uid, d.user_id)
     )
  order by d.created_at, d.id;
end;
$$;

-- Fast path: after a row is stored, push it to the recipient device's private topic.
-- Small envelopes travel whole; larger ones carry only the id and the client fetches the
-- row. Skipped where the realtime schema does not exist (tests); a failure never blocks
-- the insert because fetch_mailbox is the source of truth.
create or replace function public.mailbox_broadcast_new()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_payload jsonb;
begin
  if pg_catalog.to_regprocedure('realtime.send(jsonb,text,text,boolean)') is null then
    return null;
  end if;
  if pg_catalog.octet_length(new.ciphertext) <= 16384 then
    v_payload := pg_catalog.jsonb_build_object(
      'type', 'envelope',
      'envelope', pg_catalog.jsonb_build_object(
        'seq', new.seq, 'id', new.id,
        'sender_device_id', new.sender_device_id, 'sender_user_id', new.sender_user_id,
        'conversation_id', new.conversation_id, 'kind', new.kind,
        'ciphertext', pg_catalog.replace(pg_catalog.encode(new.ciphertext, 'base64'), E'\n', ''),
        'created_at', new.created_at));
  else
    v_payload := pg_catalog.jsonb_build_object('type', 'ref', 'id', new.id);
  end if;
  begin
    execute 'select realtime.send($1, $2, $3, true)'
      using v_payload, 'mailbox', 'device:' || new.recipient_device_id::text;
  exception when others then
    null;
  end;
  return null;
end;
$$;

revoke all on function public.mailbox_broadcast_new() from public, anon, authenticated;

drop trigger if exists mailbox_broadcast_after_insert on public.mailbox;
create trigger mailbox_broadcast_after_insert
  after insert on public.mailbox
  for each row execute function public.mailbox_broadcast_new();

revoke all on function public.mailbox_recipients(uuid) from public, anon;
grant execute on function public.mailbox_recipients(uuid) to authenticated;

revoke all on function public.mailbox_can_reach(uuid, uuid) from public, anon, authenticated;
revoke all on function public.send_envelopes(jsonb) from public, anon;
revoke all on function public.fetch_mailbox(uuid, bigint, integer) from public, anon;
revoke all on function public.ack_envelopes(uuid, uuid[]) from public, anon;
revoke all on function public.mailbox_topic_device(text) from public, anon;
revoke all on function public.mailbox_can_join_topic(text) from public, anon;
revoke all on function public.mailbox_can_send_topic(text) from public, anon;
revoke all on function public.cleanup_expired_mailbox() from public, anon, authenticated;
grant execute on function public.send_envelopes(jsonb) to authenticated;
grant execute on function public.fetch_mailbox(uuid, bigint, integer) to authenticated;
grant execute on function public.ack_envelopes(uuid, uuid[]) to authenticated;
grant execute on function public.mailbox_topic_device(text) to authenticated;
grant execute on function public.mailbox_can_join_topic(text) to authenticated;
grant execute on function public.mailbox_can_send_topic(text) to authenticated;

-- Realtime Authorization policies, only where the realtime schema exists (Supabase).
do $$
begin
  if to_regclass('realtime.messages') is not null then
    execute $p$
      create policy mailbox_device_receive on realtime.messages
        for select to authenticated
        using (public.mailbox_can_join_topic((select realtime.topic())))
    $p$;
    execute $p$
      create policy mailbox_device_send on realtime.messages
        for insert to authenticated
        with check (public.mailbox_can_send_topic((select realtime.topic())))
    $p$;
  end if;
exception when others then
  raise notice 'realtime policies skipped: %', sqlerrm;
end;
$$;

-- Daily cleanup, only where pg_cron is available (Supabase); a no-op elsewhere.
do $$
begin
  if exists (select 1 from pg_catalog.pg_extension where extname = 'pg_cron') then
    perform cron.schedule(
      'e2ee-cleanup-expired-mailbox',
      '37 3 * * *',
      'select public.cleanup_expired_mailbox()'
    );
  end if;
exception when others then
  raise notice 'pg_cron scheduling skipped: %', sqlerrm;
end;
$$;
