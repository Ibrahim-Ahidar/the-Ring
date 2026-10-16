-- One round trip for the /app gate: session liveness, device state, email
-- confirmation and MFA step-up, answered together. The older single-purpose
-- RPCs stay (other callers and tests use them).
--
-- Raises identity.session_revoked / platform.unauthenticated exactly like
-- identity_assert_session_active. Everything else comes back as data so the
-- caller decides the redirect:
--   device_active    the device row exists, is the caller's and is not revoked
--   email_confirmed  auth.users.email_confirmed_at is set (server truth, not JWT)
--   mfa_required     the member has a verified factor but the JWT is not aal2

create or replace function public.identity_assert_access(p_device_id uuid default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_confirmed boolean;
begin
  if v_uid is null then
    raise exception 'platform.unauthenticated' using errcode = 'P0001';
  end if;

  perform public.identity_assert_session_active();

  select u.email_confirmed_at is not null
    into v_confirmed
  from auth.users u
  where u.id = v_uid;

  return jsonb_build_object(
    'email_confirmed', coalesce(v_confirmed, false),
    'mfa_required',
      identity_private.requires_aal2()
      and coalesce(auth.jwt() ->> 'aal', 'aal1') <> 'aal2',
    'device_active',
      p_device_id is not null and exists (
        select 1
        from public.devices d
        where d.id = p_device_id
          and d.user_id = v_uid
          and d.revoked_at is null
      )
  );
end;
$$;

revoke all on function public.identity_assert_access(uuid) from public, anon;
grant execute on function public.identity_assert_access(uuid) to authenticated;
