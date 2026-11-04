import { ArrowRight, BookHeart, Check, ChevronRight, Compass, Copy, Flower2, Heart, House, LoaderCircle, LogOut, Search, ShieldCheck, Sparkles, UsersRound, X } from 'lucide-react'
import { lazy, Suspense, useEffect, useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import { Link, NavLink, Route, Routes, useLocation } from 'react-router-dom'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './lib/supabase'
import { filterDates } from './lib/filterDates.mjs'

const categories = [
  { id: 'conexión-y-conversación', label: 'Conexión y conversación', count: 15 },
  { id: 'aventuras-y-diversión', label: 'Aventuras y diversión', count: 20 },
  { id: 'complicidad-y-equipo', label: 'Complicidad y trabajo en equipo', count: 20 },
  { id: 'romance-y-detalles', label: 'Romance y pequeños detalles', count: 15 },
  { id: 'vida-cotidiana', label: 'La vida cotidiana y real', count: 15 },
  { id: 'conversaciones-importantes', label: 'Conversaciones que importan', count: 15 },
]

const AnimatedRoute = lazy(() => import('./components/AnimatedRoute'))
const DatePlanningPage = lazy(() => import('./components/DatePlanningPage'))
const DateExperiencePage = lazy(() => import('./components/DateExperiencePage'))
const MemoriesPage = lazy(() => import('./components/MemoriesPage'))

type DateItem = { id: string; title: string; category: string; description: string; objective: string; duration_minutes: number; energy: string; setting: string; materials: string[]; preparation: string; steps: string[]; prompts: string[]; low_energy_alternative: string; accessibility: string[]; consent: string[]; enjoyment_tips: string }
type Membership = { couple_id: string; role: string }

export default function App() {
  const [session, setSession] = useState<Session | null>(null)
  const [authReady, setAuthReady] = useState(false)
  const [membership, setMembership] = useState<Membership | null>(null)
  const [groupReady, setGroupReady] = useState(false)
  const [groupError, setGroupError] = useState('')
  const location = useLocation()

  useEffect(() => {
    if (!supabase) return
    supabase!.auth.getSession().then(({ data }) => { setSession(data.session); setAuthReady(true) })
    const { data: { subscription } } = supabase!.auth.onAuthStateChange((_event, next) => { setSession(next); setAuthReady(true) })
    return () => subscription.unsubscribe()
  }, [])

  useEffect(() => {
    let active = true
    if (!supabase || !session?.user) { setMembership(null); setGroupError(''); setGroupReady(true); return }
    setGroupReady(false)
    supabase!.from('couple_members').select('couple_id, role').eq('user_id', session.user.id).maybeSingle()
      .then(({ data, error }) => { if (active) { setMembership(data); setGroupError(error?.message ?? ''); setGroupReady(true) } })
    return () => { active = false }
  }, [session])

  if (!supabase) return <SetupScreen />
  if (!authReady || (session && !groupReady)) return <LoadingScreen />
  if (session && groupError) return <ConnectionError message={groupError} />
  if (!session) return <AuthScreen />
  if (!membership) return <PairingScreen email={session.user.email ?? ''} onSignOut={() => supabase!.auth.signOut()} />

  return <AppShell email={session.user.email ?? ''} userId={session.user.id} membership={membership} locationKey={location.key} onSignOut={() => supabase!.auth.signOut()} />
}

function SetupScreen() {
  return <main className="center-page"><div className="setup-card"><BrandMark /><p className="eyebrow">Una pequeña invitación</p><h1>Todo comienza<br />con un espacio para dos.</h1><p className="muted">Conecta las variables de Supabase para habilitar el acceso privado.</p><ol className="setup-steps"><li>Copia <code>.env.example</code> como <code>.env.local</code>.</li><li>Agrega la URL y la clave publicable de tu proyecto.</li><li>Aplica las migraciones en <code>supabase/migrations</code>.</li></ol><p className="privacy-note"><ShieldCheck size={17} /> La clave de servicio nunca se usa en el navegador.</p></div></main>
}

function AuthScreen() {
  const [mode, setMode] = useState<'login' | 'signup'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError(''); setMessage('')
    if (!supabase) return
    const result = mode === 'login'
      ? await supabase.auth.signInWithPassword({ email: email.trim(), password })
      : await supabase.auth.signUp({ email: email.trim(), password })
    if (result.error) setError(result.error.message)
    else if (mode === 'signup' && !result.data.session) setMessage('Revisa tu correo para confirmar la cuenta y después inicia sesión.')
    setBusy(false)
  }

  return <main className="center-page"><section className="auth-card"><BrandMark /><p className="eyebrow">100 veces tú y yo</p><h1>{mode === 'login' ? 'Qué bueno verte.' : 'Empecemos por aquí.'}</h1><p className="muted">Un espacio privado para descubrirse, sin prisas y a su manera.</p>
    <form onSubmit={submit} className="form-stack"><label>Correo electrónico<input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></label><label>Contraseña<input type="password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} minLength={8} required value={password} onChange={(e) => setPassword(e.target.value)} /></label>
      {error && <p className="form-error" role="alert">{error}</p>}{message && <p className="form-success" role="status">{message}</p>}<button className="button primary full" disabled={busy}>{busy ? <LoaderCircle className="spin" size={18} /> : null}{mode === 'login' ? 'Iniciar sesión' : 'Crear cuenta'}<ArrowRight size={17} /></button></form>
    <button className="text-button auth-toggle" onClick={() => { setMode(mode === 'login' ? 'signup' : 'login'); setError(''); setMessage('') }}>{mode === 'login' ? '¿Primera vez por aquí? Crear una cuenta' : 'Ya tengo una cuenta'}</button><p className="privacy-note"><ShieldCheck size={16} /> Tus recuerdos empiezan siendo solo tuyos.</p></section></main>
}

