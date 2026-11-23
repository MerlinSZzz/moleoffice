// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** A supervisor's own run key does not give it the person's power to appoint a secretary. */
import { randomBytes } from 'node:crypto'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { THE_PERSON } from '../src/shared/person.ts'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { aMadeUpHostWorker } from './a-made-up-host-worker.ts'

let db: TestDb
let app: FastifyInstance
let folder: string
let run = ''
let runKey = ''
const personKey = randomBytes(32).toString('hex')
const officeKey = randomBytes(32).toString('hex')
const person = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
  'x-mole-office-key': personKey,
}
const agent = (handle: string, key: string, session?: string) => ({
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': handle,
  'x-mole-office-key': key,
  ...(session === undefined ? {} : { 'x-mole-office-session': session }),
})

async function post(url: string, headers: Record<string, string>, payload: object) {
  const response = await app.inject({ method: 'POST', url, headers, payload })
  return { status: response.statusCode, body: JSON.parse(response.body) as Record<string, any> }
}

beforeAll(async () => {
  db = await freshDb()
  writeFileSync(join(dirname(db.file), 'keys.json'), JSON.stringify({ person: personKey, office: officeKey, providers: {} }), { mode: 0o600 })
  app = (await apiApp()).app
  await app.ready()
  folder = mkdtempSync(join(tmpdir(), 'outside-supervisor-card-'))

  const secretary = await post('/api/agents/started', person, { handle: 'fixture-starter', name: 'Fixture starter', runtime: 'claude-code', role: 'secretary' })
  expect(secretary.status).toBe(201)
  const starterKey = String(secretary.body['whatToGiveIt'].key)
  const terminal = await post('/api/records', agent('fixture-starter', starterKey), {
    kind: 'session', title: 'A made-up starter run', data: { state: 'running', runtime: 'claude-code', workingDirectory: folder },
  })
  expect(terminal.status).toBe(201)
  const starterRun = String(terminal.body['record'].id)
  const supervisor = await post('/api/agents/started', agent('fixture-starter', starterKey), {
    handle: 'fixture-supervisor', name: 'Fixture supervisor', runtime: 'claude-code', role: 'supervisor',
  })
  expect(supervisor.status).toBe(201)
  const made = await post('/api/records', agent('fixture-starter', starterKey, starterRun), {
    kind: 'session', title: 'A made-up outside supervisor run',
    data: { state: 'running', runtime: 'claude-code', servingAgent: 'fixture-supervisor', servingAgentId: supervisor.body['agent'].id, workingDirectory: folder },
  })
  expect(made.status).toBe(201)
  run = String(made.body['record'].id)
  runKey = String(made.body['runKey'].key)
  const row = db.client.sqlite.prepare('SELECT data FROM records WHERE id = ?').get(run) as { data: string }
  expect(JSON.parse(row.data).sandbox).toBeUndefined()
}, 60_000)

afterAll(async () => {
  await app?.close()
  db?.close()
  if (folder !== undefined) rmSync(folder, { recursive: true, force: true })
})

it('refuses an outside supervisor appointing a secretary and writes nothing', async () => {
  const counts = () => Object.fromEntries(['agents', 'records', 'changes', 'held_keys'].map((table) => [table,
    (db.client.sqlite.prepare(`SELECT count(*) AS n FROM ${table}`).get() as { n: number }).n,
  ]))
  const before = counts()
  const answer = await post('/api/agents/started', agent('fixture-supervisor', runKey, run), {
    handle: 'fixture-secretary', name: 'Fixture secretary', runtime: 'claude-code', role: 'secretary',
  })
  expect(answer.status).toBe(403)
  expect(answer.body['error']).toContain('Only the person appoints a secretary')
  expect(counts()).toEqual(before)
})

it('refuses a host worker appointing a secretary with its own run key and writes nothing', async () => {
  const fixture = await aMadeUpHostWorker('codex')
  try {
    await fixture.start()
    const capture = await fixture.waitForProgram()
    const counts = () => Object.fromEntries(['agents', 'records', 'changes', 'held_keys'].map((table) => [table,
      (fixture.db.client.sqlite.prepare(`SELECT count(*) AS n FROM ${table}`).get() as { n: number }).n,
    ]))
    const before = counts()
    const answer = await fixture.post('/api/agents/started', fixture.agent('fixture-worker', capture.env.MOLE_AGENT_KEY as string, capture.id as string), {
      handle: 'fixture-secretary', name: 'Fixture secretary', runtime: 'claude-code', role: 'secretary',
    })
    expect(answer.status).toBe(403)
    expect(counts()).toEqual(before)
    await fixture.end()
  } finally { await fixture.close() }
}, 120_000)
