import assert from 'node:assert/strict'
import { randomBytes, randomUUID } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'

const stagingRef = 'uyhavkmjvfaeoapzoobh'
const appOrigin = 'http://127.0.0.1:5182'
const outputDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'output', 'playwright')
const env = Object.fromEntries((await readFile(new URL('../.env.staging.local', import.meta.url), 'utf8')).split(/\r?\n/).flatMap((line) => {
  const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/)
  return match ? [[match[1], match[2].replace(/^(['"])(.*)\1$/, '$2')]] : []
}))
const url = env.VITE_SUPABASE_URL
const publishableKey = env.VITE_SUPABASE_PUBLISHABLE_KEY
const secretKey = process.env.SUPABASE_STAGING_SECRET_KEY
assert.equal(new URL(url).hostname, `${stagingRef}.supabase.co`, 'Refusing any project except staging.')
assert.ok(publishableKey?.startsWith('sb_publishable_'), 'Staging publishable key is required.')
assert.ok(secretKey?.startsWith('sb_secret_'), 'Staging secret key is required in memory.')

const options = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } }
const admin = createClient(url, secretKey, options)
const fixtureId = randomUUID()
const nonce = randomBytes(24).toString('base64url')
const users = []
const clients = new Map()
const sessions = new Map()
const passed = []
let coupleId
let expectedProgress = 0
let server
let cleanupStarted = false
let cleanupErrors = 0

const result = async (promise) => { const { data, error } = await promise; if (error) throw error; return data }
const check = (label, condition) => { assert.ok(condition, label); passed.push(label) }

async function completeDate(A, B) {
  const id = await result(A.rpc('start_or_resume_date_session', { p_couple_id: coupleId }))
  const answers = { activity: 'creatividad', mood: 'conectar', time: '1-2-horas', setting: 'indistinto', discover: 'nuevo', avoid: [] }
  await result(A.rpc('save_date_response', { p_session_id: id, p_answers: answers, p_submit: true }))
  await result(B.rpc('save_date_response', { p_session_id: id, p_answers: answers, p_submit: true }))
  await result(A.rpc('generate_date_recommendations', { p_session_id: id }))
  const recommendations = await result(A.from('date_recommendations').select('id').eq('session_id', id).order('position'))
  assert.equal(recommendations.length, 3)
  await result(A.rpc('vote_date_recommendation', { p_session_id: id, p_recommendation_id: recommendations[0].id }))
  await result(B.rpc('vote_date_recommendation', { p_session_id: id, p_recommendation_id: recommendations[0].id }))
  await result(A.rpc('confirm_date_recommendation', { p_session_id: id }))
  await result(B.rpc('confirm_date_recommendation', { p_session_id: id }))
  await result(A.rpc('start_date_experience', { p_session_id: id }))
  await result(A.rpc('finish_date_experience', { p_session_id: id }))
  await result(B.rpc('finish_date_experience', { p_session_id: id }))
  const row = await result(A.from('date_sessions').select('id,selected_date_id,status').eq('id', id).single())
  check('staging fixture completed through bilateral app RPCs', row.status === 'completed' && Boolean(row.selected_date_id))
  return row
}

async function seed() {
  for (let index = 0; index < 3; index++) {
    const email = `qa-memory-ui-${fixtureId}-${index}@example.invalid`
    const password = `${randomBytes(36).toString('base64url')}Q7!`
    const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true })
    assert.equal(error, null, 'Could not create a temporary staging user.')
    users.push({ id: data.user.id })
    const client = createClient(url, publishableKey, options)
    const signed = await client.auth.signInWithPassword({ email, password })
    assert.equal(signed.error, null, 'Could not authenticate a temporary staging user.')
    sessions.set(index, signed.data.session)
    clients.set(data.user.id, client)
  }
  const [a, b, outsider] = users
  const A = clients.get(a.id)
  const B = clients.get(b.id)
  const C = clients.get(outsider.id)
  coupleId = await result(A.rpc('create_couple'))
  const invitation = await result(A.rpc('create_couple_invite'))
  await result(B.rpc('accept_couple_invite', { p_token: invitation }))
  const members = await result(B.from('couple_members').select('user_id').eq('couple_id', coupleId))
  check('fixture links exactly two members and leaves outsider unpaired', members.length === 2)
  const firstSession = await completeDate(A, B)
  const catalog = await result(A.from('date_catalog').select('id,title').eq('id', firstSession.selected_date_id).single())
  const firstMemory = await result(A.rpc('create_date_memory', { p_session_id: firstSession.id, p_title: `Recuerdo inicial ${fixtureId.slice(0, 6)}`, p_happened_on: new Date().toISOString().slice(0, 10) }))
  await result(A.from('date_memory_contributions').insert({ memory_id: firstMemory, user_id: a.id, title: 'Aportación inicial de A', description: 'Contenido compartido de QA.' }))
  const privateNote = await result(A.from('private_notes').insert({ couple_id: coupleId, user_id: a.id, title: 'Nota privada de QA', body: 'Este texto solo debe aparecer en la cuenta A.' }).select('id').single())
  const noteIsolation = await result(B.from('private_notes').select('id').eq('id', privateNote.id))
  check('fixture private note is already isolated by RLS', noteIsolation.length === 0)
  const secondSession = await completeDate(A, B)
  expectedProgress = new Set([firstSession.selected_date_id, secondSession.selected_date_id].filter(Boolean)).size
  check('fixture has completed dates for unique-ID progress', expectedProgress > 0)
  return { catalogTitle: catalog.title, privateNoteId: privateNote.id, firstMemoryId: firstMemory }
}

