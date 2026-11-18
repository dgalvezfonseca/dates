// Maps Supabase Auth errors (sign-in / sign-up) to short Spanish messages; users never see them raw.
export function authErrorMessage(error) {
  const code = typeof error?.code === 'string' ? error.code : ''
  const message = typeof error?.message === 'string' ? error.message.toLowerCase() : String(error ?? '').toLowerCase()

  if (code === 'invalid_credentials' || /invalid login credentials/.test(message)) return 'El correo o la contraseña no coinciden.'
  if (code === 'email_not_confirmed' || /email not confirmed/.test(message)) return 'Falta confirmar tu correo. Abre el enlace que te enviamos y vuelve a iniciar sesión.'
  if (code === 'user_already_exists' || code === 'email_exists' || /already registered|already been registered/.test(message)) return 'Ese correo ya tiene una cuenta. Inicia sesión.'
  if (code === 'weak_password' || /password should be at least|weak password/.test(message)) return 'La contraseña es muy débil. Usa al menos 8 caracteres.'
  if (code === 'email_address_invalid' || /invalid email|email address .* is invalid/.test(message)) return 'Revisa el correo electrónico; no parece válido.'
  if (code === 'over_email_send_rate_limit' || code === 'over_request_rate_limit' || error?.status === 429 || /rate limit|too many requests/.test(message)) {
    return 'Hubo demasiados intentos seguidos. Espera unos minutos e inténtalo otra vez.'
  }
  if (code === 'signup_disabled' || /signups not allowed/.test(message)) return 'El registro de cuentas nuevas no está disponible por ahora.'
  if (/fetch failed|failed to fetch|networkerror|network request failed|load failed/.test(message)) return 'No pudimos conectar. Revisa tu conexión e inténtalo otra vez.'
  return 'No pudimos completar el acceso. Inténtalo de nuevo en un momento.'
}

// Where the confirmation e-mail sends people back: the app root under the deployed base path
// (https://dgalvezfonseca.github.io/dates/ on Pages). Supabase only honours it if it is in the
// project's Redirect URL allow list; otherwise it falls back to the Site URL.
export function authRedirectUrl(origin, baseUrl) {
  return new URL(baseUrl, origin).href
}
