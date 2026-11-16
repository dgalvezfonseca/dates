// Browser E2E fixture for staging only: creates three confirmed, UNLINKED temporary accounts
// (A, B, outsider C) so the pairing UI can be exercised from scratch. Credentials are served only
// to the local app origins with a per-run nonce and are never printed. Everything is removed on
// POST /cleanup, SIGINT/SIGTERM, or failure.
import assert from 'node:assert/strict'
import { randomBytes, randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { createClient } from '@supabase/supabase-js'

const stagingRef = 'uyhavkmjvfaeoapzoobh'
const appOrigins = new Set(['http://127.0.0.1:5182', 'http://127.0.0.1:5183', 'http://127.0.0.1:5184'])
const env = Object.fromEntries((await readFile(new URL('../.env.staging.local', import.meta.url), 'utf8')).split(/\r?\n/).flatMap((line) => {
  const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/)
  return match ? [[match[1], match[2].replace(/^(['"])(.*)\1$/, '$2')]] : []
}))
const url = env.VITE_SUPABASE_URL
assert.equal(new URL(url).hostname, `${stagingRef}.supabase.co`, 'Refusing any project except staging.')
assert.ok(env.VITE_SUPABASE_PUBLISHABLE_KEY?.startsWith('sb_publishable_'), 'Staging publishable key is required.')
assert.ok(process.env.SUPABASE_STAGING_SECRET_KEY?.startsWith('sb_secret_'), 'Staging secret key is required in memory.')

const options = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } }
const admin = createClient(url, process.env.SUPABASE_STAGING_SECRET_KEY, options)
const nonce = randomBytes(24).toString('base64url')
const users = []
let cleaned = false

async function cleanup() {
  if (cleaned) return
  cleaned = true
  const ids = users.map(({ id }) => id)
  if (ids.length) {
    const { data } = await admin.from('couple_members').select('couple_id').in('user_id', ids)
    const coupleIds = [...new Set((data ?? []).map(({ couple_id }) => couple_id))]
    if (coupleIds.length) await admin.from('couples').delete().in('id', coupleIds)
  }
  let removed = 0
  for (const id of ids) if (!(await admin.auth.admin.deleteUser(id)).error) removed++
  process.stdout.write(`FIXTURE_CLEANUP ${JSON.stringify({ usersRemoved: removed, expected: ids.length })}\n`)
}

try {
  for (const label of ['A', 'B', 'C']) {
    const email = `qa-ui-${label.toLowerCase()}-${randomUUID()}@example.invalid`
    const password = `${randomBytes(30).toString('base64url')}Q7!`
    const generated = await admin.auth.admin.generateLink({ type: 'signup', email, password })
    assert.equal(generated.error, null, `Could not create temporary account ${label}.`)
    users.push({ label, id: generated.data.user.id, email, password })
    const client = createClient(url, env.VITE_SUPABASE_PUBLISHABLE_KEY, options)
    const confirmed = await client.auth.verifyOtp({ type: 'signup', token_hash: generated.data.properties.hashed_token })
    assert.equal(confirmed.error, null, `Could not confirm temporary account ${label}.`)
    await client.auth.signOut({ scope: 'local' })
  }

  const server = createServer(async (request, response) => {
    const origin = request.headers.origin ?? ''
    if (appOrigins.has(origin)) {
      response.setHeader('Access-Control-Allow-Origin', origin)
      response.setHeader('Access-Control-Allow-Headers', 'x-qa-nonce')
      response.setHeader('Vary', 'Origin')
    }
    if (request.method === 'OPTIONS') { response.writeHead(204).end(); return }
    if (!appOrigins.has(origin) || request.headers['x-qa-nonce'] !== nonce) { response.writeHead(403).end(); return }
    const path = new URL(request.url ?? '/', 'http://127.0.0.1').pathname
    const match = path.match(/^\/creds\/([ABC])$/)
    if (request.method === 'GET' && match) {
      const user = users.find(({ label }) => label === match[1])
      response.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' })
      response.end(JSON.stringify({ email: user.email, password: user.password }))
      return
    }
    if (request.method === 'POST' && path === '/cleanup') {
      await cleanup()
      response.writeHead(200, { 'Content-Type': 'application/json' }).end('{"cleaned":true}')
      server.close()
      return
    }
    response.writeHead(404).end()
  })
  server.listen(0, '127.0.0.1')
  await new Promise((resolve) => server.once('listening', resolve))
  process.stdout.write(`FIXTURE_READY ${JSON.stringify({ port: server.address().port, nonce, users: users.map(({ label, email }) => ({ label, email })) })}\n`)
  const shutdown = async () => { await cleanup(); server.close() }
  process.once('SIGINT', () => { void shutdown() })
  process.once('SIGTERM', () => { void shutdown() })
  // Safety net: never leave temporary accounts behind for more than 3 hours.
  setTimeout(() => { void shutdown() }, 3 * 60 * 60 * 1000).unref()
  await new Promise((resolve) => server.once('close', resolve))
} catch (error) {
  process.stderr.write(`Staging UI fixture failed: ${error.message}\n`)
  await cleanup()
  process.exitCode = 1
}
