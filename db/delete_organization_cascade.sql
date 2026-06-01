-- Delete one organization and all tenant data reachable from it.
--
-- Usage:
--   -- Preview only. This is the default and does not delete anything.
--   select * from public.hv_delete_organization_cascade(
--     '00000000-0000-0000-0000-000000000000'::uuid
--   );
--
--   -- Real deletion.
--   begin;
--   select * from public.hv_delete_organization_cascade(
--     '00000000-0000-0000-0000-000000000000'::uuid,
--     false
--   );
--   commit;
--
-- How it stays dynamic:
--   1. It follows live PostgreSQL foreign keys recursively from tenant rows.
--   2. It also starts from any public table with a uuid tenant column named
--      organization_id, org_id, or organizationId, even if that table does not
--      declare a foreign key to public.organizations.
--
-- Important:
--   New tables are picked up automatically when they either declare foreign keys
--   into the tenant data graph or include one of the tenant id columns above.

create or replace function public.hv_delete_related_rows_by_filter(
  p_parent_table regclass,
  p_parent_filter text,
  p_dry_run boolean default true,
  p_seen oid[] default array[]::oid[],
  p_depth integer default 0
)
returns table (
  depth integer,
  relation_name text,
  affected_rows bigint,
  action text
)
language plpgsql
security definer
set search_path = public, pg_catalog
as $function$
declare
  v_fk record;
  v_child_filter text;
  v_join_condition text;
  v_sql text;
  v_rows bigint;
  v_parent_alias text;
begin
  if p_parent_table::oid = any(p_seen) then
    return;
  end if;

  v_parent_alias := format('p%s', p_depth);

  for v_fk in
    select
      c.oid as constraint_oid,
      c.conrelid as child_oid,
      c.confrelid as parent_oid,
      c.conrelid::regclass::text as child_table,
      c.confrelid::regclass::text as parent_table,
      array_agg(child_att.attname order by key_order.ordinality) as child_columns,
      array_agg(parent_att.attname order by key_order.ordinality) as parent_columns
    from pg_constraint c
    join lateral unnest(c.conkey, c.confkey) with ordinality
      as key_order(child_attnum, parent_attnum, ordinality)
      on true
    join pg_attribute child_att
      on child_att.attrelid = c.conrelid
     and child_att.attnum = key_order.child_attnum
    join pg_attribute parent_att
      on parent_att.attrelid = c.confrelid
     and parent_att.attnum = key_order.parent_attnum
    join pg_class child_class
      on child_class.oid = c.conrelid
    join pg_namespace child_ns
      on child_ns.oid = child_class.relnamespace
    where c.contype = 'f'
      and c.confrelid = p_parent_table::oid
      and child_ns.nspname = 'public'
    group by c.oid, c.conrelid, c.confrelid
    order by c.conrelid::regclass::text
  loop
    select string_agg(
      format(
        'child.%I is not distinct from %I.%I',
        (v_fk.child_columns)[i],
        v_parent_alias,
        (v_fk.parent_columns)[i]
      ),
      ' and '
    )
    into v_join_condition
    from generate_subscripts(v_fk.child_columns, 1) as i;

    v_child_filter := format(
      'exists (select 1 from %s %I where %s and %s)',
      v_fk.parent_table,
      v_parent_alias,
      replace(p_parent_filter, '__alias__', quote_ident(v_parent_alias)),
      v_join_condition
    );

    return query
    select *
    from public.hv_delete_related_rows_by_filter(
      v_fk.child_oid::regclass,
      replace(v_child_filter, 'child.', '__alias__.'),
      p_dry_run,
      array_append(p_seen, p_parent_table::oid),
      p_depth + 1
    );
  end loop;

  if p_dry_run then
    v_sql := format(
      'select count(*)::bigint from %s target where %s',
      p_parent_table,
      replace(p_parent_filter, '__alias__', 'target')
    );
    execute v_sql into v_rows;
    action := 'would_delete';
  else
    v_sql := format(
      'delete from %s target where %s',
      p_parent_table,
      replace(p_parent_filter, '__alias__', 'target')
    );
    execute v_sql;
    get diagnostics v_rows = row_count;
    action := 'deleted';
  end if;

  depth := p_depth;
  relation_name := p_parent_table::text;
  affected_rows := coalesce(v_rows, 0);
  return next;
end;
$function$;

create or replace function public.hv_delete_organization_cascade(
  p_organization_id uuid,
  p_dry_run boolean default true
)
returns table (
  step_order bigint,
  depth integer,
  relation_name text,
  affected_rows bigint,
  action text
)
language plpgsql
security definer
set search_path = public, pg_catalog
as $function$
declare
  v_root record;
  v_filter text;
  v_org_exists boolean;
