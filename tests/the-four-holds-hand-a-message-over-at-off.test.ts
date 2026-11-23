// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { withoutInheritedEffort } from './without-inherited-effort.ts'
import { supplyRuntimeSubmissions } from './synthetic-submission-fixtures.ts'
/**
 * THE FOUR HOLDS ON A MESSAGE HAND IT OVER AT OFF, AND THE RUN THAT TAKES IT COUNTS THE GATE. Wave 13r round I, its fix.
 *
 * Four gates keep a message back from a run: a notice rule of its recipient mutes it, its recipient is a permanent
 * resident asleep, the review it belongs to has not been sent, and nothing answers as its recipient until the person
 * presses Start an agent. At block each keeps the message back as before, and the held door counts the stop. At off
 * the queue sets no hold and names the gate in `wouldHaveHeld`, the message worker starts a run for the message, and
 * the taken door counts the gate as one that would have stopped work. Each gate's words say what happens at off, and
 * the Gates page shows the count as the times it would have stopped work.
 *
 * Each case sets only its own gate. For the three holds that are not the person's start, the person presses Start an
 * agent for the message first, so the hold under test is the only one the message meets. A pass of the worker before
 * the message is written settles every line the office wrote while the case was set up, so the counts move only for
 * the message the case wrote.
 *
 * A LINE MOLE OFFICE WRITES needs no run, so at off it is handed over through the needs-no-run door, and that door
 * counts the gate (wave 13r round M, item 5). A muted office notice, and an office line to a sleeping resident, are
 * written here by `writeAMessage`, as the office writes its own lines. At off the row names the gate in
 * `wouldHaveHeld` beside the reason the line needs no run, the worker hands that list to the needs-no-run door, the
 * line is delivered with no run, and the gate is counted as one that would have stopped work. At block the line is
 * held and the held door counts it as stopped, as for every other message.
 *
 * WHAT IS REAL: a scratch office in process (`freshDb` and `apiApp`), never the live office, and the real message
 * worker (`onePass` from src/worker/index.ts) with the fake runtime. Every agent, message, note and review is made up.
 *
 * MUTATIONS, after a control run: drop one hold's line where src/server/api/worker.ts counts the holds a message went
 * past, and that hold's off cases go red. Stop the worker handing `wouldHaveHeld` to the taken door in
 * src/worker/index.ts, and the four off cases of messages that need a run go red. Stop the needs-no-run door counting
 * the holds, or stop the worker handing `wouldHaveHeld` to that door, and both office-line off cases go red.
 */

import type { AddressInfo } from 'node:net'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath, URL } from 'node:url'

import type { FastifyInstance } from 'fastify'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'

import { GATES, MESSAGE_HOLDS, type MessageHold } from '../src/config/gates.mjs'
import { THE_PERSON } from '../src/shared/person.ts'
import { onePass, type WorkerSettings } from '../src/worker/index.ts'
import { A_SLEEP_TIME, apiApp, freshDb, one, theAnswerToAWriteInATestOffice, thePersonsKeyHeader, type TestDb } from './helpers.ts'
import { aCheckoutForATestRun } from './a-checkout-for-a-test-run.ts'

const FAKE = fileURLToPath(new URL('./fake-runtime.mjs', import.meta.url))
const INSPECTOR = 'holds-inspector'
const SECRETARY = 'holds-secretary'

let t: TestDb
let app: FastifyInstance
let office: typeof import('../src/server/lib/inspection.ts')
/** The made-up run every office line here is about. */
let aboutRun: string
let outputs: string
let settings: WorkerSettings
const watching: Parameters<typeof onePass>[1] = []
const PERSON: Record<string, string> = { 'content-type': 'application/json', 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON }
const agents = new Map<string, { id: string; key: string }>()
const switched = new Set<string>()
const asleep = new Set<string>()

