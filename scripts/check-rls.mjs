import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'

const sql = await readFile(new URL('../supabase/migrations/202611030001_initial_schema.sql', import.meta.url), 'utf8')
const detailMigration = await readFile(new URL('../supabase/migrations/202611030002_catalog_detail_fields.sql', import.meta.url), 'utf8')
const catalogMigration = await readFile(new URL('../supabase/migrations/202611030003_seed_date_catalog.sql', import.meta.url), 'utf8')
const hardeningMigration = await readFile(new URL('../supabase/migrations/202611030004_revoke_public_rls_event_trigger.sql', import.meta.url), 'utf8')
const triggerCheckMigration = await readFile(new URL('../supabase/migrations/202611030005_verify_rls_event_trigger.sql', import.meta.url), 'utf8')
const planningMigration = await readFile(new URL('../supabase/migrations/20261104001703_phase2_date_planning.sql', import.meta.url), 'utf8')
const planningGuardMigration = await readFile(new URL('../supabase/migrations/20261104004631_phase2_state_guards.sql', import.meta.url), 'utf8')
const experienceMigration = await readFile(new URL('../supabase/migrations/20261104061135_date_experience_mode.sql', import.meta.url), 'utf8')
const memoriesMigration = await readFile(new URL('../supabase/migrations/20261104154304_private_memory_album.sql', import.meta.url), 'utf8')
const memoriesRealtimeMigration = await readFile(new URL('../supabase/migrations/20261104180000_memory_album_realtime.sql', import.meta.url), 'utf8')
const memoryLockMigration = await readFile(new URL('../supabase/migrations/20261104181500_memory_photo_lock_cleanup.sql', import.meta.url), 'utf8')
const tables = [...sql.matchAll(/^create table public\.(\w+)/gm)].map((match) => match[1])
assert.equal(tables.length, 16, 'The initial schema table count changed; review RLS coverage.')
for (const table of tables) assert.match(sql, new RegExp(`alter table public\\.${table} enable row level security;`, 'i'), `${table} must enable RLS`)
assert.match(sql, /create policy notes_read_owner[^\n]+user_id = \(select auth\.uid\(\)\)/i, 'Private notes must be owner-only')
assert.match(sql, /revoke all on public\.profiles[\s\S]+?from anon, authenticated;/i, 'Client table grants must start closed')
assert.match(sql, /revoke all on function public\.accept_couple_invite\(text\) from public, anon;/i, 'Invite acceptance must not be callable anonymously')
assert.doesNotMatch(sql, /grant\s+[^;]*\b(insert|update|delete|all)\b[^;]*on public\.couple_members\b/i, 'Membership writes must go through checked RPCs')
for (const field of ['objective', 'steps', 'enjoyment_tips']) assert.match(detailMigration, new RegExp(`add column if not exists ${field}\\b`, 'i'), `${field} must be added without replacing existing table data`)
assert.equal([...catalogMigration.matchAll(/^  \(/gm)].length, 100, 'Catalog seed migration must contain exactly 100 rows.')
assert.match(catalogMigration, /on conflict \(id\) do update/i, 'Catalog seed must be repeatable by stable ID.')
assert.doesNotMatch(catalogMigration, /\b(delete|truncate|drop table)\b/i, 'Catalog seed must not delete or drop existing data.')
assert.match(hardeningMigration, /revoke all on function public\.rls_auto_enable\(\) from public, anon, authenticated/i, 'The platform RLS event function must not be directly executable by API roles.')
assert.match(hardeningMigration, /to_regprocedure\('public\.rls_auto_enable\(\)'\)/i, 'The optional RLS event function must be checked before access changes.')
assert.match(hardeningMigration, /p\.prosecdef[\s\S]+?p\.proconfig = array\['search_path=pg_catalog'\][\s\S]+?p\.prosrc = v_expected_body/i, 'An existing RLS event function must match its verified security settings and body.')
const expectedRlsBody = hardeningMigration.match(/v_expected_body constant text := \$body\$([\s\S]*?)\$body\$;/)?.[1]
assert.ok(expectedRlsBody, 'The verified RLS event function body must be pinned in migration 004.')
assert.equal(createHash('sha256').update(expectedRlsBody).digest('hex'), '325ae266d9b166715ef5230ceaf7ff9d523e483cf5610dfb9779ab3f183f4af9', 'The pinned RLS event body must match the inspected staging definition.')
assert.match(hardeningMigration, /select \* into v_trigger[\s\S]+?v_trigger\.evtenabled <> 'O'[\s\S]+?v_trigger\.evttags is distinct from array\['CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO'\]/i, 'An existing RLS event trigger must be enabled and match the verified tags.')
assert.match(hardeningMigration, /raise exception '[^']*unexpected definition/i, 'Unexpected homonymous RLS objects must fail closed.')
assert.doesNotMatch(hardeningMigration, /\b(drop|grant|cascade)\b/i, 'RLS event migration must not drop objects, add grants, or cascade dependencies.')
assert.match(hardeningMigration, /if v_function is null[\s\S]+?ensure_rls exists without public\.rls_auto_enable/i, 'Function and trigger presence must be checked together without provisioning privileged objects.')
assert.match(triggerCheckMigration, /from pg_class[\s\S]+?not c\.relrowsecurity/i, 'Migration 005 must verify RLS directly on public tables without creating a probe table.')
assert.doesNotMatch(triggerCheckMigration, /\b(create|drop) table\b/i, 'Migration 005 must not create or drop a database object.')
for (const name of ['start_or_resume_date_session','save_date_response','generate_date_recommendations','vote_date_recommendation','confirm_date_recommendation','close_date_session']) {
  assert.match(planningMigration, new RegExp(`create or replace function public\\.${name}\\([\\s\\S]*?set search_path = ''`, 'i'), `${name} must pin its SECURITY DEFINER search path`)
  assert.match(planningMigration, new RegExp(`revoke all on function[\\s\\S]*?public\\.${name}\\(`, 'i'), `${name} must not inherit PUBLIC/anon execution`)
}
assert.match(planningMigration, /date_sessions_one_active_per_couple/i, 'A shared space must not create concurrent active planning sessions.')
assert.match(planningMigration, /both participants must submit first/i, 'Recommendations must wait for both private responses.')
assert.match(planningMigration, /both participants must choose the same experience/i, 'Confirmation requires matching votes.')
assert.match(planningMigration, /date_confirmations[\s\S]*?enable row level security/i, 'Bilateral confirmations require RLS.')
assert.match(planningMigration, /revoke insert, update on public\.date_sessions, public\.date_responses, public\.date_response_status, public\.date_votes/i, 'Clients must not mutate planning state outside checked RPCs.')
assert.match(planningGuardMigration, /from public\.date_sessions where id=p_session_id for update/i, 'Confirmation must lock the session while validating its state.')
assert.match(planningGuardMigration, /v_status<>'voting'/i, 'Stale screens must not confirm a cancelled or postponed session.')
assert.match(planningGuardMigration, /revoke all on function public\.confirm_date_recommendation\(uuid\) from public, anon/i, 'Confirmation RPC must remain unavailable to anon and PUBLIC.')
for (const table of ['date_experience_progress', 'date_experience_confirmations', 'date_prompt_favorites']) {
  assert.match(experienceMigration, new RegExp(`alter table public\\.${table} enable row level security;`, 'i'), `${table} must enable RLS`)
  assert.match(experienceMigration, new RegExp(`create policy ${table}_[\\w]+ on public\\.${table}`, 'i'), `${table} must have an explicit policy`)
}
assert.match(experienceMigration, /revoke all on public\.date_experience_progress[\s\S]+?from public, anon, authenticated/i, 'Shared experience tables must not be directly writable by API roles')
for (const fn of ['start_date_experience', 'update_date_experience_step', 'set_date_experience_question', 'advance_date_experience_turn', 'finish_date_experience']) {
  assert.match(experienceMigration, new RegExp(`create or replace function public\\.${fn}\\([\\s\\S]*?security definer set search_path = ''`, 'i'), `${fn} must pin its search path`)
  assert.match(experienceMigration, new RegExp(`public\\.${fn}\\([\\s\\S]*?from public, anon`, 'i'), `${fn} must revoke PUBLIC and anon execution`)
}
assert.match(experienceMigration, /auth\.uid\(\)/i, 'Experience RPCs must bind changes to an authenticated participant')
assert.doesNotMatch(experienceMigration, /drop table\s+(?:if exists\s+)?public\.ai_generations/i, 'The experience migration must preserve the legacy AI table and its data')
for (const [file, migration] of [
  ['phase2 planning', planningMigration],
  ['date experience', experienceMigration],
  ['private memory album', memoriesMigration],
]) {
  const createdTables = [...migration.matchAll(/^create table public\.(\w+)/gim)].map((match) => match[1])
  for (const table of createdTables) {
    assert.match(migration, new RegExp(`alter table public\\.${table} enable row level security`, 'i'), `${file}: ${table} must enable RLS in its creating migration`)
  }
}
assert.match(memoriesMigration, /create table public\.date_memory_contributions[\s\S]+?enable row level security/i, 'Memory contributions must have RLS.')
assert.match(memoriesMigration, /date_memory_contributions_insert_owner[\s\S]+?user_id = \(select auth\.uid\(\)\)/i, 'Shared contributions must retain their author.')
assert.match(memoriesMigration, /create policy memory_album_select_member[\s\S]+?public\.is_couple_member/i, 'Private storage reads must be limited to couple members.')
assert.match(memoriesMigration, /create policy memory_album_delete_owner[\s\S]+?auth\.uid/i, 'Only the uploader may delete a photo object.')
assert.match(memoriesMigration, /public = false[\s\S]+?3145728[\s\S]+?image\/webp/i, 'The photo bucket must stay private and capped at 3 MB.')
assert.match(memoriesMigration, /public\.create_date_memory\([\s\S]+?both participants must confirm completion first/i, 'A memory requires bilateral completion.')
assert.match(memoriesMigration, /revoke all on function public\.create_date_memory[\s\S]+?from public, anon/i, 'Memory SECURITY DEFINER functions must revoke public execution.')
assert.match(memoriesMigration, /share_private_note_to_memory[\s\S]+?is_shared_note_copy/i, 'Sharing a private note must create an explicit copy.')
assert.match(memoriesRealtimeMigration, /alter publication supabase_realtime add table public\.date_memories/i, 'Shared memories must synchronize across devices.')
assert.match(memoriesRealtimeMigration, /date_memory_contributions[\s\S]+?memory_photos/i, 'Shared contributions and photo metadata must synchronize across devices.')
assert.match(memoryLockMigration, /perform 1 from public\.date_memories where id = p_memory_id for update/i, 'Photo quota lock must not keep an unused result variable.')
console.log(`Static checks passed: RLS on ${tables.length} base tables, three mode-cita tables, private memory controls and a 100-row catalog migration.`)
