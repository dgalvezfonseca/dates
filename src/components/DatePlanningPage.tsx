import { useCallback, useEffect, useRef, useState } from 'react'
import { ArrowLeft, ArrowRight, Check, Clock3, LoaderCircle, MapPin, Pause, RefreshCw, Sparkles } from 'lucide-react'
import { Link } from 'react-router-dom'
import type { Json } from '../lib/database.types'
import { planningErrorMessage } from '../lib/planningErrorMessage.mjs'
import { supabase } from '../lib/supabase'

type Answer = { activity?: string; mood?: string; time?: string; setting?: string; discover?: string; avoid?: string[] }
type Session = { id: string; status: string; selected_date_id: string | null }
type Recommendation = { id: string; date_id: string; position: number; explanation: string; preparation: string; prompts: string[]; title: string; category: string; duration_minutes: number; energy: string; setting: string }
type CatalogOption = { id: string; title: string }

const questions = [
  { key: 'activity', title: '¿Qué tipo de experiencia te gustaría vivir?', options: [['romantica','Romántica'],['aventura','Aventura'],['diversión','Diversión'],['conversación','Conversación'],['creatividad','Creatividad'],['algo-tranquilo','Algo tranquilo'],['sorprendeme','Sorpréndeme']] },
  { key: 'mood', title: '¿Cómo te sientes hoy?', options: [['mucha-energia','Con mucha energía'],['distraerme','Quiero distraerme'],['necesito-tranquilidad','Necesito tranquilidad'],['conectar','Me gustaría conectar más'],['paso','Prefiero no responder']] },
  { key: 'time', title: '¿Cuánto tiempo tienen disponible?', options: [['1-2-horas','1–2 horas'],['medio-dia','Medio día'],['todo-el-dia','Todo el día'],['escapada','Una escapada']] },
  { key: 'setting', title: '¿Qué ambiente prefieres?', options: [['interior','Interior'],['exterior','Exterior'],['indistinto','Me da igual']] },
  { key: 'discover', title: '¿Qué te gustaría descubrir del otro?', options: [['suenos','Sus sueños'],['divertido','Su lado divertido'],['pensamiento','Su forma de pensar'],['colaborar','Cómo colaboramos'],['nuevo','Algo completamente nuevo']] },
] as const

