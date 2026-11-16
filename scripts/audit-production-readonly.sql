/*
 * 100 veces tú y yo — auditoría previa de producción (READ ONLY)
 * Ejecutar completo en Supabase SQL Editor, proyecto etqnmmrhfggcqzqefvjh.
 * Devuelve metadatos y conteos, sin emails, nombres, respuestas ni rutas.
 * Todos los statements externos son SELECT (algunos precedidos por WITH).
 * query_to_xml contiene únicamente
 * SELECTs constantes para comprobar conteos aun si una tabla posterior falta.
 * Estados: PASS / WARNING / BLOCKED / NOT_APPLICABLE.
 */

-- 1. Objetos que deben existir después de 001–003: las 16 tablas base.
WITH expected(table_name) AS (
  VALUES ('profiles'), ('couples'), ('couple_members'), ('couple_invites'),
         ('date_catalog'), ('date_sessions'), ('date_responses'), ('date_response_status'),
         ('date_recommendations'), ('date_votes'), ('date_memories'),
         ('date_memory_confirmations'), ('memory_photos'), ('private_notes'),
         ('favorites'), ('ai_generations')
), actual AS (
  SELECT e.table_name, c.oid, c.relrowsecurity
  FROM expected e
  LEFT JOIN pg_namespace n ON n.nspname = 'public'
  LEFT JOIN pg_class c ON c.relnamespace = n.oid AND c.relname = e.table_name AND c.relkind IN ('r','p')
)
SELECT 'schema' AS section,
       CASE WHEN oid IS NULL THEN 'BLOCKED'
            WHEN NOT relrowsecurity THEN 'BLOCKED'
            ELSE 'PASS' END AS status,
       'public.' || table_name AS item,
       CASE WHEN oid IS NULL THEN 'missing from base schema'
            WHEN NOT relrowsecurity THEN 'RLS is disabled'
            ELSE 'exists, RLS enabled' END AS details
FROM actual
ORDER BY table_name;

-- 2. RPCs/trigger functions creadas por 001 y privilegios efectivos.
WITH expected(signature) AS (
  VALUES ('public.is_couple_member(uuid)'),
         ('public.create_profile_for_user()'),
         ('public.create_couple()'),
         ('public.create_couple_invite()'),
         ('public.accept_couple_invite(text)')
)
SELECT 'base_rpc' AS section,
       CASE WHEN p.oid IS NULL THEN 'BLOCKED'
            WHEN has_function_privilege('anon', p.oid, 'EXECUTE') THEN 'BLOCKED'
            WHEN e.signature = 'public.is_couple_member(uuid)'
                 AND NOT has_function_privilege('authenticated', p.oid, 'EXECUTE') THEN 'BLOCKED'
            WHEN e.signature IN ('public.create_couple()', 'public.create_couple_invite()', 'public.accept_couple_invite(text)')
                 AND NOT has_function_privilege('authenticated', p.oid, 'EXECUTE') THEN 'BLOCKED'
            WHEN e.signature = 'public.create_profile_for_user()'
                 AND has_function_privilege('authenticated', p.oid, 'EXECUTE') THEN 'BLOCKED'
            ELSE 'PASS' END AS status,
       e.signature AS item,
       CASE WHEN p.oid IS NULL THEN 'missing'
            ELSE format('owner=%s, security_definer=%s, search_path=%s, anon_execute=%s, authenticated_execute=%s',
                        pg_get_userbyid(p.proowner), p.prosecdef, coalesce(p.proconfig::text,'(default)'),
                        has_function_privilege('anon', p.oid, 'EXECUTE'),
                        has_function_privilege('authenticated', p.oid, 'EXECUTE')) END AS details
FROM expected e
LEFT JOIN pg_proc p ON p.oid = to_regprocedure(e.signature)
ORDER BY e.signature;

