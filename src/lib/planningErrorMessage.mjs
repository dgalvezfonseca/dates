// Maps Supabase/RPC errors from planning and date mode to short Spanish messages.
// The RPCs raise English messages (see supabase/migrations); users must never see them raw.
export function planningErrorMessage(error) {
  const message = typeof error?.message === 'string' ? error.message.toLowerCase() : String(error ?? '').toLowerCase()

  if (error?.status === 401 || /jwt expired|session (?:is )?expired|auth session missing/.test(message)) {
    return 'Tu sesión venció. Inicia sesión otra vez; lo que ya guardaste sigue a salvo.'
  }
  if (/fetch failed|failed to fetch|networkerror|network request failed|load failed/.test(message)) {
    return 'No pudimos conectar. Revisa tu conexión; lo que ya guardaste sigue a salvo.'
  }
  if (/not enough activities/.test(message)) {
    return 'Con las actividades que preferimos evitar no quedan tres propuestas. Pospongamos y respondamos de nuevo con menos restricciones.'
  }
  if (/both participants must choose the same/.test(message)) return 'Los dos tenemos que elegir la misma propuesta antes de confirmar.'
  if (/vote before confirming/.test(message)) return 'Elige una propuesta antes de confirmar.'
  if (/both participants must submit|bilateral confirmation required/.test(message)) return 'Falta que la otra persona complete su parte.'
  if (/wait for your turn/.test(message)) return 'Ahora es el turno de la otra persona.'
  if (/two participants/.test(message)) return 'Para continuar necesitamos estar los dos en el círculo.'
  if (/session is unavailable|not open for|cannot be changed|state changed|has not started|not confirmed|experience is unavailable|incomplete recommendation set/.test(message)) {
    return 'La cita cambió desde el otro teléfono. Ya actualizamos la pantalla; revisa el estado actual.'
  }
  if (/not authorized/.test(message) || error?.code === '42501') return 'Esta cuenta no tiene acceso a esta cita.'
  if (/invalid/.test(message)) return 'No pudimos guardar esa selección. Actualiza la pantalla e inténtalo otra vez.'
  return 'No se pudo completar la acción. Inténtalo de nuevo en un momento.'
}
