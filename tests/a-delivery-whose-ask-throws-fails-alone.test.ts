// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A DELIVERY WHOSE ASK THROWS FAILS ALONE, IN WORDS, AND THE REST OF THE PASS GOES ON.
 *
 * Item 49 of wave 13y, rounds 115 and 117. In the worker's queue, one ask that threw for one recipient ended the whole
 * reading, so the queue door answered an error and the worker's pass returned before it delivered anything. No message
 * of the project was delivered until somebody mended the cause.
 *
 * WHAT IS PROVED HERE, against a real database, the real server, the real queue door and the real worker pass. For
 * each way a queued delivery's ask can throw, one agent's ask throws while other deliveries wait in the same pass:
 *
 *   1. THE CHECK'S MODEL ASK, made for a check row before its run is started.
 *   2. THE CHECK'S RUNTIME ASK IN THE PROJECT, made while a login is held after a limit.
 *   3. THE CONVERSATION'S MODEL ASK, made for every other row.
 *   4. THE EARLIER CASTING ROLL, which the queue reads for the conversation's model ask, from a roll stored on the
 *      agent's run that cannot be read.
 *
 * Case 5 asks the one read of every agent's earlier roll itself, with one unreadable roll among the agents asked: once
 * on the agent's own run, and once kept on a supervisor's worker-run ask, which the read reads second. The agent with
 * the unreadable roll has that roll's run and the words `theEarlierCastingRoll` throws for it alone, and every other
 * agent has what `theEarlierCastingRoll` gives for it alone: a roll on its own run, a roll on an ask, or none.
 *
 * In each of cases 1 to 4, the queue door answers the other deliveries as before and names the failed one beside them, with the
 * error's whole words and a sentence for the delivery. In cases 3 and 4 the worker's pass also starts the others,
 * writes that sentence on the failed delivery itself, where its sender and the office read it, and leaves it queued.
 * The next pass, with the cause gone, starts it. The held door writes at most 500 characters on a delivery, so case 4,
 * whose error is longer, also asks that the sentence fits and says where it cut the error. Case 0 is the same office
 * with nothing thrown, so a red case is red for its throw. Every other read for one row is inside the same catch as
 * these four; this file proves the four asks.
 *
 * WHAT IS STOOD IN. Cases 1 to 3 make the model ask throw with a wrapper of `theModelARunGets` that throws for one
 * agent at one place, because the causes it has (a Casting row whose stored selection cannot be read, among them)
 * apply to every agent of a role and not to one. Case 2 also stands in a held login: the wrapper of
 * `theHoldOnNewChecks` adds one, so the queue asks for the check's runtime. Case 4 stands in nothing. Its cause is a
 * roll stored on one of the agent's runs that `readCastingRoll` refuses, and the queue reads that roll itself: it reads
 * every queued agent's earlier roll in one read per pass, and hands each agent's own to its conversation ask.
 *
 * CONTROL: red before the change, where the door answers an internal error in cases 1 to 4 and case 0 passes. In round
 * 117, red in cases 4 and 5 alone before that round's change: the one read of every agent's roll threw for every
 * delivery of the pass, so the failed list named the other agents too, and the read asked in case 5 threw.
 * MUTATION: in the commit with the code.
 *
 * Every run here is synthetic. The git tree and the worker's output folder are made under the system's temporary
 * folder and removed after. The tools are tests/fake-runtime.mjs and tests/fake-inspection-tool.mjs, so no model is
 * called, and nothing reaches the live server.
 */
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { aCheckoutForATestRun } from './a-checkout-for-a-test-run.ts'
import { THE_TEST_OFFICES_SECRETARY } from './a-page-of-a-test-office.ts'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { supplyRuntimeSubmissions } from './synthetic-submission-fixtures.ts'
import { withoutInheritedEffort } from './without-inherited-effort.ts'
import { theCastingRoll } from '../src/shared/casting-roll.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { THE_WORKER } from '../src/shared/roles.ts'
import { onePass, type WorkerSettings } from '../src/worker/index.ts'
import type { AHoldOnALogin } from '../src/server/lib/checks-in-merges-only.ts'

const theThrow = vi.hoisted(() => ({
  /** The words every ask this file makes throw says. */
  words: 'This ask was made to throw by the test of a delivery whose ask throws.',
  /** The agent whose ask throws, and which of the queue's asks; null while every ask answers. */
  at: null as null | { agentId: string; place: 'conversation' | 'check' | 'check in the project' },
  /** Whether a login is held, so the queue asks for a check's runtime in the project. */
  aLoginIsHeld: false,
}))

