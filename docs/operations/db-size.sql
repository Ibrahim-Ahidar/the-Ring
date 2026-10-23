-- Weekly database size record (issue #215, spec section 11).
-- Run in the Supabase SQL editor (or `supabase db query --linked -f docs/operations/db-size.sql`).
-- Copy the first row into the table in docs/operations/README.md ("Weekly size log").
-- Read-only. Target: total database under 50 MB.

select
  now()::date                                        as recorded_on,
  pg_size_pretty(pg_database_size(current_database())) as database_size,
  pg_database_size(current_database())               as database_bytes;

-- Ten largest tables (heap + indexes + toast).
select
  n.nspname || '.' || c.relname                      as table_name,
  pg_size_pretty(pg_total_relation_size(c.oid))      as total_size,
  pg_total_relation_size(c.oid)                      as total_bytes,
  c.reltuples::bigint                                as approx_rows
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where c.relkind = 'r'
  and n.nspname in ('public', 'storage', 'auth', 'realtime')
order by pg_total_relation_size(c.oid) desc
limit 10;
