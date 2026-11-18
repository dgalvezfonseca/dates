// Unit + regression tests for joining a circle with an invitation code (no database needed).
import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import { canJoinWithCode, createJoinSubmitter, isCompleteInviteCode } from '../src/lib/joinCircle.mjs'
import { coupleErrorMessage } from '../src/lib/coupleErrorMessage.ts'

const CODE = '8a34910d45311f2def63851ebb8a6c10dd308dd33b7fd9b1'
const generic = 'No se pudo completar la acción. Inténtalo de nuevo en un momento.'
const tick = () => new Promise((resolve) => setTimeout(resolve, 0))

// 1. Parser: the formats the existing normalizer accepts, nothing new.
assert.ok(isCompleteInviteCode(CODE))
assert.ok(isCompleteInviteCode(CODE.toUpperCase()))
assert.ok(isCompleteInviteCode(`   ${CODE}  \n`))
assert.ok(isCompleteInviteCode(`Te invito a nuestro círculo en 100 citas tú y yo. Abre la app e ingresa este código: ${CODE.toUpperCase()} https://dgalvezfonseca.github.io/dates/`))
assert.ok(!isCompleteInviteCode('abc123'))
assert.ok(!isCompleteInviteCode(''))

// 2. Conditional rendering (single source of truth fed by the Supabase membership).
assert.equal(canJoinWithCode({ hasCircle: false }), true, 'State A: no circle')
assert.equal(canJoinWithCode({ hasCircle: true, role: 'owner', memberCount: 1 }), true, 'State B: owner alone')
assert.equal(canJoinWithCode({ hasCircle: true, role: 'owner', memberCount: 2 }), false, 'State C: full circle')
assert.equal(canJoinWithCode({ hasCircle: true, role: 'member', memberCount: 2 }), false, 'State C: invited member')
assert.equal(canJoinWithCode({ hasCircle: true, role: 'owner', memberCount: null }), false, 'Unknown count: hidden until loaded')

// 3. Submission: normalized code reaches the RPC; success only on a confirmed couple id.
{
  const calls = []
  const submit = createJoinSubmitter(async (code) => { calls.push(code); return { data: 'couple-id', error: null } }, coupleErrorMessage)
  assert.deepEqual(await submit(` ${CODE.toUpperCase()} `), { status: 'joined' })
  assert.deepEqual(calls, [CODE], 'The RPC receives the normalized 48-hex code')
  const empty = createJoinSubmitter(async () => ({ data: null, error: null }), coupleErrorMessage)
  assert.equal((await empty(CODE)).status, 'error', 'A response without a couple id is not success')
  const short = createJoinSubmitter(async () => { throw new Error('must not be called') }, coupleErrorMessage)
  assert.equal((await short('abc')).status, 'error', 'Incomplete codes never reach the RPC')
}

// 4. Loading + double submit: a second submit while the first is pending is ignored.
{
  let release
  let calls = 0
  const submit = createJoinSubmitter(() => { calls++; return new Promise((resolve) => { release = resolve }) }, coupleErrorMessage)
  const first = submit(CODE)
  await tick()
  assert.deepEqual(await submit(CODE), { status: 'ignored' })
  release({ data: 'couple-id', error: null })
  assert.deepEqual(await first, { status: 'joined' })
  assert.equal(calls, 1, 'Exactly one RPC call')
  release = undefined
  const again = submit(CODE)
  await tick()
  release({ data: null, error: { message: 'invitation is invalid, expired, or already used' } })
  assert.equal((await again).status, 'error', 'The form is usable again after the first request ends')
}

// 5. Timeout is never treated as success.
{
  const submit = createJoinSubmitter(() => new Promise(() => {}), coupleErrorMessage, { timeoutMs: 20 })
  const result = await submit(CODE)
  assert.equal(result.status, 'error')
  assert.match(result.message, /tardando/)
}

// 6. Error handling: every server/network error becomes specific Spanish text, never raw SQL.
{
  const cases = [
    ['invitation is invalid, expired, or already used', /no es válido, venció o ya se utilizó/],
    ['invalid invitation', /no es válido/],
    ['invitation belongs to your own shared space', /nuestro propio círculo/],
    ['the shared space is full', /dos integrantes/],
    ['account already belongs to a shared space', /ya pertenece/],
    ['your shared space already has shared activity', /actividad guardada/],
  ]
  for (const [raw, expected] of cases) {
    const submit = createJoinSubmitter(async () => ({ data: null, error: { message: raw, code: 'P0001' } }), coupleErrorMessage)
    const result = await submit(CODE)
    assert.equal(result.status, 'error')
    assert.match(result.message, expected)
    assert.doesNotMatch(result.message, /invitation|shared space|P0001|account/i)
  }
  const offline = createJoinSubmitter(async () => { throw new TypeError('Failed to fetch') }, coupleErrorMessage)
  assert.match((await offline(CODE)).message, /No pudimos conectar/)
  const unexpected = createJoinSubmitter(async () => ({ data: null, error: { message: 'relation "x" does not exist', code: '42P01' } }), coupleErrorMessage)
  assert.equal((await unexpected(CODE)).message, generic)
}

