// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { withoutInheritedEffort } from './without-inherited-effort.ts'
/** Fake-runtime exits need submitted work, so this file uses the same fixture as the M22 and M79 tests: it registers a record area when absent and submits an explicit completion note through the real sealer. */
import { supplyRuntimeSubmissions } from './synthetic-submission-fixtures.ts'
/**
 * AN AGENT WHOSE RUN WAITS FOR THE NEXT MESSAGE READS REACHABLE.
 *
 * Criterion M89 of design/messages/ACCEPTANCE.md: the agent went down the moment the
 * conversation ended, with no heartbeat kept. Problem `KKRT8OQX5bWm`.
 *
 * WHAT THE PRODUCT DID BEFORE. A run the worker started answers, and `startTheWait` writes `waitsUntil`
 * on its record (criterion M22). For that many minutes the queue gives the next message to that run's
 * conversation without asking anybody. But the run's process has ended and its hold is released, so
 * `whoIsAnsweringAs` answered `nobody`: the chat drew Cannot reach, and the presence reading did not
 * name the wait. Two readings of one fact disagreed.
 *
 * WHAT IS PROVED HERE.
 *
 * 1. Inside the wait, the handle door and the conversation read answer `a waiting run`, name the run's
 *    session record, and carry one sentence. The presence reading is green and carries the same
 *    sentence.
 * 2. Once the wait has ended, the handle door answers `nobody` again.
 * 3. A message sent inside the wait is still given to the same run's conversation, with no press, and
 *    its queue row says no run is already going.
 *
 * IT DRIVES THE REAL WORKER against a real server, with the fake runtime. Time is moved rather than
 * waited for: the run's `waitsUntil` is patched into the past, which is the same fact as the minutes
 * passing.
 */

import type { AddressInfo } from 'node:net'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, URL } from 'node:url'

import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { whoIsAnsweringSays } from '../src/shared/handles.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { localStamp } from '../src/shared/time.ts'
import { onePass, type WorkerSettings } from '../src/worker/index.ts'
import { apiApp, freshDb, one, type TestDb } from './helpers.ts'
import { aCheckoutForATestRun } from './a-checkout-for-a-test-run.ts'

const FAKE = fileURLToPath(new URL('./fake-runtime.mjs', import.meta.url))

let t: TestDb
let app: FastifyInstance
let outputs: string
let settings: WorkerSettings
const watching: Parameters<typeof onePass>[1] = []

const AS_THE_OWNER = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

async function send(method: 'GET' | 'POST' | 'PATCH', path: string, body?: unknown): Promise<Record<string, unknown>> {
  const reply = await app.inject({
    method,
    url: path,
    headers: AS_THE_OWNER,
    ...(body === undefined ? {} : { payload: body as object }),
  })
  return JSON.parse(reply.body === '' ? '{}' : reply.body) as Record<string, unknown>
}

async function anAgent(handle: string): Promise<string> {
  await send('POST', '/api/records', { kind: 'agent', title: handle, data: { handle, state: 'active', runtime: 'claude-code' } })
  const listed = (await send('GET', '/api/participants')) as { agents?: { id: string; handle: string }[] }
  return one((listed.agents ?? []).filter((a) => a.handle === handle), `the registry row for ${handle}`).id
}

/** Send a message from the owner to an agent, and give back its id. */
async function messageTo(agentId: string, body: string): Promise<string> {
  const filed = await send('POST', '/api/records', { kind: 'message', title: body.slice(0, 60), data: { body, to: [{ kind: 'agent', id: agentId }] } })
  return (filed['record'] as { id: string }).id
}

/** Run passes until something is true, or say it never was. */
async function until(what: () => Promise<boolean>, within = 20_000): Promise<boolean> {
  const deadline = Date.now() + within
  for (;;) {
    await onePass(settings, watching)
    if (watching.length === 0 && (await what())) return true
    if (Date.now() >= deadline) return false
    await new Promise((go) => setTimeout(go, 100))
  }
}

interface Answering {
  how: string
  session: string | null
  says: string
}

async function viaTheHandleDoor(handle: string): Promise<Answering> {
  const read = (await send('GET', `/api/handles/${handle}`)) as { answering?: Answering }
  if (read.answering === undefined) throw new Error('the handle door gave no answering reading')
  return read.answering
}

async function viaTheConversation(agentId: string): Promise<{ answering: Answering | null; bodies: string[] }> {
  const read = (await send('GET', `/api/messages/conversation?kind=agent&id=${agentId}`)) as {
    answering?: Answering | null
    messages?: { body: string }[]
  }
  return { answering: read.answering ?? null, bodies: (read.messages ?? []).map((m) => m.body) }
}

async function presence(agentId: string): Promise<{ colour: string; word: string; from: string | null; says: string }> {
  const read = (await send('GET', `/api/presence/agent/${agentId}`)) as {
    presence?: { colour: string; word: string; from: string | null; says: string }
  }
  if (read.presence === undefined) throw new Error('no presence came back')
  return read.presence
}

async function runData(session: string): Promise<Record<string, unknown>> {
  const read = (await send('GET', `/api/records/${session}`)) as { record?: { data?: Record<string, unknown> } }
  return read.record?.data ?? {}
}

