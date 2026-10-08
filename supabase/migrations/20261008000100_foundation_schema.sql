-- Pulse platform foundation schema, RLS, and shared predicates.

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

create type public.conversation_type as enum ('direct', 'group');
create type public.member_role as enum ('owner', 'admin', 'member');
create type public.message_type as enum ('text', 'image', 'file', 'audio', 'system');
create type public.deletion_scope as enum ('none', 'everyone');
create type public.profile_visibility as enum ('public', 'contacts', 'private');
create type public.who_can_message as enum ('everyone', 'requests', 'nobody');
create type public.who_can_add_to_groups as enum ('everyone', 'contacts', 'nobody');
create type public.profile_theme as enum ('system', 'light', 'dark');
create type public.report_status as enum ('open', 'reviewed', 'dismissed');
create type public.message_request_status as enum ('pending', 'accepted', 'declined');

-- ---------------------------------------------------------------------------
-- Username helpers
-- ---------------------------------------------------------------------------

create or replace function public.normalize_username(p_username text)
returns text
language sql
immutable
as $$
  select lower(trim(p_username));
$$;

create or replace function public.username_is_valid(p_username text)
returns boolean
language plpgsql
immutable
as $$
declare
  v_norm text;
begin
  v_norm := public.normalize_username(p_username);
  if length(v_norm) < 3 or length(v_norm) > 20 then
    return false;
  end if;
  if v_norm !~ '^[a-z][a-z0-9_]*$' then
    return false;
  end if;
  if v_norm = any (
    array[
      'admin',
      'support',
      'pulse',
      'help',
      'system',
      'everyone',
      'here',
      'null',
      'undefined'
    ]::text[]
  ) then
    return false;
  end if;
  return true;
end;
$$;

create or replace function public.trg_profiles_set_normalized_username()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.normalized_username := public.normalize_username(new.username);
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text not null,
  normalized_username text not null,
  display_name text,
  avatar_url text,
  bio text,
  locale text not null default 'ar',
  timezone text not null default 'UTC',
  theme public.profile_theme not null default 'system',
  username_changed_at timestamptz,
  discoverable boolean not null default true,
  show_last_seen boolean not null default true,
  show_online boolean not null default true,
  send_read_receipts boolean not null default true,
  who_can_message public.who_can_message not null default 'everyone',
  who_can_add_to_groups public.who_can_add_to_groups not null default 'everyone',
  profile_visibility public.profile_visibility not null default 'public',
  last_seen_at timestamptz,
  created_at timestamptz not null default now(),
  constraint profiles_username_valid check (public.username_is_valid(username)),
  constraint profiles_normalized_username_unique unique (normalized_username)
);

create trigger profiles_normalized_username_trg
before insert or update of username on public.profiles
for each row
execute function public.trg_profiles_set_normalized_username();

create index profiles_normalized_username_idx on public.profiles (normalized_username);

create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  type public.conversation_type not null,
  title text,
  description text,
  avatar_url text,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_message_at timestamptz,
  last_message_id uuid,
  direct_pair_key text,
  constraint conversations_direct_pair_key_unique unique (direct_pair_key)
);

create table public.conversation_members (
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role public.member_role not null default 'member',
  joined_at timestamptz not null default now(),
  muted_until timestamptz,
  last_read_message_id uuid,
  last_read_at timestamptz,
  archived_at timestamptz,
  pinned_at timestamptz,
  left_at timestamptz,
  messaging_restricted boolean not null default false,
  primary key (conversation_id, user_id)
);

create unique index conversation_members_user_conversation_idx
  on public.conversation_members (user_id, conversation_id);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  sender_id uuid references public.profiles (id) on delete set null,
  client_id uuid not null,
  type public.message_type not null default 'text',
  body text,
  reply_to_id uuid references public.messages (id) on delete set null,
  created_at timestamptz not null default now(),
  edited_at timestamptz,
  deleted_at timestamptz,
  deletion_scope public.deletion_scope not null default 'none',
  pinned_at timestamptz,
  forwarded boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  constraint messages_sender_client_unique unique (sender_id, client_id),
  constraint messages_deleted_for_everyone_body check (
    deletion_scope <> 'everyone' or body is null
  )
);

create index messages_conversation_created_idx
  on public.messages (conversation_id, created_at desc);

create index messages_sender_created_idx
  on public.messages (sender_id, created_at desc);

alter table public.conversations
  add constraint conversations_last_message_fk
  foreign key (last_message_id) references public.messages (id) on delete set null;

alter table public.conversation_members
  add constraint conversation_members_last_read_fk
  foreign key (last_read_message_id) references public.messages (id) on delete set null;

