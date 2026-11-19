// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** A run-key check should not extract a key from every unrelated large revision. */
import { randomBytes } from 'node:crypto'
import { dirname, join } from 'node:path'
import { writeFileSync } from 'node:fs'
import Database from 'better-sqlite3'
import { afterAll, beforeAll, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { THE_MESSAGE_WORKER_ID } from '../src/shared/participants.ts'

let t: TestDb
let app: FastifyInstance
let keys: typeof import('../src/server/lib/keys.ts')
let terminals: typeof import('../src/server/lib/terminal-agents.ts')
const personKey = randomBytes(32).toString('hex')
const officeKey = randomBytes(32).toString('hex')
const person = { 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON }
const office = { 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': THE_MESSAGE_WORKER_ID, 'x-mole-office-key': officeKey }
const worker = 'a-history-worker'
const marker = 'A made-up payload in an ordinary revision. '
let run: string
let key: string
let keyId: string
let workerId: string
let delegate: Database.Database | undefined

beforeAll(async () => {
  t = await freshDb()
  writeFileSync(join(dirname(t.file), 'keys.json'), JSON.stringify({ person: personKey, office: officeKey, providers: {} }), { mode: 0o600 })
  app = (await apiApp()).app
  await app.ready()
  keys = await import('../src/server/lib/keys.ts')
  terminals = await import('../src/server/lib/terminal-agents.ts')
  const registered = await app.inject({ method: 'POST', url: '/api/agents/started', headers: person, payload: { handle: worker, name: 'History worker', role: 'worker', runtime: 'codex' } })
  expect(registered.statusCode).toBe(201)
  workerId = (t.client.sqlite.prepare('SELECT id FROM agents WHERE handle = ?').get(worker) as { id: string }).id
  const filed = await app.inject({ method: 'POST', url: '/api/records', headers: office, payload: { kind: 'session', title: 'A history to check', data: { state: 'running', runtime: 'codex', startedByMoleOffice: true, servingAgent: worker } } })
  expect(filed.statusCode).toBe(201)
  const made = filed.json() as { record: { id: string }; runKey: { key: string } }
  run = made.record.id
  key = made.runKey.key
  const headers = { 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': worker, 'x-mole-office-session': run, 'x-mole-office-key': key }
  const grown = await app.inject({ method: 'PATCH', url: `/api/records/${run}`, headers, payload: { dataPatch: { extra: { payload: marker.repeat(100) } } } })
  expect(grown.statusCode).toBe(200)
  for (let n = 0; n < 8; n++) {
    const changed = await app.inject({ method: 'PATCH', url: `/api/records/${run}`, headers, payload: { dataPatch: { doing: `Step ${n}` } } })
    expect(changed.statusCode).toBe(200)
  }
  keyId = ((t.api.getRecord(run)!.data.extra as Record<string, unknown>).runKeyId as string)
}, 120_000)

afterAll(async () => { await app?.close(); t?.close(); delegate?.close() })

it('keeps a copied earlier genuine reopen significant after a later reopen', () => {
  const opened = terminals.fileATerminalsRunAndItsKey({
    agent: { id: workerId, handle: worker }, runtime: 'codex', folder: dirname(t.file), providerSession: null,
    workspaceId: 'default', actor: { type: 'human', id: THE_PERSON, sessionId: null, provedBy: 'the-person-key' },
    title: 'A terminal opened again', doing: 'A made-up terminal', extra: {},
  })
  const named = () => (t.api.getRecord(opened.session)!.data.extra as { runKeyId: string }).runKeyId
  const reopen = () => {
    const id = named()
    const proof = (t.client.sqlite.prepare('SELECT mint_proved_by AS proof FROM held_keys WHERE id = ?').get(id) as { proof: string | null }).proof
    expect(terminals.giveAReopenedRunANewKey(opened.session, workerId, { id, proof } as never)).not.toBeNull()
  }
  reopen()
  const olderReopen = named()
  reopen()
  const newerReopen = named()
  expect(keys.theRunThisRunKeyIsBoundTo(newerReopen)).toEqual({ run: opened.session, newest: true })
  t.api.patchRecord(opened.session, { dataPatch: { extra: { runKeyId: olderReopen } } }, t.api.HUMAN)
  expect(keys.theRunThisRunKeyIsBoundTo(newerReopen)).toEqual({ run: opened.session, newest: false })
})

it('does not extract the key from every ordinary large revision', () => {
  // A second connection delegates to SQLite's real JSON function; only the number of calls is observed.
  delegate = new Database(':memory:')
  const extract = delegate.prepare('SELECT json_extract(?, ?) AS value')
  const keyPath = /'([^']+)'/.exec(keys.THE_RUN_KEY_NAMED)?.[1]
  expect(keyPath).toBeTruthy()
  let largeExtractions = 0
  t.client.sqlite.function('json_extract', { deterministic: true }, (json: string, path: string) => {
    if (path === keyPath && typeof json === 'string' && json.includes(marker)) largeExtractions++
    return (extract.get(json, path) as { value: string | number | null }).value
  })
  expect(keys.theRunThisRunKeyIsBoundTo(keyId)).toEqual({ run, newest: true })
  expect(largeExtractions).toBe(0)
})
