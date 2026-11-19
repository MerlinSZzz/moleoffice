// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { withoutInheritedEffort } from './without-inherited-effort.ts'
/**
 * A NOTICE THE OFFICE WRITES THAT ASKS NOTHING DOES NOT WAKE THE WAITER HOLDING A HANDLE.
 *
 * Problems `tXltdrCOfxsO` and `rxxoHZ1MXpGY`. The waiter stops for any row the waiting door answers
 * with, and a stop costs the session a turn. 'Agent run ended' woke a starter's waiter for every
 * finished run. 'Idle — your role and duties' woke agents that were waiting on purpose, during a quota
 * freeze. The rule lives in `whyThisWakesNoWaiter` (src/server/lib/notices.ts), which reads the kind each
 * notice carries against the one table of kinds there. The door applies it in
 * `whatTheWaiterIsHanded` (src/server/api/handles.ts), and the worker queue keeps such a notice queued
 * for a live session (`keptForTheSession` in src/server/lib/worker.ts).
 *
 * WHAT IS PROVED HERE:
 *
 *   1. The door answers an empty list when only such notices are waiting, and its note says how many.
 *   2. The notice is handed over beside the next message that is not one, and its row says why it
 *      woke nobody. So the agent still reads it.
 *   3. A line the office writes that is not on the list still wakes the waiter.
 *   4. With ?wait, such a notice neither answers at once nor ends a hold. A person's message does.
 *   5. While a live session holds the handle, the worker leaves the notice queued. Without a hold it
 *      is marked delivered, as every line the office writes always was.
 *   6. A stored line of a kind the office no longer writes stays as quiet as it was, at the door and in
 *      the worker. Its kind is retired, so no door writes one; the case stores a line and gives it the
 *      retired kind in the database, as a row written before the retirement holds it.
 */

import type { AddressInfo } from 'node:net'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, URL } from 'node:url'

import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { THE_PERSON } from '../src/shared/person.ts'
import { moleOffice } from '../src/shared/participants.ts'
import { SYSTEM_LINES } from '../src/shared/groups.ts'
import { onePass, type WorkerSettings } from '../src/worker/index.ts'
import { apiApp, freshDb, one, type TestDb } from './helpers.ts'

const FAKE = fileURLToPath(new URL('./fake-runtime.mjs', import.meta.url))
const CHECKOUT = fileURLToPath(new URL('..', import.meta.url)).replace(/\/$/, '')

let t: TestDb
let app: FastifyInstance
let api = ''
let outputs = ''
let settings: WorkerSettings
let groups: typeof import('../src/server/lib/groups.ts')
const watching: Parameters<typeof onePass>[1] = []

