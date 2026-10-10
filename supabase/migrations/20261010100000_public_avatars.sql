-- Issue #57: profile photos live in a dedicated public `avatars` bucket.
--
-- profiles.avatar_url keeps the `avatars/<uid>/<file>` form that
-- identity_set_avatar_path already enforces; that value is exactly
-- `<bucket>/<object name>`, so clients build the public URL as
-- `<supabase url>/storage/v1/object/public/<avatar_url>`.

-- ---------------------------------------------------------------------------
-- Bucket
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'avatars',
  'avatars',
  true,
  8 * 1024 * 1024,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

-- ---------------------------------------------------------------------------
-- Storage policies: only the owner may write under `<uid>/`
-- (reads are served by the public bucket endpoint)
-- ---------------------------------------------------------------------------

drop policy if exists avatars_select_own on storage.objects;
create policy avatars_select_own
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'avatars'
    and split_part(name, '/', 1) = (select auth.uid())::text
  );

drop policy if exists avatars_insert_own on storage.objects;
create policy avatars_insert_own
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'avatars'
    and split_part(name, '/', 1) = (select auth.uid())::text
  );

drop policy if exists avatars_update_own on storage.objects;
create policy avatars_update_own
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'avatars'
    and split_part(name, '/', 1) = (select auth.uid())::text
  )
  with check (
    bucket_id = 'avatars'
    and split_part(name, '/', 1) = (select auth.uid())::text
  );

drop policy if exists avatars_delete_own on storage.objects;
create policy avatars_delete_own
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'avatars'
    and split_part(name, '/', 1) = (select auth.uid())::text
  );

-- ---------------------------------------------------------------------------
-- Earlier uploads went to the private `attachments` bucket and never rendered.
-- Clear values that do not point at an object in the new bucket so members
-- see their initials instead of a broken image.
-- ---------------------------------------------------------------------------

update public.profiles p
set avatar_url = null
where p.avatar_url is not null
  and p.avatar_url !~ '^https?://'
  and not exists (
    select 1
    from storage.objects o
    where o.bucket_id = 'avatars'
      and 'avatars/' || o.name = p.avatar_url
  );

-- ---------------------------------------------------------------------------
-- identity_clear_avatar: removes the caller's photo and returns the old path
-- so the server can delete the stored object.
-- ---------------------------------------------------------------------------

create or replace function public.identity_clear_avatar()
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_previous text;
begin
  if v_uid is null then
    raise exception 'platform.unauthenticated' using errcode = 'P0001';
  end if;

  select p.avatar_url into v_previous
  from public.profiles p
  where p.id = v_uid
  for update;

  if not found then
    raise exception 'identity.not_found' using errcode = 'P0001';
  end if;

  update public.profiles p
  set avatar_url = null
  where p.id = v_uid;

  return v_previous;
end;
$$;

revoke execute on function public.identity_clear_avatar() from public, anon;
grant execute on function public.identity_clear_avatar() to authenticated, service_role;
