-- Issue #183 (spec section 7): call the push-notify Edge Function for every
-- new message notification.
--
-- Nothing is hard-coded. Store these once per project in Supabase Vault
-- (SQL editor, never in git):
--   select vault.create_secret('https://<ref>.supabase.co/functions/v1/push-notify', 'push_notify_url');
--   select vault.create_secret('<same value as the PUSH_WEBHOOK_SECRET function secret>', 'push_notify_secret');
-- Without them the trigger does nothing.

create extension if not exists pg_net with schema extensions;

create or replace function public.push_notify_dispatch()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_url text;
  v_secret text;
begin
  if new.type <> 'message.created' or new.conversation_id is null then
    return new;
  end if;

  begin
    select ds.decrypted_secret into v_url
    from vault.decrypted_secrets ds where ds.name = 'push_notify_url';
    select ds.decrypted_secret into v_secret
    from vault.decrypted_secrets ds where ds.name = 'push_notify_secret';

    if v_url is null or v_secret is null then
      return new;
    end if;

    perform net.http_post(
      url := v_url,
      headers := jsonb_build_object(
        'content-type', 'application/json',
        'x-webhook-secret', v_secret
      ),
      body := jsonb_build_object(
        'type', 'INSERT',
        'table', 'notifications',
        'schema', 'public',
        'record', to_jsonb(new)
      )
    );
  exception when others then
    -- Push is best effort: never block sending a message.
    null;
  end;

  return new;
end;
$$;

revoke all on function public.push_notify_dispatch() from public, anon, authenticated;

drop trigger if exists notifications_push_notify on public.notifications;
create trigger notifications_push_notify
  after insert on public.notifications
  for each row execute function public.push_notify_dispatch();