create table public.message_hides (
  message_id uuid not null references public.messages (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  hidden_at timestamptz not null default now(),
  primary key (message_id, user_id)
);

create table public.message_reactions (
  message_id uuid not null references public.messages (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  emoji text not null,
  created_at timestamptz not null default now(),
  primary key (message_id, user_id, emoji)
);

create table public.attachments (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.messages (id) on delete cascade,
  storage_path text not null,
  mime_type text not null,
  size_bytes bigint not null,
  file_name text,
  width integer,
  height integer,
  duration_ms integer,
  waveform jsonb,
  created_at timestamptz not null default now()
);

create table public.blocks (
  blocker_id uuid not null references public.profiles (id) on delete cascade,
  blocked_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  constraint blocks_no_self check (blocker_id <> blocked_id)
);

create unique index blocks_blocker_blocked_idx on public.blocks (blocker_id, blocked_id);

create table public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.profiles (id) on delete cascade,
  target_user_id uuid references public.profiles (id) on delete set null,
  target_message_id uuid references public.messages (id) on delete set null,
  category text not null,
  details text,
  status public.report_status not null default 'open',
  created_at timestamptz not null default now()
);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.profiles (id) on delete cascade,
  type text not null,
  actor_id uuid references public.profiles (id) on delete set null,
  entity_id uuid,
  conversation_id uuid references public.conversations (id) on delete set null,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index notifications_recipient_read_created_idx
  on public.notifications (recipient_id, read_at, created_at desc);

create table public.notification_preferences (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  in_app_enabled boolean not null default true,
  push_enabled boolean not null default false,
  mentions_only boolean not null default false
);

create table public.devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  device_label text,
  last_seen_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.message_requests (
  id uuid primary key default gen_random_uuid(),
  from_user_id uuid not null references public.profiles (id) on delete cascade,
  to_user_id uuid not null references public.profiles (id) on delete cascade,
  conversation_id uuid references public.conversations (id) on delete set null,
  status public.message_request_status not null default 'pending',
  created_at timestamptz not null default now()
);

create unique index message_requests_pending_pair_idx
  on public.message_requests (from_user_id, to_user_id)
  where status = 'pending';

create table public.favorites (
  user_id uuid not null references public.profiles (id) on delete cascade,
  favorite_user_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, favorite_user_id),
  constraint favorites_no_self check (user_id <> favorite_user_id)
);

create table public.recent_searches (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  normalized_username text not null,
  created_at timestamptz not null default now()
);

create table public.chat_folders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  name text not null,
  position integer not null default 0,
  created_at timestamptz not null default now()
);

create table public.conversation_folder_items (
  folder_id uuid not null references public.chat_folders (id) on delete cascade,
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  primary key (folder_id, conversation_id)
);

create table public.invite_links (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  code text not null,
  created_by uuid references public.profiles (id) on delete set null,
  expires_at timestamptz,
  revoked_at timestamptz,
  max_uses integer,
  use_count integer not null default 0,
  constraint invite_links_code_unique unique (code)
);

create table public.storage_usage (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  bytes_used bigint not null default 0
);

create table public.rate_limit_counters (
  user_id uuid not null references public.profiles (id) on delete cascade,
  action text not null,
  window_start timestamptz not null,
  count integer not null default 0,
  primary key (user_id, action, window_start)
);

-- ---------------------------------------------------------------------------
-- Membership / safety helpers (security definer)
-- ---------------------------------------------------------------------------

create or replace function public.is_member(
  p_conversation_id uuid,
  p_user_id uuid default auth.uid()
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.conversation_members cm
    where cm.conversation_id = p_conversation_id
      and cm.user_id = p_user_id
      and cm.left_at is null
  );
$$;

create or replace function public.is_blocked_either(p_a uuid, p_b uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.blocks b
    where (b.blocker_id = p_a and b.blocked_id = p_b)
       or (b.blocker_id = p_b and b.blocked_id = p_a)
  );
$$;

create or replace function public.direct_pair_key(p_a uuid, p_b uuid)
returns text
language sql
immutable
as $$
  select least(p_a::text, p_b::text) || ':' || greatest(p_a::text, p_b::text);
$$;

create or replace function public.decide_interaction(
  p_actor uuid,
  p_target uuid,
  p_action text
)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_discoverable boolean;
  v_profile_visibility public.profile_visibility;
  v_who_can_message public.who_can_message;
  v_who_can_add public.who_can_add_to_groups;
  v_show_online boolean;
  v_favorite boolean;
  v_direct_exists boolean;
  v_pending_request boolean;
  v_pair_key text;
