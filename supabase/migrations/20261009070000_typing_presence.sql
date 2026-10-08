-- Typing-presence: throttled last_seen_at touch and privacy-aware presence read.

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

  if v_current is not null and v_current > p_now - interval '5 minutes' then
    return false;
  end if;

  update public.profiles
  set last_seen_at = p_now
  where id = v_uid;

  return true;
end;
$$;

create or replace function public.typing_presence_read_subject(
  p_conversation_id uuid,
  p_subject_id uuid
)
returns table (
  display_name text,
  last_seen_at timestamptz,
  presence_allowed boolean,
  show_last_seen boolean,
  last_seen_visible boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_viewer uuid := auth.uid();
  v_decision text;
  v_show_last_seen boolean;
  v_display_name text;
  v_last_seen_at timestamptz;
begin
  if v_viewer is null then
    raise exception 'platform.unauthenticated' using errcode = 'P0001';
  end if;

  if not public.is_member(p_conversation_id, v_viewer) then
    raise exception 'typing_presence.not_member' using errcode = 'P0001';
  end if;

  if not public.is_member(p_conversation_id, p_subject_id) then
    return;
  end if;

  select p.display_name, p.show_last_seen, p.last_seen_at
  into v_display_name, v_show_last_seen, v_last_seen_at
  from public.profiles p
  where p.id = p_subject_id;

  if not found then
    return;
  end if;

  v_decision := public.decide_interaction(v_viewer, p_subject_id, 'presence');
  presence_allowed := v_decision = 'allow';
  show_last_seen := v_show_last_seen;
  last_seen_visible := presence_allowed and v_show_last_seen;
  display_name := v_display_name;

  if last_seen_visible then
    last_seen_at := v_last_seen_at;
  else
    last_seen_at := null;
  end if;

  return next;
end;
$$;

revoke all on function public.typing_presence_touch_last_seen(timestamptz) from public;
revoke all on function public.typing_presence_read_subject(uuid, uuid) from public;
