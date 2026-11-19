// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * The check's historical facts and the data a one-field session patch stores.
 * A disposable office supplies the real record, revision and change rows.
 */
import { randomBytes } from 'node:crypto'
import { writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { THE_MESSAGE_WORKER_ID } from '../src/shared/participants.ts'
import { REMINDED_BEFORE_THE_SEAL, remindedAsStored } from '../src/shared/before-the-seal.ts'
import { ROUND_CHAPTERS } from '../src/shared/round-chapters/manifest.ts'
import { theCardOffTheTree } from '../src/shared/roles.ts'

let t: TestDb
let app: FastifyInstance
const officeKey = randomBytes(32).toString('hex')
const personKey = randomBytes(32).toString('hex')
const handle = 'a-history-worker'
const person = { 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON }
const officeHeaders = { 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': THE_MESSAGE_WORKER_ID, 'x-mole-office-key': officeKey }
let factsOf: typeof import('../src/server/lib/inspection.ts').resolveCheckEligibilityFacts
let office: typeof import('../src/server/lib/the-office.ts').THE_OFFICE

beforeAll(async () => {
  t = await freshDb()
  writeFileSync(join(dirname(t.file), 'keys.json'), JSON.stringify({ person: personKey, office: officeKey, providers: {} }), { mode: 0o600 })
  app = (await apiApp()).app
  await app.ready()
  const registered = await app.inject({ method: 'POST', url: '/api/agents/started', headers: person, payload: { handle, name: 'History worker', role: 'worker', runtime: 'codex' } })
  expect(registered.statusCode).toBe(201)
  factsOf = (await import('../src/server/lib/inspection.ts')).resolveCheckEligibilityFacts
  office = (await import('../src/server/lib/the-office.ts')).THE_OFFICE
}, 60_000)

afterAll(async () => { await app?.close(); t?.close() })

async function session(purpose: string, historicalRole?: string) {
  const filed = await app.inject({ method: 'POST', url: '/api/records', headers: officeHeaders, payload: {
    kind: 'session', title: `History for ${purpose}`,
    data: { state: 'running', runtime: 'codex', startedByMoleOffice: true, servingAgent: handle, doing: 'before' },
  } })
  expect(filed.statusCode).toBe(201)
  const made = filed.json() as { record: { id: string }; runKey: { key: string } }
  const run = made.record
  const headers = { 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': handle, 'x-mole-office-session': run.id, 'x-mole-office-key': made.runKey.key }
  const reminder = remindedAsStored({
    reminded: true, at: '2026-01-01 00:00:00', afterSeal: null,
    line: 'A reminder', chapters: [], atTheSeal: null,
    items: [{ key: 'example', about: 'report', says: 'Made-up finding '.repeat(100), mechanical: true }],
  })
  t.doors.asTheDoorOf(REMINDED_BEFORE_THE_SEAL, () =>
    t.api.patchRecord(run.id, { dataPatch: { [REMINDED_BEFORE_THE_SEAL]: reminder } }, office),
  )
  const grown = await app.inject({ method: 'PATCH', url: `/api/records/${run.id}`, headers, payload: { dataPatch: { extra: { purpose, ...(historicalRole === undefined ? {} : { role: historicalRole }), [ROUND_CHAPTERS]: { text: 'Made-up chapter '.repeat(100) } } } } })
  expect(grown.statusCode).toBe(200)
  if (historicalRole !== undefined) {
    const cleared = await app.inject({ method: 'PATCH', url: `/api/records/${run.id}`, headers, payload: { dataPatch: { extra: { role: null } } } })
    expect(cleared.statusCode).toBe(200)
  }
  const patched = await app.inject({ method: 'PATCH', url: `/api/records/${run.id}`, headers, payload: { dataPatch: { doing: 'after' } } })
  expect(patched.statusCode).toBe(200)
  const current = t.api.getRecord(run.id)
  expect(current).not.toBeNull()
  return current!
}

type HistoryRow = { data: string; actor_type: string | null; actor_id: string | null }

it('does not copy unrelated large fields into the check history while preserving its decision', async () => {
  for (const purpose of ['ordinary work', 'inspection']) {
    const run = await session(purpose)
    const full = t.client.sqlite.prepare('SELECT data, actor_type, actor_id FROM revisions WHERE record_id = ?').all(run.id) as HistoryRow[]
    const proto = Object.getPrototypeOf(t.client.sqlite.prepare('SELECT 1')) as { all: (...args: unknown[]) => unknown }
    const original = proto.all
    let returned: HistoryRow[] = []
    let useFull = false
    proto.all = function (this: { source: string }, ...args: unknown[]) {
      const rows = original.apply(this, args)
      const sql = this.source.toLowerCase()
      if (sql.includes('from revisions where record_id = ?') && sql.includes('actor_type, actor_id')) {
        if (useFull) return full
        returned = rows as HistoryRow[]
      }
      return rows
    }
    try {
      const projectedDecision = factsOf(run, true)
      useFull = true
      const fullDecision = factsOf(run, true)
      expect(projectedDecision).toEqual(fullDecision)
      expect(returned).toHaveLength(full.length)
      expect(full.some((row) => Object.hasOwn(JSON.parse(row.data), REMINDED_BEFORE_THE_SEAL))).toBe(true)
      expect(full.some((row) => Object.hasOwn(JSON.parse(row.data).extra ?? {}, ROUND_CHAPTERS))).toBe(true)
      for (let i = 0; i < full.length; i++) {
        const stored = JSON.parse(full[i]!.data) as Record<string, any>
        const read = JSON.parse(returned[i]!.data) as Record<string, any>
        expect(read).not.toHaveProperty(REMINDED_BEFORE_THE_SEAL)
        expect(read.extra ?? {}).not.toHaveProperty(ROUND_CHAPTERS)
        delete stored[REMINDED_BEFORE_THE_SEAL]
        if (stored.extra && typeof stored.extra === 'object') delete stored.extra[ROUND_CHAPTERS]
        expect(read).toEqual(stored)
      }
      if (purpose === 'inspection') expect(projectedDecision.noInspector).toBe(false)
    } finally {
      proto.all = original
    }
  }
})

it('keeps the full record and revision and the small change for a one-field patch', async () => {
  const run = await session('ordinary work')
  const row = t.client.sqlite.prepare('SELECT data FROM records WHERE id = ?').get(run.id) as { data: string }
  const revision = t.client.sqlite.prepare('SELECT seq FROM revisions WHERE record_id = ? ORDER BY seq DESC LIMIT 1').get(run.id) as { seq: number }
  const { getRevision } = await import('../src/server/lib/revisions.ts')
  expect(JSON.parse(row.data)).toEqual(run.data)
  expect(getRevision(run.id, revision.seq).content.data).toEqual(run.data)
  expect(run.data).toHaveProperty(REMINDED_BEFORE_THE_SEAL)
  expect(run.data.extra).toHaveProperty(ROUND_CHAPTERS)
  const changes = t.api.listChanges({ workspaceId: 'default', recordId: run.id }).filter((row) => row.field === 'data.doing')
  expect(changes).toHaveLength(1)
  expect(changes[0]).toMatchObject({ oldValue: 'before', newValue: 'after' })
})

it('keeps the same decision for malformed and unusual historical JSON', async () => {
  const run = await session('ordinary work')
  const proto = Object.getPrototypeOf(t.client.sqlite.prepare('SELECT 1')) as { all: (...args: unknown[]) => unknown }
  const original = proto.all
  const samples = [
    '{broken',
    'null',
    '[1, 2]',
    JSON.stringify({ purpose: 'inspection', [REMINDED_BEFORE_THE_SEAL]: { items: ['finding'] }, extra: { [ROUND_CHAPTERS]: { text: 'chapter' } } }),
    `{"extra":{"purpose":"inspection"},"extra":${JSON.stringify({ purpose: 'ordinary work', [ROUND_CHAPTERS]: { text: 'chapter' } })}}`,
    '['.repeat(1100) + '0' + ']'.repeat(1100),
  ]
  let sample = ''
  let full = false
  proto.all = function (this: { source: string }, ...args: unknown[]) {
    const sql = this.source.toLowerCase()
    if (!(sql.includes('from revisions where record_id = ?') && sql.includes('actor_type, actor_id'))) return original.apply(this, args)
    if (full) return [{ data: sample, actor_type: 'human', actor_id: THE_PERSON }]
    // A CTE gives the actual prepared query one synthetic row without modifying the office's ledger.
    const query = t.client.sqlite.prepare(`WITH revisions(data, actor_type, actor_id, record_id) AS (VALUES (?, ?, ?, ?)) ${this.source}`)
    return original.apply(query, [sample, 'human', THE_PERSON, run.id, ...args])
  }
  try {
    for (sample of samples) {
      full = true
      const expected = factsOf(run, true)
      full = false
      expect(factsOf(run, true)).toEqual(expected)
    }
  } finally {
    proto.all = original
  }
})


it('keeps an inspector role from history beside the round chapters', async () => {
  const { theRoleCards } = await import('../src/server/lib/roles.ts')
  const inspector = theCardOffTheTree(theRoleCards())
  expect(inspector).not.toBeNull()
  const run = await session('ordinary work', inspector!.name)
  expect((run.data.extra as Record<string, unknown>).role).toBeUndefined()
  const history = t.client.sqlite.prepare('SELECT data FROM revisions WHERE record_id = ?').all(run.id) as { data: string }[]
  expect(history.some(({ data }) => {
    const extra = JSON.parse(data).extra
    return extra?.role === inspector!.name && Object.hasOwn(extra, ROUND_CHAPTERS)
  })).toBe(true)
  expect(factsOf(run, true).noInspector).toBe(false)
})