function PairingScreen({ email, onSignOut }: { email: string; onSignOut: () => void }) {
  const [invite, setInvite] = useState('')
  const [createdCode, setCreatedCode] = useState('')
  const [spaceCreated, setSpaceCreated] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  async function createSpace() { setBusy(true); setError(''); const { error: createError } = await supabase!.rpc('create_couple'); if (createError) setError(createError.message); else setSpaceCreated(true); setBusy(false) }
  async function createInvite() { setBusy(true); setError(''); const { data, error: inviteError } = await supabase!.rpc('create_couple_invite'); if (inviteError) setError(inviteError.message); else setCreatedCode(data as string); setBusy(false) }
  async function acceptInvite(event: FormEvent) { event.preventDefault(); setBusy(true); setError(''); setNotice(''); const { error: e } = await supabase!.rpc('accept_couple_invite', { p_token: invite.trim() }); if (e) setError(e.message); else { setNotice('Ya formas parte de un espacio compartido.'); window.location.reload() } setBusy(false) }
  async function copyCode() { await navigator.clipboard.writeText(createdCode); setNotice('Invitación copiada. Compártela solo con la otra persona.') }

  return <main className="center-page"><section className="pairing-card"><BrandMark /><p className="eyebrow">Hola, {email}</p><h1>{spaceCreated ? 'Invita a la otra persona.' : 'Un espacio, solo para ustedes.'}</h1><p className="muted">{spaceCreated ? 'Este código solo se puede usar una vez y vence en siete días.' : 'Crea un espacio compartido o acepta una invitación de uso único. Nadie más puede sumarse.'}</p>
    {!spaceCreated ? <><button className="button primary full" onClick={createSpace} disabled={busy}><UsersRound size={18} /> Crear nuestro espacio <ArrowRight size={17} /></button><div className="divider"><span>o ya tienes una invitación</span></div><form className="form-stack" onSubmit={acceptInvite}><label>Código de invitación<input value={invite} onChange={(e) => setInvite(e.target.value)} placeholder="Pega el código aquí" required /></label><button className="button secondary full" disabled={busy}>Vincular cuenta <ChevronRight size={17} /></button></form></> : !createdCode ? <button className="button primary full" onClick={createInvite} disabled={busy}><ShieldCheck size={18} /> Crear invitación segura <ArrowRight size={17} /></button> : null}
    {createdCode && <><div className="invite-box"><p>Invitación de un solo uso · vence en 7 días</p><div><code>{createdCode}</code><button aria-label="Copiar invitación" onClick={copyCode}><Copy size={17} /></button></div></div><button className="button secondary full" onClick={() => window.location.reload()}>Continuar a nuestro espacio</button></>}{error && <p className="form-error" role="alert">{error}</p>}{notice && <p className="form-success" role="status">{notice}</p>}<button className="text-button auth-toggle" onClick={onSignOut}>Cerrar sesión</button></section></main>
}

