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
const publishableKey = env.VITE_SUPABASE_PUBLISHABLE_KEY
const secretKey = process.env.SUPABASE_STAGING_SECRET_KEY
assert.equal(new URL(url).hostname, 'uyhavkmjvfaeoapzoobh.supabase.co', 'Refusing any project except staging.')
assert.ok(publishableKey?.startsWith('sb_publishable_'), 'Staging publishable key is required.')
assert.ok(secretKey?.startsWith('sb_secret_'), 'Staging secret key is required in memory.')

const options = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } }
const admin = createClient(url, secretKey, options)
const users = []
const clients = new Map()
let coupleId
let failures = 0
const passed = []
const check = (name, condition) => { assert.ok(condition, name); passed.push(name) }
const result = async (promise) => {
  const { data, error } = await promise
  if (error) throw error
  return data
}

try {
  for (let index = 0; index < 3; index++) {
    const email = `qa-experience-${randomUUID()}@example.invalid`
    const password = `${randomBytes(36).toString('base64url')}Q7!`
    const created = await admin.auth.admin.createUser({ email, password, email_confirm: true })
    assert.equal(created.error, null, 'Staging test account creation failed.')
    users.push({ id: created.data.user.id, email })
    const client = createClient(url, publishableKey, options)
    const login = await client.auth.signInWithPassword({ email, password })
    assert.equal(login.error, null, 'Staging test account login failed.')
    clients.set(created.data.user.id, client)
  }
  const [a, b, outsider] = users
  const A = clients.get(a.id)
  const B = clients.get(b.id)
  const X = clients.get(outsider.id)
  check('three temporary accounts authenticated against staging', clients.size === 3)

  coupleId = await result(A.rpc('create_couple'))
  const invite = await result(A.rpc('create_couple_invite'))
  await result(B.rpc('accept_couple_invite', { p_token: invite }))
  const members = await result(B.from('couple_members').select('user_id').eq('couple_id', coupleId))
  check('single-use invitation linked exactly two participants', members.length === 2 && new Set(members.map(({ user_id }) => user_id)).size === 2)
  const reused = await X.rpc('accept_couple_invite', { p_token: invite })
  check('outsider cannot reuse consumed invitation', !!reused.error)

  const sessionId = await result(A.rpc('start_or_resume_date_session', { p_couple_id: coupleId }))
  const draft = { activity: 'algo-tranquilo', mood: 'conectar', time: '1-2-horas', setting: 'indistinto', discover: 'nuevo', avoid: [] }
  await result(A.rpc('save_date_response', { p_session_id: sessionId, p_answers: draft, p_submit: false }))
  const ownDraft = await result(A.from('date_responses').select('answers').eq('session_id', sessionId).eq('user_id', a.id))
  const hiddenDraft = await result(B.from('date_responses').select('answers').eq('session_id', sessionId).eq('user_id', a.id))
  check('draft persists for its owner and stays private from partner', ownDraft.length === 1 && ownDraft[0].answers.activity === draft.activity && hiddenDraft.length === 0)
  await result(A.rpc('save_date_response', { p_session_id: sessionId, p_answers: draft, p_submit: true }))
  await result(B.rpc('save_date_response', { p_session_id: sessionId, p_answers: { ...draft, activity: 'conversación' }, p_submit: true }))
  await result(A.rpc('generate_date_recommendations', { p_session_id: sessionId }))
  const recA = await result(A.from('date_recommendations').select('id,date_id,position').eq('session_id', sessionId).order('position'))
  const recB = await result(B.from('date_recommendations').select('id,date_id,position').eq('session_id', sessionId).order('position'))
  check('both participants receive the same three deterministic recommendations', recA.length === 3 && JSON.stringify(recA) === JSON.stringify(recB))

  const selected = recA[0]
  await result(A.rpc('vote_date_recommendation', { p_session_id: sessionId, p_recommendation_id: selected.id }))
  await result(B.rpc('vote_date_recommendation', { p_session_id: sessionId, p_recommendation_id: selected.id }))
  const acceptedA = await result(A.rpc('confirm_date_recommendation', { p_session_id: sessionId }))
  const acceptedB = await result(B.rpc('confirm_date_recommendation', { p_session_id: sessionId }))
  check('experience becomes confirmed only after both accept the same proposal', acceptedA === false && acceptedB === true)
  await result(A.rpc('start_date_experience', { p_session_id: sessionId }))
  const initial = await result(A.from('date_experience_progress').select('*').eq('session_id', sessionId).single())
  const partnerProgress = await result(B.from('date_experience_progress').select('*').eq('session_id', sessionId).single())
  check('confirmed experience is available and shared to both members', initial.session_id === partnerProgress.session_id && initial.turn_user_id === partnerProgress.turn_user_id)

  await result(A.rpc('update_date_experience_step', { p_session_id: sessionId, p_step: 0, p_action: 'skip' }))
  await result(A.rpc('set_date_experience_question', { p_session_id: sessionId, p_level: 'divertidas', p_index: 1 }))
  const turnClient = initial.turn_user_id === a.id ? A : B
  const waitingClient = initial.turn_user_id === a.id ? B : A
  const deniedTurn = await waitingClient.rpc('advance_date_experience_turn', { p_session_id: sessionId })
  check('participant out of turn is rejected', !!deniedTurn.error)
  await result(turnClient.rpc('advance_date_experience_turn', { p_session_id: sessionId }))
  const nextTurn = await result(B.from('date_experience_progress').select('turn_user_id').eq('session_id', sessionId).single())
  check('turn advances to the other participant', nextTurn.turn_user_id === (initial.turn_user_id === a.id ? b.id : a.id))
  await result(waitingClient.rpc('advance_date_experience_turn', { p_session_id: sessionId }))
  const updatedProgress = await result(B.from('date_experience_progress').select('*').eq('session_id', sessionId).single())
  check('activity skip and question selection synchronize without storing answers', updatedProgress.skipped_steps.includes(0) && updatedProgress.question_level === 'divertidas' && updatedProgress.question_index === 1)

  await result(A.from('date_prompt_favorites').insert({ session_id: sessionId, user_id: a.id, prompt_key: 'bank:divertidas:divertidas-01' }))
  const favoriteA = await result(A.from('date_prompt_favorites').select('prompt_key').eq('session_id', sessionId))
  const favoriteHidden = await result(B.from('date_prompt_favorites').select('prompt_key').eq('session_id', sessionId).eq('user_id', a.id))
  check('question favorites are visible only to their owner', favoriteA.length === 1 && favoriteHidden.length === 0)

  const note = await result(A.from('private_notes').insert({ couple_id: coupleId, user_id: a.id, title: 'QA privada', body: 'Contenido temporal de prueba.' }).select('id').single())
  const noteHidden = await result(B.from('private_notes').select('id').eq('id', note.id))
  const outsiderSessions = await result(X.from('date_sessions').select('id').eq('id', sessionId))
  const outsiderProgress = await result(X.from('date_experience_progress').select('session_id').eq('session_id', sessionId))
  check('private note and shared experience are inaccessible to partner and outsider', noteHidden.length === 0 && outsiderSessions.length === 0 && outsiderProgress.length === 0)

  const finishA = await result(A.rpc('finish_date_experience', { p_session_id: sessionId }))
  const finishB = await result(B.rpc('finish_date_experience', { p_session_id: sessionId }))
  const completed = await result(B.from('date_sessions').select('status').eq('id', sessionId).single())
  check('experience completes only after both participants confirm', finishA === false && finishB === true && completed.status === 'completed')
} catch (error) {
  failures++
  process.stderr.write(`Staging experience test failed: ${error.message}\n`)
} finally {
  for (const client of clients.values()) await client.auth.signOut({ scope: 'local' })
  if (coupleId) {
    const { error } = await admin.from('couples').delete().eq('id', coupleId)
    if (error) { failures++; process.stderr.write('Temporary shared-space cleanup failed.\n') }
  }
  for (const user of users) {
    const { error } = await admin.auth.admin.deleteUser(user.id)
    if (error) { failures++; process.stderr.write('Temporary account cleanup failed.\n') }
  }
}

if (failures) process.exitCode = 1
else process.stdout.write(JSON.stringify({ passed: passed.length, checks: passed, temporaryUsersDeleted: users.length, sharedSpaceDeleted: !!coupleId }) + '\n')