SELECT 'base_trigger' AS section,
       CASE WHEN to_regclass('auth.users') IS NULL THEN 'BLOCKED'
            WHEN EXISTS (
              SELECT 1 FROM pg_trigger t
              WHERE t.tgrelid = to_regclass('auth.users')
                AND t.tgname = 'on_auth_user_created' AND NOT t.tgisinternal
                AND t.tgfoid = to_regprocedure('public.create_profile_for_user()')
            ) THEN 'PASS'
            ELSE 'BLOCKED' END AS status,
       'auth.users / on_auth_user_created' AS item,
       CASE WHEN to_regclass('auth.users') IS NULL THEN 'auth.users unavailable'
            WHEN EXISTS (
              SELECT 1 FROM pg_trigger t
              WHERE t.tgrelid = to_regclass('auth.users')
                AND t.tgname = 'on_auth_user_created' AND NOT t.tgisinternal
                AND t.tgfoid = to_regprocedure('public.create_profile_for_user()')
            ) THEN 'expected profile trigger exists'
            ELSE 'expected profile trigger missing' END AS details;

-- 3. Campos añadidos por 002 y conteo exacto del catálogo sembrado por 003.
WITH expected(column_name) AS (VALUES ('objective'), ('steps'), ('enjoyment_tips'))
SELECT 'catalog_field' AS section,
       CASE WHEN to_regclass('public.date_catalog') IS NULL THEN 'BLOCKED'
            WHEN a.attnum IS NULL THEN 'BLOCKED' ELSE 'PASS' END AS status,
       'public.date_catalog.' || e.column_name AS item,
       CASE WHEN a.attnum IS NULL THEN 'missing' ELSE 'present' END AS details
FROM expected e
LEFT JOIN pg_attribute a ON a.attrelid = to_regclass('public.date_catalog')
  AND a.attname = e.column_name AND a.attnum > 0 AND NOT a.attisdropped
ORDER BY e.column_name;

SELECT 'catalog_seed' AS section,
       CASE WHEN to_regclass('public.date_catalog') IS NULL THEN 'BLOCKED'
            ELSE CASE WHEN n = 100 THEN 'PASS' ELSE 'BLOCKED' END END AS status,
       'public.date_catalog rows' AS item,
       CASE WHEN n IS NULL THEN 'table missing'
            ELSE format('%s rows, expected 100', n) END AS details
FROM (
  SELECT CASE WHEN to_regclass('public.date_catalog') IS NULL THEN NULL::bigint
    ELSE ((xpath('/table/row/n/text()', query_to_xml(
      'SELECT count(*) AS n FROM public.date_catalog', false, false, '')))[1]::text)::bigint
  END AS n
) q;

-- 4. Estado de RLS de todas las tablas existentes en public, incluidas las futuras.
SELECT 'public_rls' AS section,
       CASE WHEN NOT c.relrowsecurity THEN 'BLOCKED' ELSE 'PASS' END AS status,
       format('%I.%I', n.nspname, c.relname) AS item,
       format('rls=%s, force_rls=%s', c.relrowsecurity, c.relforcerowsecurity) AS details
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relkind IN ('r','p')
ORDER BY c.relname;

-- 5. Todas las políticas (políticas permisivas se combinan mediante OR).
-- Qual y check se acortan para que el resultado siga siendo legible.
SELECT 'policy' AS section,
       CASE WHEN permissive = 'PERMISSIVE' THEN 'WARNING' ELSE 'PASS' END AS status,
       format('%I.%I / %s', schemaname, tablename, policyname) AS item,
       format('permissive=%s, roles=%s, command=%s, using=%s, check=%s',
              permissive, roles, cmd, left(coalesce(qual,'(none)'),180),
              left(coalesce(with_check,'(none)'),180)) AS details
FROM pg_policies
WHERE schemaname = 'public'
   OR (schemaname = 'storage' AND tablename = 'objects')
ORDER BY schemaname, tablename, policyname;

