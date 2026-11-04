import { readFile } from 'node:fs/promises'

const dates = JSON.parse(await readFile(new URL('../catalog/dates.json', import.meta.url), 'utf8'))
if (!Array.isArray(dates)) throw new Error('El catálogo debe ser un arreglo JSON.')
if (dates.length !== 0 && dates.length !== 100) throw new Error(`Se requieren 100 experiencias o un catálogo vacío pendiente de importación; hay ${dates.length}.`)

if (dates.length === 0) {
  console.log('Catálogo vacío: pendiente de recibir e importar los 100 títulos definitivos.')
  process.exit(0)
}

const expected = new Map([
  ['conexión-y-conversación', 15], ['aventuras-y-diversión', 20],
  ['complicidad-y-equipo', 20], ['romance-y-detalles', 15],
  ['vida-cotidiana', 15], ['conversaciones-importantes', 15],
])
const ids = new Set()
const counts = new Map([...expected.keys()].map((key) => [key, 0]))
const required = ['id', 'title', 'category', 'description', 'objective', 'durationMinutes', 'energy', 'setting', 'materials', 'preparation', 'steps', 'prompts', 'lowEnergyAlternative', 'accessibility', 'consent', 'enjoymentTips']

for (const [index, date] of dates.entries()) {
  for (const field of required) if (!(field in date)) throw new Error(`Experiencia ${index + 1}: falta ${field}.`)
  if (typeof date.id !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(date.id) || ids.has(date.id)) throw new Error(`ID inválido o duplicado: ${date.id}`)
  if (!date.id.startsWith(`${String(index + 1).padStart(2, '0')}-`)) throw new Error(`${date.id}: el identificador debe conservar el orden numerado del catálogo.`)
  ids.add(date.id)
  if (!counts.has(date.category)) throw new Error(`Categoría no reconocida: ${date.category}`)
  counts.set(date.category, counts.get(date.category) + 1)
  for (const field of ['title', 'description', 'objective', 'preparation', 'lowEnergyAlternative', 'enjoymentTips']) if (typeof date[field] !== 'string' || !date[field].trim()) throw new Error(`${date.id}: ${field} debe ser texto no vacío.`)
  if (!Number.isInteger(date.durationMinutes) || date.durationMinutes < 1) throw new Error(`${date.id}: durationMinutes debe ser un entero positivo.`)
  if (!['baja', 'media', 'alta'].includes(date.energy)) throw new Error(`${date.id}: nivel de energía no reconocido.`)
  if (!['interior', 'exterior', 'indistinto'].includes(date.setting)) throw new Error(`${date.id}: ambiente no reconocido.`)
  for (const field of ['materials', 'accessibility', 'consent', 'steps']) if (!Array.isArray(date[field])) throw new Error(`${date.id}: ${field} debe ser un arreglo.`)
  for (const field of ['materials', 'accessibility', 'consent', 'steps']) if (date[field].some((item) => typeof item !== 'string' || !item.trim())) throw new Error(`${date.id}: ${field} solo admite textos no vacíos.`)
  if (date.accessibility.length < 1 || date.consent.length < 1 || date.steps.length < 3) throw new Error(`${date.id}: faltan indicadores de accesibilidad/consentimiento o pasos.`)
  if (/(presupuesto|cuánto\s+(?:quiere\s+)?gastar|cuánto\s+cuesta|quién\s+paga|dividir\s+gastos)/iu.test(JSON.stringify(date))) throw new Error(`${date.id}: el catálogo no debe incluir preguntas ni campos de gasto.`)
  if (!Array.isArray(date.prompts) || date.prompts.length < 4 || date.prompts.length > 8) throw new Error(`${date.id}: se requieren de 4 a 8 preguntas o dinámicas.`)
  if (date.prompts.some((prompt) => typeof prompt !== 'string' || !prompt.trim())) throw new Error(`${date.id}: cada pregunta o dinámica debe ser texto no vacío.`)
}
for (const [category, count] of expected) if (counts.get(category) !== count) throw new Error(`${category}: se esperaban ${count}; hay ${counts.get(category)}.`)
console.log('Catálogo válido: 100 experiencias únicas con las cantidades de categoría requeridas.')
