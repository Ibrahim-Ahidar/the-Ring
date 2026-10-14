-- =============================================================================
-- Pulse: chat / realtime diagnostics (READ-ONLY)
-- =============================================================================
-- Run in the Supabase SQL editor against the hosted project. Every statement is
-- a SELECT. Nothing here inserts, updates, deletes, or changes schema.
--
-- How to read results: each query is labelled (1) to (7). Run the whole script
-- and open the result tab for each label, or run one block at a time.
--   (1) Expect exactly: messages, message_reactions, conversation_members,
--       conversations, notifications, message_hides (schema public).
--   (2) relreplident: 'd' (default) is expected unless a migration changed it.
--   (3) relrowsecurity must be true. messages_select_member must have
--       qual containing 'upload' (see the check_* column of the last row).
--   (4) Every function must return at least one row with overloads >= 1.
--       overloads = 0 means the function is missing from the hosted DB.
--   (5) Any row with status = 'MISSING' is a migration not applied on hosted.
--       Rows in the 'applied but no file' query mean drift the other way.
--   (6) Sanity check of recent messages and who is in those conversations.
--       left_at not null means the member has left (kept for history).
--   (7) Number of realtime subscriptions. Shows a note if the table is absent.
-- =============================================================================


-- (1) Tables in the supabase_realtime publication
select 'q1_publication_tables' as check_name,
       schemaname,
       tablename
from pg_publication_tables
where pubname = 'supabase_realtime'
order by schemaname, tablename;


-- (2) Replica identity for the realtime tables
select 'q2_replica_identity' as check_name,
       c.relname as table_name,
       c.relreplident,
       case c.relreplident
         when 'd' then 'default'
         when 'f' then 'full'
         when 'i' then 'index'
         when 'n' then 'nothing'
       end as replica_identity
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in (
    'messages', 'message_reactions', 'conversation_members',
    'conversations', 'notifications', 'message_hides'
  )
order by c.relname;


-- (3a) RLS enabled flag on chat tables
select 'q3a_rls_enabled' as check_name,
       c.relname as table_name,
       c.relrowsecurity as rls_enabled,
       c.relforcerowsecurity as rls_forced
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in ('messages', 'message_hides', 'conversation_members', 'conversations')
order by c.relname;


-- (3b) All policies on those tables
select 'q3b_policies' as check_name,
       tablename,
       policyname,
       cmd,
       permissive,
       roles,
       qual,
       with_check
from pg_policies
where schemaname = 'public'
  and tablename in ('messages', 'message_hides', 'conversation_members', 'conversations')
order by tablename, policyname;


-- (3c) Quick check: messages_select_member includes the metadata->>'upload' condition
select 'q3c_messages_select_member_upload_check' as check_name,
       count(*) as matching_policies,
       bool_and(qual ilike '%upload%') as has_upload_condition
from pg_policies
where schemaname = 'public'
  and tablename = 'messages'
  and policyname = 'messages_select_member';


-- (4) Required functions: existence and argument lists
with expected(fn_name) as (
  values
    ('send_text'),
    ('list_messages'),
    ('get_message_attachments'),
    ('mark_read'),
    ('is_member'),
    ('notify'),
    ('enforce_rate_limit'),
    ('identity_assert_session_active')
)
select 'q4_functions' as check_name,
       e.fn_name,
       count(p.oid) as overloads,
       string_agg(pg_get_function_identity_arguments(p.oid), ' | ') as argument_lists,
       bool_and(p.prosecdef) as all_security_definer
from expected e
left join pg_proc p
  on p.proname = e.fn_name
 and p.pronamespace = 'public'::regnamespace
group by e.fn_name
order by e.fn_name;


-- (5a) Migrations expected from supabase/migrations (22 files) vs applied
with expected(version) as (
  values
    ('20261008000100'),
    ('20261008000200'),
    ('20261009010000'),
    ('20261009020000'),
    ('20261009030000'),
    ('20261009040000'),
    ('20261009050000'),
    ('20261009060000'),
    ('20261009070000'),
    ('20261010010000'),
    ('20261010020000'),
    ('20261010030000'),
    ('20261010040000'),
    ('20261010050000'),
    ('20261010060000'),
    ('20261010070000'),
    ('20261010080000'),
    ('20261010090000'),
    ('20261010100000'),
    ('20261010110000'),
    ('20261010116000'),
    ('20261013000000')
)
select 'q5a_expected_vs_applied' as check_name,
       e.version as expected_version,
       sm.version as applied_version,
       case when sm.version is null then 'MISSING' else 'ok' end as status
from expected e
left join supabase_migrations.schema_migrations sm
  on sm.version = e.version
order by e.version;


-- (5b) Applied on hosted but no matching file in supabase/migrations
with expected(version) as (
  values
    ('20261008000100'),
    ('20261008000200'),
    ('20261009010000'),
    ('20261009020000'),
    ('20261009030000'),
    ('20261009040000'),
    ('20261009050000'),
    ('20261009060000'),
    ('20261009070000'),
    ('20261010010000'),
    ('20261010020000'),
    ('20261010030000'),
    ('20261010040000'),
    ('20261010050000'),
    ('20261010060000'),
    ('20261010070000'),
    ('20261010080000'),
    ('20261010090000'),
    ('20261010100000'),
    ('20261010110000'),
    ('20261010116000'),
    ('20261013000000')
)
select 'q5b_applied_without_file' as check_name,
       sm.version as applied_version
from supabase_migrations.schema_migrations sm
left join expected e on e.version = sm.version
where e.version is null
order by sm.version;


-- (6a) Five most recent messages
select 'q6a_recent_messages' as check_name,
       m.id,
       m.conversation_id,
       m.sender_id,
       m.created_at,
       m.metadata
from public.messages m
order by m.created_at desc
limit 5;


-- (6b) Members (including those who left) of the conversations of those 5 messages
with recent_msgs as (
  select m.conversation_id
  from public.messages m
  order by m.created_at desc
  limit 5
),
recent_convs as (
  select distinct conversation_id from recent_msgs
)
select 'q6b_members_of_recent_conversations' as check_name,
       rc.conversation_id,
       cm.user_id,
       cm.role,
       cm.joined_at,
       cm.left_at
from recent_convs rc
left join public.conversation_members cm
  on cm.conversation_id = rc.conversation_id
order by rc.conversation_id, cm.joined_at;


-- (7) Realtime subscription count (realtime.subscription may not exist)
select 'q7_realtime_subscription_count' as check_name,
       case
         when to_regclass('realtime.subscription') is null
           then 'realtime.subscription not present'
         else (
           xpath(
             '/row/c/text()',
             query_to_xml('select count(*) as c from realtime.subscription', false, true, '')
           )
         )[1]::text
       end as subscription_count;
