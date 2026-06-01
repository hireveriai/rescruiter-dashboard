-- Simple organization cleanup function.
--
-- This is intentionally simpler than the recursive FK version:
-- it deletes only tables that have a direct tenant column:
--   organization_id, org_id, or "organizationId"
--
-- If a child table does not have one of those columns and only links through
-- interview_id / attempt_id / user_id / candidate_id, this function may skip
-- parent rows with "SKIPPED - FK CONSTRAINT". In that case, delete the reported
-- child table first or add proper ON DELETE CASCADE/FKs.
--
-- Dry run:
--   select * from public.hv_delete_organization_direct_tables('ORG_ID'::uuid);
--
-- Delete:
--   begin;
--   select * from public.hv_delete_organization_direct_tables('ORG_ID'::uuid, false);
--   commit;

create or replace function public.hv_delete_organization_direct_tables(
  p_organization_id uuid,
  p_dry_run boolean default true
)
returns table (
  table_name text,
  rows_affected bigint,
  action text
)
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  r record;
  v_sql text;
  v_count bigint;
begin
  if p_organization_id is null then
    raise exception 'organization id is required';
  end if;

  create temp table if not exists pg_temp.tmp_org_delete_tables (
    schema_name text not null,
    table_name text not null,
    org_column text not null,
    depth bigint not null default 0,
    primary key (schema_name, table_name, org_column)
  ) on commit drop;

  truncate table pg_temp.tmp_org_delete_tables;

  insert into pg_temp.tmp_org_delete_tables (
    schema_name,
    table_name,
    org_column,
    depth
  )
  select
    c.table_schema,
    c.table_name,
    c.column_name,
    count(fk.parent_table)::bigint as depth
  from information_schema.columns c
  left join (
    select
      tc.table_schema,
      tc.table_name as child_table,
      ccu.table_name as parent_table
    from information_schema.table_constraints tc
    join information_schema.constraint_column_usage ccu
      on tc.constraint_schema = ccu.constraint_schema
     and tc.constraint_name = ccu.constraint_name
    where tc.constraint_type = 'FOREIGN KEY'
      and tc.table_schema = 'public'
  ) fk
    on fk.table_schema = c.table_schema
   and fk.child_table = c.table_name
  where c.table_schema = 'public'
    and c.column_name in ('organization_id', 'org_id', 'organizationId')
    and c.udt_name = 'uuid'
  group by c.table_schema, c.table_name, c.column_name;

  for r in
    select
      d.schema_name,
      d.table_name as target_table_name,
      d.org_column
    from pg_temp.tmp_org_delete_tables
    order by
      case when d.table_name = 'organizations' then -1 else d.depth end desc,
      d.table_name asc
  loop
    v_sql := format(
      'select count(*)::bigint from %I.%I where %I = $1',
      r.schema_name,
      r.target_table_name,
      r.org_column
    );

    execute v_sql into v_count using p_organization_id;

    if v_count > 0 then
      if p_dry_run then
        table_name := format('%I.%I', r.schema_name, r.target_table_name);
        rows_affected := v_count;
        action := 'DRY RUN - NO DELETE';
        return next;
      else
        begin
          v_sql := format(
            'delete from %I.%I where %I = $1',
            r.schema_name,
            r.target_table_name,
            r.org_column
          );

          execute v_sql using p_organization_id;

          table_name := format('%I.%I', r.schema_name, r.target_table_name);
          rows_affected := v_count;
          action := 'DELETED';
          return next;
        exception
          when foreign_key_violation then
            table_name := format('%I.%I', r.schema_name, r.target_table_name);
            rows_affected := v_count;
            action := 'SKIPPED - FK CONSTRAINT';
            return next;
        end;
      end if;
    end if;
  end loop;
end;
$$;
