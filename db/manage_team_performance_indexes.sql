create index if not exists idx_users_org_role_created_at
  on public.users (organization_id, role, created_at desc);

create index if not exists idx_recruiter_profiles_org_recruiter_role
  on public.recruiter_profiles (organization_id, recruiter_id, recruiter_role_id);

create index if not exists idx_hireveri_recruiter_roles_active_sort
  on public.hireveri_recruiter_roles (is_active, sort_order, name)
  where legacy_role_id is not null;

create index if not exists idx_hireveri_recruiter_roles_legacy_role_id
  on public.hireveri_recruiter_roles (legacy_role_id)
  where legacy_role_id is not null;

create index if not exists idx_role_permissions_role_permission
  on public.role_permissions (recruiter_role_id, permission);

create index if not exists idx_recruiter_team_invites_org_lower_email_invited_at
  on public.recruiter_team_invites (org_id, lower(invited_email), invited_at desc);
