-- Recruiter post-interview decision state.
-- Interview lifecycle remains separate from recruiter hiring workflow.

create table if not exists public.candidate_recruiter_decisions (
  decision_id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  candidate_id uuid not null,
  interview_id uuid,
  attempt_id uuid,
  status text not null,
  decided_by uuid,
  decided_at timestamptz not null default now(),
  notes text,
  metadata jsonb not null default '{}'::jsonb,
  constraint candidate_recruiter_decisions_status_check
    check (status in ('REVIEWED', 'PROCEED', 'HOLD', 'REJECT'))
);

delete from public.candidate_recruiter_decisions a
using public.candidate_recruiter_decisions b
where a.organization_id = b.organization_id
  and a.candidate_id = b.candidate_id
  and coalesce(a.interview_id::text, '') = coalesce(b.interview_id::text, '')
  and a.ctid < b.ctid;

create unique index if not exists candidate_recruiter_decisions_scope_uidx
  on public.candidate_recruiter_decisions (
    organization_id,
    candidate_id,
    coalesce(interview_id::text, '')
  );

create index if not exists candidate_recruiter_decisions_org_status_idx
  on public.candidate_recruiter_decisions (organization_id, status, decided_at desc);
