-- English is the default language; users can still pick Arabic (RTL) or French.
alter table public.profiles alter column locale set default 'en';
