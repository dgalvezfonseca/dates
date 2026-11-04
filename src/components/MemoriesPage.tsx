import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ChangeEvent, FormEvent } from 'react'
import { BookHeart, CalendarDays, Check, ImagePlus, LoaderCircle, LockKeyhole, Music2, Pencil, Plus, Share2, Trash2, X } from 'lucide-react'
import { supabase } from '../lib/supabase'

type SessionRow = { id: string; selected_date_id: string | null; status: string; updated_at: string }
type DateRow = { id: string; title: string; category: string }
type MemoryRow = { id: string; couple_id: string; session_id: string | null; title: string; happened_on: string | null; created_at: string; description: string | null; favorite_part: string | null; song: string | null; updated_at: string }
type Contribution = { id: string; memory_id: string; user_id: string; title: string | null; description: string | null; favorite_part: string | null; song: string | null; is_shared_note_copy: boolean; created_at: string; updated_at: string }
type Photo = { id: string; memory_id: string; uploaded_by: string; object_path: string; mime_type: string; byte_size: number; created_at: string }
type Note = { id: string; user_id: string; couple_id: string; session_id: string | null; title: string; body: string; updated_at: string }
type AlbumData = { sessions: SessionRow[]; dates: DateRow[]; memories: MemoryRow[]; contributions: Contribution[]; photos: Photo[]; notes: Note[] }

const bucket = 'memory-album-private'
const maxPhotoBytes = 3 * 1024 * 1024
const empty: AlbumData = { sessions: [], dates: [], memories: [], contributions: [], photos: [], notes: [] }