vi.mock('../src/server/lib/run-models.ts', async (importOriginal) => {
  const real = await importOriginal<typeof import('../src/server/lib/run-models.ts')>()
  const theModelARunGets: typeof real.theModelARunGets = (asked, ...rest) => {
    const at = theThrow.at
    if (at !== null && asked.agentId === at.agentId) {
      const place = asked.place === 'check' && asked.project != null ? 'check in the project' : asked.place
      if (place === at.place) throw new Error(`${theThrow.words} (${place})`)
    }
    return real.theModelARunGets(asked, ...rest)
  }
  return { ...real, theModelARunGets }
})

vi.mock('../src/server/lib/the-hold-on-new-checks.ts', async (importOriginal) => {
  const real = await importOriginal<typeof import('../src/server/lib/the-hold-on-new-checks.ts')>()
  const theHoldOnNewChecks: typeof real.theHoldOnNewChecks = (...args) => {
    const hold = real.theHoldOnNewChecks(...args)
    if (!theThrow.aLoginIsHeld) return hold
    // ONLY THE TWO FIELDS THE QUEUE READS ARE MADE UP: that some login is held, and the sentence for it.
    const madeUp = { login: 'made-up-login', says: 'A login held by this test.' } as AHoldOnALogin
    return { ...hold, held: new Map([...hold.held, ['made-up-login', madeUp]]) }
  }
  return { ...real, theHoldOnNewChecks }
})

let t: TestDb
let app: FastifyInstance
let settings: WorkerSettings
const made: string[] = []
const watching: Parameters<typeof onePass>[1] = []

const WORKSPACE = 'default'
const as = (type: 'agent' | 'human', id: string) => ({
  'x-mole-office-workspace': WORKSPACE,
  'x-mole-office-actor-type': type,
  'x-mole-office-actor-id': id,
})
const asPerson = as('human', THE_PERSON)
const asSupervisor = as('agent', 'super-t')
const asWorker = as('agent', 'worker-t')
const theWorker = { type: 'agent' as const, id: 'worker-t' }
const A = 'work/a.txt'

function git(dir: string, ...args: string[]): string {
  return execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8' }).trim()
}

/** A throwaway directory under the system's temporary folder, removed after the file. */
function scratch(prefix: string): string {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), `ask-throws-${prefix}-`)))
  made.push(dir)
  return dir
}

async function call(method: 'GET' | 'POST' | 'PATCH', url: string, headers: Record<string, string>, payload?: unknown) {
  const r = await app.inject({ method, url, headers, ...(payload === undefined ? {} : { payload: payload as Record<string, unknown> }) })
  return { status: r.statusCode, body: r.json() as Record<string, any>, raw: r.body }
}

/** The registry id of an agent, by its handle. */
function theIdOf(handle: string): string {
  const row = t.client.sqlite.prepare('SELECT id FROM agents WHERE handle = ?').get(handle) as { id: string } | undefined
  expect(row, `no agent ${handle}`).toBeDefined()
  return row!.id
}

/** One message's delivery to one agent: its mark and the reason beside it. */
function theDeliveryOf(message: string, handle: string): { mark: string; because: string | null } {
  const delivery = t.client.sqlite
    .prepare('SELECT mark, because FROM message_delivery WHERE message_id = ? AND recipient_id = ?')
    .get(message, theIdOf(handle)) as { mark: string; because: string | null } | undefined
  expect(delivery, `${message} was never queued for ${handle}`).toBeDefined()
  return delivery!
}

/** An agent the person writes to, with a runtime, so a run of it can be started. */
async function anAgent(handle: string): Promise<void> {
  const r = await call('POST', '/api/records', asPerson, { kind: 'agent', title: handle, data: { handle, state: 'active', runtime: 'claude-code' } })
  expect(r.status, r.raw).toBe(201)
}

/** A message from the person to one agent, and the person's press to start it, as the chat offers. */
async function aMessageTo(handle: string): Promise<string> {
  const filed = await call('POST', '/api/records', asPerson, { kind: 'message', title: `For ${handle}`, data: { body: `A message for ${handle}.`, to: [{ kind: 'agent', id: handle }] } })
  // A PERSON'S SEND TO AN AGENT NOTHING HOLDS ANSWERS 409, with the letter stored and routed (decision 60sbc5I-bwKx).
  expect(filed.status, filed.raw).toBe(409)
  const id = filed.body['record'].id as string
  const pressed = await call('POST', `/api/messages/${id}/start-an-agent`, { ...asPerson, 'content-type': 'application/json' }, {})
  expect(pressed.status, pressed.raw).toBeLessThan(300)
  return id
}