const AS_THE_OWNER = {
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

const THE_OFFICE = { type: 'system', id: moleOffice().id } as const

const realSetTimeout = globalThis.setTimeout
const pause = (ms: number): Promise<void> => new Promise((go) => realSetTimeout(go, ms))

async function post(path: string, body: unknown): Promise<Record<string, unknown>> {
  const reply = await app.inject({ method: 'POST', url: path, headers: AS_THE_OWNER, payload: body as never })
  return reply.json() as Record<string, unknown>
}

async function get(path: string): Promise<Record<string, unknown>> {
  const reply = await app.inject({ method: 'GET', url: path, headers: AS_THE_OWNER })
  return reply.json() as Record<string, unknown>
}

async function anAgent(handle: string): Promise<string> {
  await post('/api/records', { kind: 'agent', title: handle, data: { handle, state: 'active', runtime: 'claude-code' } })
  const listed = (await get('/api/participants')) as { agents?: { id: string; handle: string }[] }
  return one((listed.agents ?? []).filter((a) => a.handle === handle), `the registry row for ${handle}`).id
}

async function aSession(title: string): Promise<string> {
  const filed = await post('/api/records', {
    kind: 'session',
    title,
    data: { state: 'running', runtime: 'claude-code', doing: 'open in a terminal' },
  })
  return (filed['record'] as { id: string }).id
}

async function holdTheHandle(handle: string, session: string): Promise<void> {
  const reply = await app.inject({
    method: 'POST',
    url: `/api/handles/${handle}/hold`,
    headers: AS_THE_OWNER,
    payload: { session, machine: 'a-machine', runtime: 'claude-code' },
  })
  expect(reply.statusCode, reply.body).toBe(201)
}

/** The office's 'Agent run ended' line to one agent, written the way the worker writes it. */
function aRunEndedNoticeTo(agentId: string): string {
  return groups.writeASystemLineToOne({ kind: 'agent', id: agentId }, 'default', SYSTEM_LINES.aRunWaitedAndEnded(5), THE_OFFICE).id
}

/** The office's idle reminder to one agent, written the way the reminder watcher writes it. */
function anIdleNoticeTo(agentId: string): string {
  return groups.writeASystemLineToOne(
    { kind: 'agent', id: agentId },
    'default',
    SYSTEM_LINES.youHaveBeenIdle('You have been idle for about an hour.'),
    THE_OFFICE,
  ).id
}

/** "Read as a checklist item": a quiet kind until the five checklist lines replaced it, and still on stored rows. */
const A_RETIRED_QUIET_KIND = 'theOfficeReadThePersonsWordsAsAnItem'

/** A line of the office's to one agent, stored with the retired kind, as a row written before the retirement is. */
function aStoredRetiredNoticeTo(agentId: string): string {
  const id = aRunEndedNoticeTo(agentId)
  t.client.sqlite.prepare("UPDATE records SET data = json_set(data, '$.notice', ?) WHERE id = ?").run(A_RETIRED_QUIET_KIND, id)
  const stored = t.client.sqlite.prepare("SELECT json_extract(data, '$.notice') AS notice FROM records WHERE id = ?").get(id) as { notice: string }
  // THE CONTROL: the row carries the retired kind, so what is measured below is that kind and not the run-ended one.
  expect(stored.notice).toBe(A_RETIRED_QUIET_KIND)
  return id
}

async function aPersonsMessageTo(agentId: string, body: string): Promise<string> {
  const filed = await post('/api/records', { kind: 'message', title: body, data: { body, to: [{ kind: 'agent', id: agentId }] } })
  return (filed['record'] as { id: string }).id
}

interface WaitingAnswer {
  waiting: { messageId: string; wakesNoWaiter?: string }[]
  note: string
  held?: boolean
  endedBecause?: string
}

async function waitingAt(handle: string, query = ''): Promise<WaitingAnswer> {
  const res = await fetch(`${api}/api/handles/${handle}/waiting${query}`, { headers: AS_THE_OWNER })
  expect(res.status).toBe(200)
  return (await res.json()) as WaitingAnswer
}

function markOf(messageId: string, agentId: string): string {
  const row = t.client.sqlite
    .prepare("SELECT mark FROM message_delivery WHERE message_id = ? AND recipient_kind = 'agent' AND recipient_id = ?")
    .get(messageId, agentId) as { mark: string } | undefined
  if (row === undefined) throw new Error(`no delivery row for ${messageId} to ${agentId}`)
  return row.mark
}

beforeAll(async () => {
  t = await freshDb()
  groups = await import('../src/server/lib/groups.ts')
  app = (await apiApp()).app
  await app.ready()
  await app.listen({ host: '127.0.0.1', port: 0 })
  api = `http://127.0.0.1:${String((app.server.address() as AddressInfo).port)}`
  outputs = mkdtempSync(join(tmpdir(), 'mole-office-quiet-notice-'))
  settings = {
    api,
    workspace: 'default',
    session: null,
    stopWithPid: null,
    checkout: CHECKOUT,
    runs: 2,
    hops: 3,
    outputRoot: outputs,
    env: { ...withoutInheritedEffort(), MOLE_OFFICE_FAKE_RUNTIME: FAKE },
  }
}, 60_000)

afterAll(async () => {
  await app.close()
  t.close()
  rmSync(outputs, { recursive: true, force: true })
})

describe('the waiting door and a notice that asks nothing', () => {
  it('answers empty when only a run-ended notice and an idle notice are waiting, and says how many', async () => {
    const agent = await anAgent('a-starter')
    aRunEndedNoticeTo(agent)
    anIdleNoticeTo(agent)

    const read = await waitingAt('a-starter')
    expect(read.waiting).toEqual([])
    expect(read.note).toContain('2 notices')
    expect(read.note).toContain('do not wake you')
  })

  it('hands the notices over beside the next message that wakes the waiter, each saying why it woke nobody', async () => {
    const agent = await anAgent('a-second-starter')
    const ended = aRunEndedNoticeTo(agent)
    const idle = anIdleNoticeTo(agent)
    const real = await aPersonsMessageTo(agent, 'Please look at the gripper.')

    const read = await waitingAt('a-second-starter')
    expect(read.waiting.map((row) => row.messageId).sort()).toEqual([ended, idle, real].sort())
    const byId = new Map(read.waiting.map((row) => [row.messageId, row]))
    expect(byId.get(ended)?.wakesNoWaiter).toContain('"aRunWaitedAndEnded"')
    expect(byId.get(idle)?.wakesNoWaiter).toContain('"youHaveBeenIdle"')
    expect(byId.get(real)?.wakesNoWaiter).toBeUndefined()
  })

  it('still wakes the waiter for a line the office writes that asks something', async () => {
    const agent = await anAgent('a-late-runner')
    const late = groups.writeASystemLineToOne(
      { kind: 'agent', id: agent },
      'default',
      SYSTEM_LINES.twiceTheExpectedTime('Tell your supervisor why you are stuck.'),
      THE_OFFICE,
    ).id

    const read = await waitingAt('a-late-runner')
    expect(read.waiting.map((row) => row.messageId)).toEqual([late])
    expect(read.waiting[0]?.wakesNoWaiter).toBeUndefined()
  })

  it('starts a hold instead of answering at once when only such a notice is waiting', async () => {
    const agent = await anAgent('a-held-starter')
    aRunEndedNoticeTo(agent)

    const read = await waitingAt('a-held-starter', '?wait=1')
    expect(read.held).toBe(true)
    expect(read.endedBecause).toBe('the cap passed')
    expect(read.waiting).toEqual([])
  })

  it('is not ended by a notice written during the hold, and is ended by a person with both handed over', async () => {
    const agent = await anAgent('a-holding-starter')
    let settled = false
    const answer = waitingAt('a-holding-starter', '?wait=20').then((read) => {
      settled = true
      return read
    })
    await pause(400)
    const ended = aRunEndedNoticeTo(agent)
    await pause(600)
    expect(settled, 'the notice ended the hold').toBe(false)

    const real = await aPersonsMessageTo(agent, 'Are you there?')
    const read = await answer
    expect(read.endedBecause).toBe('a message arrived')
    expect(read.waiting.map((row) => row.messageId).sort()).toEqual([ended, real].sort())
  }, 30_000)

  it('keeps a stored line of a retired quiet kind quiet, and hands it over beside the next message', async () => {
    const agent = await anAgent('a-retired-kind-reader')
    const retired = aStoredRetiredNoticeTo(agent)

    const alone = await waitingAt('a-retired-kind-reader')
    expect(alone.waiting, 'a stored line of a retired kind woke the waiter').toEqual([])
    expect(alone.note).toContain('1 notice')

    const real = await aPersonsMessageTo(agent, 'Is the second batch glazed?')
    const read = await waitingAt('a-retired-kind-reader')
    expect(read.waiting.map((row) => row.messageId).sort()).toEqual([retired, real].sort())
    const byId = new Map(read.waiting.map((row) => [row.messageId, row]))
    expect(byId.get(retired)?.wakesNoWaiter).toContain(`"${A_RETIRED_QUIET_KIND}"`)
    expect(byId.get(real)?.wakesNoWaiter).toBeUndefined()
  })
})

describe('the worker and a notice that asks nothing', () => {
  it('leaves it queued while a live session holds the handle, so the waiter can hand it over later', async () => {
    const agent = await anAgent('a-live-starter')
    const session = await aSession('The terminal answering as a-live-starter')
    await holdTheHandle('a-live-starter', session)
    const ended = aRunEndedNoticeTo(agent)

    const queue = (await get('/api/worker/queue')) as { queue?: Record<string, unknown>[] }
    const row = one((queue.queue ?? []).filter((one) => one['messageId'] === ended), 'the notice in the queue')
    expect(row['needsNoRun']).toBeNull()
    expect(String(row['heldByALiveSession'])).toContain(session)

    const report = await onePass(settings, watching)
    expect(report.started).toEqual([])
    expect(markOf(ended, agent)).toBe('queued')
  })

  it('marks it delivered with no run when nobody holds the handle, as before', async () => {
    const agent = await anAgent('a-starter-nobody-holds')
    const ended = aRunEndedNoticeTo(agent)

    const queue = (await get('/api/worker/queue')) as { queue?: Record<string, unknown>[] }
    const row = one((queue.queue ?? []).filter((one) => one['messageId'] === ended), 'the notice in the queue')
    expect(row['needsNoRun']).not.toBeNull()

    await onePass(settings, watching)
    expect(markOf(ended, agent)).toBe('delivered')
  })

  it('leaves a stored line of a retired quiet kind queued while a live session holds the handle', async () => {
    const agent = await anAgent('a-live-retired-kind-reader')
    const session = await aSession('The terminal answering as a-live-retired-kind-reader')
    await holdTheHandle('a-live-retired-kind-reader', session)
    const retired = aStoredRetiredNoticeTo(agent)

    const queue = (await get('/api/worker/queue')) as { queue?: Record<string, unknown>[] }
    const row = one((queue.queue ?? []).filter((one) => one['messageId'] === retired), 'the stored line in the queue')
    expect(row['needsNoRun'], 'the stored line of a retired kind is marked as one that needs no run').toBeNull()
    expect(String(row['heldByALiveSession'])).toContain(session)

    const report = await onePass(settings, watching)
    expect(report.started).toEqual([])
    expect(markOf(retired, agent), 'the worker marked the stored line delivered, so the waiter never hands it over').toBe('queued')
  })
})
