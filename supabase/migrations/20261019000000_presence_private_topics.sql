-- Per-user private presence topics (#147).
-- Each user tracks only on `presence:user:<own id>`. A viewer may subscribe to
-- another user's topic only when they share a conversation and
-- decide_interaction(viewer, subject, 'presence') = 'allow' (blocks and the
-- subject's show_online setting). The old public `presence:global` topic is no
-- longer used by the client.

create or replace function public.presence_topic_subject(p_topic text)
returns uuid
language plpgsql
immutable
set search_path = ''
as $$
begin
  if p_topic is null or p_topic !~ '^presence:user:[0-9a-fA-F-]{36}$' then
    return null;
  end if;
  return substring(p_topic from 15)::uuid;
exception when others then
  return null;
end;
$$;

create or replace function public.presence_topic_readable(p_topic text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when s.id is null or auth.uid() is null then false
    when s.id = auth.uid() then true
    else exists (
      select 1
      from public.conversation_members a
      join public.conversation_members b
        on b.conversation_id = a.conversation_id
      where a.user_id = auth.uid() and b.user_id = s.id
    ) and public.decide_interaction(auth.uid(), s.id, 'presence') = 'allow'
  end
  from (select public.presence_topic_subject(p_topic) as id) s;
$$;

revoke all on function public.presence_topic_subject(text) from public;
revoke all on function public.presence_topic_readable(text) from public;
grant execute on function public.presence_topic_subject(text) to authenticated;
grant execute on function public.presence_topic_readable(text) to authenticated;

drop policy if exists presence_user_topic_read on realtime.messages;
create policy presence_user_topic_read on realtime.messages
  for select to authenticated
  using (
    extension = 'presence'
    and public.presence_topic_readable(realtime.topic())
  );

drop policy if exists presence_user_topic_write on realtime.messages;
create policy presence_user_topic_write on realtime.messages
  for insert to authenticated
  with check (
    extension = 'presence'
    and public.presence_topic_subject(realtime.topic()) = auth.uid()
  );
