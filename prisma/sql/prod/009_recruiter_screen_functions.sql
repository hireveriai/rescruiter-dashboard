-- Recruiter screen read/write functions.
-- Run this script once per environment after the base schema scripts.
-- It is additive: no table drops and no destructive data changes.

create extension if not exists pgcrypto;

create or replace function public.fn_recruiter_get_jobs_screen(
  p_organization_id uuid,
  p_include_inactive boolean default false,
  p_view text default null
)
returns jsonb
language plpgsql
stable
as $$
declare
  v_supports_active boolean;
  v_supports_coding boolean;
  v_supports_question_type boolean;
  v_jobs jsonb;
begin
  select exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'job_positions'
      and column_name = 'is_active'
  ) into v_supports_active;

  select exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'job_positions'
      and column_name in (
        'coding_required',
        'coding_assessment_type',
        'coding_difficulty',
        'coding_duration_minutes',
        'coding_languages'
      )
    group by table_schema, table_name
    having count(*) = 5
  ) into v_supports_coding;

  select exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'job_positions'
      and column_name = 'question_type_default'
  ) into v_supports_question_type;

  select coalesce(jsonb_agg(
    case when p_view = 'selector' then
      jsonb_build_object(
        'jobId', jp.job_id,
        'jobTitle', jp.job_title,
        'isActive', coalesce(nullif(to_jsonb(jp)->>'is_active', '')::boolean, true)
      )
    else
      jsonb_build_object(
        'jobId', jp.job_id,
        'jobTitle', jp.job_title,
        'jobDescription', jp.job_description,
        'experienceLevelId', jp.experience_level_id,
        'difficultyProfile', jp.difficulty_profile::text,
        'interviewDurationMinutes', jp.interview_duration_minutes,
        'questionTypeDefault', coalesce(to_jsonb(jp)->>'question_type_default', 'AUTO'),
        'coreSkills', coalesce(to_jsonb(jp)->'core_skills', '[]'::jsonb),
        'codingRequired', to_jsonb(jp)->>'coding_required',
        'codingAssessmentType', to_jsonb(jp)->>'coding_assessment_type',
        'codingDifficulty', to_jsonb(jp)->>'coding_difficulty',
        'codingDurationMinutes', to_jsonb(jp)->'coding_duration_minutes',
        'codingLanguages', coalesce(to_jsonb(jp)->'coding_languages', '[]'::jsonb),
        'isActive', coalesce(nullif(to_jsonb(jp)->>'is_active', '')::boolean, true),
        '_count', jsonb_build_object(
          'interviews',
          (
            select count(*)::int
            from public.interviews i
            where i.job_id = jp.job_id
          )
        )
      )
    end
    order by jp.job_id desc
  ), '[]'::jsonb)
  into v_jobs
  from public.job_positions jp
  where jp.organization_id = p_organization_id
    and (
      p_include_inactive
      or not v_supports_active
      or coalesce(nullif(to_jsonb(jp)->>'is_active', '')::boolean, true)
    );

  return jsonb_build_object(
    'jobs', v_jobs,
    'meta', jsonb_strip_nulls(jsonb_build_object(
      'supportsJobActiveState', v_supports_active,
      'supportsCodingConfig', case when p_view = 'selector' then null else v_supports_coding end,
      'supportsQuestionTypeDefault', case when p_view = 'selector' then null else v_supports_question_type end,
      'view', case when p_view = 'selector' then 'selector' else null end
    ))
  );
end;
$$;

create or replace function public.fn_recruiter_upsert_job(
  p_organization_id uuid,
  p_payload jsonb,
  p_job_id uuid default null
)
returns jsonb
language plpgsql
as $$
declare
  v_job_id uuid := p_job_id;
  v_core_skills text[];
