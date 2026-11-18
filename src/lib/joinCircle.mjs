// Joining a circle with an invitation code: pure logic shared by the pairing screen (no circle yet)
// and «Nuestro círculo ya está creado» (owner still alone). The server RPC accept_couple_invite decides.
import { normalizeInviteCode } from './inviteCode.mjs'

export const INVITE_CODE_LENGTH = 48
export const JOIN_TIMEOUT_MS = 20000

// Single source of truth, fed by the membership read from Supabase (never localStorage):
// no circle yet, or the owner of a circle that still has exactly one member.
export function canJoinWithCode({ hasCircle, role, memberCount }) {
  if (!hasCircle) return true
  return role === 'owner' && memberCount === 1
}

export function isCompleteInviteCode(raw) {
  return normalizeInviteCode(raw).length === INVITE_CODE_LENGTH
}

// Returns submit(raw) → { status: 'joined' | 'error' | 'ignored', message? }.
// One request at a time per form; a timeout or a missing response is never treated as success.
export function createJoinSubmitter(acceptInvite, mapError, { timeoutMs = JOIN_TIMEOUT_MS } = {}) {
  let inFlight = false
  return async function submit(raw) {
    if (inFlight) return { status: 'ignored' }
    const code = normalizeInviteCode(raw)
    if (code.length !== INVITE_CODE_LENGTH) return { status: 'error', message: 'Revisa el código: debe tener 48 caracteres.' }
    inFlight = true
    let timer
    try {
      const timeout = new Promise((_, reject) => { timer = setTimeout(() => reject(Object.assign(new Error('join timeout'), { name: 'TimeoutError' })), timeoutMs) })
      const result = await Promise.race([acceptInvite(code), timeout])
      if (result?.error) return { status: 'error', message: mapError(result.error) }
      if (typeof result?.data !== 'string' || !result.data) return { status: 'error', message: mapError(null) }
      return { status: 'joined' }
    } catch (error) {
      if (error?.name === 'TimeoutError') return { status: 'error', message: 'La respuesta está tardando. Actualiza la página para ver si ya quedamos unidos antes de intentarlo otra vez.' }
      return { status: 'error', message: mapError(error) }
    } finally {
      clearTimeout(timer)
      inFlight = false
    }
  }
}
