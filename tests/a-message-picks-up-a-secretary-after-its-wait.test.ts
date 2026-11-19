// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { withoutInheritedEffort } from './without-inherited-effort.ts'
/** Fake-runtime exits need submitted work, so this file uses the same fixture as the M22 and M89 tests: it registers a record area when absent and submits an explicit completion note through the real sealer. */
import { supplyRuntimeSubmissions } from './synthetic-submission-fixtures.ts'
/**
 * A MESSAGE PICKS UP A SECRETARY'S OR A SUPERVISOR'S OWN CONVERSATION AFTER ITS RUN'S WAIT.
 *
 * A decision of the owner's, on criterion M78 of design/messages/ACCEPTANCE.md, takes the secretary's
 * recommendation: secretaries and supervisors can always be resumed by a message; a worker is retired
 * when it finishes (M109) and is not resumed.
 *
 * WHAT THE PRODUCT DID BEFORE. A run that answered waited for the next message for ten minutes
 * (criterion M22). After that, a message to any agent was a message to a new agent: the queue row
 * carried no conversation to pick up, the chat drew Cannot reach, and the person was asked to press.
 *
 * WHAT IS PROVED HERE, against a real server and the real message worker, with the fake runtime.
 *
 * 1. A supervisor and a secretary whose run's wait has ended, and whose ending line has been written:
 *    the ending line says the conversation is kept; the handle door, the conversation read and the
 *    presence dot all read it reachable with one sentence; the queue row names its conversation and
 *    asks for no press; and the run the worker starts carries the same conversation id.
 * 2. A worker, and an agent with no card, whose wait has ended: exactly as before. The ending line
 *    says the next run will not remember this one, the reading is nobody, the queue row names no
 *    conversation, and it asks for the press.
 *
 * TIME IS MOVED RATHER THAN WAITED FOR: the run's `waitsUntil` is patched into the past, which is
 * the same fact as the minutes passing.
 */

import type { AddressInfo } from 'node:net'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, URL } from 'node:url'

import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { SYSTEM_LINES } from '../src/shared/groups.ts'
import { whoIsAnsweringSays } from '../src/shared/handles.ts'
import { nobodyIsAnsweringAsIt } from '../src/shared/messages.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { THE_SECRETARY, THE_SUPERVISOR, THE_WORKER } from '../src/shared/roles.ts'
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

/** Register an agent holding one card, or none, and prove the registry row holds what was asked. */
async function anAgent(handle: string, card: string | null): Promise<string> {
  await send('POST', '/api/records', {
    kind: 'agent',
    title: handle,
    data: { handle, state: 'active', runtime: 'claude-code', ...(card === null ? {} : { role: card }) },
  })
  const listed = (await send('GET', '/api/participants')) as { agents?: { id: string; handle: string; role: string | null }[] }
  const row = one((listed.agents ?? []).filter((a) => a.handle === handle), `the registry row for ${handle}`)
  expect(row.role, `the registry row for ${handle} does not hold the card the test asked for`).toBe(card)
  return row.id
}

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

interface Said {
  body: string
  saidInFull: string | null
}

async function viaTheConversation(agentId: string): Promise<{ answering: Answering | null; said: Said[] }> {
  const read = (await send('GET', `/api/messages/conversation?kind=agent&id=${agentId}`)) as {
    answering?: Answering | null
    messages?: Said[]
  }
  return { answering: read.answering ?? null, said: read.messages ?? [] }
}

