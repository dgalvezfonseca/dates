import { useCallback, useEffect, useMemo, useState } from 'react'
import { ArrowLeft, ArrowRight, Bookmark, Check, Clock3, Heart, LoaderCircle, SkipForward } from 'lucide-react'
import { Link } from 'react-router-dom'
import questionDeck from '../../catalog/question-deck.json'
import challenges from '../../catalog/experience-challenges.json'
import type { Database, Json } from '../lib/database.types'
import { planningErrorMessage } from '../lib/planningErrorMessage.mjs'
import { supabase } from '../lib/supabase'

type Experience = Pick<Database['public']['Tables']['date_catalog']['Row'], 'id' | 'title' | 'category' | 'description' | 'objective' | 'duration_minutes' | 'energy' | 'setting' | 'materials' | 'preparation' | 'steps' | 'prompts' | 'low_energy_alternative' | 'accessibility' | 'consent' | 'enjoyment_tips'>
type Session = { id: string; status: string; selected_date_id: string | null }
type Progress = { session_id: string; couple_id: string; turn_user_id: string; question_level: Level; question_index: number; completed_steps: number[]; skipped_steps: number[] }
type Level = 'actividad' | 'divertidas' | 'gustos' | 'suenos' | 'romance' | 'profundas'
type Prompt = { id: string; text: string }

const levels: { id: Level; label: string }[] = [
  { id: 'actividad', label: 'De esta cita' },
  { id: 'divertidas', label: 'Divertidas' },
  { id: 'gustos', label: 'Gustos y personalidad' },
  { id: 'suenos', label: 'Sueños y metas' },
  { id: 'romance', label: 'Romance y conexión' },
  { id: 'profundas', label: 'Profundas · opcional' },
]

const strings = (value: Json): string[] => Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
const sharedQuestions = questionDeck as Record<Exclude<Level, 'actividad'>, Prompt[]>
const categoryChallenges = challenges as Record<string, { title: string; description: string }>