export default function DatePlanningPage({ coupleId, userId }: { coupleId: string; userId: string }) {
  const [session, setSession] = useState<Session | null>(null)
  const [answer, setAnswer] = useState<Answer>({})
  const [step, setStep] = useState(0)
  const [submitted, setSubmitted] = useState(false)
  const [partnerSubmitted, setPartnerSubmitted] = useState(false)
  const [catalog, setCatalog] = useState<CatalogOption[]>([])
  const [recommendations, setRecommendations] = useState<Recommendation[]>([])
  const [votes, setVotes] = useState<{ user_id: string; recommendation_id: string }[]>([])
  const [confirmations, setConfirmations] = useState<{ user_id: string; recommendation_id: string }[]>([])
  const [myVote, setMyVote] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [avoidChoice, setAvoidChoice] = useState('')
  const hydratedSession = useRef('')
  const answerRef = useRef<Answer>({})
  const draftQueue = useRef<Promise<void>>(Promise.resolve())
  const phaseRef = useRef('')

  const refresh = useCallback(async () => {
    if (!supabase) return
    const { data: sessionRow, error: sessionError } = await supabase.from('date_sessions').select('id,status,selected_date_id').eq('couple_id', coupleId).in('status', ['collecting','recommending','voting','confirmed','in_progress']).maybeSingle()
    if (sessionError) throw sessionError
    if (!sessionRow) {
      const started = await supabase.rpc('start_or_resume_date_session', { p_couple_id: coupleId })
      if (started.error) throw started.error
      const { data: created, error: createdError } = await supabase.from('date_sessions').select('id,status,selected_date_id').eq('id', started.data).single()
      if (createdError) throw createdError
      setSession(created)
      const { data: options, error: optionsError } = await supabase.from('date_catalog').select('id,title').eq('active', true).order('sort_order')
      if (optionsError) throw optionsError
      setCatalog(options ?? [])
      hydratedSession.current = created.id
      answerRef.current = {}
      setStep(0)
      setRecommendations([]); setVotes([]); setConfirmations([]); setMyVote(''); setSubmitted(false); setPartnerSubmitted(false); setAnswer({})
      return
    }
    setSession(sessionRow)
    const [own, states, recs, currentVotes, accepted, titles] = await Promise.all([
      supabase.from('date_responses').select('answers,submitted_at').eq('session_id', sessionRow.id).eq('user_id', userId).maybeSingle(),
      supabase.from('date_response_status').select('user_id,submitted_at').eq('session_id', sessionRow.id),
      supabase.from('date_recommendations').select('id,date_id,position,explanation,preparation,prompts,session_id').eq('session_id', sessionRow.id).order('position'),
      supabase.from('date_votes').select('user_id,recommendation_id').eq('session_id', sessionRow.id),
      supabase.from('date_confirmations').select('user_id,recommendation_id').eq('session_id', sessionRow.id),
      supabase.from('date_catalog').select('id,title,category,duration_minutes,energy,setting').eq('active', true),
    ])
    for (const result of [own,states,recs,currentVotes,accepted,titles]) if (result.error) throw result.error
    const ownRow = own.data
    const statusRows = states.data ?? []
    const mySubmitted = !!ownRow?.submitted_at
    const partnerDone = statusRows.some((row) => row.user_id !== userId && !!row.submitted_at)
    if (hydratedSession.current !== sessionRow.id) {
      const restoredAnswer = (ownRow?.answers as Answer | undefined) ?? {}
      answerRef.current = restoredAnswer
      setAnswer(restoredAnswer)
      hydratedSession.current = sessionRow.id
      if (!mySubmitted) {
        const firstMissing = questions.findIndex((question) => !restoredAnswer[question.key as keyof Answer])
        setStep(firstMissing < 0 ? questions.length : firstMissing)
      }
    }
    setSubmitted(mySubmitted); setPartnerSubmitted(partnerDone)
    setCatalog((titles.data ?? []).map(({ id,title }) => ({ id,title })))
    const lookup = new Map((titles.data ?? []).map((date) => [date.id,date]))
    const parsed: Recommendation[] = (recs.data ?? []).flatMap((rec) => {
      const date = lookup.get(rec.date_id)
      if (!date) return []
      return [{ ...date, ...rec, id: rec.id, date_id: rec.date_id, prompts: Array.isArray(rec.prompts) ? rec.prompts.filter((item): item is string => typeof item === 'string') : [] }]
    })
    setRecommendations(parsed)
    // A notice describes the phase in which it was shown; drop it once the other phone moves the shared state on.
    const phase = `${sessionRow.id}|${sessionRow.status}|${mySubmitted}|${partnerDone}|${parsed.length}`
    if (phaseRef.current && phaseRef.current !== phase) setNotice('')
    phaseRef.current = phase
    setVotes(currentVotes.data ?? []); setConfirmations(accepted.data ?? [])
    setMyVote((currentVotes.data ?? []).find((vote) => vote.user_id === userId)?.recommendation_id ?? '')
    if (mySubmitted && partnerDone && parsed.length === 0 && sessionRow.status !== 'confirmed') {
      const generated = await supabase.rpc('generate_date_recommendations', { p_session_id: sessionRow.id })
      if (generated.error) throw generated.error
      await refresh()
    }
  }, [coupleId, userId])

  useEffect(() => {
    let active = true
    async function initial() { try { await refresh() } catch (e) { if (active) setError(planningErrorMessage(e)) } finally { if (active) setLoading(false) } }
    void initial()
    const timer = window.setInterval(() => { void refresh().catch((e) => setError(planningErrorMessage(e))) }, 5000)
    const channel = supabase?.channel(`planning-${coupleId}`).on('postgres_changes', { event: '*', schema: 'public', table: 'date_response_status' }, () => { void refresh().catch((e) => setError(planningErrorMessage(e))) }).on('postgres_changes', { event: '*', schema: 'public', table: 'date_votes' }, () => { void refresh().catch((e) => setError(planningErrorMessage(e))) }).subscribe()
    return () => { active = false; window.clearInterval(timer); if (channel) void supabase?.removeChannel(channel) }
  }, [refresh,coupleId])

  async function save(submit = false): Promise<boolean> {
    if (!supabase || !session) return false
    setBusy(true); setError(''); setNotice('')
    try {
      await draftQueue.current
      const { data: saved, error: saveError } = await supabase.rpc('save_date_response', { p_session_id: session.id, p_answers: answerRef.current as Json, p_submit: submit })
      if (saveError) { setError(planningErrorMessage(saveError)); return false }
      await refresh()
      // Set notices after refresh: refresh clears notices whenever the shared phase changes.
      const partnerAlreadySubmitted = !!(saved as { partner_submitted?: boolean } | null)?.partner_submitted
      if (submit && !partnerAlreadySubmitted) setNotice('Tus respuestas están listas. Se mantienen privadas mientras esperamos a la otra persona.')
      return true
    } catch (e) { setError(planningErrorMessage(e)); return false }
    finally { setBusy(false) }
  }
  async function next() { if (step === questions.length) { await save(true); return } if (await save(false)) setStep((value) => value + 1) }
  async function vote(id: string) { if (!supabase || !session) return; setBusy(true); const result = await supabase.rpc('vote_date_recommendation',{p_session_id:session.id,p_recommendation_id:id}); if (result.error) setError(planningErrorMessage(result.error)); else await refresh(); setBusy(false) }
  async function confirm() { if (!supabase || !session) return; setBusy(true); setError(''); const result = await supabase.rpc('confirm_date_recommendation',{p_session_id:session.id}); if (result.error) setError(planningErrorMessage(result.error)); else { await refresh(); setNotice(result.data ? 'La cita quedó confirmada por ambos.' : 'Tu aceptación quedó guardada. Falta la de la otra persona.') } setBusy(false) }
  async function close(status: 'postponed'|'cancelled') { if (!supabase || !session) return; setBusy(true); const result = await supabase.rpc('close_date_session',{p_session_id:session.id,p_status:status}); if (result.error) setError(planningErrorMessage(result.error)); else { await refresh(); setNotice(status==='postponed'?'Lo dejan para otro momento.':'La planificación quedó cancelada, sin penalizaciones.') } setBusy(false) }
  function changeAnswer(update: (current: Answer) => Answer) {
    const nextAnswer = update(answerRef.current)
    answerRef.current = nextAnswer
    setAnswer(nextAnswer)
    if (!supabase || !session || submitted) return
    const write = draftQueue.current.catch(() => undefined).then(async () => {
      const { error: saveError } = await supabase!.rpc('save_date_response', { p_session_id: session.id, p_answers: nextAnswer as Json, p_submit: false })
      if (saveError) throw saveError
    })
    draftQueue.current = write
    void write.then(() => setError('')).catch((e) => setError(planningErrorMessage(e)))
  }

  if (loading) return <main className="center-page"><LoaderCircle className="spin loading-icon" size={26} /><p className="muted">Preparando el cuestionario…</p></main>
  if (error && !session) return <main className="center-page"><section className="setup-card"><p className="eyebrow">Planear juntos</p><h1>No logramos abrir el test.</h1><p className="form-error" role="alert">{error}</p><button className="button primary full" onClick={() => { setError(''); setLoading(true); void refresh().catch((e) => setError(planningErrorMessage(e))).finally(() => setLoading(false)) }}>Reintentar</button></section></main>
  const own = votes.find((vote) => vote.user_id === userId)
  const partnerVote = votes.find((vote) => vote.user_id !== userId)
  const myAcceptance = confirmations.some((item) => item.user_id === userId)
  const partnerAcceptance = confirmations.some((item) => item.user_id !== userId && item.recommendation_id === own?.recommendation_id)
  const confirmed = session?.status === 'confirmed' || session?.status === 'in_progress'
  const selected = recommendations.find((item) => item.date_id === session?.selected_date_id)

  return <div className="page-wrap planning-page"><div className="catalog-heading"><div><p className="eyebrow">UNA IDEA PARA COMPARTIR TIEMPO</p><h1>La próxima cita</h1><p className="muted">Cada quien responde por su cuenta. Si ambos envían el test, combinamos sus preferencias para sugerir ideas; las respuestas individuales no se muestran.</p></div><span className="planning-mark"><Sparkles size={20} /></span></div>
    {error && <p className="form-error" role="alert">{error}</p>}{notice && <p className="form-success" role="status">{notice}</p>}
    {confirmed && selected ? <section className="planning-panel confirmed-panel"><span className="plan-step"><Check size={15} /> {session?.status === 'in_progress' ? 'EXPERIENCIA EN CURSO' : 'CONFIRMADA ENTRE AMBOS'}</span><h2>{selected.title}</h2><p>{selected.explanation}</p><div className="date-meta"><span><Clock3 size={14}/>{selected.duration_minutes} min</span><span><MapPin size={14}/>{selected.setting}</span></div><p className="muted">Pueden volver al modo cita desde cualquiera de sus teléfonos. La experiencia se marca como completada cuando ambos lo confirman.</p><div className="planning-actions"><Link className="button primary" to="/cita">{session?.status === 'in_progress' ? 'Continuar modo cita' : 'Abrir modo cita'} <ArrowRight size={16}/></Link>{session?.status === 'confirmed' && <><button className="button secondary" disabled={busy} onClick={() => void close('postponed')}><Pause size={16}/> Posponer</button><button className="text-button" disabled={busy} onClick={() => void close('cancelled')}>Cancelar cita</button></>}</div></section>
      : recommendations.length ? <><section className="planning-panel"><span className="plan-step"><Check size={15}/> SUS TRES PROPUESTAS</span><h2>Elijan sin prisa.</h2><p className="muted">Pueden cambiar su voto. Nada se confirma hasta que ambos acepten la misma idea.</p>{partnerVote && own && partnerVote.recommendation_id!==own.recommendation_id && <p className="form-success">Eligieron ideas distintas por ahora. Pueden revisar las tres y cambiar su voto cuando quieran.</p>}</section><div className="recommendation-list">{recommendations.map((item) => <article className={`recommendation-card ${myVote===item.id?'chosen':''}`} key={item.id}><span className="date-category">PROPUESTA {item.position}</span><h2>{item.title}</h2><p>{item.explanation}</p><div className="date-meta"><span><Clock3 size={14}/>{item.duration_minutes} min</span><span><MapPin size={14}/>{item.setting}</span><span>{item.energy}</span></div><p className="recommendation-prep"><strong>Para prepararla:</strong> {item.preparation}</p><details><summary>Una idea para conversar</summary><ul>{item.prompts.map((prompt) => <li key={prompt}>{prompt}</li>)}</ul></details><button className={`button ${myVote===item.id?'primary':'secondary'} full`} disabled={busy} onClick={() => void vote(item.id)}>{myVote===item.id ? <><Check size={16}/> Tu voto · {partnerVote?.recommendation_id===item.id?'también le gusta':'esperando su elección'}</> : 'Elegir esta experiencia'}</button>{myVote===item.id && partnerVote?.recommendation_id===item.id && <p className="form-success vote-match">Ambos eligieron esta propuesta. Si te parece bien, confírmala aquí.</p>}{myVote===item.id && partnerVote?.recommendation_id===item.id && <button className="button primary full" disabled={busy || myAcceptance} onClick={() => void confirm()}>{myAcceptance ? partnerAcceptance ? 'Confirmada por ambos' : 'Tu aceptación quedó guardada' : 'Confirmar esta cita'}</button>}</article>)}</div><div className="planning-actions"><button className="button secondary" disabled={busy} onClick={() => void close('postponed')}><Pause size={16}/> Posponer</button><button className="text-button" disabled={busy} onClick={() => void close('cancelled')}>Cancelar planificación</button></div></>
      : submitted && partnerSubmitted ? <section className="planning-panel waiting-panel"><LoaderCircle className="spin" size={23}/><h2>Estamos preparando sus ideas.</h2><p className="muted">Ya respondieron ambos. En un momento verán las mismas tres propuestas.</p><button className="button secondary" onClick={() => void refresh()}><RefreshCw size={15}/> Actualizar</button></section>
      : submitted ? <section className="planning-panel waiting-panel"><span className="plan-step"><Check size={15}/> TUS RESPUESTAS ESTÁN GUARDADAS</span><h2>El test puede esperar.</h2><p className="muted">Cuando la otra persona termine, aparecerán tres ideas compartidas. No verá tus respuestas individuales.</p><button className="button secondary" onClick={() => void close('postponed')}><Pause size={16}/> Dejarlo para después</button></section>
      : <section className="planning-panel questionnaire"><div className="question-progress"><span>PREGUNTA {Math.min(step+1,6)} DE 6</span><div><i style={{width:`${Math.min((step+1)/6*100,100)}%`}}/></div></div>{step<questions.length ? <><p className="eyebrow">SIN RESPUESTA CORRECTA</p><h2>{questions[step].title}</h2><div className="answer-list">{questions[step].options.map(([value,label]) => <button key={value} disabled={busy} className={`answer-option ${answer[questions[step].key as keyof Answer]===value?'selected':''}`} aria-pressed={answer[questions[step].key as keyof Answer]===value} onClick={() => changeAnswer((current) => ({...current,[questions[step].key]:value}))}>{label}{answer[questions[step].key as keyof Answer]===value && <Check size={16}/>}</button>)}</div></> : <><p className="eyebrow">OPCIONAL</p><h2>¿Hay alguna actividad que prefieras evitar?</h2><p className="muted">Puedes omitirlo o elegir hasta cinco opciones del catálogo. No se compartirán tus respuestas.</p><div className="avoid-picker"><select aria-label="Seleccionar actividad para evitar" disabled={busy} value={avoidChoice} onChange={(event) => setAvoidChoice(event.target.value)}><option value="">Elige una actividad</option>{catalog.filter((date) => !answer.avoid?.includes(date.id)).map((date) => <option key={date.id} value={date.id}>{date.title}</option>)} </select><button className="button secondary" disabled={busy || !avoidChoice || (answer.avoid?.length??0)>=5} onClick={() => {if(avoidChoice) changeAnswer((current) => ({...current,avoid:[...(current.avoid??[]),avoidChoice]})); setAvoidChoice('')}}>Agregar</button></div>{!!answer.avoid?.length && <ul className="avoid-list">{answer.avoid.map((id) => <li key={id}>{catalog.find((date) => date.id===id)?.title}<button disabled={busy} aria-label="Quitar restricción" onClick={() => changeAnswer((current) => ({...current,avoid:current.avoid?.filter((item) => item!==id)}))}>×</button></li>)}</ul>}</>}
        <p className="optional-note">Puedes dejar cualquier pregunta sin responder. Tus selecciones se guardan en tu espacio y solo tú puedes leerlas.</p><div className="question-actions">{step>0 && <button className="button secondary" disabled={busy} onClick={() => setStep((value)=>value-1)}><ArrowLeft size={16}/> Atrás</button>}<button className="text-button" disabled={busy} onClick={() => { if(step===questions.length) void save(true); else setStep((value)=>value+1) }}>Omitir</button><button className="button primary" disabled={busy} onClick={() => void next()}>{busy?<LoaderCircle className="spin" size={17}/>:null}{step===questions.length?'Enviar respuestas':'Continuar'}<ArrowRight size={16}/></button></div></section>}
  </div>
}
