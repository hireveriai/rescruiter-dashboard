-- Workspace-scoped free trial credits for new recruiter organizations.
create table if not exists public.workspace_trial_credits (
  organization_id uuid primary key references public.organizations(organization_id) on delete cascade,
  interview_credits_remaining integer not null default 5,
  screening_credits_remaining integer not null default 15,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint workspace_trial_credits_interview_non_negative check (interview_credits_remaining >= 0),
  constraint workspace_trial_credits_screening_non_negative check (screening_credits_remaining >= 0)
);

insert into public.workspace_trial_credits (
  organization_id,
  interview_credits_remaining,
  screening_credits_remaining
)
select
  o.organization_id,
  5,
  15
from public.organizations o
where not exists (
  select 1
  from public.workspace_trial_credits c
  where c.organization_id = o.organization_id
);

create index if not exists workspace_trial_credits_updated_at_idx
  on public.workspace_trial_credits (updated_at desc);
