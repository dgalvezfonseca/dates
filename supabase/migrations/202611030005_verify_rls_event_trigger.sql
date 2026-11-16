-- Verify the security property directly instead of relying on an unportable
-- superuser-only event trigger to protect migration-created tables.
do $migration$
declare
  v_unprotected text;
begin
  select string_agg(format('%I.%I', n.nspname, c.relname), ', ' order by c.relname)
  into v_unprotected
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relkind in ('r', 'p')
    and not c.relrowsecurity;

  if v_unprotected is not null then
    raise exception 'public tables without row level security: %', v_unprotected;
  end if;
end
$migration$;
