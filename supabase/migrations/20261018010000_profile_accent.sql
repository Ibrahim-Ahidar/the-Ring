-- Accent color preference on the caller's profile (indigo default, green = classic).

create type public.profile_accent as enum ('indigo', 'green');

alter table public.profiles
  add column accent public.profile_accent not null default 'indigo';

create or replace function public.appearance_update_accent(p_accent text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
begin
  if v_actor is null then
    raise exception 'platform.unauthenticated' using errcode = 'P0001';
  end if;

  if p_accent is null or p_accent not in ('indigo', 'green') then
    raise exception 'appearance.invalid_preference' using errcode = 'P0001';
  end if;

  update public.profiles p
  set accent = p_accent::public.profile_accent
  where p.id = v_actor;
end;
$$;
