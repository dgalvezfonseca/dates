import assert from 'node:assert/strict'
import { normalizeInviteCode } from '../src/lib/inviteCode.mjs'

const code = '7ac66cccc9f3c8946a60f36fb21c289a7127043d4ce03731'
const shared = `Te invito a nuestro círculo en 100 citas tú y yo. Abre la app e ingresa este código: ${code}\nhttps://dgalvezfonseca.github.io/dates/`

assert.equal(normalizeInviteCode(code), code)
// Regression: pasting the full shared message used to keep stray a-f letters from the text.
assert.equal(normalizeInviteCode(shared), code)
// Regression: the RPC only accepts lowercase; uppercase/auto-capitalized input must be normalized.
assert.equal(normalizeInviteCode(code.toUpperCase()), code)
assert.equal(normalizeInviteCode(`  ${code}  `), code)
assert.equal(normalizeInviteCode(code.replace(/(.{6})/g, '$1 ')), code)
// Partial typing keeps only hex characters and never exceeds 48.
assert.equal(normalizeInviteCode('7AC6-6c'), '7ac66c')
assert.equal(normalizeInviteCode(`${code}ff`).length, 48)
assert.equal(normalizeInviteCode(''), '')
console.log('Invite code checks passed: full shared message, uppercase, spaces, partial typing and length cap.')
