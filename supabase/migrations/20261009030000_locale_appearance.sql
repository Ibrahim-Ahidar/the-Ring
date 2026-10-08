-- Locale and appearance preferences on the caller's profile.

create or replace function public.appearance_update_locale(p_locale text)
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

  if p_locale is null or p_locale not in ('ar', 'en', 'fr') then
    raise exception 'appearance.invalid_preference' using errcode = 'P0001';
  end if;

  update public.profiles p
  set locale = p_locale
  where p.id = v_actor;
end;
$$;

create or replace function public.appearance_update_theme(p_theme text)
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

  if p_theme is null or p_theme not in ('system', 'light', 'dark') then
    raise exception 'appearance.invalid_preference' using errcode = 'P0001';
  end if;

  update public.profiles p
  set theme = p_theme::public.profile_theme
  where p.id = v_actor;
end;
$$;
