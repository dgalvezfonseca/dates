import { randomBytes, randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import assert from 'node:assert/strict'
import { createClient } from '@supabase/supabase-js'

const action = process.argv[2]
const env = Object.fromEntries((await readFile(new URL('../.env.staging.local', import.meta.url), 'utf8'))
  .split(/\r?\n/).flatMap((line) => {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/)
    return match ? [[match[1], match[2].replace(/^(['"])(.*)\1$/, '$2')]] : []
  }))
const url = env.VITE_SUPABASE_URL
const secret = process.env.SUPABASE_STAGING_SECRET_KEY
assert.equal(new URL(url).hostname, 'uyhavkmjvfaeoapzoobh.supabase.co', 'Refusing non-staging project.')
assert.ok(secret?.startsWith('sb_secret_'), 'Staging secret API key is required in memory.')
const opts = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } }
const admin = createClient(url, secret, opts)

if (action === 'setup') {
  const users = []
  try {
    for (let index = 0; index < 2; index++) {
      const email = `qa-mobile-${randomUUID()}@example.invalid`
      const password = `${randomBytes(36).toString('base64url')}Q7!`
      const generated = await admin.auth.admin.generateLink({ type: 'signup', email, password })
      assert.equal(generated.error, null, 'Could not create temporary staging account.')
      const client = createClient(url, env.VITE_SUPABASE_PUBLISHABLE_KEY, opts)
      users.push({ id: generated.data.user.id, email, password })
      const confirmation = await client.auth.verifyOtp({ type: 'signup', token_hash: generated.data.properties.hashed_token })
      assert.equal(confirmation.error, null, 'Could not confirm temporary staging account.')
      await client.auth.signOut({ scope: 'local' })
      const login = await client.auth.signInWithPassword({ email, password })
      assert.equal(login.error, null, 'Temporary staging login failed.')
      await client.auth.signOut({ scope: 'local' })
    }
    process.stdout.write(JSON.stringify({ users }))
  } catch (error) {
    for (const user of users) await admin.auth.admin.deleteUser(user.id)
    process.stderr.write(`Temporary staging account setup failed: ${error.message}\n`)
    process.exitCode = 1
  }
} else if (action === 'cleanup') {
  const ids = JSON.parse(process.env.SUPABASE_QA_USER_IDS ?? '[]')
  assert.ok(Array.isArray(ids) && ids.every((id) => /^[0-9a-f-]{36}$/i.test(id)), 'Invalid cleanup IDs.')
  const memberships = await admin.from('couple_members').select('couple_id').in('user_id', ids)
  assert.equal(memberships.error, null, 'Could not inspect test-owned memberships.')
  const coupleIds = [...new Set((memberships.data ?? []).map(({ couple_id }) => couple_id))]
  if (coupleIds.length) assert.equal((await admin.from('couples').delete().in('id', coupleIds)).error, null, 'Could not remove the test-created shared space.')
  for (const id of ids) {
    const result = await admin.auth.admin.deleteUser(id)
    assert.equal(result.error, null, 'Could not remove a test user created by this run.')
  }
  process.stdout.write(`Removed ${ids.length} temporary staging users.`)
} else if (action === 'list-qa-mobile') {
  const result = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 })
  assert.equal(result.error, null, 'Could not inspect staging Auth users.')
  const users = result.data.users.filter((user) => /^qa-mobile-[0-9a-f-]+@example\.invalid$/i.test(user.email ?? ''))
    .map(({ id,email,created_at }) => ({ id,email,created_at }))
  process.stdout.write(JSON.stringify({ users }))
} else {
  throw new Error('Usage: staging-mobile-users.mjs setup|cleanup')
}
