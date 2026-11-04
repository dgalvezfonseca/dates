import assert from 'node:assert/strict'
import { randomBytes, randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { createClient } from '@supabase/supabase-js'

const env = Object.fromEntries((await readFile(new URL('../.env.staging.local', import.meta.url), 'utf8'))
  .split(/\r?\n/).flatMap((line) => {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/)
    return match ? [[match[1], match[2].replace(/^(['"])(.*)\1$/, '$2')]] : []
  }))
const url = env.VITE_SUPABASE_URL
assert.equal(new URL(url).hostname, 'uyhavkmjvfaeoapzoobh.supabase.co', 'Refusing to run outside staging.')
assert.ok(env.VITE_SUPABASE_PUBLISHABLE_KEY?.startsWith('sb_publishable_'), 'Missing staging Publishable Key.')
assert.ok(process.env.SUPABASE_STAGING_SECRET_KEY?.startsWith('sb_secret_'), 'A staging secret API key is required in process memory.')

const clientOptions = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } }
const admin = createClient(url, process.env.SUPABASE_STAGING_SECRET_KEY, clientOptions)
const anon = createClient(url, env.VITE_SUPABASE_PUBLISHABLE_KEY, clientOptions)
const users = []
let coupleId
let noteId
let sessionId
const favoriteIds = []
let completed = false

async function checkNoRows(query, label) {
  const { data, error } = await query
  assert.ok(error || data?.length === 0, `${label} exposed rows to an unauthorized user.`)
}

try {
  for (const label of ['a', 'b', 'c']) {
    const email = `qa-${label}-${randomUUID()}@example.invalid`
    const password = `${randomBytes(32).toString('base64url')}A1!`
    const generated = await admin.auth.admin.generateLink({ type: 'signup', email, password })
    assert.equal(generated.error, null, `Could not create temporary signup ${label}.`)
    const id = generated.data.user.id
    users.push({ label, id, email, password, client: createClient(url, env.VITE_SUPABASE_PUBLISHABLE_KEY, clientOptions) })
    const confirmed = await users.at(-1).client.auth.verifyOtp({ type: 'signup', token_hash: generated.data.properties.hashed_token })
    assert.equal(confirmed.error, null, `Could not confirm temporary signup ${label}.`)
    assert.ok(confirmed.data.session, `Signup ${label} did not yield an authenticated session.`)
    await users.at(-1).client.auth.signOut({ scope: 'local' })
    const login = await users.at(-1).client.auth.signInWithPassword({ email, password })
    assert.equal(login.error, null, `Login failed for temporary account ${label}.`)
    assert.equal(login.data.user.id, id)
  }
  assert.equal(new Set(users.map(({ id }) => id)).size, 3, 'Temporary accounts must be distinct.')
  console.log('PASS auth: 3 staging signups confirmed and 3 password logins completed; no emails sent.')

  const catalog = await users[0].client.from('date_catalog').select('id').eq('active', true).order('sort_order')
  assert.equal(catalog.error, null)
  assert.equal(catalog.data.length, 100)
  console.log('PASS catalog: authenticated client read all 100 activities.')

  const created = await users[0].client.rpc('create_couple')
  assert.equal(created.error, null)
  coupleId = created.data
  const invite = await users[0].client.rpc('create_couple_invite')
  assert.equal(invite.error, null)
  assert.match(invite.data, /^[a-f0-9]{48}$/)
  const secondInvite = await users[0].client.rpc('create_couple_invite')
  assert.equal(secondInvite.error, null)
  assert.match(secondInvite.data, /^[a-f0-9]{48}$/)
  const accepted = await users[1].client.rpc('accept_couple_invite', { p_token: invite.data })
  assert.equal(accepted.error, null)
  assert.equal(accepted.data, coupleId)
  const full = await users[2].client.rpc('accept_couple_invite', { p_token: secondInvite.data })
  assert.ok(full.error, 'Third account unexpectedly joined a full shared space.')
  assert.match(full.error.message, /full/i, 'Third account was rejected for a reason other than the two-member limit.')
  const replay = await users[2].client.rpc('accept_couple_invite', { p_token: invite.data })
  assert.ok(replay.error, 'Third account unexpectedly reused a consumed invitation.')
  assert.match(replay.error.message, /invalid|expired|used/i, 'Consumed invitation was rejected for an unexpected reason.')

  const members = await users[1].client.from('couple_members').select('user_id').eq('couple_id', coupleId)
  assert.equal(members.error, null)
  assert.equal(members.data.length, 2, 'The shared space must contain exactly two participants.')
  assert.deepEqual(new Set(members.data.map(({ user_id }) => user_id)), new Set(users.slice(0, 2).map(({ id }) => id)))
  await checkNoRows(users[2].client.from('couples').select('id').eq('id', coupleId), 'Third account shared-space read')
  await checkNoRows(users[2].client.from('couple_members').select('user_id').eq('couple_id', coupleId), 'Third account membership read')
  assert.equal((await users[2].client.rpc('is_couple_member', { target_couple: coupleId })).data, false)
  assert.ok((await users[1].client.rpc('create_couple')).error, 'A linked participant created a second space.')
  assert.ok((await users[1].client.rpc('create_couple_invite')).error, 'A non-owner created an invitation.')
  console.log('PASS invitations: A/B linked once, a valid second invite was rejected for full capacity, consumed invite replay failed, and membership stayed at 2.')

  const starts = await Promise.all([
    users[0].client.rpc('start_or_resume_date_session', { p_couple_id: coupleId }),
    users[1].client.rpc('start_or_resume_date_session', { p_couple_id: coupleId }),
  ])
  assert.equal(starts[0].error, null); assert.equal(starts[1].error, null)
  assert.equal(starts[0].data, starts[1].data, 'Concurrent requests created duplicate active sessions.')
  sessionId = starts[0].data
  assert.ok((await users[2].client.from('date_sessions').select('id').eq('id', sessionId)).data?.length === 0, 'Third account read another couple session.')
  assert.ok((await users[0].client.from('date_sessions').insert({ couple_id: coupleId, created_by: users[0].id })).error, 'Direct session insertion bypassed the checked RPC.')
  assert.ok((await users[0].client.from('date_responses').insert({ session_id: sessionId, user_id: users[0].id, answers: {} })).error, 'Direct answer insertion bypassed the privacy/status RPC.')
  assert.ok((await users[0].client.from('date_response_status').insert({ session_id: sessionId, user_id: users[0].id, submitted_at: new Date().toISOString() })).error, 'Direct submission status mutation succeeded.')
  const answerA = { activity: 'romantica', mood: 'necesito-tranquilidad', time: '1-2-horas', setting: 'interior', discover: 'suenos', avoid: [] }
  const draftA = await users[0].client.rpc('save_date_response', { p_session_id: sessionId, p_answers: answerA, p_submit: false })
  assert.equal(draftA.error, null)
  await checkNoRows(users[1].client.from('date_responses').select('answers').eq('session_id', sessionId).eq('user_id', users[0].id), 'Partner incomplete response read')
  const submitA = await users[0].client.rpc('save_date_response', { p_session_id: sessionId, p_answers: answerA, p_submit: true })
  assert.equal(submitA.error, null)
  assert.equal(submitA.data.partner_submitted, false, 'The first user should see only a waiting state.')
  assert.ok((await users[1].client.rpc('generate_date_recommendations', { p_session_id: sessionId })).error, 'Recommendations generated before both submissions.')
  const answerB = { activity: 'aventura', mood: 'distraerme', time: '1-2-horas', setting: 'exterior', discover: 'divertido', avoid: [] }
  assert.equal((await users[1].client.rpc('save_date_response', { p_session_id: sessionId, p_answers: answerB, p_submit: true })).error, null)
  await checkNoRows(users[1].client.from('date_responses').select('answers').eq('session_id', sessionId).eq('user_id', users[0].id), 'Partner submitted response read')
  const recommendations = await Promise.all([
    users[0].client.rpc('generate_date_recommendations', { p_session_id: sessionId }),
    users[1].client.rpc('generate_date_recommendations', { p_session_id: sessionId }),
  ])
  assert.equal(recommendations[0].error, null); assert.equal(recommendations[1].error, null)
  assert.deepEqual(recommendations[0].data, recommendations[1].data, 'Both users must see the same deterministic recommendations.')
  assert.equal(recommendations[0].data.length, 3)
  assert.equal(new Set(recommendations[0].data.map(({ date_id }) => date_id)).size, 3)
  assert.ok((await users[0].client.from('date_votes').insert({ session_id: sessionId, user_id: users[0].id, recommendation_id: recommendations[0].data[0].id })).error, 'Direct vote insertion bypassed the state-checked RPC.')
  assert.equal((await users[0].client.from('date_recommendations').select('id').eq('session_id', sessionId)).data.length, 3)
  assert.equal((await users[0].client.from('date_sessions').select('status').eq('id', sessionId).single()).data.status, 'voting')
  const [first, second] = recommendations[0].data
  assert.equal((await users[0].client.rpc('vote_date_recommendation', { p_session_id: sessionId, p_recommendation_id: first.id })).error, null)
  assert.equal((await users[1].client.rpc('vote_date_recommendation', { p_session_id: sessionId, p_recommendation_id: second.id })).error, null)
  assert.ok((await users[0].client.rpc('confirm_date_recommendation', { p_session_id: sessionId })).error, 'Different votes unexpectedly allowed confirmation.')
  assert.equal((await users[1].client.rpc('vote_date_recommendation', { p_session_id: sessionId, p_recommendation_id: first.id })).error, null, 'Vote reconsideration failed.')
  assert.equal((await users[0].client.rpc('confirm_date_recommendation', { p_session_id: sessionId })).data, false, 'One acceptance confirmed the date unilaterally.')
  assert.equal((await users[1].client.rpc('confirm_date_recommendation', { p_session_id: sessionId })).data, true, 'Two matching acceptances did not confirm the date.')
  assert.equal((await users[0].client.rpc('confirm_date_recommendation', { p_session_id: sessionId })).data, true, 'A retried bilateral confirmation was not idempotent.')
  const confirmed = await users[1].client.from('date_sessions').select('status,selected_date_id').eq('id', sessionId).single()
  assert.equal(confirmed.data.status, 'confirmed'); assert.equal(confirmed.data.selected_date_id, first.date_id)
  assert.ok((await users[2].client.from('date_recommendations').select('id').eq('session_id', sessionId)).data?.length === 0, 'Third account read recommendations.')
  assert.equal((await users[0].client.rpc('close_date_session', { p_session_id: sessionId, p_status: 'postponed' })).error, null)
  assert.equal((await users[1].client.from('date_sessions').select('status').eq('id', sessionId).single()).data.status, 'postponed')
  assert.ok((await users[0].client.rpc('confirm_date_recommendation', { p_session_id: sessionId })).error, 'A stale screen confirmed a postponed session.')
  const nextSession = await users[0].client.rpc('start_or_resume_date_session', { p_couple_id: coupleId })
  assert.equal(nextSession.error, null); assert.notEqual(nextSession.data, sessionId)
  assert.equal((await users[1].client.rpc('close_date_session', { p_session_id: nextSession.data, p_status: 'cancelled' })).error, null)
  assert.ok((await users[1].client.rpc('confirm_date_recommendation', { p_session_id: nextSession.data })).error, 'A stale screen confirmed a cancelled session.')
  console.log('PASS planning: concurrent session reuse, private drafts, wait-until-both, three stable recommendations, vote changes, bilateral confirmation, postponement, and cancellation.')

  const catalogIds = catalog.data.map(({ id }) => id)
  const [favoriteA, favoriteB] = catalogIds
  for (const [index, dateId] of [[0, favoriteA], [1, favoriteB]]) {
    const result = await users[index].client.from('favorites').insert({ couple_id: coupleId, user_id: users[index].id, date_id: dateId })
    assert.equal(result.error, null)
    favoriteIds.push({ index, dateId })
  }
  for (const index of [0, 1]) {
    const visible = await users[index].client.from('favorites').select('user_id,date_id').eq('couple_id', coupleId)
    assert.equal(visible.error, null)
    assert.deepEqual(visible.data.map(({ user_id, date_id }) => [user_id, date_id]), [[users[index].id, index === 0 ? favoriteA : favoriteB]])
  }
  const forged = await users[0].client.from('favorites').insert({ couple_id: coupleId, user_id: users[1].id, date_id: catalogIds[2] })
  assert.ok(forged.error, 'Cross-user favorite insert unexpectedly succeeded.')

  const noteBody = `Temporary staging RLS note ${randomUUID()}`
  const note = await users[0].client.from('private_notes').insert({ couple_id: coupleId, user_id: users[0].id, title: 'RLS QA', body: noteBody }).select('id,body').single()
  assert.equal(note.error, null)
  noteId = note.data.id
  await checkNoRows(users[1].client.from('private_notes').select('id,body').eq('id', noteId), 'Partner private-note read')
  const update = await users[1].client.from('private_notes').update({ body: 'unauthorized' }).eq('id', noteId).select('id')
  assert.ok(update.error || update.data?.length === 0, 'Partner private-note update unexpectedly succeeded.')
  const unchanged = await users[0].client.from('private_notes').select('body').eq('id', noteId).single()
  assert.equal(unchanged.data.body, noteBody)
  await checkNoRows(anon.from('private_notes').select('id').eq('id', noteId), 'Anonymous private-note read')
  await checkNoRows(anon.from('couples').select('id').eq('id', coupleId), 'Anonymous shared-space read')
  assert.ok((await anon.rpc('create_couple')).error, 'Anonymous SECURITY DEFINER call unexpectedly succeeded.')
  assert.ok((await anon.rpc('accept_couple_invite', { p_token: invite.data })).error, 'Anonymous invite acceptance unexpectedly succeeded.')
  assert.ok((await anon.rpc('start_or_resume_date_session', { p_couple_id: coupleId })).error, 'Anonymous planning session start unexpectedly succeeded.')
  assert.ok((await anon.rpc('save_date_response', { p_session_id: sessionId, p_answers: {}, p_submit: true })).error, 'Anonymous response submission unexpectedly succeeded.')
  assert.ok((await users[2].client.rpc('start_or_resume_date_session', { p_couple_id: coupleId })).error, 'A nonmember started a planning session.')
  console.log('PASS RLS: favorites are individual; private notes are isolated; anon and nonmembers see no shared data.')
  console.log('PASS SECURITY DEFINER: anon cannot execute app RPCs; authenticated membership guards held.')
  completed = true
} finally {
  for (const { index, dateId } of favoriteIds) {
    const result = await users[index].client.from('favorites').delete().eq('date_id', dateId)
    assert.equal(result.error, null, 'Could not remove a temporary favorite.')
  }
  if (noteId) assert.equal((await admin.from('private_notes').delete().eq('id', noteId)).error, null)
  if (coupleId) assert.equal((await admin.from('couples').delete().eq('id', coupleId)).error, null)
  for (const { id } of users.reverse()) assert.equal((await admin.auth.admin.deleteUser(id)).error, null)
}

if (completed) console.log('CLEANUP PASS: temporary couple, invite, notes, favorites, and 3 Auth users removed from staging.')