function AppShell({ email, userId, membership, locationKey, onSignOut }: { email: string; userId: string; membership: Membership; locationKey: string; onSignOut: () => void }) {
  return <div className="app-layout"><aside className="side-rail"><BrandMark /><div className="brand-copy"><strong>100 veces<br />tú y yo</strong><span>Sin prisas, a nuestra manera.</span></div><Navigation /><div className="side-bottom"><span className="account-dot">{email.slice(0, 1).toUpperCase()}</span><div className="account-copy"><strong>Tu espacio privado</strong><span>Dos personas, nada más</span></div><button className="icon-button" title="Cerrar sesión" aria-label="Cerrar sesión" onClick={onSignOut}><LogOut size={17} /></button></div></aside>
    <main className="main-content"><header className="mobile-header"><BrandMark /><span>100 veces tú y yo</span><button className="icon-button" title="Cerrar sesión" aria-label="Cerrar sesión" onClick={onSignOut}><LogOut size={17} /></button></header><Suspense fallback={<LoadingScreen />}><AnimatedRoute locationKey={locationKey}><Routes><Route path="/" element={<HomePage email={email} role={membership.role} coupleId={membership.couple_id} />} /><Route path="/citas" element={<CatalogPage coupleId={membership.couple_id} />} /><Route path="/planear" element={<DatePlanningPage coupleId={membership.couple_id} userId={userId} />} /><Route path="/cita" element={<DateExperiencePage coupleId={membership.couple_id} userId={userId} />} /><Route path="/recuerdos" element={<MemoriesPage coupleId={membership.couple_id} userId={userId} />} /><Route path="/nosotros" element={<ComingSoon title="Nuestro espacio" copy="Las preferencias y notas privadas tendrán un lugar seguro, separado de lo que decidan compartir." icon={<Heart />} />} /></Routes></AnimatedRoute></Suspense><div className="mobile-nav"><Navigation /></div></main></div>
}

function Navigation() {
  const items = [{ to: '/', label: 'Inicio', Icon: House }, { to: '/citas', label: 'Explorar citas', Icon: Compass }, { to: '/recuerdos', label: 'Recuerdos', Icon: BookHeart }, { to: '/nosotros', label: 'Nosotros', Icon: Heart }]
  return <nav className="nav-list" aria-label="Navegación principal">{items.map(({ to, label, Icon }) => <NavLink key={to} to={to} end={to === '/'} className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}><Icon size={19} strokeWidth={1.7} /><span>{label}</span></NavLink>)}</nav>
}

function HomePage({ email, role, coupleId }: { email: string; role: string; coupleId: string }) {
  return <div className="page-wrap"><div className="page-heading"><div><p className="eyebrow">Un lugar para volver a encontrarse</p><h1>Hola, qué bueno<br className="mobile-break" /> tenerte por aquí.</h1><p className="muted">Este espacio no tiene prisa. Ustedes deciden cómo empieza.</p></div><LilyArt /></div>
    <section className="welcome-panel"><div className="welcome-copy"><span className="tiny-label"><Sparkles size={14} /> A SU PROPIO RITMO</span><h2>Lo bonito está<br />en ir descubriendo.</h2><p>Una buena conversación, algo nuevo por probar, o simplemente compartir el momento.</p><Link to="/planear" className="button light">Preparar nuestra próxima cita <ArrowRight size={17} /></Link></div><div className="welcome-orbit"><div className="orbit-ring" /><div className="orbit-core"><Heart size={33} strokeWidth={1.3} /></div><span className="orbit-dot dot-one" /><span className="orbit-dot dot-two" /></div></section>
    <div className="section-title-row"><div><p className="eyebrow">EL COMIENZO</p><h2>Su espacio compartido</h2></div><span className="private-chip"><ShieldCheck size={14} /> Privado</span></div>
    <div className="home-grid"><NextDateCard coupleId={coupleId} /><UniqueProgress coupleId={coupleId} /><article className="info-card"><div className="card-icon rose"><Flower2 size={20} /></div><p className="card-kicker">100 EXPERIENCIAS</p><h3>El catálogo les espera</h3><p className="muted small">Seis maneras distintas de compartir tiempo, sin convertirlo en una obligación.</p><Link to="/citas" className="inline-link">Ver catálogo <ChevronRight size={16} /></Link></article><article className="info-card soft-sage"><div className="card-icon sage"><UsersRound size={20} /></div><p className="card-kicker">ESPACIO SEGURO</p><h3>Vinculación confirmada</h3><p className="muted small">Este espacio tiene dos participantes y una invitación segura de un solo uso.</p><span className="status-line"><Check size={15} /> {role === 'owner' ? 'Creado por ti' : 'Te uniste a este espacio'}</span></article></div>
    <footer className="page-footer">Una invitación, nunca una obligación. <span>·</span> Sesión de {email}</footer></div>
}

