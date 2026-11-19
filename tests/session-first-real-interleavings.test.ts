// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** Drive the real queue, session and starter doors with a controlled version program. */
import { randomBytes } from 'node:crypto'
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import type { FastifyInstance } from 'fastify'
import { afterAll, afterEach, beforeAll, expect, it, vi } from 'vitest'
import { THE_PERSON } from '../src/shared/person.ts'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { aCheckoutForATestRun } from './a-checkout-for-a-test-run.ts'

let t: TestDb
let app: FastifyInstance
let scratch: string
const personKey = randomBytes(32).toString('hex')
const officeKey = randomBytes(32).toString('hex')
const person = { 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON, 'x-mole-office-key': personKey }
const office = { 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': 'mole-office/the-message-worker', 'x-mole-office-key': officeKey }
const ids: Record<string, string> = {}

beforeAll(async () => {
  t = await freshDb()
  writeFileSync(join(dirname(t.file), 'keys.json'), JSON.stringify({ person: personKey, office: officeKey, providers: {} }), { mode: 0o600 })
  app = (await apiApp()).app
  await app.ready()
  scratch = mkdtempSync(join(tmpdir(), 'session-real-interleavings-'))
  for (const handle of ['press-before-admission', 'admission-before-press', 'new-fixture-starter']) {
    const res = await app.inject({ method: 'POST', url: '/api/agents/started', headers: person, payload: { handle, name: handle, runtime: 'codex' } })
    expect(res.statusCode).toBe(201)
    ids[handle] = (t.client.sqlite.prepare('SELECT id FROM agents WHERE handle = ?').get(handle) as { id: string }).id
  }
}, 120_000)

afterEach(() => vi.unstubAllGlobals())
afterAll(async () => { await app?.close(); t?.close(); if (scratch) rmSync(scratch, { recursive: true, force: true }) })

async function queueRow(handle: string) {
  const body = 'A made-up message for the admission ordering test.'
  const sent = await app.inject({ method: 'POST', url: '/api/records', headers: person, payload: { kind: 'message', title: `Message for ${handle}`, data: { body, to: [{ kind: 'agent', id: ids[handle] }] } } })
  // A PERSON'S SEND TO AN AGENT NOTHING HOLDS ANSWERS 409, with the letter stored and routed (decision 60sbc5I-bwKx).
  expect(sent.statusCode).toBe(409)
  const messageId = sent.json().record.id as string
  const asked = await app.inject({ method: 'POST', url: `/api/messages/${messageId}/start-an-agent`, headers: person, payload: {} })
  expect(asked.statusCode).toBe(200)
  const queue = await app.inject({ method: 'GET', url: '/api/worker/queue?full=1', headers: office })
  expect(queue.statusCode).toBe(200)
  const row = (queue.json().queue as Record<string, unknown>[]).find((one) => one['messageId'] === messageId)
  expect(row).toBeDefined()
  expect(row!['body']).toBe(body)
  return { ...row!, body, runtime: 'codex', model: 'made-up-model', resume: null }
}

async function press(agent: string) {
  const res = await app.inject({ method: 'POST', url: `/api/agents/${agent}/starter`, headers: person, payload: { to: ids['new-fixture-starter'], because: 'Made-up interleaving press' } })
  expect(res.statusCode).toBe(200)
  const answer = res.json() as { change: { state: string }; runsNotEnded: { id: string }[] }
  expect(answer.change.state).toBe('waiting')
  return answer
}

async function runRealAdmissionInterleaving(handle: string, order: 'press-first' | 'admission-first') {
  // The actual queue is read before either competing operation.
  const row = await queueRow(handle)
  const agent = ids[handle]!
  if (order === 'press-first') {
    // This other live run makes the press wait; it appears only after the queue snapshot.
    t.api.createRecord({ kind: 'session', workspaceId: 'default', origin: 'fixture', actor: { type: 'agent', id: agent }, title: 'Another made-up live run', data: { state: 'running', runtime: 'codex', servingAgentId: agent } })
  }
  const dir = join(scratch, handle)
  mkdirSync(dir)
  const marker = join(dir, 'probe-started')
  const executable = join(dir, process.platform === 'win32' ? 'codex.cmd' : 'codex')
  const standIn = `require('node:fs').appendFileSync(${JSON.stringify(marker)}, 'probe\\n'); console.log('codex stand-in version');\n`
  if (process.platform === 'win32') {
    const script = join(dir, 'stand-in.cjs')
    writeFileSync(script, standIn)
    writeFileSync(executable, `@"${process.execPath}" "${script}" %*\r\n`)
  } else writeFileSync(executable, `#!${process.execPath}\n${standIn}`)
  chmodSync(executable, 0o755)
  const events: string[] = []
  let admitted: string | null = null
  let filingStatus: number | null = null
  let pressRuns: string[] = []

  // This is transport only: all session and starter writes go through the real app and SQLite.
  // The barrier is between the session commit and its reply reaching the worker, or immediately
  // before the session request. No request is made to the live office.
  vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
    const path = new URL(url).pathname
    const method = init?.method ?? 'GET'
    if (path === '/api/brief') return new Response('{}', { status: 200 })
    if (path === '/api/office-regulations/chapters') return new Response('Made-up failure after the probe', { status: 503 })
    const isFiling = path === '/api/records' && method === 'POST'
    if (isFiling && order === 'press-first') {
      pressRuns = (await press(agent)).runsNotEnded.map((run) => run.id)
      expect(existsSync(marker)).toBe(false)
      events.push('press-waiting')
    }
    const res = await app.inject({ method: method as 'GET' | 'POST' | 'PATCH', url: path, headers: Object.fromEntries(new Headers(init?.headers).entries()), ...(init?.body === undefined ? {} : { payload: String(init.body) }) })
    if (isFiling) {
      filingStatus = res.statusCode
      if (order === 'admission-first' && res.statusCode === 201) {
        admitted = res.json().record.id as string
        events.push('session-committed')
        pressRuns = (await press(agent)).runsNotEnded.map((run) => run.id)
        expect(existsSync(marker)).toBe(false)
        events.push('press-waiting')
      }
    }
    return new Response(res.body, { status: res.statusCode, headers: { 'content-type': 'application/json' } })
  })
  const { startOne } = await import('../src/worker/index.ts')
  const settings = { api: 'http://stand-in.invalid', workspace: 'default', session: null, stopWithPid: null, checkout: aCheckoutForATestRun(), outputRoot: dir, env: { PATH: dir, MOLE_OFFICE_DB: t.file }, runs: 1, hops: 1 }
  const result = await startOne(row as Parameters<typeof startOne>[0], settings as Parameters<typeof startOne>[1], [])
  return { result, events, marker, admitted, filingStatus, pressRuns, executable }
}

it('refuses filing and starts no version probe when the waiting press wins', async () => {
  const result = await runRealAdmissionInterleaving('press-before-admission', 'press-first')
  expect(result.events).toEqual(['press-waiting'])
  expect(result.pressRuns.length).toBeGreaterThan(0)
  expect(result.filingStatus).toBe(409)
  expect(result.result.ok).toBe(false)
  expect(existsSync(result.marker)).toBe(false)
})

it('lets the admitted run probe after the later press starts waiting on it', async () => {
  const result = await runRealAdmissionInterleaving('admission-before-press', 'admission-first')
  expect(result.events).toEqual(['session-committed', 'press-waiting'])
  expect(result.filingStatus).toBe(201)
  expect(result.pressRuns).toContain(result.admitted)
  expect(readFileSync(result.marker, 'utf8')).toBe('probe\n')
  expect(result.result.ok).toBe(false) // the chapters stand-in deliberately fails afterwards
  const read = await app.inject({ method: 'GET', url: `/api/records/${result.admitted}`, headers: person })
  expect(read.statusCode).toBe(200)
  expect(read.json().record.data).toMatchObject({ state: 'crashed', ranProgram: result.executable, ranProgramVersion: 'codex stand-in version' })
})
