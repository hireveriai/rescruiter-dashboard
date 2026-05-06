alter table if exists public.candidates
  drop constraint if exists unique_email;

do $$
declare
  v_constraint record;
begin
  for v_constraint in
    select tc.constraint_name
    from information_schema.table_constraints tc
    inner join information_schema.key_column_usage kcu
      on kcu.constraint_schema = tc.constraint_schema
     and kcu.constraint_name = tc.constraint_name
     and kcu.table_schema = tc.table_schema
     and kcu.table_name = tc.table_name
    where tc.table_schema = 'public'
      and tc.table_name = 'candidates'
      and tc.constraint_type = 'UNIQUE'
    group by tc.constraint_name
    having bool_or(kcu.column_name = 'email')
  loop
    execute format('alter table public.candidates drop constraint if exists %I', v_constraint.constraint_name);
  end loop;
end;
$$;

do $$
declare
  v_index record;
begin
  for v_index in
    select indexname
    from pg_indexes
    where schemaname = 'public'
      and tablename = 'candidates'
      and indexdef ilike '%unique%'
      and indexdef ilike '%email%'
  loop
    execute format('drop index if exists public.%I', v_index.indexname);
  end loop;
end;
$$;

create index if not exists idx_candidates_org_email
  on public.candidates (organization_id, lower(email))
  where email is not null;

create or replace function public.fn_upsert_candidate(
  p_organization_id uuid,
  p_job_id uuid,
  p_full_name text,
  p_email text,
  p_resume_url text default null,
  p_resume_text text default null
)
returns table (
  candidate_id uuid
)
language plpgsql
as $$
declare
  v_candidate_id uuid;
begin
  if not exists (
    select 1
    from public.job_positions jp
    where jp.job_id = p_job_id
      and jp.organization_id = p_organization_id
  ) then
    raise exception 'JOB_NOT_FOUND: job not found for this organization';
  end if;

  select c.candidate_id
  into v_candidate_id
  from public.candidates c
  where c.organization_id = p_organization_id
    and lower(c.email) = lower(p_email)
  order by c.created_at desc
  limit 1;

  if v_candidate_id is not null then
    update public.candidates
    set
      full_name = p_full_name,
      email = lower(p_email),
      resume_url = p_resume_url,
      resume_text = p_resume_text
    where candidate_id = v_candidate_id;
  else
    insert into public.candidates (
      organization_id,
      full_name,
      email,
      resume_url,
      resume_text
    )
    values (
      p_organization_id,
      p_full_name,
      lower(p_email),
      p_resume_url,
      p_resume_text
    )
    returning candidates.candidate_id into v_candidate_id;
  end if;

  return query select v_candidate_id;
exception
  when others then
    perform public.log_backend_error(
      'fn_upsert_candidate',
      sqlerrm,
      sqlstate,
      jsonb_build_object(
        'organization_id', p_organization_id,
        'job_id', p_job_id,
        'email', p_email
      )
    );
    raise;
end;
$$;
