// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { setFixtureOwner } from './agent-owner-fixture.ts'
/**
 * A RELEASE WAKES THE ONE WHO SUBMITS THE RUN, AND NOBODY ELSE.
 *
 * Wave 13y round 9, piece 1, with the secretary's answer HeBxwj6QRGjS (option B). "You are released" woke every reader it
 * went to. The starter of a worker's run submits that run after its release, so the starter's line wakes it, and the
 * worker's own line does not. An agent that queues runs from the check's own result, as the secretary does for the waves,
 * says so once, and a release to it does not wake it either. A refusal wakes every reader, whatever was said.
 *
 * WHAT IS PROVED HERE, each through the waiting door an agent's waiter reads (GET /api/handles/<handle>/waiting):
 *
 *   1. A release of a run whose starter submits it wakes that starter, and not the worker.
 *   2. A release of a wave's run, whose starter reads the check itself, wakes nobody: not the starter, not the worker.
 *   3. A refusal of such a run wakes both. Only a release is quiet.
 *   4. A worker with no agent above it submits its own run, so its release wakes it.
 *   5. The setting is said by the agent with its own key or by the owner, with a reason, and turned off the same way;
 *      anybody else is refused and nothing is written. Turned off, a release wakes the starter again.
 *
 * Nothing here opens ./data/panelx.db: `freshDb` makes a throwaway database.
 */

import { execFileSync } from 'node:child_process'

import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { THE_PERSON } from '../src/shared/person.ts'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { historicalSession } from './synthetic-submission-fixtures.ts'

let t: TestDb
let app: FastifyInstance

const WORKSPACE = 'default'
const TIP = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
const AS_THE_OWNER = {
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
  'x-mole-office-workspace': WORKSPACE,
}
const asAgent = (handle: string, key?: string): Record<string, string> => ({
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': handle,
  'x-mole-office-workspace': WORKSPACE,
  ...(key === undefined ? {} : { 'x-mole-office-key': key }),
})

const keys = new Map<string, string>()

async function register(headers: Record<string, string>, payload: Record<string, unknown>): Promise<void> {
  const reply = await app.inject({ method: 'POST', url: '/api/agents/started', headers, payload })
  expect(reply.statusCode, reply.body).toBe(201)
  const key = (reply.json() as { whatToGiveIt?: { key?: string } }).whatToGiveIt?.key
  if (typeof key === 'string') keys.set(String(payload['handle']), key)
}

/** A worker started by `starter`, with the chapter and the area a check reads. */
async function aWorker(handle: string, starter: Record<string, string>): Promise<void> {
  await register(starter, { handle, name: handle, role: 'worker', chapters: ['5:full'], workArea: ['src/server/lib'] })
}

/** A finished run of one worker, assembled for the inspector, with a report the starter's line can name. */
async function aRunOf(handle: string): Promise<string> {
  const run = historicalSession(t, {
    workspaceId: WORKSPACE,
    kind: 'session',
    title: `${handle}, a run to check`,
    actor: { type: 'agent', id: handle },
    data: { state: 'finished', servingAgent: handle, cutFrom: 'main', tip: TIP, doing: 'building a check' },
  }).id
  const assembled = await app.inject({ method: 'POST', url: `/api/checks/${run}/assembled`, headers: asAgent('inspector-r'), payload: { changes: [] } })
  expect(assembled.statusCode, assembled.body).toBe(201)
  const report = await app.inject({
    method: 'POST',
    url: '/api/records',
    headers: asAgent(handle),
    payload: {
      kind: 'report',
      title: `${handle}, what it did`,
      summary: 'Test: a report a synthetic run files; no work was done.',
      data: { blocks: [{ id: 'b-1', type: 'text', heading: 'What was done', text: 'Test: nothing.' }], date: '2026-10-07', chaptersRead: [5] },
    },
  })
  expect(report.statusCode, report.body).toBe(201)
  return run
}

async function aVerdict(run: string, verdict: 'released' | 'refused'): Promise<void> {
  const reply = await app.inject({
    method: 'POST',
    url: `/api/checks/${run}`,
    headers: asAgent('inspector-r'),
    payload: {
      verdict,
      check: 'Test: a synthetic check; no model judged work.',
      chaptersRead: ['5:full'],
      ...(verdict === 'refused' ? { missing: ['Test: a control run.'], says: { chapter: 5 } } : {}),
    },
  })
  expect(reply.statusCode, reply.body).toBe(201)
}

/** The registry id of the live agent registered under this handle. */
function idOf(handle: string): string {
  const row = t.client.sqlite.prepare('SELECT id FROM agents WHERE handle = ? AND retired = 0').get(handle) as { id: string } | undefined
  expect(row, `nothing is registered as ${handle}`).toBeDefined()
  return row!.id
}

