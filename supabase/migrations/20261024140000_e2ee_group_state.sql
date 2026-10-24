-- Encrypted groups (#229): the encrypted group_state blob (name, description, photo) and a
-- 256-member backstop. The server stores ciphertext only; it never learns the group state key.

create table if not exists public.group_state (
  conversation_id uuid primary key references public.conversations (id) on delete cascade,
  version integer not null default 1 check (version > 0),
  ciphertext bytea not null check (octet_length(ciphertext) <= 65536),
  updated_by_device uuid references public.e2ee_devices (id) on delete set null,
  updated_at timestamptz not null default now()
);

alter table public.group_state enable row level security;
revoke all on table public.group_state from public, anon, authenticated;

-- put_group_state: owners and admins replace the blob; returns the new version.
-- p_expected_version guards against two admins overwriting each other (0 = first write).
create or replace function public.put_group_state(
  p_conversation_id uuid,
  p_device_id uuid,
  p_ciphertext text,
  p_expected_version integer default 0
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_current integer;
  v_data bytea;
begin
  if v_uid is null then
    raise exception 'platform.unauthenticated' using errcode = 'P0001';
  end if;
  perform public.groups_assert_group(p_conversation_id);
  perform public.groups_require_admin(p_conversation_id, v_uid);
  perform 1 from public.e2ee_devices d where d.id = p_device_id and d.user_id = v_uid;
  if not found then
    raise exception 'e2ee.device_not_found' using errcode = 'P0001';
  end if;
  begin
    v_data := pg_catalog.decode(p_ciphertext, 'base64');
  exception when others then
    raise exception 'e2ee.invalid_ciphertext' using errcode = 'P0001';
  end;
  if octet_length(v_data) = 0 or octet_length(v_data) > 65536 then
    raise exception 'e2ee.invalid_ciphertext' using errcode = 'P0001';
  end if;
  select g.version into v_current from public.group_state g
  where g.conversation_id = p_conversation_id for update;
  if not found then
    if coalesce(p_expected_version, 0) <> 0 then
      raise exception 'e2ee.group_state_conflict' using errcode = 'P0001';
    end if;
    insert into public.group_state (conversation_id, version, ciphertext, updated_by_device)
    values (p_conversation_id, 1, v_data, p_device_id);
    return 1;
  end if;
  if coalesce(p_expected_version, 0) <> v_current then
    raise exception 'e2ee.group_state_conflict' using errcode = 'P0001';
  end if;
  update public.group_state
  set version = v_current + 1, ciphertext = v_data, updated_by_device = p_device_id,
      updated_at = now()
  where conversation_id = p_conversation_id;
  return v_current + 1;
end;
$$;

-- get_group_state: any active member, including a Fresh Device, reads the blob.
create or replace function public.get_group_state(p_conversation_id uuid)
returns table (version integer, ciphertext text)
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
  perform public.groups_assert_active_member(p_conversation_id, v_uid);
  return query
  select g.version,
         pg_catalog.replace(pg_catalog.encode(g.ciphertext, 'base64'), E'\n', '')
  from public.group_state g
  where g.conversation_id = p_conversation_id;
end;
$$;

-- Backstop for the 256-member cap of encrypted groups (the invite and join RPCs stop earlier).
create or replace function public.group_member_cap_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.left_at is null and (
    select count(*) from public.conversation_members m
    where m.conversation_id = new.conversation_id and m.left_at is null
      and m.user_id <> new.user_id
  ) >= 256 then
    raise exception 'groups.member_limit' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists group_member_cap on public.conversation_members;
create trigger group_member_cap
  before insert or update of left_at on public.conversation_members
  for each row execute function public.group_member_cap_guard();

revoke all on function public.put_group_state(uuid, uuid, text, integer) from public, anon;
revoke all on function public.get_group_state(uuid) from public, anon;
revoke all on function public.group_member_cap_guard() from public, anon, authenticated;
grant execute on function public.put_group_state(uuid, uuid, text, integer) to authenticated;
grant execute on function public.get_group_state(uuid) to authenticated;