const as = (handle: string): Record<string, string> => ({
  ...PERSON,
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': handle,
  'x-mole-office-key': agents.get(handle)?.key ?? '',
})

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function call(method: 'GET' | 'POST' | 'PUT', url: string, headers: Record<string, string>, payload?: unknown): Promise<{ status: number; body: any; raw: string }> {
  const reply = await app.inject({ method, url, headers, ...(payload === undefined ? {} : { payload: payload as object }) })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let body: any = {}
  try {
    body = reply.json()
  } catch {
    body = {}
  }
  return { status: reply.statusCode, body, raw: reply.body }
}

async function anAgent(handle: string, role: string): Promise<string> {
  const started = await call('POST', '/api/agents/started', PERSON, { handle, name: handle, role, runtime: 'claude-code' })
  expect(started.status, started.raw).toBe(201)
  agents.set(handle, { id: String(started.body.agent?.id ?? ''), key: String(started.body.whatToGiveIt?.key ?? '') })
  return agents.get(handle)!.id
}

async function aMessage(headers: Record<string, string>, given: Record<string, unknown>, expected?: number): Promise<string> {
  const data = { body: 'A made-up message for a hold.', ...given }
  const filed = await call('POST', '/api/records', headers, { kind: 'message', title: 'A made-up message', data })
  expect(filed.status, filed.raw).toBe(expected ?? theAnswerToAWriteInATestOffice(headers, { kind: 'message', data }))
  return String(filed.body.record?.id ?? '')
}

/** The person's press of Start an agent, so the person's start holds nothing. */
async function thePersonPresses(message: string): Promise<void> {
  const pressed = await call('POST', `/api/messages/${message}/start-an-agent`, PERSON, {})
  expect(pressed.status, pressed.raw).toBe(200)
}

/** The person sets a gate's position, or takes their choice back with null; it is taken back after each case. */
async function setTheGate(gate: string, value: 'block' | 'off' | null): Promise<void> {
  const row = GATES.find((each) => each.id === gate)
  expect(row, `the gate list has no row "${gate}"`).toBeDefined()
  const saved = await call('POST', '/api/office/settings', PERSON, { changes: [{ name: row!.setting, value }], because: 'A made-up reason for a gate' })
  expect(saved.status, saved.raw).toBe(200)
  switched.add(gate)
}

function counted(gate: string): { would_stop: number; stopped: number; reminded: number } {
  const row = t.client.sqlite.prepare('SELECT SUM(would_stop) AS would_stop, SUM(stopped) AS stopped, SUM(reminded) AS reminded FROM gate_counts WHERE gate = ?').get(gate) as Record<string, number | null>
  return { would_stop: row['would_stop'] ?? 0, stopped: row['stopped'] ?? 0, reminded: row['reminded'] ?? 0 }
}

const everyCount = (): Record<string, ReturnType<typeof counted>> => Object.fromEntries(MESSAGE_HOLDS.map((gate) => [gate, counted(gate)]))

/** The case's own gate moved by `moved` since `before`, and the other three holds' counts did not move. */
function theCountsMoved(before: ReturnType<typeof everyCount>, mine: MessageHold, moved: ReturnType<typeof counted>): void {
  const after = everyCount()
  for (const gate of MESSAGE_HOLDS) {
    expect({
      would_stop: after[gate]!.would_stop - before[gate]!.would_stop,
      stopped: after[gate]!.stopped - before[gate]!.stopped,
      reminded: after[gate]!.reminded - before[gate]!.reminded,
    }, gate).toEqual(gate === mine ? moved : { would_stop: 0, stopped: 0, reminded: 0 })
  }
}

async function theRow(message: string, agent: string): Promise<Record<string, unknown>> {
  const read = await call('GET', '/api/worker/queue', PERSON)
  expect(read.status, read.raw).toBe(200)
  return one(
    (read.body.queue as Record<string, unknown>[]).filter((row) => row['messageId'] === message && (row['to'] as { id: string }).id === agent),
    `the queue row of ${message}`,
  )
}

async function theDelivery(message: string, agent: string): Promise<{ mark: string; because: string | null; run: string | null }> {
  const read = await call('GET', `/api/messages/${message}`, PERSON)
  expect(read.status, read.raw).toBe(200)
  return one((read.body.message.deliveries as { to: { id: string }; mark: string; because: string | null; run: string | null }[]).filter((row) => row.to.id === agent), `the delivery of ${message}`)
}

