-- ---------------------------------------------------------------------------
-- Pin search_path on helper functions
-- ---------------------------------------------------------------------------

alter function public.direct_pair_key(uuid, uuid) set search_path = '';
alter function public.groups_validate_description(text) set search_path = '';
alter function public.groups_validate_name(text) set search_path = '';
alter function public.identity_validate_username(text) set search_path = '';
alter function public.media_assert_size(public.message_type, bigint, integer) set search_path = '';
alter function public.media_classify_mime(text) set search_path = '';
alter function public.messaging_base64url_to_bytea(text) set search_path = '';
alter function public.messaging_decode_conversation_cursor(text) set search_path = '';
alter function public.messaging_decode_message_cursor(text) set search_path = '';
alter function public.normalize_username(text) set search_path = '';
alter function public.username_is_valid(text) set search_path = '';

-- ---------------------------------------------------------------------------
-- RLS: evaluate auth.uid() once per statement, not per row
-- ---------------------------------------------------------------------------

alter policy profiles_select_authenticated
  on public.profiles
  using (
    id = (select auth.uid())
    or public.decide_interaction((select auth.uid()), id, 'discover') <> 'deny'
  );

alter policy blocks_select_blocker
  on public.blocks
  using (blocker_id = (select auth.uid()));

alter policy notifications_select_recipient
  on public.notifications
  using (recipient_id = (select auth.uid()));

alter policy notification_preferences_select_owner
  on public.notification_preferences
  using (user_id = (select auth.uid()));

alter policy devices_select_owner
  on public.devices
  using (user_id = (select auth.uid()));

alter policy message_requests_select_participant
  on public.message_requests
  using (
    from_user_id = (select auth.uid())
    or to_user_id = (select auth.uid())
  );

alter policy favorites_select_owner
  on public.favorites
  using (user_id = (select auth.uid()));

alter policy recent_searches_select_owner
  on public.recent_searches
  using (user_id = (select auth.uid()));

alter policy chat_folders_select_owner
  on public.chat_folders
  using (user_id = (select auth.uid()));

alter policy conversation_folder_items_select_owner
  on public.conversation_folder_items
  using (
    exists (
      select 1
      from public.chat_folders f
      where f.id = conversation_folder_items.folder_id
        and f.user_id = (select auth.uid())
    )
  );

alter policy storage_usage_select_owner
  on public.storage_usage
  using (user_id = (select auth.uid()));

alter policy messages_select_member
  on public.messages
  using (
    public.is_member(conversation_id)
    and (
      coalesce(metadata ->> 'upload', 'ready') in ('ready', '')
      or sender_id = (select auth.uid())
    )
  );

alter policy attachments_select_member
  on public.attachments
  using (
    exists (
      select 1
      from public.messages m
      where m.id = attachments.message_id
        and public.is_member(m.conversation_id)
        and (
          coalesce(m.metadata ->> 'upload', 'ready') in ('ready', '')
          or m.sender_id = (select auth.uid())
        )
    )
  );

-- One permissive SELECT policy on reports instead of two.
drop policy reports_select_reporter on public.reports;
drop policy reports_select_group_admin on public.reports;

create policy reports_select_visible
  on public.reports
  for select
  to authenticated
  using (
    reporter_id = (select auth.uid())
    or (
      target_message_id is not null
      and exists (
        select 1
        from public.messages m
        join public.conversations c on c.id = m.conversation_id
        join public.conversation_members cm on cm.conversation_id = c.id
        where m.id = reports.target_message_id
          and c.type = 'group'
          and cm.user_id = (select auth.uid())
          and cm.left_at is null
          and cm.role in ('owner', 'admin')
      )
    )
  );

-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------

-- Same columns as blocks_pkey / profiles_normalized_username_unique.
drop index if exists public.blocks_blocker_blocked_idx;
drop index if exists public.profiles_normalized_username_idx;

create index if not exists attachments_message_id_idx on public.attachments (message_id);
create index if not exists blocks_blocked_id_idx on public.blocks (blocked_id);
create index if not exists chat_folders_user_id_idx on public.chat_folders (user_id);
create index if not exists conversation_folder_items_conversation_id_idx
  on public.conversation_folder_items (conversation_id);
create index if not exists conversation_members_last_read_message_id_idx
  on public.conversation_members (last_read_message_id);
create index if not exists conversations_created_by_idx on public.conversations (created_by);
create index if not exists conversations_last_message_id_idx on public.conversations (last_message_id);
create index if not exists devices_user_id_idx on public.devices (user_id);
create index if not exists favorites_favorite_user_id_idx on public.favorites (favorite_user_id);
create index if not exists invite_links_conversation_id_idx on public.invite_links (conversation_id);
create index if not exists invite_links_created_by_idx on public.invite_links (created_by);
create index if not exists message_hides_user_id_idx on public.message_hides (user_id);
create index if not exists message_reactions_user_id_idx on public.message_reactions (user_id);
create index if not exists message_requests_conversation_id_idx
  on public.message_requests (conversation_id);
create index if not exists message_requests_to_user_id_idx on public.message_requests (to_user_id);
create index if not exists messages_reply_to_id_idx on public.messages (reply_to_id);
create index if not exists notifications_actor_id_idx on public.notifications (actor_id);
create index if not exists notifications_conversation_id_idx on public.notifications (conversation_id);
create index if not exists recent_searches_user_id_idx on public.recent_searches (user_id);
create index if not exists reports_reporter_id_idx on public.reports (reporter_id);
create index if not exists reports_target_message_id_idx on public.reports (target_message_id);
create index if not exists reports_target_user_id_idx on public.reports (target_user_id);

-- ---------------------------------------------------------------------------
-- Internal tables: only security-definer functions touch these
-- ---------------------------------------------------------------------------

revoke all on public.rate_limit_counters from anon, authenticated;
alter table public.identity_signup_buckets enable row level security;