/** The one message about this run to this agent, with the kind it carries. */
function theLineTo(run: string, handle: string): { id: string; notice: string } {
  const rows = t.client.sqlite
    .prepare("SELECT id, data FROM records WHERE kind = 'message' AND deleted_at IS NULL AND json_extract(data, '$.aboutRun') = ?")
    .all(run) as { id: string; data: string }[]
  const to = rows
    .map((row) => ({ id: row.id, data: JSON.parse(row.data) as { to: { id: string }[]; notice?: string } }))
    .filter((one) => one.data.to.some((who) => who.id === idOf(handle)))
  expect(to, `messages about ${run} to ${handle}`).toHaveLength(1)
  return { id: to[0]!.id, notice: String(to[0]!.data.notice) }
}

/**
 * WHETHER THE LINE WAKES ITS READER, read where a waiter reads it: the waiting door hands a waking row over as it is,
 * and a quiet one only beside a waking one, carrying `wakesNoWaiter`.
 */
async function itWakes(messageId: string, handle: string): Promise<boolean> {
  const reply = await app.inject({ method: 'GET', url: `/api/handles/${handle}/waiting`, headers: AS_THE_OWNER })
  expect(reply.statusCode, reply.body).toBe(200)
  const waiting = (reply.json() as { waiting: { messageId: string; wakesNoWaiter?: string }[] }).waiting
  const row = waiting.find((one) => one.messageId === messageId)
  return row !== undefined && row.wakesNoWaiter === undefined
}

async function sayIt(handle: string, headers: Record<string, string>, on: boolean): Promise<{ status: number; body: string }> {
  const reply = await app.inject({
    method: 'POST',
    url: `/api/participants/agent/${handle}/reads-releases-from-the-check`,
    headers,
    payload: { on, because: 'Test: it queues from the check itself.' },
  })
  return { status: reply.statusCode, body: reply.body }
}

function stored(handle: string): unknown {
  return (t.client.sqlite.prepare('SELECT reads_releases_from_the_check AS said FROM agents WHERE id = ?').get(idOf(handle)) as { said: unknown }).said
}

beforeAll(async () => {
  t = await freshDb()
  // THE DEFAULT SET, COPIED AS A NEW OFFICE DOES AT ITS FIRST START: a registration's chapters line is read against the
  // office's own chapter records (wave 13w). Imported after freshDb, which resets the modules.
  const { copyTheDefaultRegulationsOnce } = await import('../src/server/lib/default-regulations.ts')
  expect(copyTheDefaultRegulationsOnce().copied).toBeGreaterThan(0)
  app = (await apiApp()).app
  await app.ready()
  await register(AS_THE_OWNER, { handle: 'inspector-r', name: 'Inspector R', role: 'inspector' })
  // A STARTER THAT SUBMITS ITS WORKERS' RUNS, as one starter does (message YKET_0A7WEJs), and one that queues from the
  // check's own result, as the secretary does for the waves.
  await register(AS_THE_OWNER, { handle: 'submits-s', name: 'Submits S', role: 'secretary' })
  await register(AS_THE_OWNER, { handle: 'queues-q', name: 'Queues Q', role: 'secretary' })
  await aWorker('hands-h', asAgent('submits-s'))
  await aWorker('wave-w', asAgent('queues-q'))
  // A WORKER THE OWNER STARTED THEMSELVES has no agent above it, so it submits its own run.
  await aWorker('alone-a', AS_THE_OWNER)
}, 60_000)

afterAll(async () => {
  await app.close()
  t.close()
})

describe('who may say an agent reads a release from the check', () => {
  it('starts as nobody having said', async () => {
    const read = await app.inject({ method: 'GET', url: '/api/participants/agent/queues-q/reads-releases-from-the-check', headers: AS_THE_OWNER })
    expect(read.statusCode, read.body).toBe(200)
    expect((read.json() as { readsReleasesFromTheCheck: unknown }).readsReleasesFromTheCheck).toBeNull()
  })

  it('refuses another agent, and the agent itself without its key, and writes nothing', async () => {
    const another = await sayIt('queues-q', asAgent('submits-s', keys.get('submits-s')), true)
    expect(another.status, another.body).toBe(403)
    const noKey = await sayIt('queues-q', asAgent('queues-q'), true)
    expect(noKey.status, noKey.body).toBe(403)
    const noReason = await app.inject({
      method: 'POST',
      url: '/api/participants/agent/queues-q/reads-releases-from-the-check',
      headers: AS_THE_OWNER,
      payload: { on: true },
    })
    expect(noReason.statusCode, noReason.body).toBe(400)
    expect(stored('queues-q')).toBeNull()
  })

  it('takes it from the agent with its own key, and keeps who, when and why', async () => {
    const said = await sayIt('queues-q', asAgent('queues-q', keys.get('queues-q')), true)
    expect(said.status, said.body).toBe(200)
    const value = JSON.parse(String(stored('queues-q'))) as Record<string, unknown>
    expect(value['on']).toBe(true)
    expect(value['by']).toEqual({ kind: 'agent', id: idOf('queues-q') })
    expect(value['because']).toBe('Test: it queues from the check itself.')
    expect(typeof value['at']).toBe('string')
  })
})