/** The person makes the agent a permanent resident and puts it to sleep; it is woken after each case. */
async function putToSleep(handle: string): Promise<void> {
  const proposed = await call('POST', '/api/residents/proposals', as(SECRETARY), { agentId: handle, because: 'It has done made-up steady work here.', sleepTime: A_SLEEP_TIME })
  expect(proposed.status, proposed.raw).toBe(201)
  const confirmed = await call('POST', `/api/residents/proposals/${String(proposed.body.proposal?.id)}/confirm`, PERSON)
  expect(confirmed.status, confirmed.raw).toBe(200)
  const slept = await call('POST', `/api/residents/${agents.get(handle)!.id}/sleep`, PERSON, {})
  expect(slept.status, slept.raw).toBe(201)
  asleep.add(handle)
}

interface AHold {
  gate: MessageHold
  /** The row's field that carries this hold's sentence at block. */
  field: 'heldByNoticeRule' | 'heldWhileAsleep' | 'heldByAReview' | 'nobodyIsAnsweringAsIt'
  /** Everything the message needs before it is written, for an agent made for this case. */
  setUp: (handle: string) => Promise<void>
  /** The message the hold keeps back at block, to that agent. */
  write: (handle: string) => Promise<string>
}

const HOLDS: AHold[] = [
  {
    gate: 'held-by-a-notice-rule',
    field: 'heldByNoticeRule',
    setUp: async (handle) => {
      const saved = await call('PUT', '/api/messages/notice-rules', as(handle), { mutedKinds: ['theBroadcastIsDue'], because: 'A made-up quiet choice', ifVersion: null })
      expect(saved.status, saved.raw).toBe(200)
    },
    // AN INSPECTOR'S NOTICE, because it needs a run. A notice Mole Office writes needs none, and is handed over
    // without one. Nothing holds the case's agent in the test office, so the office stores the inspector's notice,
    // routes it and answers 409; the notice is stored and queued all the same.
    write: async (handle) => {
      const message = await aMessage(as(INSPECTOR), { to: [{ kind: 'agent', id: agents.get(handle)!.id }], notice: 'theBroadcastIsDue' }, 409)
      await thePersonPresses(message)
      return message
    },
  },
  {
    gate: 'held-while-a-resident-sleeps',
    field: 'heldWhileAsleep',
    setUp: putToSleep,
    write: async (handle) => {
      const message = await aMessage(PERSON, { to: [{ kind: 'agent', id: agents.get(handle)!.id }] })
      await thePersonPresses(message)
      return message
    },
  },
  {
    gate: 'held-by-an-unsent-review',
    field: 'heldByAReview',
    setUp: async () => {},
    write: async (handle) => {
      const note = await call('POST', '/api/records', PERSON, { kind: 'note', title: 'A made-up page a review collects from', data: { body: 'A made-up claim.' } })
      expect(note.status, note.raw).toBe(201)
      const target = { kind: 'record', recordId: String(note.body.record?.id), workspaceId: 'default' }
      const review = await call('POST', '/api/reviews', PERSON, { entry: { target, place: { at: 'surface' } } })
      expect(review.status, review.raw).toBe(201)
      const participant = await call('GET', `/api/participants/agent/${handle}`, PERSON)
      expect(participant.status, participant.raw).toBe(200)
      const message = await aMessage(PERSON, { chosenRecipient: { kind: 'agent', agentId: String(participant.body.participant?.record) }, target: { target, place: { at: 'surface' } } })
      await thePersonPresses(message)
      return message
    },
  },
  {
    gate: 'wait-for-the-persons-start',
    field: 'nobodyIsAnsweringAsIt',
    setUp: async () => {},
    // NO PRESS: the person's start is the hold under test.
    write: async (handle) => aMessage(PERSON, { to: [{ kind: 'agent', id: agents.get(handle)!.id }] }),
  },
]

/** A hold that a line Mole Office writes can meet. Neither of the other two holds keeps such a line back. */
interface AnOfficeLineHold {
  gate: 'held-by-a-notice-rule' | 'held-while-a-resident-sleeps'
  field: 'heldByNoticeRule' | 'heldWhileAsleep'
  setUp: (handle: string) => Promise<void>
}

