/*
 * Solo lectura para detectar drift respecto a 001–003 y colisiones con 004–011.
 * Ejecutar en SQL Editor del proyecto producción etqnmmrhfggcqzqefvjh.
 * No devuelve filas de usuario, nombres de archivos ni contenido de recuerdos.
 */

-- 1. Tablas base esperadas, tablas creadas por migraciones pendientes y relaciones públicas extra.
WITH base(name) AS (
  VALUES ('profiles'), ('couples'), ('couple_members'), ('couple_invites'),
         ('date_catalog'), ('date_sessions'), ('date_responses'), ('date_response_status'),
         ('date_recommendations'), ('date_votes'), ('date_memories'),
         ('date_memory_confirmations'), ('memory_photos'), ('private_notes'),
         ('favorites'), ('ai_generations')
), pending_create(name, migration) AS (
  VALUES ('date_confirmations', '20261104001703'),
         ('date_experience_progress', '20261104061135'),
         ('date_experience_confirmations', '20261104061135'),
         ('date_prompt_favorites', '20261104061135'),
         ('date_memory_contributions', '20261104154304')
), rels AS (
  SELECT c.relname, c.relkind
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relkind IN ('r','p','v','m','f')
)
SELECT 'BASE_EXPECTED' AS kind,
       CASE WHEN r.relname IS NULL THEN 'BLOCKED' ELSE 'PASS' END AS status,
       'public.' || b.name AS object_name,
       coalesce(r.relkind::text, 'absent') AS detail
FROM base b LEFT JOIN rels r ON r.relname = b.name
UNION ALL
SELECT 'PENDING_CREATE_COLLISION',
       CASE WHEN r.relname IS NULL THEN 'PASS' ELSE 'BLOCKED' END,
       'public.' || p.name,
       CASE WHEN r.relname IS NULL THEN 'absent as expected'
            ELSE 'already exists before migration ' || p.migration || ', inspect before applying' END
FROM pending_create p LEFT JOIN rels r ON r.relname = p.name
UNION ALL
SELECT 'UNEXPECTED_PUBLIC_RELATION', 'WARNING', 'public.' || r.relname,
       'relkind=' || r.relkind::text || ', not in 001–003 or pending CREATE TABLE list'
FROM rels r
WHERE NOT EXISTS (SELECT 1 FROM base b WHERE b.name = r.relname)
  AND NOT EXISTS (SELECT 1 FROM pending_create p WHERE p.name = r.relname)
ORDER BY 1, 3;

-- 2. Las 33 políticas public definidas en 001, extras en tablas base y políticas homónimas pendientes.
WITH base_policy(table_name, policy_name) AS (
  VALUES ('profiles','profiles_select_own'), ('profiles','profiles_update_own'),
         ('couples','couples_read_members'), ('couple_members','members_read_same_space'),
         ('date_catalog','catalog_read_authenticated'),
         ('date_sessions','sessions_read_members'), ('date_sessions','sessions_create_members'),
         ('date_responses','responses_read_owner'), ('date_responses','responses_insert_owner'), ('date_responses','responses_update_owner'),
         ('date_response_status','response_status_read_members'), ('date_response_status','response_status_write_owner'),
         ('date_recommendations','recommendations_read_members'),
         ('date_votes','votes_read_members'), ('date_votes','votes_insert_owner'), ('date_votes','votes_update_owner'),
         ('date_memories','memories_read_members'), ('date_memories','memories_insert_members'), ('date_memories','memories_update_members'),
         ('date_memory_confirmations','memory_confirmations_read_members'), ('date_memory_confirmations','memory_confirmations_insert_owner'), ('date_memory_confirmations','memory_confirmations_delete_owner'),
         ('memory_photos','photos_read_members'), ('memory_photos','photos_insert_owner'), ('memory_photos','photos_delete_owner'),
         ('private_notes','notes_read_owner'), ('private_notes','notes_insert_owner'), ('private_notes','notes_update_owner'), ('private_notes','notes_delete_owner'),
         ('favorites','favorites_read_owner'), ('favorites','favorites_insert_owner'), ('favorites','favorites_delete_owner'),
         ('ai_generations','ai_generations_read_members')
), pending_policy(table_name, policy_name, schema_name) AS (
  VALUES ('date_confirmations','date_confirmations_read_members','public'),
         ('date_experience_progress','date_experience_progress_read_members','public'),
         ('date_experience_confirmations','date_experience_confirmations_read_members','public'),
         ('date_prompt_favorites','date_prompt_favorites_read_owner','public'),
         ('date_prompt_favorites','date_prompt_favorites_insert_owner','public'),
         ('date_prompt_favorites','date_prompt_favorites_delete_owner','public'),
         ('date_memory_contributions','date_memory_contributions_read_members','public'),
         ('date_memory_contributions','date_memory_contributions_insert_owner','public'),
         ('date_memory_contributions','date_memory_contributions_update_owner','public'),
         ('date_memory_contributions','date_memory_contributions_delete_owner','public'),
         ('objects','memory_album_select_member','storage'),
         ('objects','memory_album_insert_owner','storage'),
         ('objects','memory_album_delete_owner','storage')
), actual AS (
  SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
  FROM pg_policies
)
SELECT 'POLICY_COUNT_BY_SCHEMA' AS kind, 'INFO' AS status, schemaname AS object_name,
       count(*)::text || ' policies' AS detail