function NextDateCard({ coupleId }: { coupleId: string }) {
  const [title, setTitle] = useState('Aún no hay una cita confirmada')
  const [modeAvailable, setModeAvailable] = useState(false)
  useEffect(() => {
    let active = true
    async function load() {
      const { data } = await supabase!.from('date_sessions').select('id,selected_date_id,status').eq('couple_id', coupleId).in('status', ['confirmed','in_progress']).order('updated_at', { ascending: false }).limit(1).maybeSingle()
      if (!active) return
      setModeAvailable(!!data?.selected_date_id)
      if (!data?.selected_date_id) return
      const result = await supabase!.from('date_catalog').select('title').eq('id', data.selected_date_id).single()
      if (active && result.data) setTitle(result.data.title)
    }
    void load()
    return () => { active = false }
  }, [coupleId])
  return <article className="info-card soft-sage"><div className="card-icon sage"><Check size={20} /></div><p className="card-kicker">PRÓXIMA CITA</p><h3>{title}</h3><p className="muted small">Su siguiente plan aparece aquí cuando ambos lo confirmen.</p><Link to={modeAvailable ? '/cita' : '/planear'} className="inline-link">{modeAvailable ? 'Continuar modo cita' : 'Planear juntos'} <ChevronRight size={16} /></Link></article>
}

function UniqueProgress({ coupleId }: { coupleId: string }) {
  const [count, setCount] = useState<number | null>(null)
  useEffect(() => {
    let active = true
    supabase!.from('date_sessions').select('selected_date_id').eq('couple_id', coupleId).eq('status', 'completed')
      .then(({ data, error }) => { if (active && !error) setCount(new Set((data ?? []).map((item) => item.selected_date_id).filter(Boolean)).size) })
    return () => { active = false }
  }, [coupleId])
  return <article className="info-card progress-card"><div className="card-icon rose"><BookHeart size={20} /></div><p className="card-kicker">EXPERIENCIAS VIVIDAS</p><h3>{count === null ? '—' : `${count} de 100`}</h3><div className="progress-track" aria-label={`${count ?? 0} de 100 experiencias vividas`}><span style={{ width: `${Math.min(count ?? 0, 100)}%` }} /></div><Link to="/recuerdos" className="inline-link">Ver línea del tiempo <ChevronRight size={16} /></Link></article>
}