const OFFICE_LINE_HOLDS: AnOfficeLineHold[] = [
  {
    gate: 'held-by-a-notice-rule',
    field: 'heldByNoticeRule',
    setUp: async (handle) => {
      const saved = await call('PUT', '/api/messages/notice-rules', as(handle), { mutedKinds: ['handedBack'], because: 'A made-up quiet choice', ifVersion: null })
      expect(saved.status, saved.raw).toBe(200)
    },
  },
  { gate: 'held-while-a-resident-sleeps', field: 'heldWhileAsleep', setUp: putToSleep },
]

/** A notice that wakes its reader, written as Mole Office writes its own lines, to that agent alone. */
function anOfficeLine(handle: string): string {
  return office.writeAMessage({
    workspaceId: 'default',
    to: [{ kind: 'agent', id: agents.get(handle)!.id }],
    title: 'A made-up line Mole Office writes',
    body: 'A made-up line Mole Office writes about a made-up run.',
    aboutRun,
    actor: office.THE_OFFICE,
    onlyThem: true,
    notice: 'handedBack',
  })
}

/** Settles every line the office wrote while a case was set up, and starts nothing for the case's message. */
async function settle(): Promise<void> {
  await onePass(settings, watching)
}

/**
 * Passes until the run started for the message has answered, and one pass after, so whatever its answer leads to is
 * held, counted or started inside this case and not in the next one.
 */
async function untilItIsAnswered(message: string): Promise<void> {
  for (let i = 0; i < 200; i += 1) {
    const pass = await onePass(settings, watching)
    if (pass.answered.some((each) => each.messageId === message)) break
    await new Promise((go) => setTimeout(go, 50))
  }
  await onePass(settings, watching)
}

beforeAll(async () => {
  t = await freshDb()
  const built = await apiApp()
  app = built.app
  supplyRuntimeSubmissions(t, app)
  await app.ready()
  await app.listen({ host: '127.0.0.1', port: 0 })
  Object.assign(PERSON, thePersonsKeyHeader(join(dirname(t.file), 'keys.json')))
  office = await import('../src/server/lib/inspection.ts')
  const run = await call('POST', '/api/records', PERSON, { kind: 'session', title: 'A made-up run the office lines are about', data: {} })
  expect(run.status, run.raw).toBe(201)
  aboutRun = String(run.body.record?.id ?? '')
  outputs = mkdtempSync(join(tmpdir(), 'mole-office-holds-'))
  settings = {
    api: `http://127.0.0.1:${String((app.server.address() as AddressInfo).port)}`,
    workspace: 'default',
    session: null,
    stopWithPid: null,
    checkout: aCheckoutForATestRun(),
    runs: 4,
    hops: 3,
    outputRoot: outputs,
    env: { ...withoutInheritedEffort(), MOLE_OFFICE_FAKE_RUNTIME: FAKE },
  }
  await anAgent(INSPECTOR, 'inspector')
  await anAgent(SECRETARY, 'secretary')
}, 60_000)

afterEach(async () => {
  for (const gate of switched) await setTheGate(gate, null)
  switched.clear()
  // A RESIDENT LEFT ASLEEP would keep the office's later lines to it back, and a later case would count them.
  for (const handle of asleep) {
    const woke = await call('POST', `/api/residents/${agents.get(handle)!.id}/wake`, PERSON)
    expect(woke.status, woke.raw).toBe(200)
  }
  asleep.clear()
})

afterAll(async () => {
  for (const left of watching.splice(0, watching.length)) left.adapter.stop(left.handle, 'the test is over')
  await app?.close()
  t?.close()
  if (outputs !== undefined) rmSync(outputs, { recursive: true, force: true })
})

