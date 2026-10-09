-- Delete-for-me is a row in message_hides. Realtime only delivers tables in
-- the publication, and the previous select policy let every member see who
-- hid which message. Own rows only, then publish them.

drop policy if exists message_hides_select_member on public.message_hides;

create policy message_hides_select_own
  on public.message_hides
  for select
  to authenticated
  using (user_id = (select auth.uid()));

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'message_hides'
  ) then
    alter publication supabase_realtime add table public.message_hides;
  end if;
end
$$;