describe('a release wakes the one who submits the run', () => {
  it("wakes the starter that submits its worker's run, and not the worker", async () => {
    const run = await aRunOf('hands-h')
    await aVerdict(run, 'released')
    const toTheStarter = theLineTo(run, 'submits-s')
    const toTheWorker = theLineTo(run, 'hands-h')
    expect(toTheStarter.notice).toBe('checkedAndReleased')
    expect(await itWakes(toTheStarter.id, 'submits-s'), 'the starter that submits was not woken').toBe(true)
    expect(toTheWorker.notice).toBe('releasedAndTheStarterIsTold')
    expect(await itWakes(toTheWorker.id, 'hands-h'), 'the worker was woken although its starter submits').toBe(false)
  })

  it("does not wake a starter that reads the check itself, nor the wave's worker", async () => {
    const run = await aRunOf('wave-w')
    await aVerdict(run, 'released')
    const toTheStarter = theLineTo(run, 'queues-q')
    const toTheWorker = theLineTo(run, 'wave-w')
    expect(toTheStarter.notice).toBe('releasedToOneThatReadsTheCheck')
    expect(await itWakes(toTheStarter.id, 'queues-q'), 'the starter that reads the check was woken').toBe(false)
    expect(await itWakes(toTheWorker.id, 'wave-w'), "the wave's worker was woken").toBe(false)
  })

  it('wakes a starter that reads the check, and its worker, on a refusal', async () => {
    const run = await aRunOf('wave-w')
    await aVerdict(run, 'refused')
    const toTheStarter = theLineTo(run, 'queues-q')
    const toTheWorker = theLineTo(run, 'wave-w')
    expect(toTheStarter.notice).toBe('aRefusalForTheStarter')
    expect(await itWakes(toTheStarter.id, 'queues-q'), 'a refusal did not wake the starter').toBe(true)
    expect(toTheWorker.notice).toBe('refused')
    expect(await itWakes(toTheWorker.id, 'wave-w'), 'a refusal did not wake the worker').toBe(true)
  })

  it('wakes a worker with no agent above it, which submits its own run', async () => {
    const run = await aRunOf('alone-a')
    await aVerdict(run, 'released')
    const toTheWorker = theLineTo(run, 'alone-a')
    expect(toTheWorker.notice).toBe('released')
    expect(await itWakes(toTheWorker.id, 'alone-a'), 'the worker that submits was not woken').toBe(true)
  })

  it('wakes the starter again once the owner turns it off', async () => {
    const off = await sayIt('queues-q', AS_THE_OWNER, false)
    expect(off.status, off.body).toBe(200)
    expect(JSON.parse(String(stored('queues-q')))).toMatchObject({ on: false, by: { kind: 'person', id: THE_PERSON } })
    const run = await aRunOf('wave-w')
    await aVerdict(run, 'released')
    const toTheStarter = theLineTo(run, 'queues-q')
    expect(toTheStarter.notice).toBe('checkedAndReleased')
    expect(await itWakes(toTheStarter.id, 'queues-q')).toBe(true)
  })
})

describe('a check after ownership changes', () => {
  it('sends its result to the current owner and retains the starter', async () => {
    await aWorker('check-owned-worker', asAgent('submits-s'))
    const workerId = idOf('check-owned-worker')
    setFixtureOwner(t.client.sqlite, idOf('queues-q'), workerId, 'id')
    const run = await aRunOf('check-owned-worker')
    await aVerdict(run, 'released')
    expect(theLineTo(run, 'queues-q').id).toBeTruthy()
    const rows = t.client.sqlite.prepare("SELECT data FROM records WHERE kind = 'message' AND json_extract(data, '$.aboutRun') = ?").all(run) as { data: string }[]
    const recipients = rows.flatMap((row) => (JSON.parse(row.data) as { to: { id: string }[] }).to.map((one) => one.id))
    expect(recipients).not.toContain(idOf('submits-s'))
    const row = t.client.sqlite.prepare('SELECT started_by_id FROM agents WHERE id = ?').get(workerId) as { started_by_id: string }
    expect(row.started_by_id).toBe(idOf('submits-s'))
  })
})
