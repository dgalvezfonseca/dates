-- Staging may have this platform-level guard; production may not.
do $migration$
declare
  v_function oid := to_regprocedure('public.rls_auto_enable()');
  v_trigger pg_event_trigger%rowtype;
  v_expected_body constant text := $body$
DECLARE
  cmd record;
  tbl name;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        SELECT c.relname INTO tbl FROM pg_catalog.pg_class c WHERE c.oid = cmd.objid;
        EXECUTE format('alter table if exists %I.%I enable row level security', cmd.schema_name, tbl);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$body$;
begin
  if v_function is null then
    if exists (select 1 from pg_event_trigger where evtname = 'ensure_rls') then
      raise exception 'ensure_rls exists without public.rls_auto_enable(); inspect the database before continuing';
    end if;
  else
    if not exists (
      select 1
      from pg_proc p
      join pg_language l on l.oid = p.prolang
      where p.oid = v_function
        and pg_get_userbyid(p.proowner) = 'postgres'
        and l.lanname = 'plpgsql'
        and p.prosecdef
        and p.proconfig = array['search_path=pg_catalog']
        and p.prosrc = v_expected_body
    ) then
      raise exception 'public.rls_auto_enable() exists with an unexpected definition; inspect it before continuing';
    end if;

    select * into v_trigger from pg_event_trigger where evtname = 'ensure_rls';
    if not found
      or v_trigger.evtfoid <> v_function
      or v_trigger.evtevent <> 'ddl_command_end'
      or v_trigger.evtenabled <> 'O'
      or v_trigger.evttags is distinct from array['CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO']::text[]
      or pg_get_userbyid(v_trigger.evtowner) <> 'postgres' then
      raise exception 'event trigger ensure_rls is absent or differs from the verified definition';
    end if;

    execute 'revoke all on function public.rls_auto_enable() from public, anon, authenticated';
    if has_function_privilege('anon', v_function, 'EXECUTE')
      or has_function_privilege('authenticated', v_function, 'EXECUTE') then
      raise exception 'API roles can still execute public.rls_auto_enable()';
    end if;
  end if;
end
$migration$;
