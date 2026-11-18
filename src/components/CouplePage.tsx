import { useEffect, useRef, useState } from 'react'
import { ArrowRight, Check, Copy, LoaderCircle, Share2, ShieldCheck, UsersRound } from 'lucide-react'
import { Link } from 'react-router-dom'
import { APP_NAME } from '../lib/brand'
import { coupleErrorMessage } from '../lib/coupleErrorMessage'
import { canJoinWithCode } from '../lib/joinCircle.mjs'
import JoinCircleForm from './JoinCircleForm'
import { supabase } from '../lib/supabase'

export default function CouplePage({ role, memberCount }: { role: string; memberCount: number }) {
  const [code, setCode] = useState('')
  const codeRef = useRef<HTMLElement>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState(() => {
    const message = sessionStorage.getItem('circle-notice') ?? ''
    sessionStorage.removeItem('circle-notice')
    return message
  })

  useEffect(() => { if (memberCount === 2) setCode('') }, [memberCount])

  async function createInvite() {
    setBusy(true); setError(''); setNotice('')
    try {
      const { data, error: inviteError } = await supabase!.rpc('create_couple_invite')
      if (inviteError) throw inviteError
      if (typeof data !== 'string' || !/^[a-f0-9]{48}$/.test(data)) throw new Error('Unexpected invitation response')
      setCode(data)
      setNotice('Invitación lista para compartir. Es de un solo uso y vence en siete días.')
    } catch (e) { setError(coupleErrorMessage(e)) }
    finally { setBusy(false) }
  }

  async function copyCode() {
    setError(''); setNotice('')
    try {
      if (!navigator.clipboard) throw new Error('Clipboard unavailable')
      await navigator.clipboard.writeText(code)
      setNotice('Código copiado. Envíalo solo a la otra persona.')
      return
    } catch { /* In-app browsers and non-HTTPS pages may block the Clipboard API; fall back below. */ }
    // Select the code so a single "Copiar" from the phone menu is enough, then try the legacy copy command.
    if (codeRef.current) window.getSelection()?.selectAllChildren(codeRef.current)
    let copied = false
    try { copied = document.execCommand('copy') } catch { copied = false }
    if (copied) setNotice('Código copiado. Envíalo solo a la otra persona.')
    else setError('No se pudo copiar automáticamente. El código quedó seleccionado: usa «Copiar» en tu teléfono.')
  }

  async function shareInvite() {
    const appUrl = new URL(import.meta.env.BASE_URL, window.location.origin).href
    const text = `Te invito a nuestro círculo en ${APP_NAME}. Abre la app e ingresa este código: ${code}`
    const share = Reflect.get(navigator, 'share') as ((data: ShareData) => Promise<void>) | undefined
    try {
      if (share) await share.call(navigator, { title: 'Invitación a nuestro círculo', text, url: appUrl })
      else if (navigator.clipboard) await navigator.clipboard.writeText(`${text}\n${appUrl}`)
      else throw new Error('Sharing unavailable')
      setError(''); setNotice(share ? 'Invitación compartida.' : 'Invitación y enlace copiados para compartir.')
    } catch (e) {
      if (e instanceof Error && e.name === 'AbortError') return
      setNotice('')
      setError('No se pudo compartir. Copia el código y envíalo por WhatsApp.')
    }
  }

  return <div className="page-wrap circle-page">
    <header className="catalog-heading circle-heading"><div><p className="eyebrow">Un espacio privado para dos</p><h1>Nuestro círculo</h1><p className="muted">Nuestro pequeño lugar para encontrarnos, sin prisas.</p></div><span className="circle-count"><UsersRound size={18} />{memberCount} de 2 integrantes</span></header>

    <section className="circle-panel" aria-live="polite">
      <span className="circle-seal"><ShieldCheck size={22} /></span>
      <p className="eyebrow">{memberCount === 2 ? 'YA ESTAMOS LOS DOS' : 'ESPERANDO A LA OTRA PERSONA'}</p>
      <h2>{memberCount === 2 ? 'Ya estamos en el mismo círculo.' : 'Nuestro círculo ya está creado.'}</h2>
      <p className="muted">{memberCount === 2 ? 'La invitación quedó aceptada. Cada quien puede responder el cuestionario desde su celular.' : 'Comparte la invitación para que podamos empezar. Aquí solo caben dos personas.'}</p>
      {memberCount === 2 ? <Link className="button primary" to="/planear">Empezar el cuestionario <ArrowRight size={17} /></Link>
        : role === 'owner' && memberCount === 1 ? <div className="circle-invite-actions">
          {!code ? <button className="button primary" disabled={busy} onClick={() => void createInvite()}>{busy ? <LoaderCircle className="spin" size={18} /> : <ShieldCheck size={18} />}Generar invitación</button> : <>
            <div className="invite-box circle-code"><p>Invitación activa · un solo uso · caduca en 7 días</p><div><code ref={codeRef} aria-label="Código de invitación">{code}</code><button className="icon-button copy-code" aria-label="Copiar código" onClick={() => void copyCode()}><Copy size={18} /></button></div></div>
            <button className="button primary" onClick={() => void shareInvite()}><Share2 size={18} />Compartir invitación</button>
            <button className="button secondary" disabled={busy} onClick={() => void createInvite()}>{busy ? <LoaderCircle className="spin" size={18} /> : <Copy size={17} />}Generar otra invitación</button>
            <p className="field-help">Generar otra no invalida los códigos anteriores; cada uno vence por separado. El código no se puede recuperar al cerrar esta pantalla.</p>
          </>}
        </div> : <p className="form-error" role="status">Todavía no aparecemos los dos en el círculo. Actualiza en unos segundos.</p>}
      {error && <p className="form-error circle-feedback" role="alert">{error}</p>}{notice && <p className="form-success circle-feedback" role="status"><Check size={15} />{notice}</p>}
      {/* Both people may have created a circle: while we are 1 of 2, the owner can still join the other one. */}
      {canJoinWithCode({ hasCircle: true, role, memberCount }) && <div className="circle-join" role="group" aria-labelledby="circle-join-title">
        <h3 id="circle-join-title">¿Ya tienes un código?</h3>
        <p className="muted">Si la otra persona ya creó su círculo, peguemos aquí su código para unirnos.</p>
        <JoinCircleForm id="circle-join-invite" label="Código de invitación" help="Puedes pegar el mensaje completo de WhatsApp. Cerramos este círculo vacío y nos unimos al suyo." button="Unirnos con este código" />
      </div>}
    </section>
  </div>
}
