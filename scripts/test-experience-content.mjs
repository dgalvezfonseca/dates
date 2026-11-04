import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const catalog = JSON.parse(await readFile(new URL('../catalog/dates.json', import.meta.url), 'utf8'))
const deck = JSON.parse(await readFile(new URL('../catalog/question-deck.json', import.meta.url), 'utf8'))
const challenges = JSON.parse(await readFile(new URL('../catalog/experience-challenges.json', import.meta.url), 'utf8'))
const levels = ['divertidas', 'gustos', 'suenos', 'romance', 'profundas']

assert.equal(catalog.length, 100, 'The curated date catalog must remain at 100 experiences.')
const ids = new Set(catalog.map(({ id }) => id))
assert.equal(ids.size, 100, 'Date IDs must stay unique.')
assert.deepEqual(Object.keys(deck).sort(), [...levels].sort(), 'The question deck must contain the five requested levels.')
const promptIds = Object.values(deck).flat().map(({ id }) => id)
assert.equal(promptIds.length, 40, 'There must be eight questions in each level.')
assert.equal(new Set(promptIds).size, promptIds.length, 'Question IDs must be unique.')
for (const [level, prompts] of Object.entries(deck)) {
  assert.equal(prompts.length, 8, `${level} must have eight questions.`)
  for (const prompt of prompts) assert.ok(prompt.text.length >= 30 && prompt.text.length <= 180, `${prompt.id} has an invalid length.`)
}
for (const date of catalog) {
  assert.ok(Array.isArray(date.steps) && date.steps.length >= 2, `${date.id} must keep interactive steps.`)
  assert.ok(Array.isArray(date.prompts) && date.prompts.length >= 4, `${date.id} must keep conversation prompts.`)
  assert.ok(challenges[date.category], `${date.id} has no category activity.`)
}

console.log('Experience content passed: 100 unchanged catalog entries, 40 questions and 6 category challenges.')