-- 6. 004 espera que ambos objetos heredados estén ausentes en producción.
WITH legacy AS (
  SELECT to_regprocedure('public.rls_auto_enable()') AS fn,
         EXISTS (SELECT 1 FROM pg_event_trigger WHERE evtname = 'ensure_rls') AS trg
)
SELECT 'migration_004_precondition' AS section,
       CASE WHEN fn IS NULL AND NOT trg THEN 'PASS'
            WHEN fn IS NOT NULL AND trg THEN 'WARNING'
            ELSE 'BLOCKED' END AS status,
       'public.rls_auto_enable() / ensure_rls' AS item,
       format('function_exists=%s, event_trigger_exists=%s', fn IS NOT NULL, trg) AS details
FROM legacy;

-- 7. ai_generations: existencia y conteo exacto sin fallar si la tabla falta.
SELECT 'ai_generations' AS section,
       CASE WHEN n IS NULL THEN 'BLOCKED'
            WHEN n = 0 THEN 'PASS' ELSE 'BLOCKED' END AS status,
       'public.ai_generations row count' AS item,
       CASE WHEN n IS NULL THEN 'table missing, DROP migration cannot proceed as written'
            ELSE format('%s rows, migration 061135 requires zero', n) END AS details
FROM (
  SELECT CASE WHEN to_regclass('public.ai_generations') IS NULL THEN NULL::bigint
    ELSE ((xpath('/table/row/n/text()', query_to_xml(
      'SELECT count(*) AS n FROM public.ai_generations', false, false, '')))[1]::text)::bigint
  END AS n
) q;

-- Dependencias registradas por PostgreSQL, cero filas significa sin dependencias catalogadas.
WITH target AS (SELECT to_regclass('public.ai_generations') AS oid), deps AS (
  SELECT pg_describe_object(d.classid, d.objid, d.objsubid) AS dependent_object,
         d.deptype::text AS dependency_type
  FROM pg_depend d CROSS JOIN target t
  WHERE t.oid IS NOT NULL
    AND d.refclassid = 'pg_class'::regclass AND d.refobjid = t.oid
    AND NOT (d.classid = 'pg_class'::regclass AND d.objid = t.oid)
)
SELECT 'ai_dependency' AS section,
       CASE WHEN (SELECT oid FROM target) IS NULL THEN 'NOT_APPLICABLE'
            WHEN EXISTS (SELECT 1 FROM deps) THEN 'WARNING' ELSE 'PASS' END AS status,
       coalesce(dependent_object, 'catalog dependencies') AS item,
       coalesce(dependency_type, 'none found') AS details
FROM (SELECT dependent_object, dependency_type FROM deps
      UNION ALL
      SELECT NULL, NULL WHERE NOT EXISTS (SELECT 1 FROM deps)) d
ORDER BY item;

-- Funciones y procedimientos cuyo cuerpo menciona ai_generations (no imprime el cuerpo).
WITH matches AS (
  SELECT n.nspname, p.oid::regprocedure::text AS routine,
         p.prosecdef, p.proconfig
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE p.prokind IN ('f','p')
    AND pg_get_functiondef(p.oid) ILIKE '%ai_generations%'
)
SELECT 'ai_function_reference' AS section,
       CASE WHEN EXISTS (SELECT 1 FROM matches) THEN 'WARNING' ELSE 'PASS' END AS status,
       coalesce(string_agg(routine, ', '), 'none found') AS item,
       'textual function-body search, dynamic references may not be detectable' AS details
FROM matches;

-- Vistas y vistas materializadas con referencia textual.
WITH matches AS (
  SELECT schemaname, viewname AS object_name FROM pg_views
  WHERE definition ILIKE '%ai_generations%'
  UNION ALL
  SELECT schemaname, matviewname FROM pg_matviews
  WHERE definition ILIKE '%ai_generations%'
)
SELECT 'ai_view_reference' AS section,
       CASE WHEN EXISTS (SELECT 1 FROM matches) THEN 'WARNING' ELSE 'PASS' END AS status,
       coalesce(string_agg(format('%I.%I', schemaname, object_name), ', '), 'none found') AS item,
       'textual view-definition search' AS details