begin
  select coalesce(array_agg(value), array[]::text[])
  into v_core_skills
  from jsonb_array_elements_text(coalesce(p_payload->'core_skills', p_payload->'coreSkills', '[]'::jsonb)) as value;

  if v_job_id is null then
    insert into public.job_positions (
      organization_id,
      job_title,
      job_description,
      experience_level_id,
      core_skills,
      difficulty_profile,
      interview_duration_minutes
    )
    values (
      p_organization_id,
      coalesce(p_payload->>'job_title', p_payload->>'jobTitle'),
      nullif(coalesce(p_payload->>'job_description', p_payload->>'jobDescription'), ''),
      coalesce(p_payload->>'experience_level_id', p_payload->>'experienceLevelId')::smallint,
      v_core_skills,
      coalesce(p_payload->>'difficulty_profile', p_payload->>'difficultyProfile')::public.difficulty_profile,
      coalesce(nullif(coalesce(p_payload->>'interview_duration_minutes', p_payload->>'interviewDurationMinutes'), ''), '30')::integer
    )
    returning job_id into v_job_id;
  else
    update public.job_positions
    set
      job_title = coalesce(p_payload->>'job_title', p_payload->>'jobTitle'),
      job_description = nullif(coalesce(p_payload->>'job_description', p_payload->>'jobDescription'), ''),
      experience_level_id = coalesce(p_payload->>'experience_level_id', p_payload->>'experienceLevelId')::smallint,
      core_skills = v_core_skills,
      difficulty_profile = coalesce(p_payload->>'difficulty_profile', p_payload->>'difficultyProfile')::public.difficulty_profile,
      interview_duration_minutes = coalesce(nullif(coalesce(p_payload->>'interview_duration_minutes', p_payload->>'interviewDurationMinutes'), ''), '30')::integer
    where job_id = v_job_id
      and organization_id = p_organization_id;
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'job_positions' and column_name = 'is_active'
  ) and p_payload ? 'is_active' then
    execute 'update public.job_positions set is_active = $1 where job_id = $2 and organization_id = $3'
    using (p_payload->>'is_active')::boolean, v_job_id, p_organization_id;
  end if;

  return jsonb_build_object('job_id', v_job_id);
end;
$$;

create or replace function public.fn_recruiter_get_candidates_screen(
  p_organization_id uuid,
  p_limit integer default 20
)
returns jsonb
language sql
stable
as $$
  select coalesce(jsonb_agg(row_payload order by created_at desc), '[]'::jsonb)
  from (
    select
      c.created_at,
      jsonb_build_object(
        'candidateId', c.candidate_id,
        'candidateName', c.full_name,
        'email', c.email,
        'status', coalesce(i.status, c.status, 'PENDING'),
        'jobTitle', jp.job_title,
        'interviewId', i.interview_id,
        'attemptId', ia.attempt_id,
        'score', ie.final_score,
        'decision', ie.decision,
        'createdAt', c.created_at,
        'endedAt', ia.ended_at
      ) as row_payload
    from public.candidates c
    left join lateral (
      select i.*
      from public.interviews i
      where i.organization_id = c.organization_id
        and i.candidate_id = c.candidate_id
      order by i.created_at desc
      limit 1
    ) i on true
    left join public.job_positions jp on jp.job_id = i.job_id
    left join lateral (
      select ia.*
      from public.interview_attempts ia
      where ia.interview_id = i.interview_id
      order by ia.started_at desc
      limit 1
    ) ia on true
    left join public.interview_evaluations ie on ie.attempt_id = ia.attempt_id
    where c.organization_id = p_organization_id
    order by c.created_at desc
    limit greatest(coalesce(p_limit, 20), 1)
  ) rows;
$$;

create or replace function public.fn_recruiter_upsert_candidate(
  p_organization_id uuid,
  p_job_id uuid,
  p_full_name text,
  p_email text,
  p_resume_url text default null,
  p_resume_text text default null
)
returns jsonb
language plpgsql
as $$
declare
  v_candidate_id uuid;
begin
  select candidate_id
  into v_candidate_id
  from public.fn_upsert_candidate(
    p_organization_id,
    p_job_id,
    p_full_name,
    lower(p_email),
    p_resume_url,
    p_resume_text
  );

  return jsonb_build_object('candidate_id', v_candidate_id);
end;
$$;