async function presence(agentId: string): Promise<{ colour: string; from: string | null; says: string }> {
  const read = (await send('GET', `/api/presence/agent/${agentId}`)) as {
    presence?: { colour: string; from: string | null; says: string }
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

async function queueRowOf(messageId: string): Promise<Record<string, unknown>> {
  const queue = (await send('GET', '/api/worker/queue?full=1')) as { queue?: Record<string, unknown>[] }
  return one((queue.queue ?? []).filter((r) => r['messageId'] === messageId), `the queue row of ${messageId}`)
}

const ENDED = SYSTEM_LINES.aRunWaitedAndEnded(10).line

/** The full sentence of every "A run answered" line in the conversation, oldest first. */
async function answeredLines(agentId: string): Promise<(string | null)[]> {
  return (await viaTheConversation(agentId)).said
    .filter((m) => m.body === SYSTEM_LINES.aRunAnswered.line)
    .map((m) => m.saidInFull)
}

/**
 * One agent answered once by a run the worker started; then its wait is moved into the past and the
 * worker's passes write the ending line, so the run has left the list of waiting runs.
 */
async function anAgentWhoseWaitHasEnded(handle: string, card: string | null): Promise<{ agentId: string; run: string }> {
  const agentId = await anAgent(handle, card)
  const first = await messageTo(agentId, 'Please read record aaaaaaaaaaaa and say what it is.')
  // THE PERSON'S PRESS, because this agent is fresh and M78 holds a message that would start a new
  // agent. This file is about what happens after the run has answered and its wait has ended.
  await send('POST', `/api/messages/${first}/start-an-agent`, {})
  expect(await until(async () => (await viaTheConversation(agentId)).said.length >= 2)).toBe(true)
  const run = await runOf(first)
  expect((await runData(run))['waitsUntil'], 'the run started a wait').toBeTypeOf('string')
  await send('PATCH', `/api/records/${run}`, { dataPatch: { waitsUntil: localStamp(new Date(Date.now() - 60_000)) } })
  expect(
    await until(async () => (await viaTheConversation(agentId)).said.some((m) => m.body === ENDED)),
    'the worker wrote no ending line',
  ).toBe(true)
  const waits = (await send('GET', '/api/worker/waits')) as { waits?: { session: string }[] }
  expect((waits.waits ?? []).filter((w) => w.session === run), 'the run is still in the list of waiting runs').toHaveLength(0)
  return { agentId, run }
}

beforeAll(async () => {
  t = await freshDb()
  const built = await apiApp()
  app = built.app
  supplyRuntimeSubmissions(t, app)
  await app.ready()
  await app.listen({ host: '127.0.0.1', port: 0 })
  outputs = mkdtempSync(join(tmpdir(), 'mole-office-picks-up-a-secretary-'))
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

describe.each([
  { card: THE_SUPERVISOR, handle: 'kept-supervisor' },
  { card: THE_SECRETARY, handle: 'kept-secretary' },
])('a $card whose wait has ended', ({ card, handle }) => {
  let agentId = ''
  let run = ''

  it('gets an ending line that says its conversation is kept', async () => {
    ;({ agentId, run } = await anAgentWhoseWaitHasEnded(handle, card))
    const line = one(
      (await viaTheConversation(agentId)).said.filter((m) => m.body === ENDED),
      'the ending line',
    )
    expect(line.saidInFull).toBe(SYSTEM_LINES.aKeptConversationWaitedAndEnded(10).said)
    expect(line.saidInFull).toContain('its conversation is kept')
    expect(line.saidInFull).not.toContain('will not remember')
  }, 60_000)

  it('reads reachable at the handle door, in the conversation and on the dot, with one sentence', async () => {
    const door = await viaTheHandleDoor(handle)
    expect(door.how).toBe('its own conversation')
    expect(door.session).toBe(run)
    expect(door.says).toBe(whoIsAnsweringSays('its own conversation', null))
    expect((await viaTheConversation(agentId)).answering).toEqual(door)
    const dot = await presence(agentId)
    expect(dot.colour).toBe('green')
    expect(dot.from).toBe('its own conversation, picked up by a message')
    expect(dot.says).toBe(door.says)
  }, 30_000)

  it('is picked up by the next message: the queue names its conversation, asks for no press, and the run resumes it', async () => {
    const provider = (await runData(run))['providerSession']
    expect(provider).toBeTypeOf('string')
    const later = await messageTo(agentId, 'A message after the wait, about record bbbbbbbbbbbb.')
    const row = await queueRowOf(later)
    expect((row['resume'] as { id?: string } | null)?.id).toBe(provider)
    expect(row['nobodyIsAnsweringAsIt']).toBeNull()
    expect(row['runningAlready']).toBeNull()

    const answered = await until(async () => {
      const read = (await send('GET', `/api/messages/${later}`)) as { message?: { deliveries?: { run: string | null }[] } }
      const theRun = read.message?.deliveries?.[0]?.run ?? null
      return theRun !== null && typeof (await runData(theRun))['waitsUntil'] === 'string'
    })
    expect(answered, JSON.stringify(await send('GET', `/api/messages/${later}`))).toBe(true)
    const second = await runOf(later)
    expect(second).not.toBe(run)
    expect((await runData(second))['providerSession']).toBe(provider)
  }, 60_000)

  it('says the run that answered picked up its own conversation, and the first run did not', async () => {
    expect(await answeredLines(agentId)).toEqual([
      SYSTEM_LINES.aRunAnswered.said,
      SYSTEM_LINES.aRunPickedUpItsConversation.said,
    ])
  }, 30_000)
})

describe.each([
  { card: THE_WORKER as string | null, handle: 'ended-worker' },
  { card: null, handle: 'ended-no-card' },
])('an agent with the card $card whose wait has ended, exactly as before', ({ card, handle }) => {
  let agentId = ''

  it('gets the ending line that says the next run will not remember this one', async () => {
    ;({ agentId } = await anAgentWhoseWaitHasEnded(handle, card))
    const line = one(
      (await viaTheConversation(agentId)).said.filter((m) => m.body === ENDED),
      'the ending line',
    )
    expect(line.saidInFull).toBe(SYSTEM_LINES.aRunWaitedAndEnded(10).said)
    expect(line.saidInFull).toContain('will not remember')
    // ITS ONE RUN STARTED A NEW CONVERSATION, so the line after its answer is today's, word for word.
    expect(await answeredLines(agentId)).toEqual([SYSTEM_LINES.aRunAnswered.said])
  }, 60_000)

  it('reads nobody, and the dot names no conversation picked up', async () => {
    const door = await viaTheHandleDoor(handle)
    expect(door.how).toBe('nobody')
    expect(door.session).toBeNull()
    expect((await viaTheConversation(agentId)).answering?.how).toBe('nobody')
    const dot = await presence(agentId)
    expect(dot.from).not.toBe('its own conversation, picked up by a message')
    expect(dot.from).not.toBe('a run waiting for the next message')
  }, 30_000)

  it('is not picked up by the next message: the queue names no conversation and asks for the press', async () => {
    const later = await messageTo(agentId, 'A message after the wait, about record cccccccccccc.')
    const row = await queueRowOf(later)
    expect(row['resume']).toBeNull()
    expect(row['nobodyIsAnsweringAsIt']).toBe(nobodyIsAnsweringAsIt(handle))
    await onePass(settings, watching)
    await onePass(settings, watching)
    const read = (await send('GET', `/api/messages/${later}`)) as { message?: { deliveries?: { run: string | null; mark: string }[] } }
    const delivery = one(read.message?.deliveries ?? [], `a delivery row for ${later}`)
    expect(delivery.run, 'a run was started without the person\'s press').toBeNull()
  }, 30_000)
})

describe('a worker resumed inside its wait', () => {
  it('says the run that answered picked up its own conversation, because the run carries it, not the card', async () => {
    const agentId = await anAgent('resumed-worker', THE_WORKER)
    const first = await messageTo(agentId, 'Please read record dddddddddddd and say what it is.')
    await send('POST', `/api/messages/${first}/start-an-agent`, {})
    expect(await until(async () => (await answeredLines(agentId)).length === 1)).toBe(true)
    const provider = (await runData(await runOf(first)))['providerSession']
    expect(provider).toBeTypeOf('string')

    const inside = await messageTo(agentId, 'One more thing, about record eeeeeeeeeeee.')
    expect(await until(async () => (await answeredLines(agentId)).length === 2)).toBe(true)
    expect((await runData(await runOf(inside)))['providerSession'], 'the second run did not pick the conversation up').toBe(provider)
    expect(await answeredLines(agentId)).toEqual([
      SYSTEM_LINES.aRunAnswered.said,
      SYSTEM_LINES.aRunPickedUpItsConversation.said,
    ])
  }, 60_000)
})