FROM matches;

-- Triggers unidos a ai_generations y triggers cuyas funciones mencionan la tabla.
WITH matches AS (
  SELECT n.nspname, c.relname, t.tgname
  FROM pg_trigger t
  JOIN pg_class c ON c.oid = t.tgrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE NOT t.tgisinternal
    AND ((n.nspname = 'public' AND c.relname = 'ai_generations')
      OR pg_get_functiondef(t.tgfoid) ILIKE '%ai_generations%')
)
SELECT 'ai_trigger_reference' AS section,
       CASE WHEN EXISTS (SELECT 1 FROM matches) THEN 'WARNING' ELSE 'PASS' END AS status,
       coalesce(string_agg(format('%I.%I / %I', nspname, relname, tgname), ', '), 'none found') AS item,
       'table-trigger and trigger-function search' AS details
FROM matches;

-- Event triggers cuyas funciones mencionan ai_generations.
WITH matches AS (
  SELECT e.evtname AS trigger_name, p.oid::regprocedure::text AS routine
  FROM pg_event_trigger e
  JOIN pg_proc p ON p.oid = e.evtfoid
  WHERE pg_get_functiondef(p.oid) ILIKE '%ai_generations%'
)
SELECT 'ai_event_trigger_reference' AS section,
       CASE WHEN EXISTS (SELECT 1 FROM matches) THEN 'WARNING' ELSE 'PASS' END AS status,
       coalesce(string_agg(format('%s -> %s', trigger_name, routine), ', '), 'none found') AS item,
       'textual event-trigger function search' AS details
FROM matches;

-- 8. Storage: configuración del bucket, colisión y conteo sin nombres de archivos.
SELECT 'storage_bucket' AS section,
       CASE WHEN NOT EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'memory-album-private')
              THEN 'PASS'
            WHEN EXISTS (SELECT 1 FROM storage.buckets
                         WHERE id = 'memory-album-private' AND public = false
                           AND file_size_limit = 3145728
                           AND allowed_mime_types = ARRAY['image/jpeg','image/png','image/webp']::text[])
              THEN 'WARNING'
            ELSE 'BLOCKED' END AS status,
       'memory-album-private' AS item,
       coalesce((SELECT format('public=%s, size_limit=%s, mime_types=%s', public, file_size_limit, allowed_mime_types)
                 FROM storage.buckets WHERE id = 'memory-album-private'),
                'bucket absent, no name collision') AS details;

SELECT 'storage_objects' AS section,
       CASE WHEN NOT EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'memory-album-private')
              THEN 'NOT_APPLICABLE'
            WHEN count(*) = 0 THEN 'PASS' ELSE 'WARNING' END AS status,
       'memory-album-private object count' AS item,
       format('%s objects, names and owners intentionally omitted', count(*)) AS details
FROM storage.objects
WHERE bucket_id = 'memory-album-private';

-- 9. Precondiciones de índices y restricciones posteriores sobre tablas base existentes.
WITH relation AS (SELECT to_regclass('public.date_sessions') AS oid), result AS (
  SELECT oid, CASE WHEN oid IS NULL THEN NULL::bigint ELSE
    ((xpath('/table/row/n/text()', query_to_xml(
      'SELECT count(*) AS n FROM (SELECT couple_id FROM public.date_sessions WHERE status IN (''collecting'',''recommending'',''voting'',''confirmed'',''in_progress'') GROUP BY couple_id HAVING count(*) > 1) q',
      false, false, '')))[1]::text)::bigint END AS duplicates
  FROM relation
)
SELECT 'migration_01703_unique_index' AS section,
       CASE WHEN oid IS NULL THEN 'NOT_APPLICABLE'
            WHEN duplicates = 0 THEN 'PASS' ELSE 'BLOCKED' END AS status,
       'duplicate active sessions per couple' AS item,
       CASE WHEN duplicates IS NULL THEN 'base table absent'
            ELSE format('%s duplicate groups', duplicates) END AS details
