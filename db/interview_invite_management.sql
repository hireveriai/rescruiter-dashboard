alter table if exists public.interview_invites
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists revoked_at timestamptz,
  add column if not exists revoked_reason text;

create index if not exists idx_interview_invites_status_created_at
  on public.interview_invites (status, created_at desc);

create index if not exists idx_interview_invites_interview_id
  on public.interview_invites (interview_id);

create or replace function public.fn_update_interview_invite(
  p_organization_id uuid,
  p_invite_id uuid,
  p_access_type text default 'FLEXIBLE',
  p_start_time timestamptz default null,
  p_end_time timestamptz default null
)
returns table (
  invite_id uuid,
  interview_id uuid,
  access_type text,
  start_time timestamptz,
  end_time timestamptz,
  expires_at timestamptz,
  status text
)
language plpgsql
as $$
declare
  v_invite record;
  v_access_type text := upper(coalesce(p_access_type, 'FLEXIBLE'));
  v_expires_at timestamptz;
begin
  select
    ii.invite_id,
    ii.interview_id,
    ii.status,
    ii.used_at
  into v_invite
  from public.interview_invites ii
  inner join public.interviews i on i.interview_id = ii.interview_id
  where ii.invite_id = p_invite_id
    and i.organization_id = p_organization_id
  limit 1;

  if v_invite is null then
    raise exception 'INTERVIEW_INVITE_NOT_FOUND: interview invite not found';
  end if;

  if v_invite.used_at is not null then
    raise exception 'INTERVIEW_INVITE_LOCKED: used interview invite cannot be edited';
  end if;

  if upper(coalesce(v_invite.status, 'ACTIVE')) <> 'ACTIVE' then
    raise exception 'INTERVIEW_INVITE_INACTIVE: only active interview invites can be edited';
  end if;

  if v_access_type not in ('FLEXIBLE', 'SCHEDULED') then
    raise exception 'INVALID_ACCESS_TYPE: access type must be FLEXIBLE or SCHEDULED';
  end if;

  if v_access_type = 'SCHEDULED' then
    if p_start_time is null or p_end_time is null then
      raise exception 'INVALID_TIME: start and end time required';
    end if;

    if p_start_time >= p_end_time then
      raise exception 'INVALID_TIME: end time must be after start time';
    end if;

    v_expires_at := p_end_time;
  else
    p_start_time := null;
    p_end_time := null;
    v_expires_at := now() + interval '24 hours';
  end if;

  update public.interview_invites
  set
    access_type = v_access_type,
    start_time = p_start_time,
    end_time = p_end_time,
    expires_at = v_expires_at,
    updated_at = now()
  where invite_id = p_invite_id;

  return query
  select
    ii.invite_id,
    ii.interview_id,
    ii.access_type,
    ii.start_time,
    ii.end_time,
    ii.expires_at,
    coalesce(ii.status, 'ACTIVE')
  from public.interview_invites ii
  where ii.invite_id = p_invite_id;
exception
  when others then
    perform public.log_backend_error(
      'fn_update_interview_invite',
      sqlerrm,
      sqlstate,
      jsonb_build_object(
        'organization_id', p_organization_id,
        'invite_id', p_invite_id,
        'access_type', p_access_type,
        'start_time', p_start_time,
        'end_time', p_end_time
      )
    );
    raise;
end;
$$;

create or replace function public.fn_revoke_interview_invite(
  p_organization_id uuid,
  p_invite_id uuid,
  p_reason text default null
)
returns table (
  invite_id uuid,
  interview_id uuid,
  status text,
  revoked_at timestamptz,
  revoked_reason text
)
language plpgsql
as $$
declare
  v_invite record;
  v_reason text := nullif(trim(coalesce(p_reason, '')), '');
begin
  select
    ii.invite_id,
    ii.interview_id,
    ii.status,
    ii.used_at
  into v_invite
  from public.interview_invites ii
  inner join public.interviews i on i.interview_id = ii.interview_id
  where ii.invite_id = p_invite_id
    and i.organization_id = p_organization_id
  limit 1;

  if v_invite is null then
    raise exception 'INTERVIEW_INVITE_NOT_FOUND: interview invite not found';
  end if;

  if v_invite.used_at is not null then
    raise exception 'INTERVIEW_INVITE_LOCKED: used interview invite cannot be revoked';
  end if;

  if upper(coalesce(v_invite.status, 'ACTIVE')) <> 'ACTIVE' then
    raise exception 'INTERVIEW_INVITE_INACTIVE: only active interview invites can be revoked';
  end if;

  update public.interview_invites
  set
    status = 'REVOKED',
    revoked_at = now(),
    revoked_reason = v_reason,
    updated_at = now()
  where invite_id = p_invite_id;

  return query
  select
    ii.invite_id,
    ii.interview_id,
    coalesce(ii.status, 'REVOKED'),
    ii.revoked_at,
    ii.revoked_reason
  from public.interview_invites ii
  where ii.invite_id = p_invite_id;
exception
  when others then
    perform public.log_backend_error(
      'fn_revoke_interview_invite',
      sqlerrm,
      sqlstate,
      jsonb_build_object(
        'organization_id', p_organization_id,
        'invite_id', p_invite_id,
        'reason', p_reason
      )
    );
    raise;
end;
$$;
