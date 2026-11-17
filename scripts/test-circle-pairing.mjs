// Regression checks for joining a circle with an invitation code (no database needed).
import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import { coupleErrorMessage } from '../src/lib/coupleErrorMessage.ts'

const generic = 'No se pudo completar la acción. Inténtalo de nuevo en un momento.'
const migrations = new URL('../supabase/migrations/', import.meta.url)
const names = (await readdir(migrations)).sort()

// 1. The latest definition of every circle RPC is the one deployed; take each function's last body.
const latest = new Map()
for (const name of names) {
  const sql = await readFile(new URL(name, migrations), 'utf8')
  for (const fn of sql.matchAll(/create or replace function public\.(create_couple|create_couple_invite|accept_couple_invite)\b[\s\S]*?\n\$\$;/gi)) latest.set(fn[1], fn[0])
}
assert.deepEqual([...latest.keys()].sort(), ['accept_couple_invite', 'create_couple', 'create_couple_invite'])

// 2. Every exception those RPCs can raise maps to a specific Spanish message, never raw English.
for (const [fn, body] of latest) {
  for (const [, raised] of body.matchAll(/raise exception '([^']+)'/g)) {
    const output = coupleErrorMessage({ message: raised })
    assert.notEqual(output, generic, `${fn}: "${raised}" needs a specific message`)
    assert.doesNotMatch(output, /invitation|shared space|account|authentication/i, 'Raw English must not reach users.')
  }
}

// 3. Root cause guard: an owner who is ALONE in a circle without shared activity can still accept
//    an invitation. The rule must stay server-side and keep the two-person limit.
const accept = latest.get('accept_couple_invite')
assert.match(accept, /security definer set search_path = ''/, 'accept_couple_invite must stay SECURITY DEFINER with an empty search_path')
assert.match(accept, /own_role <> 'owner' or own_count <> 1/, 'Only a sole owner may leave an empty circle to join another one')
assert.match(accept, /if member_count >= 2 then raise exception 'the shared space is full'/, 'The two-person limit must hold')
assert.match(accept, /used_at is not null or invite_row\.expires_at <= now\(\)/, 'Used and expired codes must be rejected')
assert.match(accept, /own_couple = invite_row\.couple_id/, 'A code from your own circle must be rejected')
for (const table of ['date_sessions', 'date_memories']) {
  assert.match(accept, new RegExp(`exists \\(select 1 from public\\.${table} where couple_id = own_couple\\)`), `Circles with ${table} must not be closed`)
}
assert.match(accept, /to_regclass\('public\.ai_generations'\) is not null then\s+if exists \(select 1 from public\.ai_generations where couple_id = own_couple\)/, 'ai_generations is checked only where it exists (absent in staging)')
assert.doesNotMatch(accept.replace(/--.*$/gm, '').replace(/if to_regclass\('public\.ai_generations'\)[\s\S]*?end if;\s*end if;/, ''), /ai_generations/, 'No unguarded reference to ai_generations')
const deletes = [...accept.matchAll(/delete from public\.([a-z_]+)/g)].map((m) => m[1])
assert.deepEqual(deletes, ['couples'], 'The only deletion is the caller’s own empty circle')
assert.match(accept, /delete from public\.couples where id = own_couple;/)
assert.ok(accept.indexOf('member_count >= 2') < accept.indexOf('delete from public.couples'), 'Check capacity before closing the empty circle')
const lastMigration = await readFile(new URL(names.findLast((n) => /join_from_empty_circle/.test(n)), migrations), 'utf8')
assert.match(lastMigration, /revoke all on function public\.accept_couple_invite\(text\) from public, anon;/)
assert.doesNotMatch(lastMigration, /grant [^;]* to (anon|public)\b/i, 'No new grants to anon or public')
assert.doesNotMatch(lastMigration, /disable row level security|drop policy|alter policy/i)

// 4. The join form is reachable from both places where an account can still join: without a circle
//    (PairingScreen) and alone in its own circle (CouplePage), driven by the membership from Supabase.
const app = await readFile(new URL('../src/App.tsx', import.meta.url), 'utf8')
const couple = await readFile(new URL('../src/components/CouplePage.tsx', import.meta.url), 'utf8')
const form = await readFile(new URL('../src/components/JoinCircleForm.tsx', import.meta.url), 'utf8')
assert.match(app, /if \(!membership\) return <PairingScreen/, 'Accounts without a circle always get the pairing screen')
assert.match(app.slice(app.indexOf('function PairingScreen')), /<JoinCircleForm /)
assert.match(couple, /role === 'owner' && memberCount === 1 && <section className="circle-join-alt"/)
assert.match(couple, /<JoinCircleForm /)
assert.doesNotMatch(app + couple + form, /localStorage\.[gs]etItem\([^)]*(onboard|pair|invite)/i, 'Visibility must not depend on a local onboarding flag')
assert.match(form, /inFlight\.current/, 'Double submit guard')
assert.match(form, /rpc\('accept_couple_invite'/)
assert.doesNotMatch(form, /from\('couple_members'\)\.(insert|update|delete)/, 'No direct table writes')

console.log(`Circle pairing: ${latest.size} RPCs mapped, sole-owner join guarded, form reachable from both screens.`)
