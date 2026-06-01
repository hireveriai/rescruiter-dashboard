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
as $$
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
      c.conrelid as child_oid,
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
    group by c.conrelid, c.confrelid
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
$$;
