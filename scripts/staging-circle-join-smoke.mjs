// Staging-only smoke test for joining a circle with an invitation code (accept_couple_invite),
// including the case that locked real accounts out: both people created their own circle first.
// Temporary confirmed accounts; everything is removed at the end. No credential is printed.
import assert from 'node:assert/strict'
import { randomBytes, randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { createClient } from '@supabase/supabase-js'
import { coupleErrorMessage } from '../src/lib/coupleErrorMessage.ts'

const env = Object.fromEntries((await readFile(new URL('../.env.staging.local', import.meta.url), 'utf8'))
  .split(/\r?\n/).flatMap((line) => {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/)
    return match ? [[match[1], match[2].replace(/^(['"])(.*)\1$/, '$2')]] : []
  }))
const url = env.VITE_SUPABASE_URL
const publishableKey = env.VITE_SUPABASE_PUBLISHABLE_KEY
const secretKey = process.env.SUPABASE_STAGING_SECRET_KEY
assert.equal(new URL(url).hostname, 'uyhavkmjvfaeoapzoobh.supabase.co', 'Refusing any project except staging.')
assert.ok(publishableKey?.startsWith('sb_publishable_'), 'Staging publishable key is required.')
assert.ok(secretKey?.startsWith('sb_secret_'), 'Staging secret key is required in memory.')

const options = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } }
const admin = createClient(url, secretKey, options)
const users = []
const passed = []
let failures = 0
const check = (name, condition) => { assert.ok(condition, name); passed.push(name) }
const ok = async (promise) => { const { data, error } = await promise; if (error) throw error; return data }
const fails = async (promise, pattern) => { const { error } = await promise; return !!error && pattern.test(error.message) }

async function account(label) {
  const email = `qa-join-${label}-${randomUUID()}@example.invalid`
  const password = `${randomBytes(36).toString('base64url')}Q7!`
  const created = await admin.auth.admin.createUser({ email, password, email_confirm: true })
  assert.equal(created.error, null, 'Staging test account creation failed.')
  const client = createClient(url, publishableKey, options)
  assert.equal((await client.auth.signInWithPassword({ email, password })).error, null, 'Staging test account login failed.')
  const user = { label, id: created.data.user.id, client }
  users.push(user)
  return user
}
const membership = async (user) => (await ok(admin.from('couple_members').select('couple_id, role').eq('user_id', user.id))) ?? []
const memberCount = async (couple) => (await ok(admin.from('couple_members').select('user_id').eq('couple_id', couple))).length

try {
  const [A, B, C, D, E, F, G] = await Promise.all(['a', 'b', 'c', 'd', 'e', 'f', 'g'].map(account))

  // Root cause: A and B both created a circle; B later receives A's code.
  const coupleA = await ok(A.client.rpc('create_couple'))
  const coupleB = await ok(B.client.rpc('create_couple'))
  const inviteA = await ok(A.client.rpc('create_couple_invite'))
  const { data: catalog } = await admin.from('date_catalog').select('id').limit(1)
  await ok(B.client.from('favorites').insert({ user_id: B.id, date_id: catalog[0].id, couple_id: coupleB }))
  await ok(B.client.from('private_notes').insert({ user_id: B.id, couple_id: coupleB, title: 'QA', body: 'nota de prueba' }))
  await ok(B.client.rpc('accept_couple_invite', { p_token: inviteA }))
  const bMembership = await membership(B)
  check('owner alone in an empty circle can accept the other person’s code', bMembership.length === 1 && bMembership[0].couple_id === coupleA && bMembership[0].role === 'member')
  check('the joined circle now has exactly two members', await memberCount(coupleA) === 2)
  check('the empty circle was closed', (await ok(admin.from('couples').select('id').eq('id', coupleB))).length === 0)
  const fav = await ok(admin.from('favorites').select('couple_id').eq('user_id', B.id))
  const notes = await ok(admin.from('private_notes').select('couple_id').eq('user_id', B.id))
  check('personal favorites and private notes moved with the person', fav.length === 1 && fav[0].couple_id === coupleA && notes.length === 1 && notes[0].couple_id === coupleA)
  check('partner still cannot read the moved private note', (await ok(A.client.from('private_notes').select('id'))).length === 0)

  // Consumed, invalid and own codes.
  check('a consumed code is rejected without details', await fails(C.client.rpc('accept_couple_invite', { p_token: inviteA }), /invalid, expired, or already used/))
  check('a malformed code is rejected', await fails(C.client.rpc('accept_couple_invite', { p_token: 'zz'.repeat(24) }), /invalid invitation/))
  check('an unknown well-formed code is rejected', await fails(C.client.rpc('accept_couple_invite', { p_token: randomBytes(24).toString('hex') }), /invalid, expired, or already used/))
  const coupleC = await ok(C.client.rpc('create_couple'))
  const inviteC1 = await ok(C.client.rpc('create_couple_invite'))
  const inviteC2 = await ok(C.client.rpc('create_couple_invite'))
  check('your own circle’s code is rejected', await fails(C.client.rpc('accept_couple_invite', { p_token: inviteC1 }), /your own shared space/))

  // A member of a full circle cannot switch partners.
  check('someone already with a partner cannot join another circle', await fails(A.client.rpc('accept_couple_invite', { p_token: inviteC1 }), /already belongs/))
  check('the invited member cannot leave either', await fails(B.client.rpc('accept_couple_invite', { p_token: inviteC1 }), /already belongs/))

  // Double submit from the same account: exactly one join.
  const twice = await Promise.all([D.client.rpc('accept_couple_invite', { p_token: inviteC1 }), D.client.rpc('accept_couple_invite', { p_token: inviteC1 })])
  check('double click joins once', twice.filter(({ error }) => !error).length === 1 && await memberCount(coupleC) === 2)

  // A full circle rejects a second still-valid code.
  check('a still-valid code for a full circle is rejected', await fails(E.client.rpc('accept_couple_invite', { p_token: inviteC2 }), /full/))
  check('the rejected account stays without a circle', (await membership(E)).length === 0)

  // A solo circle with shared activity is never closed.
  const coupleF = await ok(F.client.rpc('create_couple'))
  await ok(admin.from('date_sessions').insert({ couple_id: coupleF, created_by: F.id }))
  await ok(G.client.rpc('create_couple'))
  const inviteG = await ok(G.client.rpc('create_couple_invite'))
  check('a circle with shared activity is not closed to join another', await fails(F.client.rpc('accept_couple_invite', { p_token: inviteG }), /shared activity/) && (await membership(F))[0]?.couple_id === coupleF)

  // Anonymous callers still cannot use the RPC.
  const anon = createClient(url, publishableKey, options)
  check('anonymous callers cannot accept invitations', !!(await anon.rpc('accept_couple_invite', { p_token: inviteG })).error)

  // Every server message reaches people in Spanish.
  const messages = ['invitation is invalid, expired, or already used', 'invalid invitation', 'invitation belongs to your own shared space', 'account already belongs to a shared space', 'the shared space is full', 'your shared space already has shared activity']
  check('all join errors map to specific Spanish text', messages.every((m) => !/invitation|shared space|account/i.test(coupleErrorMessage({ message: m }))))
} finally {
  const ids = users.map(({ id }) => id)
  if (ids.length) {
    const { data } = await admin.from('couple_members').select('couple_id').in('user_id', ids)
    const couples = [...new Set([...(data ?? []).map(({ couple_id }) => couple_id)])]
    if (couples.length) { const { error } = await admin.from('couples').delete().in('id', couples); if (error) { failures++; process.stderr.write('Temporary circle cleanup failed.\n') } }
  }
  let removed = 0
  for (const { id } of users) { const { error } = await admin.auth.admin.deleteUser(id); if (error) failures++; else removed++ }
  process.stdout.write(`${JSON.stringify({ passed: passed.length, checks: passed, temporaryUsersDeleted: removed })}\n`)
  if (failures) process.exitCode = 1
}
