do $$
declare
  probe_table text := format('__rls_auto_enable_check_%s', txid_current());
  rls_enabled boolean;
begin
  execute format('create table public.%I (id integer)', probe_table);

  select c.relrowsecurity into rls_enabled
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relname = probe_table;

  if rls_enabled is distinct from true then
    raise exception 'ensure_rls did not enable RLS on a newly created public table';
  end if;

  execute format('drop table public.%I', probe_table);
end;
$$;
