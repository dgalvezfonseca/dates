import assert from 'node:assert/strict'
import { randomBytes, randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { createClient } from '@supabase/supabase-js'

const env = Object.fromEntries((await readFile(new URL('../.env.staging.local', import.meta.url), 'utf8')).split(/\r?\n/).flatMap((line) => {
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
const anonymous = createClient(url, publishableKey, options)
const users = []
const clients = new Map()
const objects = []
const passed = []
let coupleId
let failures = 0
const check = (name, ok) => { assert.ok(ok, name); passed.push(name) }
const result = async (promise) => { const { data, error } = await promise; if (error) throw error; return data }
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jXioAAAAASUVORK5CYII=', 'base64')

async function completeDate(A, B, couple, userA, userB) {
  const sessionId = await result(A.rpc('start_or_resume_date_session', { p_couple_id: couple }))
  const answers = { activity: 'creatividad', mood: 'conectar', time: '1-2-horas', setting: 'indistinto', discover: 'nuevo', avoid: [] }
  await result(A.rpc('save_date_response', { p_session_id: sessionId, p_answers: answers, p_submit: true }))
  await result(B.rpc('save_date_response', { p_session_id: sessionId, p_answers: answers, p_submit: true }))
  await result(A.rpc('generate_date_recommendations', { p_session_id: sessionId }))
  const recommendations = await result(A.from('date_recommendations').select('id,date_id').eq('session_id', sessionId).order('position'))
  assert.equal(recommendations.length, 3)
  await result(A.rpc('vote_date_recommendation', { p_session_id: sessionId, p_recommendation_id: recommendations[0].id }))
  await result(B.rpc('vote_date_recommendation', { p_session_id: sessionId, p_recommendation_id: recommendations[0].id }))
  await result(A.rpc('confirm_date_recommendation', { p_session_id: sessionId }))
  await result(B.rpc('confirm_date_recommendation', { p_session_id: sessionId }))
  await result(A.rpc('start_date_experience', { p_session_id: sessionId }))
  await result(A.rpc('finish_date_experience', { p_session_id: sessionId }))
  await result(B.rpc('finish_date_experience', { p_session_id: sessionId }))
  const session = await result(A.from('date_sessions').select('id,selected_date_id,status').eq('id', sessionId).single())
  check('date reached completed only after two confirmations', session.status === 'completed' && Boolean(session.selected_date_id) && userA !== userB)
  return session
}

try {
  for (let index = 0; index < 3; index++) {
    const email = `qa-memory-${randomUUID()}@example.invalid`
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
  const C = clients.get(outsider.id)
  check('three independent temporary staging accounts signed in', clients.size === 3)
  coupleId = await result(A.rpc('create_couple'))
  const invite = await result(A.rpc('create_couple_invite'))
  await result(B.rpc('accept_couple_invite', { p_token: invite }))
  const members = await result(B.from('couple_members').select('user_id').eq('couple_id', coupleId))
  check('one-use invite bound exactly the two expected participants', members.length === 2)
  check('third account cannot consume or reuse invite', Boolean((await C.rpc('accept_couple_invite', { p_token: invite })).error))

  const completed = await completeDate(A, B, coupleId, a.id, b.id)
  const memoryId = await result(A.rpc('create_date_memory', { p_session_id: completed.id, p_title: 'Recuerdo temporal QA', p_happened_on: new Date().toISOString().slice(0, 10) }))
  const idempotentId = await result(B.rpc('create_date_memory', { p_session_id: completed.id, p_title: 'Otro título', p_happened_on: new Date().toISOString().slice(0, 10) }))
  check('memory is created only for completed bilateral experience and RPC is idempotent', memoryId === idempotentId)
  const [memoryA, memoryB, memoryC] = await Promise.all([
    result(A.from('date_memories').select('id').eq('id', memoryId)),
    result(B.from('date_memories').select('id').eq('id', memoryId)),
    result(C.from('date_memories').select('id').eq('id', memoryId)),
  ])
  check('both members read shared memory while outsider sees none', memoryA.length === 1 && memoryB.length === 1 && memoryC.length === 0)
  const firstContribution = await result(A.from('date_memory_contributions').insert({ memory_id: memoryId, user_id: a.id, title: 'Aportación A', description: 'Texto temporal A' }).select('id').single())
  const secondContribution = await result(B.from('date_memory_contributions').insert({ memory_id: memoryId, user_id: b.id, title: 'Aportación B', description: 'Texto temporal B' }).select('id').single())
  const contributionsA = await result(A.from('date_memory_contributions').select('id,title,user_id').eq('memory_id', memoryId))
  const contributionsB = await result(B.from('date_memory_contributions').select('id,title,user_id').eq('memory_id', memoryId))
  const outsiderContributions = await result(C.from('date_memory_contributions').select('id').eq('memory_id', memoryId))
  check('both append-only contributions synchronize to both members without overwrite', contributionsA.length === 2 && contributionsB.length === 2 && contributionsA.some((item) => item.id === firstContribution.id) && contributionsA.some((item) => item.id === secondContribution.id))
  check('outsider cannot read contributions or shared memory', outsiderContributions.length === 0)
  await result(A.from('date_memory_contributions').update({ title: 'Aportación editada A' }).eq('id', secondContribution.id))
  check('participant cannot overwrite the other author contribution', (await result(B.from('date_memory_contributions').select('title').eq('id', secondContribution.id).single())).title === 'Aportación B')
  check('outsider cannot append a contribution', Boolean((await C.from('date_memory_contributions').insert({ memory_id: memoryId, user_id: outsider.id, title: 'No autorizado' })).error))

  const note = await result(A.from('private_notes').insert({ couple_id: coupleId, user_id: a.id, session_id: completed.id, title: 'Nota solo mía QA', body: 'Contenido privado temporal.' }).select('id').single())
  check('private note remains invisible to partner and outsider', (await result(B.from('private_notes').select('id').eq('id', note.id))).length === 0 && (await result(C.from('private_notes').select('id').eq('id', note.id))).length === 0)
  await result(B.from('private_notes').delete().eq('id', note.id))
  check('partner cannot delete the private note', (await result(A.from('private_notes').select('id').eq('id', note.id))).length === 1)
  const sharedCopyId = await result(A.rpc('share_private_note_to_memory', { p_note_id: note.id, p_memory_id: memoryId }))
  const copy = await result(B.from('date_memory_contributions').select('is_shared_note_copy,title,description').eq('id', sharedCopyId).single())
  check('explicit sharing creates a shared copy and preserves private original', copy.is_shared_note_copy && copy.title === 'Nota solo mía QA' && copy.description === 'Contenido privado temporal.' && (await result(A.from('private_notes').select('id').eq('id', note.id))).length === 1)
  check('partner cannot share a note owned by another participant', Boolean((await B.rpc('share_private_note_to_memory', { p_note_id: note.id, p_memory_id: memoryId })).error))
  await result(A.from('private_notes').update({ body: 'Nota actualizada en privado.' }).eq('id', note.id))
  check('owner can update own private note', (await result(A.from('private_notes').select('body').eq('id', note.id).single())).body === 'Nota actualizada en privado.')

  for (const [client, user, label] of [[A, a, 'A'], [B, b, 'B']]) {
    const path = `${memoryId}/${user.id}/${randomUUID()}.png`
    const uploaded = await client.storage.from('memory-album-private').upload(path, png, { contentType: 'image/png', upsert: false })
    assert.equal(uploaded.error, null, `Synthetic photo ${label} upload failed.`)
    objects.push(path)
    await result(client.rpc('register_memory_photo', { p_memory_id: memoryId, p_object_path: path, p_mime_type: 'image/png', p_byte_size: png.length }))
  }
  const photosA = await result(A.from('memory_photos').select('id,uploaded_by,object_path').eq('memory_id', memoryId))
  const photosB = await result(B.from('memory_photos').select('id').eq('memory_id', memoryId))
  const photosC = await result(C.from('memory_photos').select('id').eq('memory_id', memoryId))
  check('private bucket metadata is visible to both members and hidden from outsider', photosA.length === 2 && photosB.length === 2 && photosC.length === 0)
  const pathA = photosA.find((photo) => photo.uploaded_by === a.id).object_path
  const pathB = photosA.find((photo) => photo.uploaded_by === b.id).object_path
  check('member B can download private image with authenticated access', Boolean((await B.storage.from('memory-album-private').download(pathA)).data))
  check('outsider and anonymous session cannot download private image', Boolean((await C.storage.from('memory-album-private').download(pathA)).error) && Boolean((await anonymous.storage.from('memory-album-private').download(pathA)).error))
  const oversized = await A.storage.from('memory-album-private').upload(`${memoryId}/${a.id}/${randomUUID()}.png`, Buffer.alloc(3 * 1024 * 1024 + 1), { contentType: 'image/png', upsert: false })
  const disallowedMime = await A.storage.from('memory-album-private').upload(`${memoryId}/${a.id}/${randomUUID()}.png`, png, { contentType: 'application/pdf', upsert: false })
  check('private bucket rejects oversized and disallowed MIME uploads', Boolean(oversized.error) && Boolean(disallowedMime.error))
  await A.storage.from('memory-album-private').remove([pathB])
  check('uploader B photo cannot be removed by A', Boolean((await B.storage.from('memory-album-private').download(pathB)).data) && Boolean((await A.rpc('delete_memory_photo', { p_photo_id: photosA.find((photo) => photo.uploaded_by === b.id).id })).error))
  const orphanPath = `${memoryId}/${a.id}/${randomUUID()}.png`
  assert.equal((await A.storage.from('memory-album-private').upload(orphanPath, png, { contentType: 'image/png', upsert: false })).error, null)
  objects.push(orphanPath)
  const orphanCleanup = await A.storage.from('memory-album-private').remove([orphanPath])
  check('author can clean up own uploaded file if metadata registration failed', orphanCleanup.error === null)
  objects.splice(objects.indexOf(orphanPath), 1)
  for (let index = 0; index < 4; index++) {
    const path = `${memoryId}/${a.id}/${randomUUID()}.png`
    const filled = await A.storage.from('memory-album-private').upload(path, png, { contentType: 'image/png', upsert: false })
    if (filled.error) throw new Error(`Filling photo quota failed at image ${index + 3} of 6 (${filled.error.statusCode}).`)
    objects.push(path)
    await result(A.rpc('register_memory_photo', { p_memory_id: memoryId, p_object_path: path, p_mime_type: 'image/png', p_byte_size: png.length }))
  }
  const cappedPath = `${memoryId}/${a.id}/${randomUUID()}.png`
  check('seventh image is rejected by Storage quota policy', Boolean((await A.storage.from('memory-album-private').upload(cappedPath, png, { contentType: 'image/png', upsert: false })).error))
  const ownedPhoto = photosA.find((photo) => photo.uploaded_by === a.id)
  const removed = await A.storage.from('memory-album-private').remove([ownedPhoto.object_path])
  assert.equal(removed.error, null)
  await result(A.rpc('delete_memory_photo', { p_photo_id: ownedPhoto.id }))
  objects.splice(objects.indexOf(ownedPhoto.object_path), 1)
  check('owner can delete own object and matching metadata', (await result(A.from('memory_photos').select('id').eq('id', ownedPhoto.id))).length === 0)
  const noteDelete = await A.from('private_notes').delete().eq('id', note.id)
  assert.equal(noteDelete.error, null)
  check('owner can delete own private note after sharing a copy', (await result(A.from('private_notes').select('id').eq('id', note.id))).length === 0)

  const anonymousRead = await anonymous.from('date_memories').select('id').eq('id', memoryId)
  check('anonymous database access is denied by grants/RLS', Boolean(anonymousRead.error) || (anonymousRead.data?.length ?? 0) === 0)
  check('anonymous callers cannot execute SECURITY DEFINER memory RPC', Boolean((await anonymous.rpc('create_date_memory', { p_session_id: completed.id, p_title: 'No auth', p_happened_on: new Date().toISOString().slice(0, 10) })).error))
  check('nonmember cannot use SECURITY DEFINER memory creation RPC', Boolean((await C.rpc('create_date_memory', { p_session_id: completed.id, p_title: 'No membership', p_happened_on: new Date().toISOString().slice(0, 10) })).error))
  const repeatedSession = await result(admin.from('date_sessions').insert({ couple_id: coupleId, status: 'completed', selected_date_id: completed.selected_date_id, created_by: a.id }).select('id').single())
  await result(admin.from('date_experience_confirmations').insert([{ session_id: repeatedSession.id, user_id: a.id }, { session_id: repeatedSession.id, user_id: b.id }]))
  const repeatedMemory = await result(A.rpc('create_date_memory', { p_session_id: repeatedSession.id, p_title: 'Repetición de QA', p_happened_on: new Date().toISOString().slice(0, 10) }))
  const repeatRows = await result(A.from('date_memories').select('id,session_id').eq('couple_id', coupleId))
  const repeatDates = await result(A.from('date_sessions').select('selected_date_id').eq('couple_id', coupleId).eq('status', 'completed'))
  check('repeating one experience creates a separate memory while counting its catalog ID once', repeatedMemory !== memoryId && repeatRows.length === 2 && repeatDates.length === 2 && new Set(repeatDates.map((row) => row.selected_date_id)).size === 1)

  process.stdout.write(JSON.stringify({ passed: passed.length, checks: passed, photosTested: 2 }) + '\n')
} catch (error) {
  failures++
  process.stderr.write(`Staging memories test failed: ${error.message}\n`)
} finally {
  for (const client of clients.values()) await client.auth.signOut({ scope: 'local' })
  for (const path of objects) await admin.storage.from('memory-album-private').remove([path])
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
else process.stdout.write(JSON.stringify({ cleanup: { temporaryUsersDeleted: users.length, sharedSpaceDeleted: Boolean(coupleId), trackedObjectsRemoved: objects.length } }) + '\n')
