import { useState } from 'react'
import type { FormEvent } from 'react'
import { KeyRound, LoaderCircle } from 'lucide-react'
import { coupleErrorMessage } from '../lib/coupleErrorMessage'
import { normalizeInviteCode } from '../lib/inviteCode.mjs'
import { createJoinSubmitter, isCompleteInviteCode } from '../lib/joinCircle.mjs'
import { supabase } from '../lib/supabase'

// Full reload into /circulo: the session and the real membership are read again from Supabase,
// so the final state shown is the one the server confirmed.
export function openCircle(message: string) {
  sessionStorage.setItem('circle-notice', message)
  window.location.assign(new URL('circulo', new URL(import.meta.env.BASE_URL, window.location.origin)).href)
}

// The one join form, used without a circle (PairingScreen) and while the owner is still alone (CouplePage).
export default function JoinCircleForm({ id, label, help, button }: { id: string; label: string; help: string; button: string }) {
  const [invite, setInvite] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [submit] = useState(() => createJoinSubmitter((code) => supabase!.rpc('accept_couple_invite', { p_token: code }), coupleErrorMessage))

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    if (busy) return
    setBusy(true); setError('')
    const result = await submit(invite)
    if (result.status === 'joined') { openCircle('Listo, ya estamos en el mismo círculo.'); return }
    if (result.status === 'error') setError(result.message ?? '')
    setBusy(false)
  }

  return <form className="form-stack join-circle-form" onSubmit={onSubmit} noValidate>
    <label htmlFor={id}>{label}</label>
    <input id={id} className="invite-input" value={invite} onChange={(e) => { setInvite(normalizeInviteCode(e.target.value)); setError('') }} placeholder="Pega aquí el código o mensaje de invitación" autoCapitalize="none" autoComplete="off" autoCorrect="off" spellCheck={false} enterKeyHint="go" aria-describedby={`${id}-help`} aria-invalid={error ? true : undefined} disabled={busy} />
    <p id={`${id}-help`} className="field-help">{help}</p>
    <button className="button secondary full" disabled={busy || !isCompleteInviteCode(invite)}>{busy ? <LoaderCircle className="spin" size={18} /> : <KeyRound size={18} />}{busy ? 'Uniéndonos…' : button}</button>
    {error && <p className="form-error" role="alert">{error}</p>}
  </form>
}
