-- Online status from the last_seen heartbeat (#154). Realtime private joins
-- fail on this project (realtime.messages has no partitions), so a peer is
-- online when their heartbeat is under 90 seconds old. The client beats every
-- 30 seconds while visible; the server throttle drops to 25 seconds.

create or replace function public.typing_presence_touch_last_seen(
  p_now timestamptz default now()
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_current timestamptz;
begin
  if v_uid is null then
    raise exception 'platform.unauthenticated' using errcode = 'P0001';
  end if;

  select p.last_seen_at
  into v_current
  from public.profiles p
  where p.id = v_uid
  for update;

  if not found then
    raise exception 'typing_presence.profile_missing' using errcode = 'P0001';
  end if;

  if v_current is not null and v_current > p_now - interval '25 seconds' then
    return false;
  end if;

  update public.profiles
  set last_seen_at = p_now
  where id = v_uid;

  return true;
end;
$$;

-- Same gate as presence_topic_readable: shared conversation and
-- decide_interaction (blocks, show_online) must allow presence.
create or replace function public.presence_peer_online(p_subject_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select auth.uid() is not null
    and p_subject_id <> auth.uid()
    and exists (
      select 1
      from public.conversation_members a
      join public.conversation_members b
        on b.conversation_id = a.conversation_id
      where a.user_id = auth.uid() and a.left_at is null
        and b.user_id = p_subject_id and b.left_at is null
    )
    and public.decide_interaction(auth.uid(), p_subject_id, 'presence') = 'allow'
    and coalesce((
      select p.last_seen_at > now() - interval '90 seconds'
      from public.profiles p
      where p.id = p_subject_id
    ), false);
$$;

revoke all on function public.presence_peer_online(uuid) from public;
grant execute on function public.presence_peer_online(uuid) to authenticated;
