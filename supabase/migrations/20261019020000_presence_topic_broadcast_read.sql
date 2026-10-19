-- Realtime rejects a private channel join unless the user may read its
-- broadcast extension, so presence topics need broadcast read as well.
do $do$
begin
  if to_regclass('realtime.messages') is null then return; end if;
  drop policy if exists presence_user_topic_read on realtime.messages;
  create policy presence_user_topic_read on realtime.messages
    for select to authenticated
    using (
      extension in ('presence', 'broadcast')
      and public.presence_topic_readable(realtime.topic())
    );
end
$do$;
