-- Per-message "played" state for voice messages, separate from the
-- watermark-based read receipt. A listener's play is visible to the sender
-- only when both sides send read receipts (same reciprocity as seen).

create table if not exists public.message_audio_plays (
  message_id uuid not null references public.messages (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  played_at timestamptz not null default now(),
  primary key (message_id, user_id)
);

create index if not exists message_audio_plays_user_idx
  on public.message_audio_plays (user_id);

alter table public.message_audio_plays enable row level security;

-- Helper (security definer so policies need no access to messages/profiles).
-- True when the caller may insert a play: member, not own message, audio.
create or replace function public.can_mark_audio_played(p_message_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.messages m
    where m.id = p_message_id
      and m.type = 'audio'
      and m.deleted_at is null
      and m.sender_id is distinct from (select auth.uid())
      and public.is_member(m.conversation_id, (select auth.uid()))
  );
$$;

-- True when the caller sent the message and the play by p_listener is
-- shareable (both sides send read receipts).
create or replace function public.can_see_audio_play(p_message_id uuid, p_listener uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.messages m
    join public.profiles lp on lp.id = p_listener
    join public.profiles vp on vp.id = m.sender_id
    where m.id = p_message_id
      and m.sender_id = (select auth.uid())
      and lp.send_read_receipts
      and vp.send_read_receipts
  );
$$;

revoke all on function public.can_mark_audio_played(uuid) from public, anon;
revoke all on function public.can_see_audio_play(uuid, uuid) from public, anon;
grant execute on function public.can_mark_audio_played(uuid) to authenticated;
grant execute on function public.can_see_audio_play(uuid, uuid) to authenticated;

drop policy if exists message_audio_plays_insert_self on public.message_audio_plays;
create policy message_audio_plays_insert_self
  on public.message_audio_plays
  for insert
  to authenticated
  with check (
    user_id = (select auth.uid())
    and public.can_mark_audio_played(message_id)
  );

drop policy if exists message_audio_plays_select on public.message_audio_plays;
create policy message_audio_plays_select
  on public.message_audio_plays
  for select
  to authenticated
  using (
    user_id = (select auth.uid())
    or public.can_see_audio_play(message_id, user_id)
  );

create or replace function public.mark_audio_played(p_message_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    raise exception 'unauthenticated' using errcode = '28000';
  end if;
  if not public.can_mark_audio_played(p_message_id) then
    return;
  end if;
  insert into public.message_audio_plays (message_id, user_id)
  values (p_message_id, (select auth.uid()))
  on conflict (message_id, user_id) do nothing;
end;
$$;

-- Number of listeners whose play the caller (the sender) may see.
create or replace function public.get_audio_played_count(p_message_id uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::int
  from public.message_audio_plays p
  where p.message_id = p_message_id
    and public.can_see_audio_play(p.message_id, p.user_id);
$$;

revoke all on function public.mark_audio_played(uuid) from public, anon;
revoke all on function public.get_audio_played_count(uuid) from public, anon;
grant execute on function public.mark_audio_played(uuid) to authenticated;
grant execute on function public.get_audio_played_count(uuid) to authenticated;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'message_audio_plays'
  ) then
    alter publication supabase_realtime add table public.message_audio_plays;
  end if;
end
$$;
