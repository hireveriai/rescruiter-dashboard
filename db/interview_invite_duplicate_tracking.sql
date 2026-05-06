alter table if exists public.interview_invites
  add column if not exists company_id uuid,
  add column if not exists candidate_email text,
  add column if not exists sent_at timestamptz;

update public.interview_invites ii
set
  company_id = coalesce(ii.company_id, i.organization_id),
  candidate_email = coalesce(ii.candidate_email, ii.email, c.email),
  sent_at = coalesce(ii.sent_at, ii.ai_screening_sent_at, ii.created_at)
from public.interviews i
left join public.candidates c
  on c.candidate_id = i.candidate_id
where i.interview_id = ii.interview_id;

update public.interview_invites
set
  candidate_email = coalesce(candidate_email, email),
  sent_at = coalesce(sent_at, ai_screening_sent_at, created_at)
where candidate_email is null
   or sent_at is null;

create index if not exists idx_interview_invites_company_email_sent_at
  on public.interview_invites (company_id, lower(candidate_email), sent_at desc);

create index if not exists idx_interview_invites_company_job_sent_at
  on public.interview_invites (company_id, job_id, sent_at desc);

do $$
declare
  v_constraint record;
begin
  for v_constraint in
    select
      tc.constraint_name
    from information_schema.table_constraints tc
    inner join information_schema.key_column_usage kcu
      on kcu.constraint_schema = tc.constraint_schema
     and kcu.constraint_name = tc.constraint_name
     and kcu.table_schema = tc.table_schema
     and kcu.table_name = tc.table_name
    where tc.table_schema = 'public'
      and tc.table_name = 'interview_invites'
      and tc.constraint_type = 'UNIQUE'
    group by tc.constraint_name
    having bool_or(kcu.column_name = 'candidate_email')
  loop
    execute format('alter table public.interview_invites drop constraint if exists %I', v_constraint.constraint_name);
  end loop;
end;
$$;

do $$
declare
  v_index record;
begin
  for v_index in
    select
      indexname
    from pg_indexes
    where schemaname = 'public'
      and tablename = 'interview_invites'
      and indexdef ilike '%unique%'
      and indexdef ilike '%candidate_email%'
  loop
    execute format('drop index if exists public.%I', v_index.indexname);
  end loop;
end;
$$;
