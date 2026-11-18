import assert from 'node:assert/strict'
import { authErrorMessage, authRedirectUrl } from '../src/lib/authErrorMessage.mjs'

const generic = 'No pudimos completar el acceso. Inténtalo de nuevo en un momento.'

// Known Supabase Auth error codes and legacy messages map to specific Spanish text.
const cases = [
  [{ code: 'invalid_credentials', message: 'Invalid login credentials' }, 'El correo o la contraseña no coinciden.'],
  [{ message: 'Invalid login credentials' }, 'El correo o la contraseña no coinciden.'],
  [{ code: 'email_not_confirmed', message: 'Email not confirmed' }, /Falta confirmar tu correo/],
  [{ code: 'user_already_exists', message: 'User already registered' }, 'Ese correo ya tiene una cuenta. Inicia sesión.'],
  [{ code: 'weak_password', message: 'Password should be at least 8 characters.' }, /muy débil/],
  [{ code: 'email_address_invalid', message: 'Email address "x" is invalid' }, /no parece válido/],
  [{ code: 'over_email_send_rate_limit', status: 429, message: 'email rate limit exceeded' }, /demasiados intentos/],
  [{ status: 429, message: 'Too Many Requests' }, /demasiados intentos/],
  [{ code: 'signup_disabled', message: 'Signups not allowed for this instance' }, /no está disponible/],
  [new TypeError('Failed to fetch'), /No pudimos conectar/],
  [{ message: 'Something unexpected in English' }, generic],
  [null, generic],
]
for (const [input, expected] of cases) {
  const output = authErrorMessage(input)
  if (expected instanceof RegExp) assert.match(output, expected)
  else assert.equal(output, expected)
  assert.doesNotMatch(output, /invalid|credentials|confirmed|registered|rate limit|fetch/i, 'Raw English must not reach users.')
}

// The confirmation link returns to the app root under the Pages base path, never to localhost.
assert.equal(authRedirectUrl('https://dgalvezfonseca.github.io', '/dates/'), 'https://dgalvezfonseca.github.io/dates/')
assert.equal(authRedirectUrl('http://127.0.0.1:5182', '/'), 'http://127.0.0.1:5182/')

console.log(`Auth error messages: ${cases.length} cases passed; redirect URL respects the base path.`)