begin
  if p_organization_id is null then
    raise exception 'organization id is required';
  end if;

  select exists (
    select 1
    from public.organizations
    where organization_id = p_organization_id
  )
  into v_org_exists;

  if not v_org_exists then
    raise exception 'organization % does not exist', p_organization_id;
  end if;

  create temp table if not exists pg_temp.hv_delete_organization_report (
    report_id bigserial primary key,
    depth integer not null,
    relation_name text not null,
    affected_rows bigint not null,
    action text not null
  ) on commit drop;

  truncate table pg_temp.hv_delete_organization_report restart identity;

  create temp table if not exists pg_temp.hv_delete_organization_auth_users (
    auth_user_id uuid primary key
  ) on commit drop;

  create temp table if not exists pg_temp.hv_delete_organization_identities (
    identity_id uuid primary key
  ) on commit drop;

  truncate table pg_temp.hv_delete_organization_auth_users;
  truncate table pg_temp.hv_delete_organization_identities;

  if to_regclass('public.organization_memberships') is not null then
    insert into pg_temp.hv_delete_organization_auth_users (auth_user_id)
    select distinct om.auth_user_id
    from public.organization_memberships om
    where om.org_id = p_organization_id
      and om.auth_user_id is not null
    on conflict do nothing;
  end if;

  if to_regclass('public.users') is not null then
    insert into pg_temp.hv_delete_organization_identities (identity_id)
    select distinct u.identity_id
    from public.users u
    where u.organization_id = p_organization_id
      and u.identity_id is not null
    on conflict do nothing;
  end if;

  for v_root in
    select distinct on (table_oid, tenant_column)
      table_oid,
      table_name,
      tenant_column
    from (
      select
        c.oid as table_oid,
        c.oid::regclass::text as table_name,
        a.attname as tenant_column
      from pg_class c
      join pg_namespace n
        on n.oid = c.relnamespace
      join pg_attribute a
        on a.attrelid = c.oid
      join pg_type t
        on t.oid = a.atttypid
      where n.nspname = 'public'
        and c.relkind in ('r', 'p')
        and a.attnum > 0
        and not a.attisdropped
        and a.attname in ('organization_id', 'org_id', 'organizationId')
        and t.typname = 'uuid'
        and c.oid <> 'public.organizations'::regclass::oid
    ) tenant_tables
    order by table_oid, tenant_column
  loop
    v_filter := format(
      '__alias__.%I = %L::uuid',
      v_root.tenant_column,
      p_organization_id
    );

    insert into pg_temp.hv_delete_organization_report (
      depth,
      relation_name,
      affected_rows,
      action
    )
    select
      related.depth,
      related.relation_name,
      related.affected_rows,
      related.action
    from public.hv_delete_related_rows_by_filter(
      v_root.table_oid::regclass,
      v_filter,
      p_dry_run
    ) related;
  end loop;

  insert into pg_temp.hv_delete_organization_report (
    depth,
    relation_name,
    affected_rows,
    action
  )
  select
    related.depth,
    related.relation_name,
    related.affected_rows,
    related.action
  from public.hv_delete_related_rows_by_filter(
    'public.organizations'::regclass,
    format('__alias__.organization_id = %L::uuid', p_organization_id),
    p_dry_run
  ) related;

  if to_regclass('public.auth_users') is not null
    and to_regclass('public.organization_memberships') is not null
  then
    if p_dry_run then
      insert into pg_temp.hv_delete_organization_report (
        depth,
        relation_name,
        affected_rows,
        action
      )
      select
        0,
        'public.auth_users',
        count(*)::bigint,
        'would_delete_orphan'
      from public.auth_users au
      join pg_temp.hv_delete_organization_auth_users pending
        on pending.auth_user_id = au.id
      where not exists (
        select 1
        from public.organization_memberships om
        where om.auth_user_id = au.id
          and om.org_id <> p_organization_id
      );
    else
      with deleted as (
        delete from public.auth_users au
        using pg_temp.hv_delete_organization_auth_users pending
        where pending.auth_user_id = au.id
          and not exists (
            select 1
            from public.organization_memberships om
            where om.auth_user_id = au.id
          )
        returning 1
      )
      insert into pg_temp.hv_delete_organization_report (
        depth,
        relation_name,
        affected_rows,
        action
      )
      select
        0,
        'public.auth_users',
        count(*)::bigint,
        'deleted_orphan'
      from deleted;
    end if;
  end if;

  if to_regclass('public.identity_users') is not null
    and to_regclass('public.users') is not null
  then
    if p_dry_run then
      insert into pg_temp.hv_delete_organization_report (
        depth,
        relation_name,
        affected_rows,
        action
      )
      select
        0,
        'public.identity_users',
        count(*)::bigint,
        'would_delete_orphan'
      from public.identity_users iu
      join pg_temp.hv_delete_organization_identities pending
        on pending.identity_id = iu.identity_id
      where not exists (
        select 1
        from public.users u
        where u.identity_id = iu.identity_id
          and u.organization_id <> p_organization_id
      )
      and (
        to_regclass('public.candidate_identity_links') is null
        or not exists (
          select 1
          from public.candidate_identity_links cil
          join public.candidates c
            on c.candidate_id = cil.candidate_id
          where cil.identity_id = iu.identity_id
            and c.organization_id <> p_organization_id
        )
      );
    else
      with deleted as (
        delete from public.identity_users iu
        using pg_temp.hv_delete_organization_identities pending
        where pending.identity_id = iu.identity_id
          and not exists (
            select 1
            from public.users u
            where u.identity_id = iu.identity_id
          )
          and (
            to_regclass('public.candidate_identity_links') is null
            or not exists (
              select 1
              from public.candidate_identity_links cil
              where cil.identity_id = iu.identity_id
            )
          )
        returning 1
      )
      insert into pg_temp.hv_delete_organization_report (
        depth,
        relation_name,
        affected_rows,
        action
      )
      select
        0,
        'public.identity_users',
        count(*)::bigint,
        'deleted_orphan'
      from deleted;
    end if;
  end if;

  return query
  select
    row_number() over (order by report_id)::bigint as step_order,
    hv_delete_organization_report.depth,
    hv_delete_organization_report.relation_name,
    hv_delete_organization_report.affected_rows,
    hv_delete_organization_report.action
  from pg_temp.hv_delete_organization_report
  where hv_delete_organization_report.affected_rows > 0
  order by report_id;
end;
$function$;

comment on function public.hv_delete_organization_cascade(uuid, boolean)
is 'Deletes or dry-runs deletion of one organization and tenant data by recursively following public foreign keys plus direct tenant id columns.';