FROM actual
WHERE schemaname IN ('public','storage')
GROUP BY schemaname
UNION ALL
SELECT 'BASE_POLICY_SUMMARY' AS kind,
       CASE WHEN count(a.policyname)=count(*) THEN 'PASS' ELSE 'BLOCKED' END AS status,
       'public policies defined by 001' AS object_name,
       format('%s of %s expected policies present', count(a.policyname), count(*)) AS detail
FROM base_policy b LEFT JOIN actual a
  ON a.schemaname = 'public' AND a.tablename = b.table_name AND a.policyname = b.policy_name
UNION ALL
SELECT 'BASE_POLICY_MISSING', 'BLOCKED', 'public.' || b.table_name || '/' || b.policy_name, 'expected by 001 but absent'
FROM base_policy b
WHERE NOT EXISTS (SELECT 1 FROM actual a WHERE a.schemaname='public' AND a.tablename=b.table_name AND a.policyname=b.policy_name)
UNION ALL
SELECT 'EXTRA_POLICY_ON_BASE_TABLE', 'WARNING', 'public.' || a.tablename || '/' || a.policyname,
       format('permissive=%s, roles=%s, command=%s, using=%s, check=%s',
              a.permissive, a.roles, a.cmd, left(coalesce(a.qual,'(none)'),240), left(coalesce(a.with_check,'(none)'),240))
FROM actual a
WHERE a.schemaname = 'public'
  AND a.tablename IN (SELECT name FROM (VALUES
    ('profiles'),('couples'),('couple_members'),('couple_invites'),('date_catalog'),('date_sessions'),
    ('date_responses'),('date_response_status'),('date_recommendations'),('date_votes'),('date_memories'),
    ('date_memory_confirmations'),('memory_photos'),('private_notes'),('favorites'),('ai_generations')
  ) AS t(name))
  AND NOT EXISTS (SELECT 1 FROM base_policy b WHERE b.table_name=a.tablename AND b.policy_name=a.policyname)
UNION ALL
SELECT 'PENDING_POLICY_NAME_COLLISION',
       CASE WHEN a.policyname IS NULL THEN 'PASS' ELSE 'BLOCKED' END,
       p.schema_name || '.' || p.table_name || '/' || p.policy_name,
       CASE WHEN a.policyname IS NULL THEN 'no same-name policy'
            ELSE format('exists: permissive=%s, roles=%s, command=%s', a.permissive, a.roles, a.cmd) END
FROM pending_policy p LEFT JOIN actual a
  ON a.schemaname=p.schema_name AND a.tablename=p.table_name AND a.policyname=p.policy_name
ORDER BY 1, 3;