interface TheRow { messageId: string; handle: string; inspection?: { run: string } }
interface TheFailedRow { messageId: string; handle: string; because: string; error: string }

/** The queue door's answer: the rows, and the deliveries that could not be worked out. */
async function theDoor(): Promise<{ status: number; raw: string; queue: TheRow[]; failed: TheFailedRow[] }> {
  const r = await call('GET', '/api/worker/queue?full=1', {})
  return { status: r.status, raw: r.raw.slice(0, 600), queue: (r.body['queue'] ?? []) as TheRow[], failed: (r.body['failed'] ?? []) as TheFailedRow[] }
}

/** Whether the queue holds one message for one agent. */
const holds = (rows: readonly TheRow[], message: string, handle: string): boolean => rows.some((one) => one.messageId === message && one.handle === handle)

let checkAsk = ''

/**
 * A finished run of the worker, sealed at its own tree's tip, so the office asks the inspector for its check. Returns
 * the ask.
 */
async function aRunAskedForItsCheck(): Promise<string> {
  const dir = scratch('tree')
  git(dir, 'init', '-q', '-b', 'main')
  git(dir, 'config', 'user.email', 'fixture@example.invalid')
  git(dir, 'config', 'user.name', 'Synthetic throwing-ask fixture')
  mkdirSync(dirname(join(dir, A)), { recursive: true })
  writeFileSync(join(dir, A), `${A} before.\n`)
  git(dir, 'add', '.')
  git(dir, 'commit', '-q', '-m', 'Synthetic baseline')
  git(dir, 'switch', '-q', '-c', 'work')
  const run = t.api.createRecord({
    kind: 'session',
    title: 'Synthetic run whose check is asked for',
    workspaceId: WORKSPACE,
    actor: theWorker,
    origin: 'fixture',
    data: { state: 'running', servingAgent: 'worker-t', cutFrom: 'main', workingDirectory: dir, doing: 'Synthetic: the run changes work/a.txt.' },
  }).id
  writeFileSync(join(dir, A), `${A} changed by ${dir}.\n`)
  git(dir, 'commit', '-q', '-am', 'Synthetic work of the run')
  const finished = await call('PATCH', `/api/records/${run}`, asWorker, { dataPatch: { state: 'finished', submission: { kind: 'git' } } })
  expect(finished.status, finished.raw).toBe(200)
  if (!(t.api.getRecord(run)!.data['theCheck'] as { message?: string } | undefined)?.message) {
    const again = await call('POST', `/api/checks/${run}/ask-again`, { ...asPerson, 'content-type': 'application/json' }, {})
    expect(again.status, again.raw).toBe(200)
  }
  const message = (t.api.getRecord(run)!.data['theCheck'] as { message?: string } | undefined)?.message ?? ''
  expect(message, `the office asked for no check of ${run}`).not.toBe('')
  return message
}

const messages = new Map<string, string>()

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  // THE CONVERSATION RUNS' ENDINGS NAME A RECORDS SUBMISSION, as a real agent's would; the sealed run below names its own.
  supplyRuntimeSubmissions(t, app)
  await app.ready()
  await app.listen({ host: '127.0.0.1', port: 0 })
  const register = async (by: Record<string, string>, payload: Record<string, unknown>) => {
    const r = await app.inject({ method: 'POST', url: '/api/agents/started', headers: by, payload })
    expect(r.statusCode, r.body).toBe(201)
  }
  await register(asPerson, { handle: THE_TEST_OFFICES_SECRETARY.handle, name: THE_TEST_OFFICES_SECRETARY.name, role: 'secretary' })
  await register(asPerson, { handle: 'inspector-t', name: 'Inspector T', role: 'inspector' })
  await register(asPerson, { handle: 'super-t', name: 'Super T', role: 'supervisor' })
  await register(asSupervisor, { handle: 'worker-t', name: 'Worker T', role: 'worker', workArea: ['work'] })
  const repositories = await import('../src/server/lib/repositories.ts')
  repositories.registerRepository({ workspaceId: WORKSPACE, name: 'fixture-main', root: scratch('main'), actor: { type: 'human', id: THE_PERSON } })
  for (const handle of ['its-ask-throws', 'delivered-one', 'delivered-two', 'its-roll-cannot-be-read', 'delivered-three', 'delivered-four']) await anAgent(handle)
  for (const handle of ['its-ask-throws', 'delivered-one', 'delivered-two']) messages.set(handle, await aMessageTo(handle))
  checkAsk = await aRunAskedForItsCheck()
  settings = {
    api: `http://127.0.0.1:${String((app.server.address() as AddressInfo).port)}`,
    workspace: WORKSPACE,
    session: null,
    stopWithPid: null,
    checkout: aCheckoutForATestRun(),
    runs: 20,
    hops: 3,
    outputRoot: scratch('worker'),
    env: {
      ...withoutInheritedEffort(),
      MOLE_OFFICE_FAKE_INSPECTION_TOOL: join(process.cwd(), 'tests/fake-inspection-tool.mjs'),
      MOLE_OFFICE_FAKE_RUNTIME: join(process.cwd(), 'tests/fake-runtime.mjs'),
      MOLE_OFFICE_INSPECTION_MODEL: 'sonnet',
    },
  }
}, 60_000)

