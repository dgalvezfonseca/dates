import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { filterDates } from '../src/lib/filterDates.mjs'

const dates = JSON.parse(await readFile(new URL('../catalog/dates.json', import.meta.url), 'utf8'))
const all = { query: '', category: 'todas', energy: 'todas', setting: 'todas', duration: 'todas' }
assert.equal(filterDates(dates, all).length, 100)
assert.equal(filterDates(dates, { ...all, category: 'aventuras-y-diversión', energy: 'alta' }).length, 5)
assert.ok(filterDates(dates, { ...all, duration: 'corta' }).every((date) => date.duration_minutes <= 60))
assert.ok(filterDates(dates, { ...all, duration: 'media' }).every((date) => date.duration_minutes > 60 && date.duration_minutes <= 120))
assert.ok(filterDates(dates, { ...all, duration: 'larga' }).every((date) => date.duration_minutes > 120))
assert.deepEqual(filterDates(dates, { ...all, query: 'GO-KARTS' }).map((date) => date.title), ['Go-karts'])
assert.ok(filterDates(dates, { ...all, setting: 'interior' }).every((date) => date.setting === 'interior'))
console.log('Catalog filter checks passed for category, energy, duration, environment, and search.')
