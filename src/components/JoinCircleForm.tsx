import { useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { KeyRound, LoaderCircle } from 'lucide-react'
import { coupleErrorMessage } from '../lib/coupleErrorMessage'
import { normalizeInviteCode } from '../lib/inviteCode.mjs'
import { supabase } from '../lib/supabase'

// Full reload into /circulo so the session and the real membership are resolved again from Supabase
// (the shell is keyed on the user id and would otherwise keep showing the previous circle).
export function openCircle(message: string) {
  sessionStorage.setItem('circle-notice', message)
  window.location.assign(new URL('circulo', new URL(import.meta.env.BASE_URL, window.location.origin)).href)
}

// "Ya tengo un código": shown whenever the account can still join a circle (no circle yet, or alone in
// the one it created). The server decides; this form never writes tables directly.
export default function JoinCircleForm({ id, label, help }: { id: string; label: string; help: string }) {
  const [invite, setInvite] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const inFlight = useRef(false)

  async function accept(event: FormEvent) {
    event.preventDefault()
    if (inFlight.current || invite.length !== 48) return
    inFlight.current = true; setBusy(true); setError('')
    try {
      const { error: acceptError } = await supabase!.rpc('accept_couple_invite', { p_token: invite })
      if (acceptError) setError(coupleErrorMessage(acceptError))
      else { openCircle('Listo, ya estamos en el mismo círculo.'); return }
    } catch (e) { setError(coupleErrorMessage(e)) }
    inFlight.current = false; setBusy(false)
  }

  return <form className="form-stack join-circle-form" onSubmit={accept} noValidate>
    <label htmlFor={id}>{label}</label>
    <input id={id} className="invite-input" value={invite} onChange={(e) => { setInvite(normalizeInviteCode(e.target.value)); setError('') }} placeholder="Pega aquí el código o el mensaje completo" autoCapitalize="none" autoComplete="off" autoCorrect="off" spellCheck={false} aria-describedby={`${id}-help`} aria-invalid={error ? true : undefined} />
    <p id={`${id}-help`} className="field-help">{help}</p>
    <button className="button secondary full" disabled={busy || invite.length !== 48}>{busy ? <LoaderCircle className="spin" size={18} /> : <KeyRound size={18} />}{busy ? 'Uniéndonos…' : 'Unirnos'}</button>
    {error && <p className="form-error" role="alert">{error}</p>}
  </form>
}
