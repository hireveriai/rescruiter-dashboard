-- Persist recruiter alert read state per organization so unread counts survive logout/login.

create table if not exists public.dashboard_alert_reads (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(organization_id) on delete cascade,
  user_id uuid not null references public.users(user_id) on delete cascade,
  alert_id text not null,
  read_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint dashboard_alert_reads_org_user_alert_unique unique (organization_id, user_id, alert_id)
);

create index if not exists dashboard_alert_reads_org_user_idx
  on public.dashboard_alert_reads (organization_id, user_id, read_at desc);

create index if not exists dashboard_alert_reads_alert_idx
  on public.dashboard_alert_reads (alert_id);
