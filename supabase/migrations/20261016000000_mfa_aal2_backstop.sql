-- TOTP two-factor auth backstop: a member with a verified MFA factor must be at
-- AAL2 to call the sensitive identity RPCs. The originals move into a private
-- schema (not exposed through the API) and the public names become thin wrappers.

create schema if not exists identity_private;
revoke all on schema identity_private from public, anon, authenticated;

create or replace function identity_private.requires_aal2()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from auth.mfa_factors f
    where f.user_id = auth.uid()
      and f.status::text = 'verified'
  );
$$;

create or replace function identity_private.assert_aal2()
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is not null
     and identity_private.requires_aal2()
     and coalesce(auth.jwt() ->> 'aal', 'aal1') <> 'aal2' then
    raise exception 'identity.mfa_required' using errcode = 'P0001';
  end if;
end;
$$;

revoke all on function identity_private.requires_aal2() from public, anon, authenticated;
revoke all on function identity_private.assert_aal2() from public, anon, authenticated;

-- Move originals out of the public API surface.
alter function public.identity_delete_account(text) set schema identity_private;
alter function public.identity_upsert_device(uuid, text) set schema identity_private;
alter function public.identity_revoke_device(uuid) set schema identity_private;
alter function public.identity_revoke_other_devices(uuid) set schema identity_private;

revoke all on function identity_private.identity_delete_account(text) from public, anon, authenticated;
revoke all on function identity_private.identity_upsert_device(uuid, text) from public, anon, authenticated;
revoke all on function identity_private.identity_revoke_device(uuid) from public, anon, authenticated;
revoke all on function identity_private.identity_revoke_other_devices(uuid) from public, anon, authenticated;

create or replace function public.identity_delete_account(p_username_confirm text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  perform identity_private.assert_aal2();
  perform identity_private.identity_delete_account(p_username_confirm);
end;
$$;

-- Registering a device happens only after the second factor.
create or replace function public.identity_upsert_device(
  p_device_id uuid,
  p_device_label text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  perform identity_private.assert_aal2();
  return identity_private.identity_upsert_device(p_device_id, p_device_label);
end;
$$;

create or replace function public.identity_revoke_device(p_device_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  perform identity_private.assert_aal2();
  perform identity_private.identity_revoke_device(p_device_id);
end;
$$;

create or replace function public.identity_revoke_other_devices(p_current_device_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  perform identity_private.assert_aal2();
  return identity_private.identity_revoke_other_devices(p_current_device_id);
end;
$$;

revoke all on function public.identity_delete_account(text) from public, anon;
revoke all on function public.identity_upsert_device(uuid, text) from public, anon;
revoke all on function public.identity_revoke_device(uuid) from public, anon;
revoke all on function public.identity_revoke_other_devices(uuid) from public, anon;
grant execute on function public.identity_delete_account(text) to authenticated, service_role;
grant execute on function public.identity_upsert_device(uuid, text) to authenticated, service_role;
grant execute on function public.identity_revoke_device(uuid) to authenticated, service_role;
grant execute on function public.identity_revoke_other_devices(uuid) to authenticated, service_role;
