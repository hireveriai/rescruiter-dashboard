insert into public.permissions (permission_code, description)
values
  ('ai.use', 'Use AI features'),
  ('alerts.view', 'View risk alerts'),
  ('billing.view', 'View billing and usage'),
  ('candidates.invite', 'Invite candidates'),
  ('candidates.view', 'View candidate list'),
  ('interviews.create', 'Create new interviews'),
  ('interviews.delete', 'Delete interviews'),
  ('interviews.edit', 'Edit interviews'),
  ('organization.settings', 'Manage organization settings'),
  ('reports.view', 'View reports and results'),
  ('users.manage', 'Manage team members'),
  ('warroom.analyze', 'Analyze interview deeply'),
  ('warroom.view', 'View interview forensic data')
on conflict (permission_code) do update
set description = excluded.description;

insert into public.recruiter_role_pool (recruiter_role_id, code, description)
values
  (1, 'Recruiter', 'Standard recruiter'),
  (2, 'Hiring Manager', 'Hiring decision maker'),
  (3, 'Founder/CEO', 'Founder or owner')
on conflict (recruiter_role_id) do update
set
  code = excluded.code,
  description = excluded.description;

insert into public.role_permissions (recruiter_role_id, permission)
values
  (1, 'ai.use'),
  (1, 'alerts.view'),
  (1, 'candidates.invite'),
  (1, 'candidates.view'),
  (1, 'interviews.create'),
  (1, 'interviews.edit'),
  (1, 'reports.view'),
  (2, 'ai.use'),
  (2, 'alerts.view'),
  (2, 'candidates.invite'),
  (2, 'candidates.view'),
  (2, 'interviews.create'),
  (2, 'interviews.delete'),
  (2, 'interviews.edit'),
  (2, 'reports.view'),
  (2, 'warroom.view'),
  (3, 'ai.use'),
  (3, 'alerts.view'),
  (3, 'billing.view'),
  (3, 'candidates.invite'),
  (3, 'candidates.view'),
  (3, 'interviews.create'),
  (3, 'interviews.delete'),
  (3, 'interviews.edit'),
  (3, 'organization.settings'),
  (3, 'reports.view'),
  (3, 'users.manage'),
  (3, 'warroom.analyze'),
  (3, 'warroom.view')
on conflict (recruiter_role_id, permission) do nothing;