begin
  if p_action not in ('discover', 'message', 'invite', 'presence') then
    raise exception 'platform.invalid_action' using errcode = 'P0001';
  end if;

  -- An end user may only ask about their own interactions; otherwise this
  -- function would reveal blocks and settings between two other people.
  if auth.role() = 'authenticated' and p_actor is distinct from auth.uid() then
    raise exception 'platform.forbidden' using errcode = 'P0001';
  end if;

  if p_actor is not distinct from p_target then
    return 'allow';
  end if;

  if public.is_blocked_either(p_actor, p_target) then
    return 'deny';
  end if;

  select
    p.discoverable,
    p.profile_visibility,
    p.who_can_message,
    p.who_can_add_to_groups,
    p.show_online
  into
    v_discoverable,
    v_profile_visibility,
    v_who_can_message,
    v_who_can_add,
    v_show_online
  from public.profiles p
  where p.id = p_target;

  if not found then
    return 'deny';
  end if;

  if p_action = 'discover' then
    if not v_discoverable then
      return 'deny';
    end if;
    if v_profile_visibility = 'private' then
      return 'deny';
    end if;
    if v_profile_visibility = 'public' then
      return 'allow';
    end if;
    select exists (
      select 1
      from public.favorites f
      where (f.user_id = p_actor and f.favorite_user_id = p_target)
         or (f.user_id = p_target and f.favorite_user_id = p_actor)
    ) into v_favorite;
    if v_favorite then
      return 'allow';
    end if;
    return 'deny';
  end if;

  if p_action = 'message' then
    v_pair_key := public.direct_pair_key(p_actor, p_target);
    select exists (
      select 1
      from public.conversations c
      where c.type = 'direct'
        and c.direct_pair_key = v_pair_key
    ) into v_direct_exists;

    select exists (
      select 1
      from public.message_requests mr
      where mr.status = 'pending'
        and (
          (mr.from_user_id = p_actor and mr.to_user_id = p_target)
          or (mr.from_user_id = p_target and mr.to_user_id = p_actor)
        )
    ) into v_pending_request;

    if v_direct_exists and not v_pending_request then
      return 'allow';
    end if;

    case v_who_can_message
      when 'everyone' then return 'allow';
      when 'requests' then return 'request';
      when 'nobody' then return 'deny';
      else return 'deny';
    end case;
  end if;

  if p_action = 'invite' then
    case v_who_can_add
      when 'everyone' then return 'allow';
      when 'nobody' then return 'deny';
      when 'contacts' then
        select exists (
          select 1
          from public.favorites f
          where (f.user_id = p_actor and f.favorite_user_id = p_target)
             or (f.user_id = p_target and f.favorite_user_id = p_actor)
        ) into v_favorite;
        if v_favorite then
          return 'allow';
        end if;
        return 'deny';
      else return 'deny';
    end case;
  end if;

  if p_action = 'presence' then
    if not v_show_online then
      return 'deny';
    end if;
    return 'allow';
  end if;

  return 'deny';
end;
$$;

revoke all on function public.normalize_username(text) from public;
revoke all on function public.username_is_valid(text) from public;
revoke all on function public.is_member(uuid, uuid) from public;
revoke all on function public.is_blocked_either(uuid, uuid) from public;
revoke all on function public.decide_interaction(uuid, uuid, text) from public;
revoke all on function public.direct_pair_key(uuid, uuid) from public;

grant execute on function public.normalize_username(text) to authenticated;
grant execute on function public.username_is_valid(text) to authenticated;
grant execute on function public.is_member(uuid, uuid) to authenticated;
grant execute on function public.decide_interaction(uuid, uuid, text) to authenticated;
revoke all on function public.is_member(uuid, uuid) from anon;
revoke all on function public.is_blocked_either(uuid, uuid) from anon, authenticated;
revoke all on function public.decide_interaction(uuid, uuid, text) from anon;
revoke all on function public.direct_pair_key(uuid, uuid) from anon;
revoke all on function public.normalize_username(text) from anon;
revoke all on function public.username_is_valid(text) from anon;

-- Functions added by later migrations are callable by authenticated and
-- service_role only; each must grant nothing further and check auth.uid().
alter default privileges revoke execute on functions from public;
alter default privileges in schema public revoke execute on functions from anon;

comment on column public.messages.body is
  'When deletion_scope is everyone, the delete function sets body to null and metadata to {} at delete time; clients never receive the original body.';

-- ---------------------------------------------------------------------------
-- Storage bucket (private attachments)
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public)
values ('attachments', 'attachments', false)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Realtime publication
-- ---------------------------------------------------------------------------

