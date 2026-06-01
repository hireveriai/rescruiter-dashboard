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
as $$
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

  for v_root in
    select distinct on (table_oid, tenant_column)
      table_oid,
      tenant_column
    from (
      select
        c.oid as table_oid,
        a.attname as tenant_column
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      join pg_attribute a on a.attrelid = c.oid
      join pg_type t on t.oid = a.atttypid
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
$$;

comment on function public.hv_delete_organization_cascade(uuid, boolean)
is 'Deletes or dry-runs deletion of one organization and tenant data by recursively following public foreign keys plus direct tenant id columns.';