export default function DateExperiencePage({ coupleId, userId }: { coupleId: string; userId: string }) {
  const [session, setSession] = useState<Session | null>(null)
  const [experience, setExperience] = useState<Experience | null>(null)
  const [progress, setProgress] = useState<Progress | null>(null)
  const [finishers, setFinishers] = useState<string[]>([])
  const [favorites, setFavorites] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const refresh = useCallback(async () => {
    if (!supabase) return
    const { data: sessions, error: sessionError } = await supabase.from('date_sessions')
      .select('id,status,selected_date_id').eq('couple_id', coupleId)
      .in('status', ['confirmed', 'in_progress', 'completed']).order('updated_at', { ascending: false }).limit(1)
    if (sessionError) throw sessionError
    const current = sessions?.[0]
    if (!current?.selected_date_id) {
      setSession(null); setExperience(null); setProgress(null); setFinishers([]); setFavorites([])
      return
    }
    if (current.status === 'confirmed') {
      const { error: startError } = await supabase.rpc('start_date_experience', { p_session_id: current.id })
      if (startError) throw startError
      current.status = 'in_progress'
    }
    const [dateResult, progressResult, finishResult, favoriteResult] = await Promise.all([
      supabase.from('date_catalog').select('id,title,category,description,objective,duration_minutes,energy,setting,materials,preparation,steps,prompts,low_energy_alternative,accessibility,consent,enjoyment_tips').eq('id', current.selected_date_id).single(),
      supabase.from('date_experience_progress').select('session_id,couple_id,turn_user_id,question_level,question_index,completed_steps,skipped_steps').eq('session_id', current.id).single(),
      supabase.from('date_experience_confirmations').select('user_id').eq('session_id', current.id),
      supabase.from('date_prompt_favorites').select('prompt_key').eq('session_id', current.id).eq('user_id', userId),
    ])
    for (const result of [dateResult, progressResult, finishResult, favoriteResult]) if (result.error) throw result.error
    setSession(current)
    setExperience(dateResult.data)
    setProgress(progressResult.data as Progress | null)
    setFinishers((finishResult.data ?? []).map((item) => item.user_id))
    setFavorites((favoriteResult.data ?? []).map((item) => item.prompt_key))
  }, [coupleId, userId])

  useEffect(() => {
    let mounted = true
    const load = async () => {
      try { await refresh() } catch (cause) { if (mounted) setError(planningErrorMessage(cause)) }
      finally { if (mounted) setLoading(false) }
    }
    void load()
    const timer = window.setInterval(() => { void refresh().catch((cause) => setError(planningErrorMessage(cause))) }, 5000)
    const channel = supabase?.channel(`experience-${coupleId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'date_experience_progress', filter: `couple_id=eq.${coupleId}` }, () => { void refresh().catch((cause) => setError(planningErrorMessage(cause))) })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'date_experience_confirmations' }, () => { void refresh().catch((cause) => setError(planningErrorMessage(cause))) })
      .subscribe()
    return () => { mounted = false; window.clearInterval(timer); if (channel) void supabase?.removeChannel(channel) }
  }, [coupleId, refresh])

  const steps = useMemo(() => experience ? strings(experience.steps) : [], [experience])
  const prompts = useMemo<Prompt[]>(() => {
    if (!experience || !progress) return []
    if (progress.question_level !== 'actividad') return sharedQuestions[progress.question_level]
    return strings(experience.prompts).map((text, index) => ({ id: `activity:${experience.id}:${index}`, text }))
  }, [experience, progress])
  const challenge = experience ? categoryChallenges[experience.category] : undefined
  const activityCount = steps.length + (challenge ? 1 : 0)
  const completed = progress?.completed_steps ?? []
  const skipped = progress?.skipped_steps ?? []
  const nextStep = Array.from({ length: activityCount }, (_, index) => index).find((index) => !completed.includes(index) && !skipped.includes(index))
  const activePrompt = prompts.length ? prompts[progress!.question_index % prompts.length] : undefined
  const promptKey = activePrompt?.id.startsWith('activity:') ? activePrompt.id : activePrompt ? `bank:${progress?.question_level}:${activePrompt.id}` : ''
  const isFavorite = !!promptKey && favorites.includes(promptKey)
  const isFinisher = finishers.includes(userId)
  const partnerFinished = finishers.some((id) => id !== userId)

  async function act(request: () => Promise<unknown>, success?: string) {
    setBusy(true); setError(''); setNotice('')
    try { await request(); if (success) setNotice(success); await refresh() }
    catch (cause) { setError(planningErrorMessage(cause)) }
    finally { setBusy(false) }
  }

  function chooseLevel(level: Level) {
    if (!session || !supabase || !progress) return
    const nextIndex = 0
    void act(async () => {
      const result = await supabase!.rpc('set_date_experience_question', { p_session_id: session.id, p_level: level, p_index: nextIndex })
      if (result.error) throw result.error
    })
  }

  function moveQuestion() {
    if (!session || !supabase || !progress || !prompts.length) return
    const nextIndex = (progress.question_index + 1) % prompts.length
    void act(async () => {
      const result = await supabase!.rpc('set_date_experience_question', { p_session_id: session.id, p_level: progress.question_level, p_index: nextIndex })
      if (result.error) throw result.error
    })
  }

  function setFavorite() {
    if (!supabase || !session || !promptKey) return
    void act(async () => {
      const result = isFavorite
        ? await supabase!.from('date_prompt_favorites').delete().eq('session_id', session.id).eq('user_id', userId).eq('prompt_key', promptKey)
        : await supabase!.from('date_prompt_favorites').insert({ session_id: session.id, user_id: userId, prompt_key: promptKey })
      if (result.error) throw result.error
    })
  }

  if (loading) return <main className="center-page"><LoaderCircle className="spin loading-icon" size={26} /><p className="muted">Abriendo nuestra cita…</p></main>
  if (!session || !experience || !progress) return <div className="page-wrap experience-page"><p className="eyebrow">MODO CITA</p><h1>Una experiencia para compartir.</h1><p className="muted">Cuando los dos confirmemos una cita, aquí podremos vivirla a nuestro ritmo.</p><Link className="button primary" to="/planear">Volver a planear <ArrowRight size={16}/></Link>{error && <p className="form-error" role="alert">{error}</p>}</div>

  return <div className="page-wrap experience-page">
    <Link className="experience-back" to="/planear"><ArrowLeft size={16}/> Volver a la cita</Link>
    <header className="experience-heading"><p className="eyebrow">MODO CITA · {session.status === 'completed' ? 'CITA VIVIDA' : 'A NUESTRO PROPIO RITMO'}</p><h1>{experience.title}</h1><p className="muted">{experience.description}</p><div className="date-meta"><span><Clock3 size={14}/>{experience.duration_minutes} min aprox.</span><span>{experience.energy} energía</span><span>{experience.setting}</span></div></header>
    <section className="experience-panel"><p className="eyebrow">PARA EMPEZAR</p><h2>Preparación</h2><p>{experience.preparation}</p><h3>Materiales</h3>{strings(experience.materials).length ? <ul>{strings(experience.materials).map((material) => <li key={material}>{material}</li>)}</ul> : <p className="muted">No necesitamos materiales especiales.</p>}</section>
    {session.status !== 'completed' && <>
      <section className="experience-panel"><div className="experience-section-title"><div><p className="eyebrow">PASOS Y RETOS</p><h2>Hagamos espacio para disfrutarlo.</h2></div><span className="experience-count">{completed.length + skipped.length}/{activityCount}</span></div><p className="muted">El progreso es opcional. Podemos cambiar el orden, adaptar una idea o saltarla.</p>
        <ol className="experience-steps">{steps.map((step, index) => <li key={`${index}-${step}`} className={completed.includes(index) ? 'done' : skipped.includes(index) ? 'skipped' : ''}><span>{completed.includes(index) ? <Check size={16}/> : index + 1}</span><p>{step}</p></li>)}</ol>
        {challenge && <article className={`experience-challenge ${(completed.includes(steps.length) || skipped.includes(steps.length)) ? 'done' : ''}`}><p className="eyebrow">RETO COOPERATIVO · OPCIONAL</p><h3>{challenge.title}</h3><p>{challenge.description}</p></article>}
        {nextStep !== undefined ? <div className="experience-actions"><button className="button secondary" disabled={busy} onClick={() => void act(async () => { const result = await supabase!.rpc('update_date_experience_step', { p_session_id: session.id, p_step: nextStep, p_action: 'skip' }); if (result.error) throw result.error })}><SkipForward size={16}/> Saltar actividad</button><button className="button primary" disabled={busy} onClick={() => void act(async () => { const result = await supabase!.rpc('update_date_experience_step', { p_session_id: session.id, p_step: nextStep, p_action: 'complete' }); if (result.error) throw result.error })}>Marcar como lista <Check size={16}/></button></div> : <p className="form-success">Ya recorrimos las actividades que elegimos.</p>}
      </section>
      <section className="experience-panel question-panel"><p className="eyebrow">CONVERSACIÓN SIN PRISA</p><h2>Elijamos de qué nos gustaría conversar.</h2><p className="muted">Lo que respondamos no se guarda. Podemos pasar, cambiar de tema o pausar cuando queramos.</p><div className="question-levels" role="tablist" aria-label="Niveles de preguntas">{levels.map(({ id, label }) => <button key={id} role="tab" aria-selected={progress.question_level === id} className={progress.question_level === id ? 'selected' : ''} disabled={busy} onClick={() => chooseLevel(id)}>{label}</button>)}</div>
        {activePrompt && <article className="question-card"><span className="turn-label">{progress.turn_user_id === userId ? 'Tu turno para responder' : 'Turno de la otra persona'}</span><p>{activePrompt.text}</p><button className="question-favorite" aria-label={isFavorite ? 'Quitar pregunta de favoritas' : 'Guardar pregunta favorita'} aria-pressed={isFavorite} disabled={busy} onClick={setFavorite}><Heart size={18} fill={isFavorite ? 'currentColor' : 'none'}/></button><div className="experience-actions"><button className="button secondary" disabled={busy} onClick={moveQuestion}><SkipForward size={16}/> Saltar pregunta</button><button className="button primary" disabled={busy || progress.turn_user_id !== userId} onClick={() => void act(async () => { const result = await supabase!.rpc('advance_date_experience_turn', { p_session_id: session.id }); if (result.error) throw result.error })}>Siguiente turno <ArrowRight size={16}/></button></div></article>}
        <p className="experience-favorite-note"><Bookmark size={14}/> Tus preguntas favoritas solo aparecen en tu cuenta.</p>
      </section>
      <details className="experience-panel quiet-panel"><summary>Una alternativa más tranquila</summary><p>{experience.low_energy_alternative}</p></details>
      <section className="experience-finish"><p className="muted">Al terminar, cada quien confirma desde su cuenta. La cita quedará como vivida cuando los dos estemos de acuerdo.</p><button className="button primary" disabled={busy || isFinisher} onClick={() => void act(async () => { const result = await supabase!.rpc('finish_date_experience', { p_session_id: session.id }); if (result.error) throw result.error })}>{isFinisher ? partnerFinished ? 'Confirmada por los dos' : 'Tu confirmación quedó guardada' : 'Finalizar experiencia'}</button></section>
    </>}
    {session.status === 'completed' && <section className="experience-panel experience-done"><Check size={22}/><h2>Gracias por esta cita.</h2><p>Ya la guardamos como una cita que vivimos los dos.</p></section>}
    {finishers.length > 0 && session.status !== 'completed' && <p className="experience-finish-status" role="status">{isFinisher ? 'Tu confirmación quedó guardada. Falta la de la otra persona.' : 'La otra persona ya confirmó que terminamos. Ahora puedes confirmar desde tu cuenta.'}</p>}
    {error && <p className="form-error" role="alert">{error}</p>}{notice && <p className="form-success" role="status">{notice}</p>}
    {busy && <span className="experience-saving" role="status"><LoaderCircle className="spin" size={15}/> Guardando en nuestro espacio…</span>}
    {session.status === 'completed' && <Link className="button secondary" to="/">Volver al inicio <ArrowRight size={16}/></Link>}
    <p className="experience-tip">{experience.enjoyment_tips}</p>
  </div>
}
