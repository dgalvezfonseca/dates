import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import { planningErrorMessage } from '../src/lib/planningErrorMessage.mjs'

const generic = 'No se pudo completar la acción. Inténtalo de nuevo en un momento.'

// Every exception raised by the planning and date-mode RPCs must map to a specific Spanish message.
const migrations = new URL('../supabase/migrations/', import.meta.url)
const files = (await readdir(migrations)).filter((name) => /^20261104(001703|004631|061135)_/.test(name))
assert.equal(files.length, 3, 'Expected the planning, state-guard and date-mode migrations.')
const raised = new Set()
for (const name of files) {
  const sql = await readFile(new URL(name, migrations), 'utf8')
  // Only RPC bodies reach the browser; one-off `do $$` migration guards are deploy-time checks.
  for (const fn of sql.matchAll(/create or replace function[\s\S]*?\n\$\$;/gi)) {
    for (const match of fn[0].matchAll(/raise exception '([^']+)'/g)) raised.add(match[1])
  }
}
assert.ok(raised.size >= 20, 'Expected the RPC exception catalog to be found.')
for (const message of raised) {
  const mapped = planningErrorMessage({ message })
  assert.notEqual(mapped, generic, `Unmapped RPC error: ${message}`)
  assert.doesNotMatch(mapped, /[a-z]+ [a-z]+ (?:must|before|after|is|has)\b/i, `English leaked for: ${message}`)
}

assert.match(planningErrorMessage(new TypeError('Failed to fetch')), /conectar/)
assert.match(planningErrorMessage({ message: 'JWT expired', status: 401 }), /sesión venció/)
assert.match(planningErrorMessage({ message: 'both participants must choose the same experience' }), /misma propuesta/)
assert.match(planningErrorMessage({ message: 'wait for your turn' }), /turno/)
assert.equal(planningErrorMessage({ message: 'something unexpected' }), generic)
assert.equal(planningErrorMessage(null), generic)
console.log(`Planning error checks passed: ${raised.size} RPC exceptions mapped to Spanish, plus network and session cases.`)
