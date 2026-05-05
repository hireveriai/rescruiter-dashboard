create extension if not exists pgcrypto;

do $$
begin
  if exists (
    select 1
    from information_schema.schemata
    where schema_name = 'storage'
  ) then
    execute $storage$
      insert into storage.buckets (
        id,
        name,
        public,
        file_size_limit,
        allowed_mime_types
      )
      values (
        'resumes',
        'resumes',
        false,
        15728640,
        array[
          'application/pdf',
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
        ]::text[]
      )
      on conflict (id) do update
      set
        public = excluded.public,
        file_size_limit = excluded.file_size_limit,
        allowed_mime_types = excluded.allowed_mime_types
    $storage$;
  end if;
end $$;

create table if not exists public.jobs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(organization_id) on delete cascade,
  title text not null,
  description text not null,
  required_skills text[] not null default array[]::text[],
  experience_needed numeric(4, 1),
  role_title text,
  extracted_json jsonb not null default '{}'::jsonb,
  source_job_position_id uuid references public.job_positions(job_id) on delete set null,
  created_by uuid references public.users(user_id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_ai_jobs_organization_created_at
  on public.jobs (organization_id, created_at desc);

create index if not exists idx_ai_jobs_source_job_position
  on public.jobs (source_job_position_id);

alter table if exists public.candidates
  alter column email drop not null;

alter table if exists public.candidates
  add column if not exists extracted_json jsonb not null default '{}'::jsonb,
  add column if not exists upload_batch_id uuid,
  add column if not exists ai_screening_status text not null default 'READY',
  add column if not exists created_by uuid references public.users(user_id) on delete set null,
  add column if not exists updated_at timestamptz not null default now();

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'candidates_email_valid_or_null'
      and conrelid = 'public.candidates'::regclass
  ) then
    alter table public.candidates
      add constraint candidates_email_valid_or_null
      check (
        email is null
        or email ~* '^[A-Z0-9._%+\-]+@[A-Z0-9.\-]+\.[A-Z]{2,}$'
      )
      not valid;
  end if;
end $$;

create index if not exists idx_candidates_ai_screening_org_created_at
  on public.candidates (organization_id, created_at desc);

create index if not exists idx_candidates_ai_screening_email
  on public.candidates (organization_id, lower(email))
  where email is not null;

create index if not exists idx_candidates_ai_screening_upload_batch
  on public.candidates (organization_id, upload_batch_id, created_at desc)
  where upload_batch_id is not null;