export default function MemoriesPage({ coupleId, userId }: { coupleId: string; userId: string }) {
  const [data, setData] = useState<AlbumData>(empty)
  const [photoUrls, setPhotoUrls] = useState<Record<string, string>>({})
  const photoUrlsRef = useRef<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [category, setCategory] = useState('todas')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const [noteTitle, setNoteTitle] = useState('')
  const [noteBody, setNoteBody] = useState('')
  const [noteSession, setNoteSession] = useState('')
  const [editNote, setEditNote] = useState('')
  const [editMemory, setEditMemory] = useState('')
  const [memoryTitle, setMemoryTitle] = useState('')
  const [memoryDate, setMemoryDate] = useState('')
  const [shareTargets, setShareTargets] = useState<Record<string, string>>({})

  const refresh = useCallback(async () => {
    if (!supabase) return
    setError('')
    const [sessionsResult, datesResult, memoriesResult, notesResult] = await Promise.all([
      supabase.from('date_sessions').select('id,selected_date_id,status,updated_at').eq('couple_id', coupleId).eq('status', 'completed'),
      supabase.from('date_catalog').select('id,title,category').eq('active', true),
      supabase.from('date_memories').select('id,couple_id,session_id,title,happened_on,created_at,description,favorite_part,song,updated_at').eq('couple_id', coupleId).order('happened_on', { ascending: false, nullsFirst: false }),
      supabase.from('private_notes').select('id,user_id,couple_id,session_id,title,body,updated_at').eq('couple_id', coupleId).order('updated_at', { ascending: false }),
    ])
    const failed = sessionsResult.error ?? datesResult.error ?? memoriesResult.error ?? notesResult.error
    if (failed) { setError('No se pudo sincronizar el álbum. Intenta de nuevo.'); setLoading(false); return }
    const memories = memoriesResult.data ?? []
    const ids = memories.map((memory) => memory.id)
    const [contributionsResult, photosResult] = ids.length ? await Promise.all([
      supabase.from('date_memory_contributions').select('id,memory_id,user_id,title,description,favorite_part,song,is_shared_note_copy,created_at,updated_at').in('memory_id', ids).order('created_at', { ascending: false }),
      supabase.from('memory_photos').select('id,memory_id,uploaded_by,object_path,mime_type,byte_size,created_at').in('memory_id', ids).order('created_at', { ascending: false }),
    ]) : [{ data: [], error: null }, { data: [], error: null }]
    if (contributionsResult.error || photosResult.error) { setError('No se pudieron cargar todas las aportaciones. Intenta de nuevo.'); setLoading(false); return }
    const next: AlbumData = { sessions: (sessionsResult.data ?? []) as SessionRow[], dates: (datesResult.data ?? []) as DateRow[], memories: memories as MemoryRow[], contributions: (contributionsResult.data ?? []) as Contribution[], photos: (photosResult.data ?? []) as Photo[], notes: (notesResult.data ?? []) as Note[] }
    setData(next)
    setLoading(false)
    const urls = { ...photoUrlsRef.current }
    const currentPhotoIds = new Set(next.photos.map((photo) => photo.id))
    for (const [id, url] of Object.entries(urls)) if (!currentPhotoIds.has(id)) { URL.revokeObjectURL(url); delete urls[id] }
    await Promise.all(next.photos.map(async (photo) => {
      if (urls[photo.id]) return
      const { data: file } = await supabase!.storage.from(bucket).download(photo.object_path)
      if (file) urls[photo.id] = URL.createObjectURL(file)
    }))
    photoUrlsRef.current = urls
    setPhotoUrls(urls)
  }, [coupleId])

  useEffect(() => {
    void refresh()
    const channel = supabase?.channel(`memory-album-${coupleId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'date_memories', filter: `couple_id=eq.${coupleId}` }, () => { void refresh() })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'date_memory_contributions' }, () => { void refresh() })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'memory_photos' }, () => { void refresh() })
      .subscribe()
    const syncTimer = window.setInterval(() => { if (document.visibilityState === 'visible') void refresh() }, 30000)
    const onVisible = () => { if (document.visibilityState === 'visible') void refresh() }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      window.clearInterval(syncTimer)
      document.removeEventListener('visibilitychange', onVisible)
      if (channel) void supabase?.removeChannel(channel)
      Object.values(photoUrlsRef.current).forEach(URL.revokeObjectURL)
      photoUrlsRef.current = {}
    }
  }, [coupleId, refresh])

  const dateById = useMemo(() => new Map(data.dates.map((date) => [date.id, date])), [data.dates])
  const sessionById = useMemo(() => new Map(data.sessions.map((session) => [session.id, session])), [data.sessions])
  const memoriesBySession = useMemo(() => new Set(data.memories.map((memory) => memory.session_id).filter((id): id is string => Boolean(id))), [data.memories])
  const completedCount = new Set(data.sessions.map((session) => session.selected_date_id).filter((id): id is string => Boolean(id))).size
  const categories = [...new Set(data.sessions.map((session) => dateById.get(session.selected_date_id ?? '')?.category).filter((item): item is string => Boolean(item)))].sort()
  const filteredMemories = data.memories.filter((memory) => {
    const session = sessionById.get(memory.session_id ?? '')
    const date = dateById.get(session?.selected_date_id ?? '')
    return (category === 'todas' || date?.category === category) && (!fromDate || Boolean(memory.happened_on && memory.happened_on >= fromDate)) && (!toDate || Boolean(memory.happened_on && memory.happened_on <= toDate))
  })

  async function createMemory(session: SessionRow, form: HTMLFormElement) {
    if (!supabase) return
    const values = new FormData(form)
    const title = String(values.get('title') ?? '').trim()
    const happenedOn = String(values.get('happened_on') ?? '')
    setBusy(session.id); setError(''); setNotice('')
    const { error: createError } = await supabase.rpc('create_date_memory', { p_session_id: session.id, p_title: title, p_happened_on: happenedOn })
    if (createError) setError('La cita aún no aparece completada por ambas personas. Actualiza e inténtalo de nuevo.')
    else { setNotice('El recuerdo ya está en la línea del tiempo.'); await refresh() }
    setBusy('')
  }

  async function updateMemory(memory: MemoryRow, event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!supabase) return
    setBusy(memory.id); setError(''); setNotice('')
    const { error: updateError } = await supabase.rpc('update_date_memory_metadata', { p_memory_id: memory.id, p_title: memoryTitle.trim(), p_happened_on: memoryDate, p_expected_updated_at: memory.updated_at })
    if (updateError) setError('No se pudo actualizar el recuerdo. Puede haber cambiado desde el otro teléfono; actualiza e inténtalo de nuevo.')
    else { setEditMemory(''); setNotice('Recuerdo actualizado.'); await refresh() }
    setBusy('')
  }

  async function saveContribution(memoryId: string, event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!supabase) return
    const form = event.currentTarget
    const values = new FormData(form)
    const entry = { memory_id: memoryId, user_id: userId, title: String(values.get('title') ?? '').trim() || null, description: String(values.get('description') ?? '').trim() || null, favorite_part: String(values.get('favorite_part') ?? '').trim() || null, song: String(values.get('song') ?? '').trim() || null }
    if (!entry.title && !entry.description && !entry.favorite_part && !entry.song) return
    setBusy(memoryId); setError('')
    const { error: saveError } = await supabase.from('date_memory_contributions').insert(entry)
    if (saveError) setError('No se pudo guardar tu aportación. El recuerdo de la otra persona sigue intacto.')
    else { form.reset(); await refresh() }
    setBusy('')
  }

  async function uploadPhoto(memoryId: string, event: ChangeEvent<HTMLInputElement>) {
    if (!supabase) return
    const source = event.target.files?.[0]; event.target.value = ''
    if (!source) return
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(source.type) || source.size > 20 * 1024 * 1024) { setError('Elige una foto JPEG, PNG o WebP de hasta 20 MB.'); return }
    setBusy(memoryId); setError('')
    let path = ''
    try {
      const photo = await compressPhoto(source)
      if (photo.blob.size > maxPhotoBytes) throw new Error('La imagen sigue siendo demasiado grande; prueba con otra foto.')
      const ext = photo.mime === 'image/webp' ? 'webp' : photo.mime === 'image/png' ? 'png' : 'jpg'
      path = `${memoryId}/${userId}/${crypto.randomUUID()}.${ext}`
      const { error: uploadError } = await supabase.storage.from(bucket).upload(path, photo.blob, { contentType: photo.mime, upsert: false, cacheControl: '0' })
      if (uploadError) throw uploadError
      const { error: registerError } = await supabase.rpc('register_memory_photo', { p_memory_id: memoryId, p_object_path: path, p_mime_type: photo.mime, p_byte_size: photo.blob.size })
      if (registerError) {
        const { error: removeError } = await supabase.storage.from(bucket).remove([path])
        throw new Error(removeError ? 'La foto subió, pero no se pudieron registrar sus datos. Reintenta quitarla desde tu cuenta.' : 'No se pudo registrar la foto; el archivo temporal se limpió.')
      }
      setNotice('Foto añadida al recuerdo.'); await refresh()
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'No se pudo subir la foto.') }
    setBusy('')
  }

  async function deletePhoto(photo: Photo) {
    if (!supabase || photo.uploaded_by !== userId) return
    setBusy(photo.id); setError('')
    const { error: storageError } = await supabase.storage.from(bucket).remove([photo.object_path])
    const { error: rowError } = await supabase.rpc('delete_memory_photo', { p_photo_id: photo.id })
    if (rowError) setError(storageError ? 'No se pudo retirar el archivo privado.' : 'El archivo se quitó; falta sincronizar el registro. Intenta actualizar el álbum.')
    else setNotice('Foto eliminada de forma segura.')
    setBusy(''); await refresh()
  }

  async function saveNote(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!supabase) return
    setBusy('note'); setError(''); setNotice('')
    const values = { title: noteTitle.trim(), body: noteBody.trim(), session_id: noteSession || null }
    const result = editNote
      ? await supabase.from('private_notes').update(values).eq('id', editNote)
      : await supabase.from('private_notes').insert({ ...values, couple_id: coupleId, user_id: userId })
    if (result.error) setError('No se pudo guardar la nota privada.')
    else { setNoteTitle(''); setNoteBody(''); setNoteSession(''); setEditNote(''); setNotice('Nota guardada solo para ti.'); await refresh() }
    setBusy('')
  }

  async function deleteNote(note: Note) {
    if (!supabase || note.user_id !== userId) return
    setBusy(note.id); const { error: noteError } = await supabase.from('private_notes').delete().eq('id', note.id)
    if (noteError) setError('No se pudo eliminar la nota privada.'); else await refresh()
    setBusy('')
  }

  async function shareNote(note: Note) {
    if (!supabase) return
    const memoryId = shareTargets[note.id]
    if (!memoryId) { setError('Elige el recuerdo al que quieres copiar esta nota.'); return }
    setBusy(note.id); setError('')
    const { error: shareError } = await supabase.rpc('share_private_note_to_memory', { p_note_id: note.id, p_memory_id: memoryId })
    if (shareError) setError('No se pudo compartir la copia. La nota original sigue siendo privada.')
    else { setNotice('Se añadió una copia al recuerdo; tu nota privada permanece intacta.'); await refresh() }
    setBusy('')
  }

  return <div className="page-wrap memories-page">
    <div className="catalog-heading memories-heading"><div><p className="eyebrow">UN DIARIO PARA DOS</p><h1>Nuestros recuerdos</h1><p className="muted">Cada momento se guarda a su manera y con el cuidado que merece.</p></div><div className="catalog-count"><span>{completedCount}</span><small>de 100 vividas</small></div></div>
    {error && <p className="form-error memory-alert" role="alert">{error}</p>}{notice && <p className="form-success memory-alert" role="status">{notice}</p>}
    {!loading && data.sessions.some((session) => !memoriesBySession.has(session.id)) && <section className="memory-panel"><div className="memory-section-heading"><span className="card-icon rose"><Plus size={19} /></span><div><p className="eyebrow">DOS CONFIRMACIONES RECIBIDAS</p><h2>Guardar una nueva cita</h2></div></div><p className="muted">El recuerdo se habilita después de que ambas personas confirman que vivieron la experiencia.</p><div className="unrecorded-list">{data.sessions.filter((session) => !memoriesBySession.has(session.id)).map((session) => {
      const date = dateById.get(session.selected_date_id ?? '')
      return <form className="unrecorded-card" key={session.id} onSubmit={(event) => { event.preventDefault(); void createMemory(session, event.currentTarget) }}><strong>{date?.title ?? 'Experiencia completada'}</strong><label>Título del recuerdo<input name="title" maxLength={120} defaultValue={date?.title ?? ''} required /></label><label>Fecha de la cita<input name="happened_on" type="date" defaultValue={localToday()} required /></label><button className="button primary" disabled={busy === session.id}>{busy === session.id ? <LoaderCircle className="spin" size={16} /> : <BookHeart size={16} />} Crear recuerdo</button></form>
    })}</div></section>}
    <section className="memory-panel">
      <div className="memory-section-heading"><span className="card-icon sage"><CalendarDays size={19} /></span><div><p className="eyebrow">LÍNEA DEL TIEMPO</p><h2>Momentos compartidos</h2></div></div>
      <div className="memory-filters"><label>Categoría<select value={category} onChange={(event) => setCategory(event.target.value)}><option value="todas">Todas</option>{categories.map((item) => <option key={item} value={item}>{item}</option>)}</select></label><label>Desde<input type="date" value={fromDate} onChange={(event) => setFromDate(event.target.value)} /></label><label>Hasta<input type="date" value={toDate} onChange={(event) => setToDate(event.target.value)} /></label><button className="text-button" onClick={() => { setCategory('todas'); setFromDate(''); setToDate('') }}>Limpiar filtros</button></div>
      {loading ? <div className="memory-empty"><LoaderCircle className="spin" size={22} /> <span>Cargando sus recuerdos…</span></div> : filteredMemories.length === 0 ? <div className="memory-empty"><BookHeart size={25} /><h3>Aquí empieza su historia de recuerdos.</h3><p>Cuando ambos confirmen una experiencia, podrán guardarla aquí.</p></div> : <div className="memory-timeline">{filteredMemories.map((memory) => {
        const session = sessionById.get(memory.session_id ?? '')
        const date = dateById.get(session?.selected_date_id ?? '')
        const photos = data.photos.filter((photo) => photo.memory_id === memory.id)
        const contributions = data.contributions.filter((item) => item.memory_id === memory.id)
        return <article className="memory-card" key={memory.id}><div className="memory-date"><span>{memory.happened_on ? new Date(`${memory.happened_on}T12:00:00`).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' }) : 'Fecha pendiente'}</span><i /></div><div className="memory-card-body"><div className="memory-card-title"><div><p className="date-category">{date?.category ?? 'Experiencia compartida'}</p><h3>{memory.title}</h3><span className="memory-activity">{date?.title ?? 'Cita'}</span></div><button className="memory-edit-button" aria-label={`Editar ${memory.title}`} onClick={() => { setEditMemory(memory.id); setMemoryTitle(memory.title); setMemoryDate(memory.happened_on ?? localToday()) }}><Pencil size={15} /><span>Editar</span></button><span className="memory-private-label"><LockKeyhole size={13} /> Privado</span></div>
          {editMemory === memory.id && <form className="memory-metadata-form" onSubmit={(event) => void updateMemory(memory, event)}><label>Título<input value={memoryTitle} onChange={(event) => setMemoryTitle(event.target.value)} maxLength={120} required /></label><label>Fecha<input type="date" value={memoryDate} onChange={(event) => setMemoryDate(event.target.value)} required /></label><div className="note-actions"><button className="button primary" disabled={busy === memory.id}>{busy === memory.id ? 'Guardando…' : 'Guardar cambios'}</button><button className="button secondary" type="button" onClick={() => setEditMemory('')}><X size={15} /> Cancelar</button></div></form>}
          {photos.length > 0 && <div className="memory-photo-grid">{photos.map((photo) => <figure key={photo.id}><img src={photoUrls[photo.id]} alt="Fotografía del recuerdo compartido" loading="lazy" />{photo.uploaded_by === userId && <button aria-label="Eliminar mi fotografía" onClick={() => void deletePhoto(photo)} disabled={busy === photo.id}><Trash2 size={15} /></button>}</figure>)}</div>}
          {memory.description && <p className="memory-shared-copy">{memory.description}</p>}{memory.favorite_part && <p className="memory-highlight"><Check size={15} /> {memory.favorite_part}</p>}{memory.song && <p className="memory-song"><Music2 size={15} /> {memory.song}</p>}
          {contributions.map((item) => <div className="memory-contribution" key={item.id}><span>{item.user_id === userId ? 'Tu aportación' : 'Aportación de la otra persona'}{item.is_shared_note_copy ? ' · copia compartida' : ''}</span>{item.title && <h4>{item.title}</h4>}{item.description && <p>{item.description}</p>}{item.favorite_part && <p className="memory-highlight"><Check size={14} /> {item.favorite_part}</p>}{item.song && <p className="memory-song"><Music2 size={14} /> {item.song}</p>}<time>{new Date(item.created_at).toLocaleDateString('es-MX')}</time></div>)}
          {photos.length < 6 && <label className="photo-upload"><ImagePlus size={17} /><span>{busy === memory.id ? 'Preparando foto…' : 'Añadir una fotografía'}</span><input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => void uploadPhoto(memory.id, event)} disabled={busy === memory.id} /></label>}
          <details className="contribution-form"><summary>Agregar mi aportación</summary><form onSubmit={(event) => void saveContribution(memory.id, event)}><label>Título opcional<input name="title" maxLength={120} placeholder="Un detalle que quieras recordar" /></label><label>Descripción<textarea name="description" maxLength={2000} rows={3} placeholder="Escribe algo para este recuerdo…" /></label><label>Mi momento favorito<textarea name="favorite_part" maxLength={1000} rows={2} /></label><label>Canción (texto o enlace)<input name="song" maxLength={500} /></label><button className="button secondary" disabled={busy === memory.id}>{busy === memory.id ? 'Guardando…' : 'Guardar mi aportación'}</button></form></details>
        </div></article>
      })}</div>}
    </section>
    <section className="memory-panel private-notes-panel"><div className="memory-section-heading"><span className="card-icon rose"><LockKeyhole size={19} /></span><div><p className="eyebrow">SOLO PARA TI</p><h2>Notas privadas</h2></div></div><p className="muted">Estas notas solo son visibles para tu cuenta. Compartir crea una copia independiente y conserva el original privado.</p><form className="note-form" onSubmit={(event) => void saveNote(event)}><label>Título<input value={noteTitle} onChange={(event) => setNoteTitle(event.target.value)} maxLength={120} required /></label><label>Nota privada<textarea value={noteBody} onChange={(event) => setNoteBody(event.target.value)} maxLength={10000} rows={4} required /></label><label>Asociar a una cita (opcional)<select value={noteSession} onChange={(event) => setNoteSession(event.target.value)}><option value="">Sin asociar</option>{data.sessions.map((session) => <option key={session.id} value={session.id}>{dateById.get(session.selected_date_id ?? '')?.title ?? 'Experiencia completada'}</option>)}</select></label><div className="note-actions"><button className="button primary" disabled={busy === 'note'}>{busy === 'note' ? 'Guardando…' : editNote ? 'Actualizar nota' : 'Guardar nota privada'}</button>{editNote && <button className="button secondary" type="button" onClick={() => { setEditNote(''); setNoteTitle(''); setNoteBody('') }}><X size={15} /> Cancelar edición</button>}</div></form>
      <div className="private-note-list">{data.notes.map((note) => <article className="private-note" key={note.id}><div><h3>{note.title}</h3><p>{note.body}</p><span>{note.session_id ? `Asociada a ${dateById.get(sessionById.get(note.session_id)?.selected_date_id ?? '')?.title ?? 'una cita'}` : 'Nota personal'} · {new Date(note.updated_at).toLocaleDateString('es-MX')}</span></div><div className="note-actions"><button className="text-button" onClick={() => { setEditNote(note.id); setNoteTitle(note.title); setNoteBody(note.body); setNoteSession(note.session_id ?? '') }}>Editar</button><button className="icon-button" aria-label="Eliminar nota privada" onClick={() => void deleteNote(note)} disabled={busy === note.id}><Trash2 size={16} /></button></div><div className="note-share"><select aria-label="Recuerdo donde compartir copia" value={shareTargets[note.id] ?? ''} onChange={(event) => setShareTargets((current) => ({ ...current, [note.id]: event.target.value }))}><option value="">Compartir una copia en…</option>{data.memories.map((memory) => <option key={memory.id} value={memory.id}>{memory.title}</option>)}</select><button className="button secondary" onClick={() => void shareNote(note)} disabled={busy === note.id}><Share2 size={14} /> Compartir copia</button></div></article>)}</div>
    </section>
  </div>
}

async function compressPhoto(file: File): Promise<{ blob: Blob; mime: string }> {
  const bitmap = await createImageBitmap(file)
  try {
    let scale = Math.min(1, 1920 / Math.max(bitmap.width, bitmap.height))
    for (let attempt = 0; attempt < 8; attempt++) {
      const canvas = document.createElement('canvas')
      canvas.width = Math.max(1, Math.round(bitmap.width * scale)); canvas.height = Math.max(1, Math.round(bitmap.height * scale))
      const context = canvas.getContext('2d')
      if (!context) throw new Error('Este navegador no pudo preparar la imagen.')
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/webp', Math.max(.45, .84 - attempt * .06)))
      if (!blob) throw new Error('No se pudo comprimir la imagen.')
      if (blob.size <= maxPhotoBytes) return { blob, mime: ['image/jpeg', 'image/png', 'image/webp'].includes(blob.type) ? blob.type : 'image/png' }
      scale *= .78
    }
    throw new Error('La imagen sigue siendo demasiado grande; prueba con otra foto.')
  } finally { bitmap.close() }
}

function localToday() {
  const date = new Date()
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset())
  return date.toISOString().slice(0, 10)
}