function CatalogPage({ coupleId }: { coupleId: string }) {
  const [dates, setDates] = useState<DateItem[]>([])
  const [favorites, setFavorites] = useState<string[]>([])
  const [selectedDate, setSelectedDate] = useState<DateItem | null>(null)
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('todas')
  const [energy, setEnergy] = useState('todas')
  const [setting, setSetting] = useState('todas')
  const [duration, setDuration] = useState('todas')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [favoriteError, setFavoriteError] = useState('')

  useEffect(() => {
    let active = true
    async function load() {
      const [{ data, error: catalogError }, { data: favoriteData, error: favoriteError }] = await Promise.all([
        supabase!.from('date_catalog').select('id,title,category,description,objective,duration_minutes,energy,setting,materials,preparation,steps,prompts,low_energy_alternative,accessibility,consent,enjoyment_tips').eq('active', true).order('sort_order'),
        supabase!.from('favorites').select('date_id'),
      ])
      if (!active) return
      if (catalogError) setError(catalogError.message)
      else {
        setDates((data ?? []) as DateItem[])
        if (favoriteError) setFavoriteError(favoriteError.message)
        else setFavorites((favoriteData ?? []).map((item) => item.date_id))
      }
      setLoading(false)
    }
    void load()
    return () => { active = false }
  }, [coupleId])
  const filtered = filterDates(dates, { query, category, energy, setting, duration })

  async function toggleFavorite(id: string) {
    const userId = (await supabase!.auth.getUser()).data.user?.id
    if (!userId) { setFavoriteError('La sesión expiró. Vuelve a iniciar sesión.'); return }
    if (favorites.includes(id)) {
      const { error: e } = await supabase!.from('favorites').delete().eq('date_id', id)
      if (e) setFavoriteError(e.message)
      else { setFavoriteError(''); setFavorites((current) => current.filter((item) => item !== id)) }
    } else {
      const { error: e } = await supabase!.from('favorites').insert({ date_id: id, couple_id: coupleId, user_id: userId })
      if (e) setFavoriteError(e.message)
      else { setFavoriteError(''); setFavorites((current) => [...current, id]) }
    }
  }

  return <div className="page-wrap"><div className="catalog-heading"><div><p className="eyebrow">PEQUEÑAS IDEAS, GRANDES MOMENTOS</p><h1>Explorar experiencias</h1><p className="muted">Seis caminos para compartir tiempo. Pueden elegir, cambiar de opinión o dejarlo para otro día.</p></div><div className="catalog-count"><span>{dates.length}</span><small>de 100</small></div></div>
    <div className="search-field"><Search size={18} /><input aria-label="Buscar experiencias" placeholder="Buscar por nombre o momento…" value={query} onChange={(e) => setQuery(e.target.value)} /><kbd>/</kbd></div>
    <div className="category-scroll" aria-label="Filtrar por categoría"><button className={category === 'todas' ? 'category-pill selected' : 'category-pill'} onClick={() => setCategory('todas')}>Todas <span>{dates.length}</span></button>{categories.map((item) => <button key={item.id} className={category === item.id ? 'category-pill selected' : 'category-pill'} onClick={() => setCategory(item.id)}>{item.label}<span>{dates.filter((date) => date.category === item.id).length}</span></button>)}</div>
    <div className="catalog-filters"><label>Duración<select value={duration} onChange={(e) => setDuration(e.target.value)}><option value="todas">Cualquiera</option><option value="corta">Hasta 1 hora</option><option value="media">1 a 2 horas</option><option value="larga">Más de 2 horas</option></select></label><label>Energía<select value={energy} onChange={(e) => setEnergy(e.target.value)}><option value="todas">Cualquiera</option><option value="baja">Tranquila</option><option value="media">Media</option><option value="alta">Activa</option></select></label><label>Ambiente<select value={setting} onChange={(e) => setSetting(e.target.value)}><option value="todas">Cualquiera</option><option value="interior">Interior</option><option value="exterior">Exterior</option><option value="indistinto">Indistinto</option></select></label></div>
    {favoriteError && <p className="form-error" role="alert">{favoriteError}</p>}
    {loading ? <div className="catalog-empty"><LoaderCircle className="spin" size={23} /><p>Cargando el catálogo…</p></div> : error ? <div className="catalog-empty"><p className="form-error">No se pudo cargar el catálogo. {error}</p></div> : filtered.length ? <div className="date-grid">{filtered.map((date) => <article className="date-card" key={date.id}><button className={`favorite-button ${favorites.includes(date.id) ? 'is-favorite' : ''}`} aria-label={favorites.includes(date.id) ? `Quitar ${date.title} de favoritos` : `Guardar ${date.title} en favoritos`} aria-pressed={favorites.includes(date.id)} onClick={() => void toggleFavorite(date.id)}><Heart size={18} fill={favorites.includes(date.id) ? 'currentColor' : 'none'} /></button><span className="date-category">{categories.find((item) => item.id === date.category)?.label ?? date.category}</span><h2>{date.title}</h2><p>{date.description}</p><div className="date-meta"><span>{date.duration_minutes} min</span><span>{date.energy}</span><span>{date.setting}</span></div><button className="date-open-button" onClick={() => setSelectedDate(date)}>Ver experiencia <ChevronRight size={15} /></button></article>)}</div> : <div className="catalog-empty"><div className="empty-flower"><Flower2 size={25} /></div><h2>{query || category !== 'todas' || energy !== 'todas' || setting !== 'todas' || duration !== 'todas' ? 'Todavía no hay coincidencias' : 'El catálogo aún no está cargado'}</h2><p>{dates.length ? 'Prueba con otra palabra o elige filtros distintos.' : 'Verifica las migraciones pendientes con Supabase CLI; la migración 003 carga las 100 experiencias.'}</p>{(query || category !== 'todas' || energy !== 'todas' || setting !== 'todas' || duration !== 'todas') && <button className="text-button" onClick={() => { setQuery(''); setCategory('todas'); setEnergy('todas'); setSetting('todas'); setDuration('todas') }}>Limpiar filtros</button>}</div>}
    {selectedDate && <DateDetail date={selectedDate} onClose={() => setSelectedDate(null)} />}
  </div>
}