create table if not exists public.ai_screening_upload_batches (
  batch_id uuid primary key,
  organization_id uuid not null references public.organizations(organization_id) on delete cascade,
  created_by uuid references public.users(user_id) on delete set null,
  candidate_ids jsonb not null default '[]'::jsonb,
  file_names jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_ai_screening_upload_batches_org_created_at
  on public.ai_screening_upload_batches (organization_id, created_at desc);

create table if not exists public.candidate_job_matches (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(organization_id) on delete cascade,
  candidate_id uuid not null references public.candidates(candidate_id) on delete cascade,
  job_id uuid not null references public.jobs(id) on delete cascade,
  match_score int not null check (match_score between 0 and 100),
  skill_match int not null check (skill_match between 0 and 100),
  experience_match int not null check (experience_match between 0 and 100),
  risk_level text not null check (risk_level in ('LOW', 'MEDIUM', 'HIGH')),
  recommendation text not null check (recommendation in ('STRONG_FIT', 'POTENTIAL', 'WEAK', 'REJECT')),
  insights jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (candidate_id, job_id)
);

create index if not exists idx_candidate_job_matches_job_score
  on public.candidate_job_matches (job_id, match_score desc);

create index if not exists idx_candidate_job_matches_org_recommendation
  on public.candidate_job_matches (organization_id, recommendation, match_score desc);

alter table if exists public.interview_invites
  add column if not exists candidate_id uuid references public.candidates(candidate_id) on delete set null,
  add column if not exists job_id uuid references public.jobs(id) on delete set null,
  add column if not exists email text,
  add column if not exists invite_link text,
  add column if not exists ai_screening_match_id uuid references public.candidate_job_matches(id) on delete set null,
  add column if not exists ai_screening_email_status text,
  add column if not exists ai_screening_sent_at timestamptz;

create index if not exists idx_interview_invites_ai_screening_job
  on public.interview_invites (job_id, created_at desc)
  where job_id is not null;

create index if not exists idx_interview_invites_ai_screening_candidate
  on public.interview_invites (candidate_id, created_at desc)
  where candidate_id is not null;

create or replace function public.set_ai_screening_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_ai_jobs_updated_at on public.jobs;
create trigger trg_ai_jobs_updated_at
before update on public.jobs
for each row execute function public.set_ai_screening_updated_at();

drop trigger if exists trg_candidate_job_matches_updated_at on public.candidate_job_matches;
create trigger trg_candidate_job_matches_updated_at
before update on public.candidate_job_matches
for each row execute function public.set_ai_screening_updated_at();

drop trigger if exists trg_candidates_ai_screening_updated_at on public.candidates;
create trigger trg_candidates_ai_screening_updated_at
before update of extracted_json, upload_batch_id, ai_screening_status, resume_url, resume_text, email, phone on public.candidates
for each row execute function public.set_ai_screening_updated_at();

create or replace function public.current_recruiter_organization_id()
returns uuid
language sql
stable
security definer
set search_path = public, auth
as $$
  select u.organization_id
  from public.users u
  where u.identity_id = auth.uid()
    and u.role in ('RECRUITER', 'ADMIN', 'ORG_OWNER')
    and u.is_active = true
  limit 1
$$;

grant execute on function public.current_recruiter_organization_id() to authenticated;

alter table public.jobs enable row level security;
alter table public.candidate_job_matches enable row level security;

drop policy if exists jobs_recruiter_select on public.jobs;
create policy jobs_recruiter_select
on public.jobs
for select
to authenticated
using (organization_id = public.current_recruiter_organization_id());

drop policy if exists jobs_recruiter_insert on public.jobs;
create policy jobs_recruiter_insert
on public.jobs
for insert
to authenticated
with check (organization_id = public.current_recruiter_organization_id());

drop policy if exists jobs_recruiter_update on public.jobs;
create policy jobs_recruiter_update
on public.jobs
for update
to authenticated
using (organization_id = public.current_recruiter_organization_id())
with check (organization_id = public.current_recruiter_organization_id());

drop policy if exists candidate_job_matches_recruiter_select on public.candidate_job_matches;
create policy candidate_job_matches_recruiter_select
on public.candidate_job_matches
for select
to authenticated
using (organization_id = public.current_recruiter_organization_id());

drop policy if exists candidate_job_matches_recruiter_insert on public.candidate_job_matches;
create policy candidate_job_matches_recruiter_insert
on public.candidate_job_matches
for insert
to authenticated
with check (organization_id = public.current_recruiter_organization_id());

drop policy if exists candidate_job_matches_recruiter_update on public.candidate_job_matches;
create policy candidate_job_matches_recruiter_update
on public.candidate_job_matches
for update
to authenticated
using (organization_id = public.current_recruiter_organization_id())
with check (organization_id = public.current_recruiter_organization_id());

alter table public.candidates enable row level security;

drop policy if exists candidates_recruiter_ai_screening_select on public.candidates;
create policy candidates_recruiter_ai_screening_select
on public.candidates
for select
to authenticated
using (organization_id = public.current_recruiter_organization_id());

drop policy if exists candidates_recruiter_ai_screening_insert on public.candidates;
create policy candidates_recruiter_ai_screening_insert
on public.candidates
for insert
to authenticated
with check (organization_id = public.current_recruiter_organization_id());

drop policy if exists candidates_recruiter_ai_screening_update on public.candidates;
create policy candidates_recruiter_ai_screening_update
on public.candidates
for update
to authenticated
using (organization_id = public.current_recruiter_organization_id())
with check (organization_id = public.current_recruiter_organization_id());

alter table public.interview_invites enable row level security;

drop policy if exists interview_invites_recruiter_ai_screening_select on public.interview_invites;
create policy interview_invites_recruiter_ai_screening_select
on public.interview_invites
for select
to authenticated
using (
  exists (
    select 1
    from public.interviews i
    where i.interview_id = interview_invites.interview_id
      and i.organization_id = public.current_recruiter_organization_id()
  )
  or exists (
    select 1
    from public.candidates c
    where c.candidate_id = interview_invites.candidate_id
      and c.organization_id = public.current_recruiter_organization_id()
  )
);

drop policy if exists interview_invites_recruiter_ai_screening_update on public.interview_invites;
create policy interview_invites_recruiter_ai_screening_update
on public.interview_invites
for update
to authenticated
using (
  exists (
    select 1
    from public.interviews i
    where i.interview_id = interview_invites.interview_id
      and i.organization_id = public.current_recruiter_organization_id()
  )
  or exists (
    select 1
    from public.candidates c
    where c.candidate_id = interview_invites.candidate_id
      and c.organization_id = public.current_recruiter_organization_id()
  )
);