for (const hold of HOLDS) {
  describe(hold.gate, () => {
    it('at off, the message is handed to a run, wouldHaveHeld names the gate, and the taken door counts it as would have stopped', async () => {
      const handle = `${hold.gate}-off`
      const agent = await anAgent(handle, 'worker')
      await hold.setUp(handle)
      await setTheGate(hold.gate, 'off')
      await settle()
      const message = await hold.write(handle)

      const row = await theRow(message, agent)
      expect(row['wouldHaveHeld']).toEqual([hold.gate])
      expect(row['needsNoRun']).toBeNull()
      expect(row['heldByNoticeRule']).toBeUndefined()
      expect(row['heldWhileAsleep']).toBeUndefined()
      expect(row['heldByAReview']).toBeNull()
      expect(row['nobodyIsAnsweringAsIt']).toBeNull()

      const before = everyCount()
      const pass = await onePass(settings, watching)
      try {
        const started = one(pass.started.filter((run) => run.messageId === message), 'the run started for the message')
        const delivered = await theDelivery(message, agent)
        expect(delivered.mark).toBe('delivered')
        expect(delivered.run).toBe(started.session)
        theCountsMoved(before, hold.gate, { would_stop: 1, stopped: 0, reminded: 0 })
      } finally {
        await untilItIsAnswered(message)
      }
    }, 30_000)

    it('at block, the same message is held, no run starts, and the held door counts it as stopped', async () => {
      const handle = `${hold.gate}-block`
      const agent = await anAgent(handle, 'worker')
      await hold.setUp(handle)
      await setTheGate(hold.gate, 'block')
      await settle()
      const message = await hold.write(handle)

      const row = await theRow(message, agent)
      expect(row['wouldHaveHeld']).toBeUndefined()
      expect(typeof row[hold.field]).toBe('string')

      const before = everyCount()
      const pass = await onePass(settings, watching)
      expect(pass.started.filter((run) => run.messageId === message)).toEqual([])
      const held = await theDelivery(message, agent)
      expect(held.mark).toBe('queued')
      expect(held.because).toBe(row[hold.field])

      theCountsMoved(before, hold.gate, { would_stop: 1, stopped: 1, reminded: 0 })
    }, 30_000)
  })
}

for (const hold of OFFICE_LINE_HOLDS) {
  describe(`${hold.gate}, a line Mole Office writes`, () => {
    it('at off, the line needs no run, wouldHaveHeld names the gate, and the needs-no-run door counts it as would have stopped', async () => {
      const handle = `${hold.gate}-line-off`
      const agent = await anAgent(handle, 'worker')
      await hold.setUp(handle)
      await setTheGate(hold.gate, 'off')
      await settle()
      const message = anOfficeLine(handle)

      const row = await theRow(message, agent)
      expect(row['wouldHaveHeld']).toEqual([hold.gate])
      expect(typeof row['needsNoRun']).toBe('string')
      expect(row[hold.field]).toBeUndefined()

      const before = everyCount()
      const pass = await onePass(settings, watching)
      expect(pass.started.filter((run) => run.messageId === message)).toEqual([])
      expect(pass.held).toContainEqual({ messageId: message, because: row['needsNoRun'] })
      const delivered = await theDelivery(message, agent)
      expect(delivered.mark).toBe('delivered')
      expect(delivered.run).toBeNull()
      theCountsMoved(before, hold.gate, { would_stop: 1, stopped: 0, reminded: 0 })
    }, 30_000)

    it('at block, the same line is held, needs no run is not said, and the held door counts it as stopped', async () => {
      const handle = `${hold.gate}-line-block`
      const agent = await anAgent(handle, 'worker')
      await hold.setUp(handle)
      await setTheGate(hold.gate, 'block')
      await settle()
      const message = anOfficeLine(handle)

      const row = await theRow(message, agent)
      expect(row['wouldHaveHeld']).toBeUndefined()
      expect(row['needsNoRun']).toBeNull()
      expect(typeof row[hold.field]).toBe('string')

      const before = everyCount()
      const pass = await onePass(settings, watching)
      expect(pass.started.filter((run) => run.messageId === message)).toEqual([])
      const held = await theDelivery(message, agent)
      expect(held.mark).toBe('queued')
      expect(held.because).toBe(row[hold.field])
      theCountsMoved(before, hold.gate, { would_stop: 1, stopped: 1, reminded: 0 })
    }, 30_000)
  })
}