function DateDetail({ date, onClose }: { date: DateItem; onClose: () => void }) {
  useEffect(() => {
    function closeOnEscape(event: KeyboardEvent) { if (event.key === 'Escape') onClose() }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [onClose])
  const categoryLabel = categories.find((item) => item.id === date.category)?.label ?? date.category
  return <div className="dialog-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
    <section className="date-dialog" role="dialog" aria-modal="true" aria-labelledby="date-dialog-title">
      <button className="dialog-close" aria-label="Cerrar detalle" onClick={onClose}><X size={19} /></button>
      <p className="eyebrow">{categoryLabel}</p><h2 id="date-dialog-title">{date.title}</h2><p className="muted">{date.description}</p>
      <div className="date-meta"><span>{date.duration_minutes} min</span><span>{date.energy}</span><span>{date.setting}</span></div>
      <h3>Para qué compartirla</h3><p>{date.objective}</p><h3>Preparación</h3><p>{date.preparation}</p>
      {date.materials.length > 0 && <><h3>Materiales</h3><ul>{date.materials.map((item) => <li key={item}>{item}</li>)}</ul></>}
      <h3>Guía</h3><ol>{date.steps.map((item, index) => <li key={`${index}-${item}`}>{item}</li>)}</ol>
      <h3>Preguntas y dinámicas</h3><ol>{date.prompts.map((item, index) => <li key={`${index}-${item}`}>{item}</li>)}</ol>
      <h3>Si hoy hay poca energía</h3><p>{date.low_energy_alternative}</p>
      <h3>Para disfrutarla</h3><p>{date.enjoyment_tips}</p>
      {date.accessibility.length > 0 && <p className="consent-copy"><strong>Accesibilidad:</strong> {date.accessibility.join(' · ')}</p>}
      {date.consent.length > 0 && <p className="consent-copy"><strong>Acuerdos:</strong> {date.consent.join(' · ')}</p>}
    </section>
  </div>
}

function ComingSoon({ title, copy, icon }: { title: string; copy: string; icon: ReactNode }) { return <div className="page-wrap"><p className="eyebrow">UN ESPACIO HECHO A SU MEDIDA</p><h1>{title}</h1><div className="coming-card"><span className="card-icon rose">{icon}</span><h2>Todo a su tiempo.</h2><p className="muted">{copy}</p><span className="status-line">La base privada ya está preparada para esta etapa.</span></div></div> }
function BrandMark() { return <div className="brand-mark" aria-hidden="true"><Flower2 size={23} strokeWidth={1.4} /></div> }
function LilyArt() { return <svg className="lily-art" viewBox="0 0 120 120" fill="none" aria-hidden="true"><path d="M57 111C60 84 61 53 57 18M59 77c-17-18-29-18-39-14 10 18 21 24 39 22m1 8c17-20 30-19 41-14-9 18-21 25-41 22" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/><path d="M57 31C43 20 47 8 57 8c7 0 8 12 3 23 9-17 20-19 23-12 4 8-4 17-23 21 19-4 29 2 26 10-4 9-17 5-27-6 9 14 6 26-3 26-9 0-12-12-5-27-9 14-21 16-25 8-3-8 7-17 25-19-17 1-25-7-19-14 6-7 17-2 24 13z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"/></svg> }
function LoadingScreen() { return <main className="center-page"><LoaderCircle className="spin loading-icon" size={26} /><p className="muted">Preparando su espacio…</p></main> }
function ConnectionError({ message }: { message: string }) { return <main className="center-page"><section className="setup-card"><BrandMark /><p className="eyebrow">No se pudo sincronizar</p><h1>Intentémoslo otra vez.</h1><p className="muted">No logramos cargar el estado de tu espacio. Tus datos no se modificaron.</p><p className="form-error" role="alert">{message}</p><button className="button primary full" onClick={() => window.location.reload()}>Reintentar</button></section></main> }
