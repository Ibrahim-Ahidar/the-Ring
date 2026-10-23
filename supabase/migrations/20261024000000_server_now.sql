-- Issue #215 (spec section 11): server clock for the development timing tool.
--
-- Returns the database clock as epoch milliseconds so a client can estimate its
-- clock offset from one RPC round trip. Reveals nothing but the current time.
-- Security invoker, no table access, callable only by signed-in users.

create or replace function public.server_now()
returns bigint
language sql
stable
security invoker
set search_path = ''
as $$
  select (extract(epoch from pg_catalog.clock_timestamp()) * 1000)::bigint;
$$;

revoke all on function public.server_now() from public;
grant execute on function public.server_now() to authenticated;
