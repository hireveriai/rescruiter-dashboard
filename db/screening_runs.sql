-- Screening Run History for HireVeri VERIS Screening
-- Run separately in dev and prod.

create table if not exists public.screening_runs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(organization_id) on delete cascade,
  job_id uuid not null references public.jobs(id) on delete cascade,
  batch_id uuid null,
  created_by uuid null references public.users(user_id) on delete set null,
  created_at timestamptz not null default now(),
  total_candidates int not null default 0,
  strong_fit_count int not null default 0,
  avg_score numeric(5,2) not null default 0
);

create table if not exists public.screening_run_matches (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.screening_runs(id) on delete cascade,
  organization_id uuid not null references public.organizations(organization_id) on delete cascade,
  candidate_id uuid null references public.candidates(candidate_id) on delete set null,
  match_snapshot jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_screening_runs_org_job_created
  on public.screening_runs (organization_id, job_id, created_at desc);

create index if not exists idx_screening_runs_batch
  on public.screening_runs (organization_id, batch_id)
  where batch_id is not null;

create index if not exists idx_screening_run_matches_run
  on public.screening_run_matches (run_id);

create index if not exists idx_screening_run_matches_org_candidate
  on public.screening_run_matches (organization_id, candidate_id)
  where candidate_id is not null;

alter table public.screening_runs enable row level security;
alter table public.screening_run_matches enable row level security;

drop policy if exists screening_runs_recruiter_select on public.screening_runs;
create policy screening_runs_recruiter_select
on public.screening_runs
for select
using (organization_id = nullif(current_setting('request.jwt.claims', true)::jsonb->>'organization_id', '')::uuid);

drop policy if exists screening_run_matches_recruiter_select on public.screening_run_matches;
create policy screening_run_matches_recruiter_select
on public.screening_run_matches
for select
using (organization_id = nullif(current_setting('request.jwt.claims', true)::jsonb->>'organization_id', '')::uuid);