// 7. Every exception the deployed circle RPCs can raise has a specific message.
const migrations = new URL('../supabase/migrations/', import.meta.url)
const latest = new Map()
for (const name of (await readdir(migrations)).sort()) {
  const sql = await readFile(new URL(name, migrations), 'utf8')
  for (const fn of sql.matchAll(/create or replace function public\.(create_couple|create_couple_invite|accept_couple_invite)\b[\s\S]*?\n\$\$;/gi)) latest.set(fn[1], fn[0])
}
for (const [fn, body] of latest) {
  for (const [, raised] of body.matchAll(/raise exception '([^']+)'/g)) assert.notEqual(coupleErrorMessage({ message: raised }), generic, `${fn}: "${raised}"`)
}
const accept = latest.get('accept_couple_invite')
assert.match(accept, /own_role <> 'owner' or own_count <> 1/, 'The deployed RPC lets a sole owner join')
assert.match(accept, /security definer set search_path = ''/, 'SECURITY DEFINER with an empty search_path')
assert.match(accept, /if member_count >= 2 then raise exception 'the shared space is full'/, 'The two-person limit holds')
assert.match(accept, /used_at is not null or invite_row\.expires_at <= now\(\)/, 'Used and expired codes are rejected')
assert.match(accept, /own_couple = invite_row\.couple_id/, 'Your own code is rejected')
for (const table of ['date_sessions', 'date_memories']) assert.match(accept, new RegExp(`exists \\(select 1 from public\\.${table} where couple_id = own_couple\\)`), `Circles with ${table} are never closed`)
assert.match(accept, /to_regclass\('public\.ai_generations'\) is not null then\s+if exists \(select 1 from public\.ai_generations where couple_id = own_couple\)/, 'ai_generations only checked where it exists (absent in staging)')
assert.deepEqual([...accept.matchAll(/delete from public\.([a-z_]+)/g)].map((m) => m[1]), ['couples'], 'The only deletion is the caller’s own empty circle')
assert.ok(accept.indexOf('member_count >= 2') < accept.indexOf('delete from public.couples'), 'Capacity is checked before closing the empty circle')
const joinMigrations = (await readdir(migrations)).filter((n) => /join_from_empty_circle/.test(n))
assert.deepEqual(joinMigrations, ['20261117120000_join_from_empty_circle.sql'], 'The join migration is versioned exactly once')
const joinSql = await readFile(new URL(joinMigrations[0], migrations), 'utf8')
assert.doesNotMatch(joinSql, /grant [^;]* to (anon|public)\b/i, 'No grants to anon or public')
assert.doesNotMatch(joinSql, /disable row level security|drop policy|alter policy/i, 'RLS untouched')

// 8. Wiring: one form, rendered in state A (PairingScreen) and inside the circle card in state B.
const app = await readFile(new URL('../src/App.tsx', import.meta.url), 'utf8')
const couple = await readFile(new URL('../src/components/CouplePage.tsx', import.meta.url), 'utf8')
const form = await readFile(new URL('../src/components/JoinCircleForm.tsx', import.meta.url), 'utf8')
assert.match(app, /if \(!membership\) return <PairingScreen/)
const pairing = app.slice(app.indexOf('function PairingScreen'))
assert.match(pairing, /<JoinCircleForm /)
assert.ok(pairing.indexOf('Ya tengo un código') < pairing.indexOf('Crear nuestro espacio'), 'Joining is offered before creating, to avoid a second circle by mistake')
assert.doesNotMatch(form, /from\('couple_members'\)\.(insert|update|delete)/, 'No direct table writes')
assert.equal((app.match(/rpc\('accept_couple_invite'/g) ?? []).length, 0, 'No duplicated RPC call outside the shared form')
assert.match(couple, /canJoinWithCode\(\{ hasCircle: true, role, memberCount \}\) && <div className="circle-join"/)
assert.ok(couple.indexOf('Generar otra invitación') < couple.indexOf('¿Ya tienes un código?'), 'Join section sits below the invite actions')
assert.match(couple, /Si la otra persona ya creó su círculo, peguemos aquí su código para unirnos\./)
assert.match(couple, /button="Unirnos con este código"/)
assert.match(form, /placeholder="Pega aquí el código o mensaje de invitación"/)
assert.match(form, /rpc\('accept_couple_invite', \{ p_token: code \}\)/)
assert.match(form, /disabled=\{busy \|\| !isCompleteInviteCode\(invite\)\}/, 'Button disabled while processing')
assert.doesNotMatch(app + couple + form, /localStorage/, 'Membership never comes from localStorage')
assert.doesNotMatch(form, /console\.(log|info|debug)/, 'Codes are never logged')
assert.match(app, /\}, \[userId\]\)/, 'Membership reload keyed on the user id (no flicker on tab focus)')

console.log('Join circle: parser, state rules, loading/double submit, timeout, errors and wiring verified.')
