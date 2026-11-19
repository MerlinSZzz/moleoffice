// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** Problem l3vULTAJYUNT: every caller reaches the office's field guard before a record is written. */
import { createHash } from 'node:crypto'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { NEEDS_NO_CHECK, ENDED_WITH_ITS_MERGE_ENTRY } from '../src/shared/releasing.ts'
import type { DeltaOp } from '../src/shared/delta.ts'

const person = { type: 'human', id: THE_TEST_OFFICES_OWNER.id } as const
const worker = { type: 'agent', id: 'office-fields-worker' } as const
const headers = (actor = person as { type: string; id: string }) => ({
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': actor.type,
  'x-mole-office-actor-id': actor.id,
})
const fields = [
  { field: NEEDS_NO_CHECK, value: { decision: 'synthetic-decision', at: '2026-09-26 09:00:00', because: 'Synthetic office mark.' },
    refusal: "The office writes needsNoCheck when it files a run for a secretary's design/-only merge entry. Nothing was written." },
  { field: ENDED_WITH_ITS_MERGE_ENTRY, value: { entry: 'synthetic-entry', at: '2026-09-26 09:00:00', because: 'Synthetic office ending.' },
    refusal: "The office writes endedWithItsMergeEntry on a merge entry's check-again run when that check refuses and the entry bounces. Nothing was written." },
] as const

let t: TestDb
let app: FastifyInstance
beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  const started = await app.inject({ method: 'POST', url: '/api/agents/started', headers: headers(),
    payload: { handle: worker.id, name: 'Synthetic office field worker', role: 'worker' } })
  expect(started.statusCode, started.body).toBe(201)
})
afterAll(async () => { await app?.close(); t?.close() })

function record(kind: 'session' | 'task', data: Record<string, unknown> = {}) {
  return t.api.createRecord({ workspaceId: 'default', kind, title: 'Synthetic office field fixture', data, actor: person, origin: 'fixture' })
}

/** Historical field values are planted directly in this throwaway database, never through the guarded door. */
function storedData(id: string, data: Record<string, unknown>) {
  t.client.sqlite.prepare('UPDATE records SET data = ? WHERE id = ?').run(JSON.stringify(data), id)
}

/** The content and its history, including a folder piece and any preceding proposal operations. */
function corpus() {
  return createHash('sha256').update(JSON.stringify(['records', 'revisions', 'changes', 'links', 'allocations', 'folder_readings'].map((table) =>
    t.client.sqlite.prepare(`SELECT * FROM ${table} ORDER BY id`).all()))).digest('hex')
}

describe.each(fields)('$field on every ordinary road', ({ field, value, refusal }) => {
  for (const actor of [person, worker]) {
    it(`refuses a kind change taking the field off a run for ${actor.type}, without writing`, async () => {
      const run = record('session', { state: 'running' })
      storedData(run.id, { ...run.data, [field]: value })
      const before = corpus()
      const r = await app.inject({ method: 'PATCH', url: `/api/records/${run.id}`, headers: headers(actor), payload: { kind: 'task' } })
      expect({ status: r.statusCode, error: r.json().error, corpus: corpus() }).toEqual({ status: 403, error: refusal, corpus: before })
    })

    it(`refuses a kind change bringing the field out of extra for ${actor.type}, without writing`, async () => {
      const task = record('task', { extra: { [field]: value } })
      const before = corpus()
      const r = await app.inject({ method: 'PATCH', url: `/api/records/${task.id}`, headers: headers(actor), payload: { kind: 'session' } })
      expect({ status: r.statusCode, error: r.json().error, corpus: corpus() }).toEqual({ status: 403, error: refusal, corpus: before })
    })
  }

  for (const operation of ['set_field', 'create_record'] as const) {
    it(`refuses an applied planning proposal with ${operation}, rolling back earlier operations`, async () => {
      const run = record('session', { state: 'running' })
      const bad: DeltaOp = operation === 'set_field'
        ? { op: 'set_field', recordId: run.id, expectVersion: t.api.versionOf(run), field, value, says: 'Synthetic field edit.' }
        : { op: 'create_record', workspaceId: 'default', kind: 'session', title: 'Synthetic forged run', data: { state: 'running', [field]: value }, says: 'Synthetic run creation.' }
      const proposal = t.api.createRecord({ workspaceId: 'default', kind: 'proposal', title: 'Synthetic field proposal', actor: worker,
        data: { question: 'Apply the synthetic changes?', options: ['yes', 'no'], who_settles_it: 'the owner', extra: { delta: { ops: [
          { op: 'create_record', workspaceId: 'default', kind: 'task', title: 'Synthetic earlier operation', says: 'Synthetic preceding write.' }, bad,
        ] } } } })
      const decision = t.api.createRecord({ workspaceId: 'default', kind: 'decision', title: 'Synthetic approval', data: { because: 'Synthetic test approval.' }, actor: person })
      t.api.createLink({ fromId: decision.id, toId: proposal.id, type: 'derived_from', actor: person })
      const before = corpus()
      const r = await app.inject({ method: 'POST', url: `/api/planning/proposals/${proposal.id}/apply`, headers: headers() })
      expect({ status: r.statusCode, error: r.json().error, corpus: corpus() }).toEqual({ status: 403, error: refusal, corpus: before })
    })
  }

  for (const supplied of ['draft', 'accept body'] as const) {
    it(`refuses a folder piece with the field in its ${supplied}, leaving the piece proposed`, async () => {
      const data = { state: 'running', [field]: value }
      const draft = await app.inject({ method: 'POST', url: '/api/import/draft', headers: headers(worker), payload: {
        folder: '/synthetic/folder', note: 'Synthetic reading.', couldNotTell: [], pieces: [
          { kind: 'session', title: 'Synthetic folder run', data: supplied === 'draft' ? data : { state: 'running' }, from: ['run.txt'], quote: 'Synthetic quoted words.' },
        ],
      } })
      expect(draft.statusCode, draft.body).toBe(201)
      const held = draft.json().draft
      const before = corpus()
      const r = await app.inject({ method: 'POST', url: `/api/import/drafts/${held.id}/pieces/${held.pieces[0].id}`, headers: headers(),
        payload: { press: 'accept', ...(supplied === 'accept body' ? { data } : {}) } })
      expect({ status: r.statusCode, error: r.json().error, corpus: corpus() }).toEqual({ status: 403, error: refusal, corpus: before })
    })
  }

  it('refuses direct library writes even when the actor names the office, and permits unchanged values', () => {
    const actor = { type: 'agent', id: 'mole-office/the-api-server' } as const
    const run = record('session', { state: 'running' })
    const before = corpus()
    expect(() => t.api.createRecord({ workspaceId: 'default', kind: 'session', title: 'Synthetic unmarked office create', actor, data: { [field]: value } }))
      .toThrow(refusal)
    expect(() => t.api.patchRecord(run.id, { dataPatch: { [field]: value } }, actor)).toThrow(refusal)
    expect(corpus()).toBe(before)
    storedData(run.id, { ...run.data, [field]: value })
    const marked = t.api.getRecord(run.id)!
    for (const data of [run.data, { ...marked.data, [field]: { ...value, because: 'Synthetic changed value.' } }]) {
      const held = corpus()
      expect(() => t.api.patchRecord(run.id, { data, replace: true }, actor)).toThrow(refusal)
      expect(corpus()).toBe(held)
    }
    t.api.patchRecord(run.id, { data: { ...marked.data, doing: 'Synthetic ordinary edit.' } }, person)
    expect(t.api.getRecord(run.id)!.data[field]).toEqual(value)
  })
})