async function removeMemoryObjects(memoryId) {
  const folders = await admin.storage.from('memory-album-private').list(memoryId, { limit: 100 })
  if (folders.error) throw folders.error
  for (const folder of folders.data ?? []) {
    if (folder.id !== null) continue
    const entries = await admin.storage.from('memory-album-private').list(`${memoryId}/${folder.name}`, { limit: 100 })
    if (entries.error) throw entries.error
    const paths = (entries.data ?? []).filter((entry) => entry.id !== null).map((entry) => `${memoryId}/${folder.name}/${entry.name}`)
    if (paths.length) {
      const removed = await admin.storage.from('memory-album-private').remove(paths)
      if (removed.error) throw removed.error
    }
  }
}

async function cleanup() {
  if (cleanupStarted) return
  cleanupStarted = true
  for (const client of clients.values()) await client.auth.signOut({ scope: 'local' }).catch(() => {})
  if (coupleId) {
    const memories = await admin.from('date_memories').select('id').eq('couple_id', coupleId)
    if (memories.error) cleanupErrors++
    for (const memory of memories.data ?? []) await removeMemoryObjects(memory.id).catch(() => { cleanupErrors++ })
    const removed = await admin.from('couples').delete().eq('id', coupleId)
    if (removed.error) cleanupErrors++
  }
  for (const user of users) {
    const deleted = await admin.auth.admin.deleteUser(user.id)
    if (deleted.error) cleanupErrors++
  }
  process.stdout.write(JSON.stringify({ fixtureCleanup: { users: users.length, spaces: coupleId ? 1 : 0, photos: 'all fixture memories', cleanupErrors, checks: passed.length } }) + '\n')
  if (cleanupErrors) process.exitCode = 1
}

function setCors(response, origin) {
  response.setHeader('Access-Control-Allow-Origin', origin === appOrigin ? appOrigin : 'null')
  response.setHeader('Vary', 'Origin')
  response.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  response.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-QA-Nonce, X-QA-Name')
}

try {
  const fixture = await seed()
  await mkdir(outputDir, { recursive: true })
  server = createServer(async (request, response) => {
    const origin = request.headers.origin ?? ''
    setCors(response, origin)
    if (request.method === 'OPTIONS') { response.writeHead(204).end(); return }
    const requestUrl = new URL(request.url ?? '/', 'http://127.0.0.1')
    if (origin !== appOrigin || requestUrl.searchParams.get('nonce') !== nonce && request.headers['x-qa-nonce'] !== nonce) {
      response.writeHead(403).end(); return
    }
    if (request.method === 'GET' && requestUrl.pathname.startsWith('/session/')) {
      const key = requestUrl.pathname.split('/').at(-1)
      const slot = key === 'A' ? 0 : key === 'B' ? 1 : key === 'C' ? 2 : -1
      const session = sessions.get(slot)
      if (!session) { response.writeHead(404).end(); return }
      response.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' })
      response.end(JSON.stringify(session))
      return
    }
    if (request.method === 'GET' && requestUrl.pathname === '/info') {
      response.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' })
      response.end(JSON.stringify({ expectedProgress, catalogTitle: fixture.catalogTitle, firstMemoryId: fixture.firstMemoryId, privateNoteId: fixture.privateNoteId }))
      return
    }
    if (request.method === 'POST' && requestUrl.pathname === '/screenshot') {
      const name = String(request.headers['x-qa-name'] ?? '')
      if (!/^[a-z0-9-]{1,80}\.png$/.test(name)) { response.writeHead(400).end(); return }
      const chunks = []
      for await (const chunk of request) chunks.push(chunk)
      await writeFile(join(outputDir, name), Buffer.concat(chunks))
      response.writeHead(201, { 'Content-Type': 'application/json' }).end('{"saved":true}')
      return
    }
    if (request.method === 'POST' && requestUrl.pathname === '/cleanup') {
      await cleanup()
      response.writeHead(200, { 'Content-Type': 'application/json' }).end('{"cleaned":true}')
      server.close()
      return
    }
    response.writeHead(404).end()
  })
  server.listen(0, '127.0.0.1')
  await new Promise((resolve) => server.once('listening', resolve))
  const port = server.address().port
  process.stdout.write(`FIXTURE_READY ${JSON.stringify({ port, nonce, expectedProgress })}\n`)
  const shutdown = async () => { await cleanup(); server.close() }
  process.once('SIGINT', () => { void shutdown() })
  process.once('SIGTERM', () => { void shutdown() })
  await new Promise((resolve) => server.once('close', resolve))
  await cleanup()
} catch (error) {
  process.stderr.write(`Staging browser fixture failed: ${error.message}\n`)
  await cleanup()
  process.exitCode = 1
}