-- 3. Columnas que determinan si ALTER TABLE 002/154304 chocará o ya se aplicó parcialmente.
WITH expected(table_name, column_name, migration, action) AS (
  VALUES ('date_catalog','objective','202611030002','base column'),
         ('date_catalog','steps','202611030002','base column'),
         ('date_catalog','enjoyment_tips','202611030002','base column'),
         ('date_memories','updated_at','20261104154304','ADD COLUMN'),
         ('private_notes','session_id','20261104154304','ADD COLUMN')
)
SELECT 'COLUMN_STATE' AS kind,
       CASE WHEN c.column_name IS NULL AND e.migration <> '202611030002' THEN 'PASS'
            WHEN c.column_name IS NULL THEN 'BLOCKED'
            WHEN e.migration = '202611030002' THEN 'PASS'
            ELSE 'BLOCKED' END AS status,
       'public.' || e.table_name || '.' || e.column_name AS object_name,
       CASE WHEN c.column_name IS NULL THEN e.action || ' absent, ready'
            ELSE format('present before pending %s, type=%s, nullable=%s, default=%s',
                        e.migration, c.data_type, c.is_nullable, coalesce(c.column_default,'(none)')) END AS detail
FROM expected e
LEFT JOIN information_schema.columns c
  ON c.table_schema='public' AND c.table_name=e.table_name AND c.column_name=e.column_name
ORDER BY e.migration, e.table_name, e.column_name;

-- Estructura actual relevante para ALTER/índice; devuelve metadatos, no filas.
SELECT 'RELEVANT_COLUMN' AS kind, 'INFO' AS status,
       'public.' || table_name || '.' || column_name AS object_name,
       format('type=%s, nullable=%s, default=%s', data_type, is_nullable, coalesce(column_default,'(none)')) AS detail
FROM information_schema.columns
WHERE table_schema='public'
  AND ((table_name='date_sessions' AND column_name IN ('couple_id','status'))
    OR (table_name='date_memories' AND column_name IN ('couple_id','session_id','updated_at'))
    OR (table_name='memory_photos' AND column_name IN ('memory_id','mime_type','byte_size'))
    OR (table_name='private_notes' AND column_name IN ('couple_id','user_id','session_id')))
ORDER BY table_name, ordinal_position;

SELECT 'RELEVANT_CONSTRAINT' AS kind, 'INFO' AS status,
       conrelid::regclass::text || '/' || conname AS object_name,
       format('type=%s, validated=%s, %s', contype, convalidated, pg_get_constraintdef(oid)) AS detail
FROM pg_constraint
WHERE conrelid IN (to_regclass('public.date_sessions'), to_regclass('public.date_memories'),
                   to_regclass('public.memory_photos'), to_regclass('public.private_notes'))
ORDER BY conrelid::regclass::text, conname;

-- 4. Colisiones de índices, restricciones y trigger creados por migraciones pendientes.
WITH pending_index(name, migration) AS (
  VALUES ('date_sessions_one_active_per_couple','20261104001703'),
         ('date_experience_progress_couple','20261104061135'),
         ('date_experience_confirmations_user','20261104061135'),
         ('date_prompt_favorites_user','20261104061135'),
         ('date_memories_one_per_session','20261104154304'),
         ('date_memory_contributions_memory_created_idx','20261104154304'),
         ('memory_photos_memory_created_idx','20261104154304'),
         ('private_notes_couple_session_idx','20261104154304')
)
SELECT 'PENDING_INDEX_COLLISION' AS kind,
       CASE WHEN i.indexrelid IS NULL THEN 'PASS' ELSE 'BLOCKED' END AS status,
       'public.' || p.name AS object_name,
       coalesce(pg_get_indexdef(i.indexrelid), 'absent as expected') AS detail
FROM pending_index p
LEFT JOIN pg_class c ON c.relnamespace='public'::regnamespace AND c.relname=p.name AND c.relkind IN ('i','I')
LEFT JOIN pg_index i ON i.indexrelid=c.oid
ORDER BY p.migration, p.name;