async function runOf(messageId: string): Promise<string> {
  const read = (await send('GET', `/api/messages/${messageId}`)) as { message?: { deliveries?: { run: string | null }[] } }
  const row = one(read.message?.deliveries ?? [], `a delivery row for ${messageId}`)
  if (row.run === null) throw new Error(`No run is named on the delivery row for ${messageId}.`)
  return row.run
}

/** One agent answered once by a run the worker started, so its wait has begun. */
async function anAgentWhoseRunHasAnswered(handle: string): Promise<{ agentId: string; run: string }> {
  const agentId = await anAgent(handle)
  const first = await messageTo(agentId, 'Please read record aaaaaaaaaaaa and say what it is.')
  // THE PERSON'S PRESS, because this agent is fresh and M78 holds a message that would start a new
  // agent. This file is about what happens after the run has answered.
  await send('POST', `/api/messages/${first}/start-an-agent`, {})
  expect(await until(async () => (await viaTheConversation(agentId)).bodies.length >= 2)).toBe(true)
  const run = await runOf(first)
  expect((await runData(run))['waitsUntil'], 'the run started a wait').toBeTypeOf('string')
  return { agentId, run }
}

/** The wait's end as a person reads it: HH:MM, local wall clock. */
function hhmm(stamp: unknown): string {
  const text = String(stamp)
  return text.slice(11, 16)
}

beforeAll(async () => {
  t = await freshDb()
  const built = await apiApp()
  app = built.app
  supplyRuntimeSubmissions(t, app)
  await app.ready()
  await app.listen({ host: '127.0.0.1', port: 0 })
  outputs = mkdtempSync(join(tmpdir(), 'mole-office-run-waits-reachable-'))
  settings = {
    api: `http://127.0.0.1:${String((app.server.address() as AddressInfo).port)}`,
    workspace: 'default',
    session: null,
    stopWithPid: null,
    checkout: aCheckoutForATestRun(),
    runs: 2,
    hops: 3,
    outputRoot: outputs,
    env: { ...withoutInheritedEffort(), MOLE_OFFICE_FAKE_RUNTIME: FAKE },
  }
}, 60_000)

afterAll(async () => {
  for (const left of watching.splice(0, watching.length)) left.adapter.stop(left.handle, 'the test is over')
  await app.close()
  t.close()
  rmSync(outputs, { recursive: true, force: true })
})

describe('inside the wait', () => {
  let agentId = ''
  let run = ''

  it('the handle door and the conversation read say a waiting run, and the dot is green with the same sentence', async () => {
    ;({ agentId, run } = await anAgentWhoseRunHasAnswered('waits-reachable'))
    const until_ = (await runData(run))['waitsUntil']

    const door = await viaTheHandleDoor('waits-reachable')
    expect(door.how).toBe('a waiting run')
    expect(door.session).toBe(run)
    expect(door.says).toBe(whoIsAnsweringSays('a waiting run', null, null, true, String(until_)))
    expect(door.says).toContain(`until ${hhmm(until_)}`)
    expect(door.says).toContain('A run Mole Office started for this agent')

    const talk = await viaTheConversation(agentId)
    expect(talk.answering).toEqual(door)

    const dot = await presence(agentId)
    expect(dot.colour).toBe('green')
    expect(dot.from).toBe('a run waiting for the next message')
    expect(dot.says).toBe(door.says)
  }, 40_000)

  it('a message sent inside the wait goes to the same run, with no press and no run said to be going', async () => {
    const inside = await messageTo(agentId, 'One more thing, about record bbbbbbbbbbbb.')
    const queue = (await send('GET', '/api/worker/queue?full=1')) as { queue?: Record<string, unknown>[] }
    const row = one((queue.queue ?? []).filter((r) => r['messageId'] === inside), 'the queue row of the message')
    expect(row['runningAlready']).toBeNull()
    expect(row['runningAlreadySays']).toBeNull()
    expect(row['nobodyIsAnsweringAsIt']).toBeNull()
    expect((row['resume'] as { id?: string } | null)?.id).toBe((await runData(run))['providerSession'])

    expect(await until(async () => (await viaTheConversation(agentId)).bodies.length >= 4)).toBe(true)
    const second = await runOf(inside)
    expect(second).not.toBe(run)
    expect((await runData(second))['providerSession']).toBe((await runData(run))['providerSession'])
  }, 40_000)
})

describe('when the wait has ended', () => {
  it('reads nobody again, and the dot no longer names a waiting run', async () => {
    const { agentId, run } = await anAgentWhoseRunHasAnswered('waits-then-ends')
    expect((await viaTheHandleDoor('waits-then-ends')).how).toBe('a waiting run')

    await send('PATCH', `/api/records/${run}`, { dataPatch: { waitsUntil: localStamp(new Date(Date.now() - 60_000)) } })

    const door = await viaTheHandleDoor('waits-then-ends')
    expect(door.how).toBe('nobody')
    expect(door.session).toBeNull()
    expect((await viaTheConversation(agentId)).answering?.how).toBe('nobody')
    expect((await presence(agentId)).from).not.toBe('a run waiting for the next message')
  }, 40_000)
})