create or replace function public.fn_recruiter_get_interviews_screen(
  p_organization_id uuid,
  p_limit integer default 200
)
returns jsonb
language sql
stable
as $$
  select coalesce(jsonb_agg(row_payload order by created_at desc), '[]'::jsonb)
  from (
    select
      i.created_at,
      jsonb_build_object(
        'interviewId', i.interview_id,
        'candidateId', i.candidate_id,
        'candidateName', c.full_name,
        'jobTitle', jp.job_title,
        'status', i.status,
        'questionStatus', i.question_status,
        'emailStatus', i.email_status,
        'inviteStatus', inv.status,
        'attemptId', ia.attempt_id,
        'attemptStatus', ia.status,
        'score', ie.final_score,
        'decision', ie.decision,
        'createdAt', i.created_at,
        'startedAt', ia.started_at,
        'endedAt', ia.ended_at
      ) as row_payload
    from public.interviews i
    join public.candidates c on c.candidate_id = i.candidate_id
    join public.job_positions jp on jp.job_id = i.job_id
    left join lateral (
      select inv.*
      from public.interview_invites inv
      where inv.interview_id = i.interview_id
      order by inv.created_at desc
      limit 1
    ) inv on true
    left join lateral (
      select ia.*
      from public.interview_attempts ia
      where ia.interview_id = i.interview_id
      order by ia.started_at desc
      limit 1
    ) ia on true
    left join public.interview_evaluations ie on ie.attempt_id = ia.attempt_id
    where i.organization_id = p_organization_id
    order by i.created_at desc
    limit greatest(coalesce(p_limit, 200), 1)
  ) rows;
$$;

create or replace function public.fn_recruiter_get_dashboard_screen(
  p_organization_id uuid
)
returns jsonb
language sql
stable
as $$
  select jsonb_build_object(
    'jobs', (select count(*)::int from public.job_positions where organization_id = p_organization_id),
    'candidates', (select count(*)::int from public.candidates where organization_id = p_organization_id),
    'interviews', (select count(*)::int from public.interviews where organization_id = p_organization_id),
    'completedInterviews', (
      select count(*)::int
      from public.interviews
      where organization_id = p_organization_id
        and upper(coalesce(status, '')) in ('COMPLETED', 'SUBMITTED', 'EVALUATED')
    )
  );
$$;

create or replace function public.fn_recruiter_get_reports_screen(
  p_organization_id uuid
)
returns jsonb
language sql
stable
as $$
  select jsonb_build_object(
    'summary', public.fn_recruiter_get_dashboard_screen(p_organization_id),
    'scores', coalesce((
      select jsonb_build_object(
        'average', round(avg(ie.final_score)::numeric, 2),
        'highest', max(ie.final_score),
        'lowest', min(ie.final_score)
      )
      from public.interviews i
      join public.interview_attempts ia on ia.interview_id = i.interview_id
      join public.interview_evaluations ie on ie.attempt_id = ia.attempt_id
      where i.organization_id = p_organization_id
    ), '{}'::jsonb)
  );
$$;

create or replace function public.fn_recruiter_get_billing_screen(
  p_organization_id uuid
)
returns jsonb
language sql
stable
as $$
  select jsonb_build_object(
    'subscription', (
      select to_jsonb(s)
      from public.hireveri_user_subscriptions s
      where s."organizationId" = p_organization_id
      limit 1
    ),
    'invoices', coalesce((
      select jsonb_agg(to_jsonb(i) order by i.invoice_date desc)
      from public.invoices i
      where i.organization_id = p_organization_id
    ), '[]'::jsonb),
    'payments', coalesce((
      select jsonb_agg(to_jsonb(p) order by p."createdAt" desc)
      from public.hireveri_payments p
      where p."organizationId" = p_organization_id
    ), '[]'::jsonb)
  );
$$;

create or replace function public.fn_recruiter_upsert_decision(
  p_organization_id uuid,
  p_user_id uuid,
  p_candidate_id uuid,
  p_interview_id uuid default null,
  p_attempt_id uuid default null,
  p_status text default 'REVIEW_REQUIRED',
  p_notes text default null
)
returns jsonb
language plpgsql
as $$
declare
  v_decision_id uuid;
begin
  insert into public.candidate_recruiter_decisions (
    organization_id,
    candidate_id,
    interview_id,
    attempt_id,
    status,
    decided_by,
    decided_at,
    notes
  )
  values (
    p_organization_id,
    p_candidate_id,
    p_interview_id,
    p_attempt_id,
    p_status,
    p_user_id,
    now(),
    p_notes
  )
  on conflict (
    organization_id,
    candidate_id,
    coalesce(interview_id::text, '')
  )
  do update set
    attempt_id = excluded.attempt_id,
    status = excluded.status,
    decided_by = excluded.decided_by,
    decided_at = excluded.decided_at,
    notes = excluded.notes
  returning decision_id into v_decision_id;

  return jsonb_build_object('decision_id', v_decision_id);
end;
$$;
