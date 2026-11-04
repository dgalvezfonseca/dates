import { readFile, writeFile } from 'node:fs/promises'

const dates = JSON.parse(await readFile(new URL('../catalog/dates.json', import.meta.url), 'utf8'))
if (dates.length !== 100) throw new Error('Validate exactly 100 dates before generating the seed migration.')
const quote = (value) => `'${String(value).replaceAll("'", "''")}'`
const json = (value) => `${quote(JSON.stringify(value))}::jsonb`
const columns = 'id,title,category,description,objective,duration_minutes,energy,setting,materials,preparation,steps,prompts,low_energy_alternative,accessibility,consent,enjoyment_tips,active,sort_order'
const rows = dates.map((date, index) => `(${[
  quote(date.id), quote(date.title), quote(date.category), quote(date.description), quote(date.objective),
  String(date.durationMinutes), quote(date.energy), quote(date.setting), json(date.materials), quote(date.preparation),
  json(date.steps), json(date.prompts), quote(date.lowEnergyAlternative), json(date.accessibility), json(date.consent),
  quote(date.enjoymentTips), 'true', String(index + 1),
].join(', ')})`)
const updates = ['title', 'category', 'description', 'objective', 'duration_minutes', 'energy', 'setting', 'materials', 'preparation', 'steps', 'prompts', 'low_energy_alternative', 'accessibility', 'consent', 'enjoyment_tips', 'active', 'sort_order'].map((field) => `${field} = excluded.${field}`).join(',\n  ')
const sql = `insert into public.date_catalog (${columns})\nvalues\n  ${rows.join(',\n  ')}\non conflict (id) do update set\n  ${updates};\n`
await writeFile(new URL('../supabase/migrations/202611030003_seed_date_catalog.sql', import.meta.url), sql, 'utf8')
console.log(`Generated catalog migration for ${dates.length} dates.`)
