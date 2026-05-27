insert into public.recruiter_role_pool (recruiter_role_id, code, description)
select
  hrr.legacy_role_id,
  hrr.name,
  coalesce(rrp.description, hrr.name)
from public.hireveri_recruiter_roles hrr
left join public.recruiter_role_pool rrp
  on rrp.recruiter_role_id = hrr.legacy_role_id
where hrr.is_active = true
  and hrr.legacy_role_id is not null
on conflict (recruiter_role_id) do update
set
  code = excluded.code,
  description = coalesce(public.recruiter_role_pool.description, excluded.description);

insert into public.role_permissions (recruiter_role_id, permission)
select hrr.legacy_role_id, permission.permission_code
from public.hireveri_recruiter_roles hrr
cross join lateral (
  values
    ('ai.use'),
    ('alerts.view'),
    ('candidates.invite'),
    ('candidates.view'),
    ('interviews.create'),
    ('interviews.edit'),
    ('reports.view')
) as permission(permission_code)
where hrr.is_active = true
  and hrr.legacy_role_id is not null
  and hrr.name in (
    'Hiring Manager',
    'Recruitment Operations',
    'People Operations'
  )
on conflict (recruiter_role_id, permission) do nothing;

insert into public.role_permissions (recruiter_role_id, permission)
select hrr.legacy_role_id, 'interviews.delete'
from public.hireveri_recruiter_roles hrr
where hrr.is_active = true
  and hrr.legacy_role_id is not null
  and hrr.name = 'Hiring Manager'
on conflict (recruiter_role_id, permission) do nothing;
