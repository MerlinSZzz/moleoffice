// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** Disposable office and launcher records only: no agent or launcher process is started. */
import { randomBytes } from 'node:crypto'
import { writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { afterAll, beforeAll, expect, it, vi } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { THE_PERSON } from '../src/shared/person.ts'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { onePass, type WorkerSettings } from '../src/worker/index.ts'
import { aCheckoutForATestRun } from './a-checkout-for-a-test-run.ts'

let t: TestDb
let app: FastifyInstance
let agent = ''
let next = ''
let parent = ''
let wrapper = ''
let message = ''
const key = randomBytes(32).toString('hex')
const headers = {'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON, 'x-mole-office-key': key}

beforeAll(async () => {
  t = await freshDb()
  writeFileSync(join(dirname(t.file), 'keys.json'), JSON.stringify({person: key, office: randomBytes(32).toString('hex'), providers: {}}), {mode: 0o600})
  app = (await apiApp()).app
  await app.ready()
  for (const handle of ['hold-worker', 'new-starter']) {
    const res = await app.inject({method: 'POST', url: '/api/agents/started', headers, payload: {handle, name: `Made-up ${handle}`}})
    expect(res.statusCode).toBe(201)
  }
  const id = (handle: string) => (t.client.sqlite.prepare('SELECT id FROM agents WHERE handle = ?').get(handle) as {id: string}).id
  agent = id('hold-worker'); next = id('new-starter')
  parent = t.api.createRecord({kind: 'session', workspaceId: 'default', origin: 'fixture', actor: {type: 'human', id: THE_PERSON}, title: 'Made-up parent', data: {runtime: 'claude-code', state: 'running'}}).id
  wrapper = t.api.createRecord({kind: 'session', workspaceId: 'default', origin: 'fixture', actor: {type: 'human', id: THE_PERSON}, title: 'Made-up launcher', data: {runtime: 'round-launcher', state: 'finished', startedByMoleOffice: true, extra: {purpose: 'worker', run: parent, worker: agent}}}).id
  const ask = {state: 'wanted', askedAt: '2026-11-09 10:00:00', askedBy: {who: {kind: 'person', id: THE_PERSON}, session: parent}, handle: 'hold-worker', brief: {path: '/made-up/brief', sha256: 'a'.repeat(64), bytes: 1}, sandbox: {folder: '/made-up', instance: 'made-up', container: 'made-up'}}
  t.client.sqlite.prepare("UPDATE records SET data = json_set(data, '$.workerRuns', json(?)) WHERE id = ?").run(JSON.stringify({[agent]: ask}), parent)
  message = t.api.createRecord({kind: 'message', workspaceId: 'default', origin: 'fixture', actor: {type: 'human', id: THE_PERSON}, title: 'Made-up message', data: {body: 'Made-up words.', to: [{kind: 'agent', id: agent}]}}).id
  t.client.sqlite.prepare("INSERT INTO agent_starter_changes (id, agent_id, from_kind, from_id, to_kind, to_id, asked_by_kind, asked_by_id, because, asked_at, state, runs_not_ended) VALUES (?, ?, 'person', ?, 'agent', ?, 'person', ?, ?, ?, 'waiting', '[]')").run('waiting-change', agent, THE_PERSON, next, THE_PERSON, 'Made-up reason', '2026-11-09 10:00:00')
}, 120_000)
afterAll(async () => { await app?.close(); t?.close() })

it('holds a message before the version probe and offers it again after withdrawal', async () => {
  const read = async () => JSON.parse((await app.inject({method: 'GET', url: '/api/worker/queue', headers})).body)
  const held = await read()
  expect(held.queue.find((row: any) => row.messageId === message)?.heldByStarterChange).toContain('waiting-change')
  const paths: string[] = []
  vi.stubGlobal('fetch', async (url: string) => {
    const path = new URL(url).pathname
    paths.push(path)
    const body = path === '/api/worker/queue' ? {queue: held.queue.filter((row: any) => row.messageId === message), failed: [], next: null} : {runs: [], waits: [], resumes: [], rounds: [], workerRuns: [], wanted: [], going: [], deadLetters: {rows: []}}
    return new Response(JSON.stringify(body), {status: 200})
  })
  try {
    const settings: WorkerSettings = {api: 'http://fixture.invalid', workspace: 'default', session: null, stopWithPid: null, checkout: aCheckoutForATestRun(), runs: 2, hops: 3, outputRoot: '/unused', env: {}}
    const pass = await onePass(settings, [], [], [])
    expect(pass.held.find(row => row.messageId === message)?.because).toContain('waiting-change')
    expect(paths).not.toContain(`/api/records/${message}`)
  } finally { vi.unstubAllGlobals() }
  expect((t.client.sqlite.prepare('SELECT mark FROM message_delivery WHERE message_id = ? AND recipient_id = ?').get(message, agent) as {mark: string}).mark).toBe('queued')
  t.client.sqlite.prepare("UPDATE agent_starter_changes SET state = 'withdrawn' WHERE id = ?").run('waiting-change')
  expect((await read()).queue.find((row: any) => row.messageId === message)?.heldByStarterChange).toBeUndefined()
  t.client.sqlite.prepare("UPDATE agent_starter_changes SET state = 'waiting' WHERE id = ?").run('waiting-change')
})

it('holds a delivery stored under the agent’s old registry id', async () => {
  const old = 'old-id-of-hold-worker'
  const {fileRegistryAliases} = await import('../src/server/lib/registry-aliases/index.ts')
  fileRegistryAliases(t.client.sqlite, [{namespace: 'agent-registry', aliasId: old, canonicalId: agent}])
  t.client.sqlite.prepare("UPDATE message_delivery SET recipient_id = ? WHERE message_id = ? AND recipient_id = ?").run(old, message, agent)
  try {
    const answer = JSON.parse((await app.inject({method: 'GET', url: '/api/worker/queue', headers})).body)
    expect(answer.queue.find((row: any) => row.messageId === message)?.heldByStarterChange).toContain('waiting-change')
  } finally {
    t.client.sqlite.prepare("UPDATE message_delivery SET recipient_id = ? WHERE message_id = ? AND recipient_id = ?").run(agent, message, old)
  }
})

it('reads a waiting change once per recipient even when several deliveries need a run', async () => {
  const second = t.api.createRecord({kind: 'message', workspaceId: 'default', origin: 'fixture', actor: {type: 'human', id: THE_PERSON}, title: 'Another made-up message', data: {body: 'More made-up words.', to: [{kind: 'agent', id: agent}]}}).id
  const prepare = t.client.sqlite.prepare.bind(t.client.sqlite)
  let reads = 0
  const spy = vi.spyOn(t.client.sqlite, 'prepare').mockImplementation(((source: string) => {
    if (source.includes("SELECT * FROM agent_starter_changes WHERE agent_id = ? AND state = 'waiting'")) reads++
    return prepare(source)
  }) as typeof t.client.sqlite.prepare)
  try {
    const answer = JSON.parse((await app.inject({method: 'GET', url: '/api/worker/queue', headers})).body)
    const entries = answer.queue.filter((row: any) => row.to.id === agent && row.needsNoRun === null)
    expect(entries.map((row: any) => row.messageId)).toEqual(expect.arrayContaining([message, second]))
    expect(entries.every((row: any) => row.heldByStarterChange?.includes('waiting-change'))).toBe(true)
    const recipients = new Set(answer.queue.filter((row: any) => row.needsNoRun === null).map((row: any) => row.to.id))
    expect(reads).toBe(recipients.size)
  } finally { spy.mockRestore() }
})

it('leaves a worker ask wanted at selection and at a stale start, then offers it again', async () => {
  const {theWorkerRunsToStart, startingTheWorkerRun} = await import('../src/server/lib/worker-runs.ts')
  expect(theWorkerRunsToStart('default').some(row => row.run === parent)).toBe(false)
  expect(() => startingTheWorkerRun({run: parent, agent, wrapper, workspaceId: 'default'})).toThrow('waiting-change')
  const state = () => (t.client.sqlite.prepare("SELECT json_extract(data, '$.workerRuns.' || ? || '.state') AS state FROM records WHERE id = ?").get(agent, parent) as {state: string}).state
  expect(state()).toBe('wanted')
  t.client.sqlite.prepare("UPDATE agent_starter_changes SET state = 'withdrawn' WHERE id = ?").run('waiting-change')
  expect(theWorkerRunsToStart('default').some(row => row.run === parent)).toBe(true)
  expect(state()).toBe('wanted')
})

it('does not let 25 older held asks hide a later eligible ask', async () => {
  t.client.sqlite.prepare("UPDATE agent_starter_changes SET state = 'waiting' WHERE id = ?").run('waiting-change')
  const ask = {state: 'wanted', askedAt: '2026-11-09 10:00:00', askedBy: {who: {kind: 'person', id: THE_PERSON}, session: parent}, handle: 'hold-worker', brief: {path: '/made-up/brief', sha256: 'a'.repeat(64), bytes: 1}, sandbox: {folder: '/made-up', instance: 'made-up', container: 'made-up'}}
  const make = (workerId: string, date: string) => {
    const run = t.api.createRecord({kind: 'session', workspaceId: 'default', origin: 'fixture', actor: {type: 'human', id: THE_PERSON}, title: 'Made-up asking run', data: {runtime: 'claude-code', state: 'running'}}).id
    t.client.sqlite.prepare("UPDATE records SET updated_at = ?, data = json_set(data, '$.workerRuns', json(?)) WHERE id = ?").run(date, JSON.stringify({[workerId]: ask}), run)
    return run
  }
  for (let i = 0; i < 25; i++) make(i % 2 === 0 ? 'old-id-of-hold-worker' : agent, '2000-01-01 00:00:00')
  const eligible = make(next, '2001-01-01 00:00:00')
  const later = make(next, '2002-01-01 00:00:00')
  const {theWorkerRunsToStart} = await import('../src/server/lib/worker-runs.ts')
  const rows = theWorkerRunsToStart('default')
  expect(rows.some(row => row.run === eligible && row.agentId === next)).toBe(true)
  expect(rows.filter(row => row.run === eligible || row.run === later).map(row => row.run)).toEqual([eligible, later])
  expect(rows.length).toBeLessThanOrEqual(25)
})
