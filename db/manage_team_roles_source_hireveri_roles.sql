do $$
declare
  v_constraint record;
begin
  for v_constraint in
    select con.conname
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_namespace nsp on nsp.oid = rel.relnamespace
    join pg_class ref_rel on ref_rel.oid = con.confrelid
    join pg_namespace ref_nsp on ref_nsp.oid = ref_rel.relnamespace
    where nsp.nspname = 'public'
      and rel.relname = 'recruiter_team_invites'
      and con.contype = 'f'
      and ref_nsp.nspname = 'public'
      and ref_rel.relname = 'recruiter_role_pool'
  loop
    execute format('alter table public.recruiter_team_invites drop constraint if exists %I', v_constraint.conname);
  end loop;
end $$;

do $$
begin
  alter table public.hireveri_recruiter_roles
    add constraint hireveri_recruiter_roles_legacy_role_id_unique
    unique (legacy_role_id);
exception
  when duplicate_object then
    null;
end $$;

do $$
begin
  if exists (
    select 1
    from information_schema.tables
    where table_schema = 'public'
      and table_name = 'recruiter_team_invites'
  ) then
    alter table public.recruiter_team_invites
      add constraint recruiter_team_invites_role_assigned_hireveri_roles_fk
      foreign key (role_assigned)
      references public.hireveri_recruiter_roles (legacy_role_id)
      not valid;

    alter table public.recruiter_team_invites
      validate constraint recruiter_team_invites_role_assigned_hireveri_roles_fk;
  end if;
exception
  when duplicate_object then
    null;
end $$;
