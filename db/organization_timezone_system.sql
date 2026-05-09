alter table if exists public.organizations
  add column if not exists timezone varchar(100) not null default 'Asia/Kolkata',
  add column if not exists timezone_label varchar(100) not null default 'India Standard Time';

update public.organizations
set
  timezone = coalesce(nullif(timezone, ''), 'Asia/Kolkata'),
  timezone_label = coalesce(nullif(timezone_label, ''), 'India Standard Time')
where timezone is null
   or timezone = ''
   or timezone_label is null
   or timezone_label = '';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'chk_organizations_timezone_format'
  ) then
    alter table public.organizations
      add constraint chk_organizations_timezone_format
      check (position('/' in timezone) > 0 or timezone = 'UTC');
  end if;
end $$;
