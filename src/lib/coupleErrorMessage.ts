export function coupleErrorMessage(error: unknown): string {
  const value = error as { message?: unknown; status?: unknown } | null
  const message = typeof value?.message === 'string' ? value.message.toLowerCase() : ''

  if (value?.status === 401 || /jwt expired|session (?:is )?expired|auth session missing/.test(message)) {
    return 'Tu sesión venció. Inicia sesión otra vez y vuelve a intentarlo.'
  }
  if (/full/.test(message)) return 'Este círculo ya tiene sus dos integrantes.'
  if (/already belongs/.test(message)) return 'Esta cuenta ya pertenece a otro círculo.'
  if (/invalid invitation|expired|already used/.test(message)) {
    return 'El código no es válido, venció o ya se utilizó. Pide una invitación vigente.'
  }
  if (/fetch failed|network|failed to fetch|load failed/.test(message)) {
    return 'No pudimos conectar. Revisa tu conexión e inténtalo de nuevo.'
  }
  return 'No se pudo completar la acción. Inténtalo de nuevo en un momento.'
}
