// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * Each door answers a request that stored nothing and a request that did store something.
 * Answer: clearing a missing draft says why; removing its sentence or adding one to a write turns it red.
 * Check also: clearing a missing list says why; dropping or adding its sentence turns the case red.
 * Checklist: equal values, absent deletions, both together and an edit are distinguished; dropping or adding the sentence turns the case red.
 * Block: equal values, absent deletions, both together and an edit are distinguished; dropping or adding the sentence turns the case red.
 * Order: the current order has a sentence and a changed order does not; dropping or adding it turns the case red.
 * Restore: a live record has a sentence and a restored deletion does not; dropping or adding it turns the case red.
 * Short forms: clearing a missing label or parts says why, while writing a label has no sentence; dropping or adding it turns the case red.
 * Links: an existing link has a sentence and a new link does not; dropping or adding it turns the case red.
 * Repeat causes: an unchanged answer or list has its own reason; changing either to its clearing cause turns this case red.
 * Same answer: repeat a non-empty draft in one second, then repeat it a second later; choosing the absent cause,
 * removing the repeat sentence, or adding a sentence to a write turns the case red.
 * Same check-also: repeat a non-empty list in one second, then repeat it a second later; choosing the absent cause,
 * removing the repeat sentence, or adding a sentence to a write turns the case red.
 * Same short forms: repeat a label with the same source revision, then change the label a second later; choosing the
 * absent cause, removing the repeat sentence, or adding a sentence to a write turns the case red.
 * The repeated label and source revision leave the existing stamp intact, so their equality pins the no-write choice
 * without depending on the clock. The later changed label exercises a write under the same controlled clock.
 * All sentences are read from the product's one wording function.
 */
import { afterAll, beforeAll, expect, it, vi } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { ANSWERS_FIELD } from '../src/shared/answers.ts'
import { CHECK_ALSO } from '../src/shared/before-the-seal.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { nowStamp } from '../src/shared/time.ts'
import { apiApp, freshDb, type TestDb } from './helpers.ts'

const person = { 'content-type': 'application/json', 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON }
let t: TestDb
let app: FastifyInstance
beforeAll(async () => { t = await freshDb(); app = (await apiApp()).app; await app.ready() }, 60_000)
afterAll(async () => { await app?.close(); t?.close() })
async function sentence(kind: string, fields?: string[], absent?: string[]) {
  const mod = await import('../src/server/lib/records/patching.ts') as unknown as { nothingWrittenSentence: (reason: { kind: string; fields?: string[]; absent?: string[] }) => string }
  const result = mod.nothingWrittenSentence({ kind, fields, absent })
  expect(result).toEqual(expect.any(String))
  return result
}
function note(title: string) { return t.api.createRecord({ workspaceId: 'default', kind: 'note', title, data: { body: 'A small note.' }, actor: t.api.HUMAN }) }

it('answers clearing an absent draft and keeping an answer', async () => {
  const report = t.api.createRecord({ workspaceId: 'default', kind: 'report', title: 'Questions', data: { for: 'The reader', date: '2026-11-16', blocks: [{ id: 'question', type: 'fillin', asks: 'What next?' }] }, actor: t.api.HUMAN })
  const call = (answer: object) => app.inject({ method: 'PUT', url: `/api/records/${report.id}/answers/question`, headers: person, payload: { answer } })
  const empty = await call({})
  expect(empty.statusCode, empty.body).toBe(200)
  expect(empty.json().nothingWritten).toBe(await sentence('answer-absent'))
  const written = await call({ words: 'Keep this.' })
  expect(written.statusCode, written.body).toBe(200)
  expect(written.json().nothingWritten).toBeUndefined()
})


it('answers clearing an absent reminder list and keeping a list', async () => {
  const run = t.api.createRecord({ workspaceId: 'default', kind: 'session', title: 'A run', data: { state: 'finished' }, actor: t.api.HUMAN })
  const call = (items: string[]) => app.inject({ method: 'PUT', url: `/api/records/${run.id}/check-also`, headers: person, payload: { items } })
  const empty = await call([])
  expect(empty.statusCode, empty.body).toBe(200)
  expect(empty.json().nothingWritten).toBe(await sentence('check-also-absent'))
  const written = await call(['Check the example.'])
  expect(written.statusCode, written.body).toBe(200)
  expect(written.json().nothingWritten).toBeUndefined()
})


