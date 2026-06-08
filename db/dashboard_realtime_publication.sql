create table if not exists public.dashboard_realtime_events (
  event_id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(organization_id) on delete cascade,
  source_table text not null,
  source_id text,
  event_type text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_dashboard_realtime_events_org_created
  on public.dashboard_realtime_events (organization_id, created_at desc);

alter table public.dashboard_realtime_events enable row level security;

drop policy if exists dashboard_realtime_events_recruiter_select on public.dashboard_realtime_events;
create policy dashboard_realtime_events_recruiter_select
on public.dashboard_realtime_events
for select
using (
  organization_id = public.current_recruiter_organization_id()
  or organization_id = nullif(current_setting('request.jwt.claims', true)::jsonb->>'organization_id', '')::uuid
);

create or replace function public.fn_emit_dashboard_realtime_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_organization_id uuid;
  v_source_id text;
  v_new jsonb := '{}'::jsonb;
  v_old jsonb := '{}'::jsonb;
begin
  if tg_op in ('INSERT', 'UPDATE') then
    v_new := to_jsonb(new);
  end if;

  if tg_op in ('UPDATE', 'DELETE') then
    v_old := to_jsonb(old);
  end if;

  if tg_table_name in ('interviews', 'job_positions', 'candidates', 'candidate_job_matches', 'screening_runs', 'candidate_recruiter_decisions') then
    v_organization_id := coalesce((v_new->>'organization_id')::uuid, (v_old->>'organization_id')::uuid);
  elsif tg_table_name = 'interview_invites' then
    select i.organization_id
    into v_organization_id
    from public.interviews i
    where i.interview_id = coalesce((v_new->>'interview_id')::uuid, (v_old->>'interview_id')::uuid);
  elsif tg_table_name in ('interview_attempts', 'interview_evaluations') then
    select i.organization_id
    into v_organization_id
    from public.interviews i
    left join public.interview_attempts ia
      on ia.interview_id = i.interview_id
    where ia.attempt_id = coalesce((v_new->>'attempt_id')::uuid, (v_old->>'attempt_id')::uuid);
  elsif tg_table_name = 'interview_recordings' then
    select i.organization_id
    into v_organization_id
    from public.interviews i
    left join public.interview_attempts ia on ia.interview_id = i.interview_id
    where i.interview_id = coalesce((v_new->>'interview_id')::uuid, (v_old->>'interview_id')::uuid)
       or ia.attempt_id = coalesce((v_new->>'attempt_id')::uuid, (v_old->>'attempt_id')::uuid)
    limit 1;
  end if;

  if v_organization_id is null then
    if tg_op = 'DELETE' then
      return old;
    end if;

    return new;
  end if;

  v_source_id := coalesce(
    v_new->>'interview_id',
    v_new->>'candidate_id',
    v_new->>'job_id',
    v_new->>'attempt_id',
    v_new->>'evaluation_id',
    v_new->>'invite_id',
    v_new->>'recording_id',
    v_new->>'id',
    v_old->>'interview_id',
    v_old->>'candidate_id',
    v_old->>'job_id',
    v_old->>'attempt_id',
    v_old->>'evaluation_id',
    v_old->>'invite_id',
    v_old->>'recording_id',
    v_old->>'id'
  );

  insert into public.dashboard_realtime_events (
    organization_id,
    source_table,
    source_id,
    event_type
  )
  values (
    v_organization_id,
    tg_table_name,
    v_source_id,
    tg_op
  );

  if tg_op = 'DELETE' then
    return old;
  end if;

  return new;
end $$;

do $$
declare
  trigger_table text;
begin
  foreach trigger_table in array array[
    'interviews',
    'interview_invites',
    'interview_attempts',
    'interview_evaluations',
    'interview_recordings',
    'job_positions',
    'candidates',
    'candidate_job_matches',
    'screening_runs',
    'candidate_recruiter_decisions'
  ]
  loop
    if to_regclass(format('public.%I', trigger_table)) is not null then
      execute format('drop trigger if exists trg_dashboard_realtime_%I on public.%I', trigger_table, trigger_table);
      execute format(
        'create trigger trg_dashboard_realtime_%I after insert or update or delete on public.%I for each row execute function public.fn_emit_dashboard_realtime_event()',
        trigger_table,
        trigger_table
      );
    end if;
  end loop;
end $$;

do $$
declare
  realtime_table text;
begin
  foreach realtime_table in array array[
    'dashboard_realtime_events',
    'interviews',
    'job_positions',
    'candidates',
    'candidate_job_matches',
    'screening_runs',
    'candidate_recruiter_decisions'
  ]
  loop
    if to_regclass(format('public.%I', realtime_table)) is not null then
      begin
        execute format('alter publication supabase_realtime add table public.%I', realtime_table);
      exception
        when duplicate_object then
          null;
        when undefined_object then
          null;
      end;

      execute format('alter table public.%I replica identity full', realtime_table);
    end if;
  end loop;
end $$;
