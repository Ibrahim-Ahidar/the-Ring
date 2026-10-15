-- Contacts = people you share a direct conversation with.
create or replace function public.discovery_list_contacts()
returns table (
  user_id uuid,
  username text,
  display_name text,
  avatar_url text,
  last_message_at timestamptz
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
    p.id,
    p.username,
    p.display_name,
    p.avatar_url,
    c.last_message_at
  from public.conversations c
  join public.conversation_members me
    on me.conversation_id = c.id and me.user_id = v_actor and me.left_at is null
  join public.conversation_members other
    on other.conversation_id = c.id and other.user_id <> v_actor
  join public.profiles p on p.id = other.user_id
  where c.type = 'direct'
  order by lower(coalesce(p.display_name, p.username));
end;
$$;

revoke all on function public.discovery_list_contacts() from public, anon;
grant execute on function public.discovery_list_contacts() to authenticated;