WITH pending_constraint(table_name, name) AS (
  VALUES ('memory_photos','memory_photos_phase4_mime_check'),
         ('memory_photos','memory_photos_phase4_size_check'),
         ('private_notes','private_notes_session_couple_fk')
)
SELECT 'PENDING_CONSTRAINT_COLLISION' AS kind,
       CASE WHEN c.oid IS NULL THEN 'PASS' ELSE 'BLOCKED' END AS status,
       'public.' || p.table_name || '/' || p.name AS object_name,
       coalesce(pg_get_constraintdef(c.oid), 'absent as expected') AS detail
FROM pending_constraint p
LEFT JOIN pg_constraint c ON c.conname=p.name AND c.conrelid=to_regclass('public.' || p.table_name)
ORDER BY p.table_name, p.name;

SELECT 'PENDING_TRIGGER_COLLISION' AS kind,
       CASE WHEN t.oid IS NULL THEN 'PASS' ELSE 'BLOCKED' END AS status,
       'public.date_memory_contributions/date_memory_contributions_touch_updated_at' AS object_name,
       coalesce(pg_get_triggerdef(t.oid, true), 'absent as expected') AS detail
FROM (SELECT to_regclass('public.date_memory_contributions') AS target) r
LEFT JOIN pg_trigger t ON t.tgrelid=r.target AND t.tgname='date_memory_contributions_touch_updated_at';

-- 5. Funciones CREATE OR REPLACE de las migraciones pendientes: presencia implica reemplazo, no error de CREATE.
WITH pending(signature, migration) AS (
  VALUES ('public.start_or_resume_date_session(uuid)','20261104001703'),
         ('public.save_date_response(uuid,jsonb,boolean)','20261104001703'),
         ('public.generate_date_recommendations(uuid)','20261104001703'),
         ('public.vote_date_recommendation(uuid,uuid)','20261104001703'),
         ('public.confirm_date_recommendation(uuid)','20261104001703/04631'),
         ('public.close_date_session(uuid,text)','20261104001703'),
         ('public.start_date_experience(uuid)','20261104061135'),
         ('public.update_date_experience_step(uuid,smallint,text)','20261104061135'),
         ('public.set_date_experience_question(uuid,text,smallint)','20261104061135'),
         ('public.advance_date_experience_turn(uuid)','20261104061135'),
         ('public.finish_date_experience(uuid)','20261104061135'),
         ('public.touch_memory_contribution_updated_at()','20261104154304'),
         ('public.create_date_memory(uuid,text,date)','20261104154304'),
         ('public.update_date_memory_metadata(uuid,text,date,timestamptz)','20261104154304'),
         ('public.share_private_note_to_memory(uuid,uuid)','20261104154304'),
         ('public.register_memory_photo(uuid,text,text,integer)','20261104154304/181500'),
         ('public.delete_memory_photo(uuid)','20261104154304'),
         ('public.can_upload_memory_photo(uuid,text)','20261104154304')
)
SELECT 'PENDING_FUNCTION' AS kind,
       CASE WHEN p.oid IS NULL THEN 'PASS' ELSE 'WARNING' END AS status,
       x.signature AS object_name,
       CASE WHEN p.oid IS NULL THEN x.migration || ', absent as expected'
            ELSE format('%s, pre-existing body hash=%s, owner=%s, security_definer=%s, settings=%s',
                        x.migration, md5(pg_get_functiondef(p.oid)), pg_get_userbyid(p.proowner), p.prosecdef, p.proconfig) END AS detail
FROM pending x LEFT JOIN pg_proc p ON p.oid=to_regprocedure(x.signature)
ORDER BY x.signature;

-- 6. Efecto previsto de 154304: retirar escrituras directas a recuerdos y dejar SELECT.
SELECT role_name,
       has_table_privilege(role_name, 'public.date_memories', 'SELECT') AS can_select,
       has_table_privilege(role_name, 'public.date_memories', 'INSERT') AS can_insert,
       has_table_privilege(role_name, 'public.date_memories', 'UPDATE') AS can_update,
       has_table_privilege(role_name, 'public.date_memories', 'DELETE') AS can_delete
FROM (VALUES ('anon'), ('authenticated')) AS r(role_name)
ORDER BY role_name;