FROM result;

WITH relation AS (SELECT to_regclass('public.date_memories') AS oid), result AS (
  SELECT oid, CASE WHEN oid IS NULL THEN NULL::bigint ELSE
    ((xpath('/table/row/n/text()', query_to_xml(
      'SELECT count(*) AS n FROM (SELECT session_id FROM public.date_memories WHERE session_id IS NOT NULL GROUP BY session_id HAVING count(*) > 1) q',
      false, false, '')))[1]::text)::bigint END AS duplicates
  FROM relation
)
SELECT 'migration_154304_unique_index' AS section,
       CASE WHEN oid IS NULL THEN 'NOT_APPLICABLE'
            WHEN duplicates = 0 THEN 'PASS' ELSE 'BLOCKED' END AS status,
       'duplicate memories per non-null session' AS item,
       CASE WHEN duplicates IS NULL THEN 'base table absent'
            ELSE format('%s duplicate groups', duplicates) END AS details
FROM result;

WITH relation AS (SELECT to_regclass('public.memory_photos') AS oid), result AS (
  SELECT oid, CASE WHEN oid IS NULL THEN NULL::bigint ELSE
    ((xpath('/table/row/n/text()', query_to_xml(
      'SELECT count(*) AS n FROM public.memory_photos WHERE mime_type NOT IN (''image/jpeg'',''image/png'',''image/webp'') OR byte_size NOT BETWEEN 1 AND 3145728',
      false, false, '')))[1]::text)::bigint END AS invalid_rows
  FROM relation
)
SELECT 'migration_154304_photo_constraints' AS section,
       CASE WHEN oid IS NULL THEN 'NOT_APPLICABLE'
            WHEN invalid_rows = 0 THEN 'PASS' ELSE 'WARNING' END AS status,
       'existing photos outside proposed MIME/size limits' AS item,
       CASE WHEN invalid_rows IS NULL THEN 'base table absent'
            ELSE format('%s rows', invalid_rows) END AS details
FROM result;

-- Verifica por catálogo los objetos opcionales de fases pendientes sin referenciarlos directamente.
WITH expected(table_name) AS (
  VALUES ('date_confirmations'), ('date_experience_progress'),
         ('date_experience_confirmations'), ('date_prompt_favorites'),
         ('date_memory_contributions')
)
SELECT 'later_table' AS section,
       CASE WHEN c.oid IS NULL THEN 'NOT_APPLICABLE'
            WHEN c.relrowsecurity THEN 'PASS' ELSE 'BLOCKED' END AS status,
       'public.' || e.table_name AS item,
        CASE WHEN c.oid IS NULL THEN 'not created yet, migration pending'
            WHEN c.relrowsecurity THEN 'exists, RLS enabled'
            ELSE 'exists, RLS disabled' END AS details
FROM expected e
LEFT JOIN pg_namespace n ON n.nspname = 'public'
LEFT JOIN pg_class c ON c.relnamespace = n.oid AND c.relname = e.table_name AND c.relkind IN ('r','p')
ORDER BY e.table_name;

-- Privilegios efectivos de SECURITY DEFINER existentes en public (sin cuerpos SQL).
SELECT 'security_definer_rpc' AS section,
       CASE WHEN has_function_privilege('anon', p.oid, 'EXECUTE') THEN 'WARNING' ELSE 'PASS' END AS status,
       p.oid::regprocedure::text AS item,
       format('owner=%s, anon_execute=%s, authenticated_execute=%s, search_path=%s',
              pg_get_userbyid(p.proowner),
              has_function_privilege('anon', p.oid, 'EXECUTE'),
              has_function_privilege('authenticated', p.oid, 'EXECUTE'),
              coalesce(p.proconfig::text,'(default)')) AS details
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.prosecdef
ORDER BY p.oid::regprocedure::text;
