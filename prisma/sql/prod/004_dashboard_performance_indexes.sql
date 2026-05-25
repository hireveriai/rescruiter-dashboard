-- Dashboard read-path indexes for fast recruiter workspace loading.
-- Safe to run multiple times.

create index if not exists idx_interviews_org_created_desc
  on public.interviews (organization_id, created_at desc);

create index if not exists idx_interviews_org_candidate_created_desc
  on public.interviews (organization_id, candidate_id, created_at desc);

create index if not exists idx_interview_invites_interview_created_desc
  on public.interview_invites (interview_id, created_at desc);

create index if not exists idx_interview_attempts_interview_attempt_started_desc
  on public.interview_attempts (interview_id, attempt_number desc, started_at desc);

create index if not exists idx_interview_evaluations_attempt
  on public.interview_evaluations (attempt_id);

create index if not exists idx_candidates_org_created_desc
  on public.candidates (organization_id, created_at desc);

create index if not exists idx_candidate_job_matches_org_candidate_created_desc
  on public.candidate_job_matches (organization_id, candidate_id, created_at desc);

create index if not exists idx_job_positions_org_created_desc
  on public.job_positions (organization_id, created_at desc);

create index if not exists idx_screening_runs_org_created_desc
  on public.screening_runs (organization_id, created_at desc);
