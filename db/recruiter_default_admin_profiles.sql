create or replace function public.fn_ensure_default_recruiter_profile(
  p_user_id uuid,
  p_organization_id uuid
)
returns smallint
language plpgsql
as $$
declare
  v_existing_profile boolean := false;
  v_existing_role_id smallint;
  v_company_name text;
  v_default_role_id smallint;
begin
  select true, rp.recruiter_role_id
  into v_existing_profile, v_existing_role_id
  from public.recruiter_profiles rp
  where rp.recruiter_id = p_user_id
  limit 1;

  if coalesce(v_existing_role_id, 0) > 0 then
    return v_existing_role_id;
  end if;

  v_default_role_id := public.fn_get_default_super_admin_role_id();

  select o.organization_name
  into v_company_name
  from public.organizations o
  where o.organization_id = p_organization_id
  limit 1;

  if v_existing_profile then
    update public.recruiter_profiles
    set
      recruiter_role_id = v_default_role_id,
      company_name = coalesce(company_name, v_company_name, 'Organization'),
      organization_id = p_organization_id
    where recruiter_id = p_user_id;
  else
    insert into public.recruiter_profiles (
      recruiter_id,
      company_name,
      recruiter_role_id,
      organization_id
    )
    values (
      p_user_id,
      coalesce(v_company_name, 'Organization'),
      v_default_role_id,
      p_organization_id
    )
    on conflict (recruiter_id) do update
    set
      recruiter_role_id = excluded.recruiter_role_id,
      company_name = excluded.company_name,
      organization_id = excluded.organization_id;
  end if;

  return v_default_role_id;
exception
  when others then
    perform public.log_backend_error(
      'fn_ensure_default_recruiter_profile',
      sqlerrm,
      sqlstate,
      jsonb_build_object(
        'user_id', p_user_id,
        'organization_id', p_organization_id
      )
    );
    raise;
end;
$$;

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