it('answers unchanged, absent and mixed checklist edits, and omits the sentence on an edit', async () => {
  const record = t.api.createRecord({ workspaceId: 'default', kind: 'module', title: 'A module', data: { parts: [{ id: 'part', name: 'A part', items: [{ id: 'item', text: 'One item', state: 'todo' }] }] }, actor: t.api.HUMAN })
  const call = (payload: object) => app.inject({ method: 'PATCH', url: `/api/records/${record.id}/checklist/item`, headers: person, payload })
  const same = await call({ state: 'todo' })
  expect(same.statusCode, same.body).toBe(200)
  expect(same.json().nothingWritten).toBe(await sentence('unchanged', ['state']))
  const absent = await call({ note: null })
  expect(absent.statusCode, absent.body).toBe(200)
  expect(absent.json().nothingWritten).toBe(await sentence('absent', ['note']))
  const mixed = await call({ state: 'todo', note: null })
  expect(mixed.statusCode, mixed.body).toBe(200)
  expect(mixed.json().nothingWritten).toBe(await sentence('mixed', ['state'], ['note']))
  const written = await call({ state: 'doing' })
  expect(written.statusCode, written.body).toBe(200)
  expect(written.json().nothingWritten).toBeUndefined()
})


it('answers unchanged, absent and mixed block edits, and omits the sentence on an edit', async () => {
  const pipeline = t.api.createRecord({ workspaceId: 'default', kind: 'pipeline', title: 'A pipeline', data: { blockIds: [] }, actor: t.api.HUMAN })
  const block = t.blocks.addBlock(pipeline.id, { name: 'A block', state: 'todo' }, t.api.HUMAN).block
  const call = (payload: object) => app.inject({ method: 'PATCH', url: `/api/records/${pipeline.id}/blocks/${block.id}`, headers: person, payload })
  const same = await call({ state: 'todo' })
  expect(same.statusCode, same.body).toBe(200)
  expect(same.json().nothingWritten).toBe(await sentence('unchanged', ['state']))
  const absent = await call({ measured: null })
  expect(absent.statusCode, absent.body).toBe(200)
  expect(absent.json().nothingWritten).toBe(await sentence('absent', ['measured']))
  const mixed = await call({ state: 'todo', measured: null })
  expect(mixed.statusCode, mixed.body).toBe(200)
  expect(mixed.json().nothingWritten).toBe(await sentence('mixed', ['state'], ['measured']))
  const written = await call({ state: 'doing' })
  expect(written.statusCode, written.body).toBe(200)
  expect(written.json().nothingWritten).toBeUndefined()
})


it('answers an unchanged block order and a changed order', async () => {
  const pipeline = t.api.createRecord({ workspaceId: 'default', kind: 'pipeline', title: 'Ordered work', data: { blockIds: [] }, actor: t.api.HUMAN })
  const first = t.blocks.addBlock(pipeline.id, { name: 'First', state: 'todo' }, t.api.HUMAN).block
  const second = t.blocks.addBlock(pipeline.id, { name: 'Second', state: 'todo' }, t.api.HUMAN).block
  const call = (blockIds: string[]) => app.inject({ method: 'PUT', url: `/api/records/${pipeline.id}/blocks`, headers: person, payload: { blockIds } })
  const same = await call([first.id, second.id])
  expect(same.statusCode, same.body).toBe(200)
  expect(same.json().nothingWritten).toBe(await sentence('order-unchanged'))
  const written = await call([second.id, first.id])
  expect(written.statusCode, written.body).toBe(200)
  expect(written.json().nothingWritten).toBeUndefined()
})


it('answers a live record and an actual restore', async () => {
  const record = note('A record to restore')
  const call = () => app.inject({ method: 'POST', url: `/api/records/${record.id}/restore`, headers: person, payload: {} })
  const live = await call()
  expect(live.statusCode, live.body).toBe(200)
  expect(live.json().nothingWritten).toBe(await sentence('not-deleted'))
  t.api.deleteRecord(record.id, t.api.HUMAN)
  const written = await call()
  expect(written.statusCode, written.body).toBe(200)
  expect(written.json().nothingWritten).toBeUndefined()
})


it('answers clearing absent short forms and omits the sentence on a write', async () => {
  const record = note('A longer record title')
  const call = async (forms: object) => {
    const history = await app.inject({ method: 'GET', url: `/api/records/${record.id}/revisions`, headers: person })
    expect(history.statusCode, history.body).toBe(200)
    const revisions = history.json().revisions as { seq: number; contentHash: string }[]
    const latest = [...revisions].sort((a, b) => b.seq - a.seq)[0]!
    return app.inject({ method: 'POST', url: `/api/records/${record.id}/short-forms`, headers: person, payload: { madeFrom: { seq: latest.seq, contentHash: latest.contentHash }, forms } })
  }
  const absent = await call({ label: null })
  expect(absent.statusCode, absent.body).toBe(200)
  expect(absent.json().nothingWritten).toBe(await sentence('short-forms-absent'))
  const written = await call({ label: 'Brief marker' })
  expect(written.statusCode, written.body).toBe(200)
  expect(written.json().nothingWritten).toBeUndefined()
  const parts = await call({ parts: null })
  expect(parts.statusCode, parts.body).toBe(200)
  expect(parts.json().nothingWritten).toBe(await sentence('short-forms-absent'))
})