do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'messages'
  ) then
    alter publication supabase_realtime add table public.messages;
  end if;

  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'message_reactions'
  ) then
    alter publication supabase_realtime add table public.message_reactions;
  end if;

  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'conversation_members'
  ) then
    alter publication supabase_realtime add table public.conversation_members;
  end if;

  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'conversations'
  ) then
    alter publication supabase_realtime add table public.conversations;
  end if;

  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'notifications'
  ) then
    alter publication supabase_realtime add table public.notifications;
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- Row level security (default deny; SELECT policies only)
-- ---------------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.conversations enable row level security;
alter table public.conversation_members enable row level security;
alter table public.messages enable row level security;
alter table public.message_hides enable row level security;
alter table public.message_reactions enable row level security;
alter table public.attachments enable row level security;
alter table public.blocks enable row level security;
alter table public.reports enable row level security;
alter table public.notifications enable row level security;
alter table public.notification_preferences enable row level security;
alter table public.devices enable row level security;
alter table public.message_requests enable row level security;
alter table public.favorites enable row level security;
alter table public.recent_searches enable row level security;
alter table public.chat_folders enable row level security;
alter table public.conversation_folder_items enable row level security;
alter table public.invite_links enable row level security;
alter table public.storage_usage enable row level security;
alter table public.rate_limit_counters enable row level security;

create policy profiles_select_authenticated
  on public.profiles
  for select
  to authenticated
  using (
    id = auth.uid()
    or public.decide_interaction(auth.uid(), id, 'discover') <> 'deny'
  );

create policy conversations_select_member
  on public.conversations
  for select
  to authenticated
  using (public.is_member(id));

create policy conversation_members_select_member
  on public.conversation_members
  for select
  to authenticated
  using (public.is_member(conversation_id));

create policy messages_select_member
  on public.messages
  for select
  to authenticated
  using (public.is_member(conversation_id));

create policy message_hides_select_member
  on public.message_hides
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.messages m
      where m.id = message_hides.message_id
        and public.is_member(m.conversation_id)
    )
  );

create policy message_reactions_select_member
  on public.message_reactions
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.messages m
      where m.id = message_reactions.message_id
        and public.is_member(m.conversation_id)
    )
  );

create policy attachments_select_member
  on public.attachments
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.messages m
      where m.id = attachments.message_id
        and public.is_member(m.conversation_id)
    )
  );

create policy blocks_select_blocker
  on public.blocks
  for select
  to authenticated
  using (blocker_id = auth.uid());

create policy reports_select_reporter
  on public.reports
  for select
  to authenticated
  using (reporter_id = auth.uid());

create policy reports_select_group_admin
  on public.reports
  for select
  to authenticated
  using (
    target_message_id is not null
    and exists (
      select 1
      from public.messages m
      join public.conversations c on c.id = m.conversation_id
      join public.conversation_members cm on cm.conversation_id = c.id
      where m.id = reports.target_message_id
        and c.type = 'group'
        and cm.user_id = auth.uid()
        and cm.left_at is null
        and cm.role in ('owner', 'admin')
    )
  );

create policy notifications_select_recipient
  on public.notifications
  for select
  to authenticated
  using (recipient_id = auth.uid());

create policy notification_preferences_select_owner
  on public.notification_preferences
  for select
  to authenticated
  using (user_id = auth.uid());

create policy devices_select_owner
  on public.devices
  for select
  to authenticated
  using (user_id = auth.uid());

create policy message_requests_select_participant
  on public.message_requests
  for select
  to authenticated
  using (from_user_id = auth.uid() or to_user_id = auth.uid());

create policy favorites_select_owner
  on public.favorites
  for select
  to authenticated
  using (user_id = auth.uid());

create policy recent_searches_select_owner
  on public.recent_searches
  for select
  to authenticated
  using (user_id = auth.uid());

create policy chat_folders_select_owner
  on public.chat_folders
  for select
  to authenticated
  using (user_id = auth.uid());

create policy conversation_folder_items_select_owner
  on public.conversation_folder_items
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.chat_folders f
      where f.id = conversation_folder_items.folder_id
        and f.user_id = auth.uid()
    )
  );

create policy invite_links_select_member
  on public.invite_links
  for select
  to authenticated
  using (public.is_member(conversation_id));

create policy storage_usage_select_owner
  on public.storage_usage
  for select
  to authenticated
  using (user_id = auth.uid());

-- Revoke direct writes from browser roles (writes via security definer RPCs).
-- TRUNCATE bypasses row-level security, so it is revoked with the writes.
revoke insert, update, delete, truncate, references, trigger
  on all tables in schema public from anon, authenticated, public;
revoke all on all sequences in schema public from anon, authenticated;

grant select on all tables in schema public to authenticated;

-- Tables added by later migrations start read-only for browser roles too.
alter default privileges in schema public
  revoke insert, update, delete, truncate, references, trigger
  on tables from anon, authenticated, public;