afterAll(async () => {
  theThrow.at = null
  theThrow.aLoginIsHeld = false
  for (const run of watching) if (run.adapter.alive(run.handle)) run.adapter.stop(run.handle, 'The throwing-ask test ended.')
  await app?.close()
  t?.close()
  for (const dir of made) rmSync(dir, { recursive: true, force: true })
}, 60_000)

describe('one delivery whose ask throws, with others in the same pass', () => {
  it('0: with no ask throwing, the door answers every delivery and names none as failed', async () => {
    const door = await theDoor()
    expect(door.status, door.raw).toBe(200)
    expect(door.failed).toEqual([])
    expect(holds(door.queue, checkAsk, 'inspector-t')).toBe(true)
    for (const handle of ['its-ask-throws', 'delivered-one', 'delivered-two']) expect(holds(door.queue, messages.get(handle)!, handle)).toBe(true)
  })

  it('1: the check\'s model ask throws, and only the check fails', async () => {
    theThrow.at = { agentId: theIdOf('inspector-t'), place: 'check' }
    try {
      const door = await theDoor()
      expect(door.status, door.raw).toBe(200)
      expect(holds(door.queue, checkAsk, 'inspector-t'), 'the check is not a row of the queue').toBe(false)
      expect(door.failed.filter((one) => one.messageId === checkAsk && one.handle === 'inspector-t')).toHaveLength(1)
      for (const one of door.failed) {
        expect(one.handle, 'only the inspector\'s ask threw').toBe('inspector-t')
        expect(one.because).toContain(`${theThrow.words} (check)`)
      }
      for (const handle of ['its-ask-throws', 'delivered-one', 'delivered-two']) {
        expect(holds(door.queue, messages.get(handle)!, handle), `the message for ${handle} is still a row of the queue`).toBe(true)
      }
    } finally {
      theThrow.at = null
    }
  })

  it('2: the check\'s runtime ask in the project throws while a login is held, and only the check fails', async () => {
    theThrow.at = { agentId: theIdOf('inspector-t'), place: 'check in the project' }
    theThrow.aLoginIsHeld = true
    try {
      const door = await theDoor()
      expect(door.status, door.raw).toBe(200)
      expect(holds(door.queue, checkAsk, 'inspector-t'), 'the check is not a row of the queue').toBe(false)
      expect(door.failed.filter((one) => one.messageId === checkAsk && one.handle === 'inspector-t')).toHaveLength(1)
      for (const one of door.failed) {
        expect(one.handle, 'only the inspector\'s ask threw').toBe('inspector-t')
        expect(one.because).toContain(`${theThrow.words} (check in the project)`)
      }
      for (const handle of ['its-ask-throws', 'delivered-one', 'delivered-two']) {
        expect(holds(door.queue, messages.get(handle)!, handle), `the message for ${handle} is still a row of the queue`).toBe(true)
      }
    } finally {
      theThrow.at = null
      theThrow.aLoginIsHeld = false
    }
  })

  it('3: the conversation\'s model ask throws; the pass starts the others and says why on the failed delivery', async () => {
    theThrow.at = { agentId: theIdOf('its-ask-throws'), place: 'conversation' }
    const failing = messages.get('its-ask-throws')!
    try {
      const door = await theDoor()
      expect(door.status, door.raw).toBe(200)
      expect(holds(door.queue, failing, 'its-ask-throws')).toBe(false)
      const said = door.failed.find((one) => one.messageId === failing && one.handle === 'its-ask-throws')
      expect(said?.error, JSON.stringify(door.failed)).toBe(`${theThrow.words} (conversation)`)
      expect(said?.because).toContain(`${theThrow.words} (conversation)`)
      for (const one of door.failed) expect(one.handle, 'only the one agent\'s asks threw').toBe('its-ask-throws')
      const pass = await onePass(settings, watching, [])
      const started = pass.started.map((one) => one.messageId)
      for (const handle of ['delivered-one', 'delivered-two']) {
        expect(started, `the message for ${handle} was started in the same pass`).toContain(messages.get(handle))
        expect(theDeliveryOf(messages.get(handle)!, handle).mark).toBe('delivered')
      }
      expect(started, 'the check was started in the same pass').toContain(checkAsk)
      expect(started).not.toContain(failing)
      expect(pass.held.find((one) => one.messageId === failing)?.because).toBe(said?.because)
      expect(theDeliveryOf(failing, 'its-ask-throws').mark, 'the failed delivery stays queued').toBe('queued')
      expect(theDeliveryOf(failing, 'its-ask-throws').because, 'the failure is written on the delivery').toBe(said?.because)
    } finally {
      theThrow.at = null
    }
    const again = await onePass(settings, watching, [])
    expect(again.started.map((one) => one.messageId), 'with the cause gone, the next pass starts it').toContain(failing)
    expect(theDeliveryOf(failing, 'its-ask-throws').mark).toBe('delivered')
  }, 60_000)

  it('4: the earlier Casting roll cannot be read; the pass starts the others and says why on the failed delivery', async () => {
    const throwing = theIdOf('its-roll-cannot-be-read')
    // A ROLL STORED ON ONE OF THE AGENT'S RUNS, in a shape `readCastingRoll` refuses. Every door refuses to write a roll,
    // and the office's own write takes only a readable one, so this broken store is written by SQL.
    const broken = t.api.createRecord({
      kind: 'session',
      title: 'Synthetic run with a roll that cannot be read',
      workspaceId: WORKSPACE,
      actor: { type: 'agent', id: 'its-roll-cannot-be-read' },
      origin: 'fixture',
      data: { state: 'crashed', servingAgent: 'its-roll-cannot-be-read' },
    }).id
    t.client.sqlite
      .prepare("UPDATE records SET data = json_set(data, '$.castingRoll', json(?)) WHERE id = ?")
      .run(JSON.stringify({ choice: 'rolled', made: 'up by this test' }), broken)
    const { theEarlierCastingRoll } = await import('../src/server/lib/casting-roll.ts')
    const thrown = ((): string => {
      try {
        theEarlierCastingRoll(WORKSPACE, throwing)
      } catch (error) {
        return (error as Error).message
      }
      return 'nothing was thrown'
    })()
    expect(thrown).toContain('The Casting roll cannot be read')
    for (const handle of ['its-roll-cannot-be-read', 'delivered-three', 'delivered-four']) messages.set(handle, await aMessageTo(handle))
    const failing = messages.get('its-roll-cannot-be-read')!
    const door = await theDoor()
    expect(door.status, door.raw).toBe(200)
    expect(holds(door.queue, failing, 'its-roll-cannot-be-read')).toBe(false)
    const said = door.failed.find((one) => one.messageId === failing && one.handle === 'its-roll-cannot-be-read')
    expect(said?.error, JSON.stringify(door.failed)).toBe(thrown)
    // THE SENTENCE FOR THE DELIVERY FITS THE HELD DOOR, which writes at most 500 characters on a delivery, and says
    // where it cut the error's words.
    expect(said!.because).toContain('The Casting roll cannot be read')
    expect(said!.because.length).toBeLessThanOrEqual(500)
    expect(thrown.length, 'the error is longer than a delivery holds').toBeGreaterThan(500)
    expect(said!.because).toContain('more characters; the whole error is in the failed list of GET /api/worker/queue.')
    for (const one of door.failed) expect(one.handle, 'only the one agent\'s roll is unreadable').toBe('its-roll-cannot-be-read')
    const pass = await onePass(settings, watching, [])
    const started = pass.started.map((one) => one.messageId)
    for (const handle of ['delivered-three', 'delivered-four']) {
      expect(started, `the message for ${handle} was started in the same pass`).toContain(messages.get(handle))
      expect(theDeliveryOf(messages.get(handle)!, handle).mark).toBe('delivered')
    }
    expect(started).not.toContain(failing)
    expect(pass.held.find((one) => one.messageId === failing)?.because).toBe(said?.because)
    expect(theDeliveryOf(failing, 'its-roll-cannot-be-read').mark, 'the failed delivery stays queued').toBe('queued')
    expect(theDeliveryOf(failing, 'its-roll-cannot-be-read').because, 'the failure is written on the delivery').toBe(said?.because)
    // THE CAUSE IS TAKEN AWAY, as a person would mend it: the run with the unreadable roll is deleted.
    t.api.deleteRecord(broken, { type: 'human', id: THE_PERSON })
    const again = await onePass(settings, watching, [])
    expect(again.started.map((one) => one.messageId), 'with the cause gone, the next pass starts it').toContain(failing)
    expect(theDeliveryOf(failing, 'its-roll-cannot-be-read').mark).toBe('delivered')
  }, 60_000)

  it("5: read for several agents at once, one unreadable roll is its agent's answer alone, and every other agent has the roll it has alone", async () => {
    const { theEarlierCastingRoll, theEarlierCastingRolls } = await import('../src/server/lib/casting-roll.ts')
    const readable = theCastingRoll({
      role: THE_WORKER, project: 'default', rows: [{ id: 1, program: 'claude-code', model: 'made-up-model', effort: 'high', probability: 1, marked: false, labels: [], outUntil: null }],
      difficulty: null, named: null, earlier: null, builderModel: null, limits: { limited: [], unreadableStops: [], week: 'The week was not read.' }, random: () => 0.25,
    }).record
    expect(readable.choice).toBe('rolled')
    const unreadable = { choice: 'rolled', made: 'up by this test' }
    // A CRASHED RUN OF THIS AGENT, AND THEN THIS FIELD STORED ON IT BY SQL, as in case 4.
    const aRun = (servingAgent: string, field: '$.castingRoll' | '$.workerRuns', value: unknown): string => {
      const run = t.api.createRecord({
        kind: 'session', title: 'Synthetic run that holds a roll', workspaceId: WORKSPACE, actor: { type: 'agent', id: servingAgent }, origin: 'fixture',
        data: { state: 'crashed', servingAgent },
      }).id
      t.client.sqlite.prepare('UPDATE records SET data = json_set(data, ?, json(?)) WHERE id = ?').run(field, JSON.stringify(value), run)
      return run
    }
    for (const handle of ['rolled-on-its-run', 'rolled-on-an-ask', 'never-rolled', 'refused-on-its-run', 'refused-on-an-ask']) await anAgent(handle)
    const id = (handle: string): string => theIdOf(handle)
    const runs: Record<string, string> = {
      'rolled-on-its-run': aRun('rolled-on-its-run', '$.castingRoll', readable),
      'rolled-on-an-ask': aRun('super-t', '$.workerRuns', { [id('rolled-on-an-ask')]: { castingRoll: readable } }),
      'refused-on-its-run': aRun('refused-on-its-run', '$.castingRoll', unreadable),
      'refused-on-an-ask': aRun('super-t', '$.workerRuns', { [id('refused-on-an-ask')]: { castingRoll: unreadable } }),
    }
    const others = ['rolled-on-its-run', 'rolled-on-an-ask', 'never-rolled']
    // EACH OTHER AGENT, ASKED ALONE, has a roll, a roll on an ask, or none, so equal answers are not equal for being empty.
    expect(theEarlierCastingRoll(WORKSPACE, id('rolled-on-its-run'))?.run).toBe(runs['rolled-on-its-run'])
    expect(theEarlierCastingRoll(WORKSPACE, id('rolled-on-an-ask'))?.run).toBe(runs['rolled-on-an-ask'])
    expect(theEarlierCastingRoll(WORKSPACE, id('never-rolled'))).toBeNull()
    for (const refused of ['refused-on-its-run', 'refused-on-an-ask']) {
      const thrown = ((): string => {
        try {
          theEarlierCastingRoll(WORKSPACE, id(refused))
        } catch (error) {
          return (error as Error).message
        }
        return 'nothing was thrown'
      })()
      expect(thrown, refused).toContain('The Casting roll cannot be read')
      const asked = [...others, refused].map(id)
      const all = theEarlierCastingRolls(WORKSPACE, asked)
      expect([...all.keys()].sort(), refused).toEqual([...asked].sort())
      expect(all.get(id(refused)), refused).toEqual({ run: runs[refused], unreadable: thrown })
      for (const handle of others) expect(all.get(id(handle)), `${handle} beside ${refused}`).toEqual(theEarlierCastingRoll(WORKSPACE, id(handle)))
    }
  })
})
