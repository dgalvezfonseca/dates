// Maps the circle RPC errors (create_couple, create_couple_invite, accept_couple_invite) to Spanish.
// Never reveals anything about the owner of a code: invalid, expired and used codes share one message.
export function coupleErrorMessage(error: unknown): string {
  const value = error as { message?: unknown; status?: unknown } | null
  const message = typeof value?.message === 'string' ? value.message.toLowerCase() : ''

  if (value?.status === 401 || /jwt expired|session (?:is )?expired|auth session missing|authentication required/.test(message)) {
    return 'Tu sesión venció. Inicia sesión otra vez y vuelve a intentarlo.'
  }
  if (/your own shared space/.test(message)) return 'Ese código es de nuestro propio círculo. Compártelo con la otra persona para que se una.'
  if (/shared activity/.test(message)) return 'Este círculo ya tiene actividad guardada, así que no podemos cambiarlo por otro.'
  if (/full/.test(message)) return 'Ese círculo ya tiene sus dos integrantes.'
  if (/already belongs/.test(message)) return 'Esta cuenta ya pertenece a un círculo con otra persona.'
  if (/only the space owner/.test(message)) return 'Solo quien creó el círculo puede generar la invitación.'
  if (/invalid invitation|invitation is invalid|expired|already used/.test(message)) {
    return 'El código no es válido, venció o ya se utilizó. Pide una invitación vigente.'
  }
  if (/fetch failed|network|failed to fetch|load failed/.test(message)) {
    return 'No pudimos conectar. Revisa tu conexión e inténtalo de nuevo.'
  }
  return 'No se pudo completar la acción. Inténtalo de nuevo en un momento.'
}
