alter table public.users
  add column if not exists team_removed_at timestamptz null;

create index if not exists idx_users_org_role_team_removed
  on public.users (organization_id, role, team_removed_at);