it('answers an existing link and omits the sentence on a new link', async () => {
  const from = note('First record')
  const to = note('Second record')
  const call = (payload: object) => app.inject({ method: 'POST', url: '/api/links', headers: person, payload })
  const written = await call({ fromId: from.id, toId: to.id, type: 'relates_to' })
  expect(written.statusCode, written.body).toBe(201)
  expect(written.json().nothingWritten).toBeUndefined()
  const existing = await call({ fromId: from.id, toId: to.id, type: 'relates_to' })
  expect(existing.statusCode, existing.body).toBe(201)
  expect(existing.json().nothingWritten).toBe(await sentence('link-exists'))
  const byTitle = await call({ fromId: from.id, toTitle: to.title, type: 'relates_to' })
  expect(byTitle.statusCode, byTitle.body).toBe(201)
  expect(byTitle.json().nothingWritten).toBe(await sentence('link-exists'))
})


it('distinguishes unchanged answers and lists from missing ones', async () => {
  expect(await sentence('answer-unchanged')).not.toBe(await sentence('answer-absent'))
  expect(await sentence('check-also-unchanged')).not.toBe(await sentence('check-also-absent'))
  expect(await sentence('short-forms-unchanged')).not.toBe(await sentence('short-forms-absent'))
})

it('answers a repeated non-empty draft and writes it at a later second', async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  try {
    vi.setSystemTime(new Date(2026, 10, 16, 12, 0, 0))
    const report = t.api.createRecord({ workspaceId: 'default', kind: 'report', title: 'Questions for the reader', data: { for: 'The reader', date: '2026-11-16', blocks: [{ id: 'question', type: 'fillin', asks: 'What next?' }] }, actor: t.api.HUMAN })
    const call = () => app.inject({ method: 'PUT', url: `/api/records/${report.id}/answers/question`, headers: person, payload: { answer: { words: 'Keep this.' } } })
    const first = await call()
    expect(first.statusCode, first.body).toBe(200)
    const same = await call()
    expect(same.statusCode, same.body).toBe(200)
    expect(same.json().nothingWritten).toBe(await sentence('answer-unchanged'))
    vi.setSystemTime(new Date(2026, 10, 16, 12, 0, 1))
    const written = await call()
    expect(written.statusCode, written.body).toBe(200)
    expect(written.json().nothingWritten).toBeUndefined()
    const answers = t.api.getRecord(report.id)!.data[ANSWERS_FIELD] as { question: { draft: { at: string } } }
    expect(answers.question.draft.at).toBe(nowStamp())
  } finally { vi.useRealTimers() }
})

it('answers a repeated non-empty reminder list and writes it at a later second', async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  try {
    vi.setSystemTime(new Date(2026, 10, 16, 12, 0, 0))
    const run = t.api.createRecord({ workspaceId: 'default', kind: 'session', title: 'A run with reminders', data: { state: 'finished' }, actor: t.api.HUMAN })
    const call = () => app.inject({ method: 'PUT', url: `/api/records/${run.id}/check-also`, headers: person, payload: { items: ['Check the example.'] } })
    const first = await call()
    expect(first.statusCode, first.body).toBe(200)
    const same = await call()
    expect(same.statusCode, same.body).toBe(200)
    expect(same.json().nothingWritten).toBe(await sentence('check-also-unchanged'))
    vi.setSystemTime(new Date(2026, 10, 16, 12, 0, 1))
    const written = await call()
    expect(written.statusCode, written.body).toBe(200)
    expect(written.json().nothingWritten).toBeUndefined()
    const list = t.api.getRecord(run.id)!.data[CHECK_ALSO] as { at: string }
    expect(list.at).toBe(nowStamp())
  } finally { vi.useRealTimers() }
})

it('answers repeated short forms and omits the sentence for a changed label', async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  try {
    vi.setSystemTime(new Date(2026, 10, 16, 12, 0, 0))
    const record = note('A longer record title for a reader')
    const history = await app.inject({ method: 'GET', url: `/api/records/${record.id}/revisions`, headers: person })
    expect(history.statusCode, history.body).toBe(200)
    const revisions = history.json().revisions as { seq: number; contentHash: string }[]
    const latest = [...revisions].sort((a, b) => b.seq - a.seq)[0]!
    const madeFrom = { seq: latest.seq, contentHash: latest.contentHash }
    const call = (label: string) => app.inject({ method: 'POST', url: `/api/records/${record.id}/short-forms`, headers: person, payload: { madeFrom, forms: { label } } })
    const first = await call('Brief marker')
    expect(first.statusCode, first.body).toBe(200)
    const same = await call('Brief marker')
    expect(same.statusCode, same.body).toBe(200)
    expect(same.json().nothingWritten).toBe(await sentence('short-forms-unchanged'))
    vi.setSystemTime(new Date(2026, 10, 16, 12, 0, 1))
    const written = await call('Another marker')
    expect(written.statusCode, written.body).toBe(200)
    expect(written.json().nothingWritten).toBeUndefined()
  } finally { vi.useRealTimers() }
})
