// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { setFixtureOwner } from './agent-owner-fixture.ts'
/**
 * "COULD NOT TELL" IS ITS OWN ANSWER: A MESSAGE TO SUCH AN AGENT GOES NO FURTHER UP ITS CHAIN.
 *
 * Problem `TOoUy7fMbg1P`, found by wave 13j's round 9 (report 3Ht9IooMEFUY, block r9-8). The secretary's
 * message Uy7lHchqqTXJ to a second agent carried a `data.routed` entry that sent a copy to the owner.
 * That agent's session had a live process but no recorded transcript, so src/server/lib/answering.ts read
 * it as not answering; the routing counted that as unreachable, and because that agent holds the secretary
 * card the copy went to the owner. The secretary's brief: make "could not tell" its
 * own answer; no copy goes up the chain on that alone; a copy goes up only when the agent is known to
 * be unreachable; the sender is told plainly that the office could not tell.
 *
 * WHAT IS MEASURED
 *
 *   · a secretary whose session holds its handle, has a live process and has no transcript: the
 *     reading says `couldNotTell`, the reach reading says `could not tell`, and an agent's message to
 *     it makes no routed entry and no delivery row for the owner, while the reply tells the sender;
 *   · a worker in the same state with a reachable starter: a person's message to it makes no copy for
 *     the starter, and the reply tells the sender;
 *   · the control: the same worker shape with NO live process is known to be unreachable, so the
 *     message still goes up to the starter as before. Its hold is current, so a person's send to it
 *     answers 201: a current hold holds the handle even when nothing is behind it, and the waiter
 *     takes the message when it comes. Only a hold that has lapsed holds nothing, and then the send
 *     answers the unheld 409 (tests/a-send-to-an-agent-releases-its-lapsed-hold.test.ts, case 1);
 *   · a rung the office could not tell about ends the walk and receives the copy, and the line says
 *     the office could not tell whether that rung is answering.
 *
 * MUTATIONS, each run and each red (the runs are in the commit message that adds this file):
 *   (a) count "could not tell" as unreachable again: in `whyThisAgentCannotBeReached`
 *       (src/server/lib/worker.ts), return `was: 'nothing answering'` where it returns
 *       `was: 'could not tell'` — the secretary and worker cases go red, because a copy is routed;
 *   (b) pass over a rung the office could not tell about: in `theRoutingOfOneAddressee`
 *       (src/server/lib/superiors.ts), test `cannot === null` alone — the rung case goes red.
 *   (c) log a check's line: in src/server/lib/records.ts, delete `!onlyChecking() && ` from the line that logs
 *       `notRouted` for a run's reply — the check case goes red, because a check of the reply prints the line
 *       (wave 13s, round 20; the line has been skipped during a check since round 18).
 *
 * A LIVE PROCESS IS A REAL CHILD OF THIS TEST, in its own group, registered as a process resource of
 * the session. The children are killed by their group in afterAll.
 *
 * EVERY HOLD HERE IS KEPT: past its lapse and inside its grace. While a hold beats, the hold is the answer for every
 * tool, so a beating hold with nothing readable behind it reads answering and nothing is routed on it at all. The
 * office's "could not tell" is read only for a hold that no longer beats. So each hold is aged past the lapse once it
 * is taken, and the grace is set to a day for this file and put back after it.
 */

import { spawn, type ChildProcess } from 'node:child_process'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import type { HoldOnTheWire } from '../src/shared/handles.ts'
import { localStamp as aStampOf } from '../src/shared/time.ts'

let t: TestDb
let app: FastifyInstance

const WORKSPACE = 'default'
const AS_THE_PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': WORKSPACE,
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}
const asAgent = (id: string): Record<string, string> => ({
  'content-type': 'application/json',
  'x-mole-office-workspace': WORKSPACE,
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': id,
})

/** Every real child this file started, stopped by group afterwards. */
const started: ChildProcess[] = []
const processForSession = new Map<string, ChildProcess>()

/** The session record behind each held handle, by handle. */
const sessionOf = new Map<string, string>()

/** The grace setting this file turns up, and what it was before, put back in afterAll. */
const GRACE = 'MOLE_OFFICE_HANDLE_GRACE_SECONDS'
const GRACE_BEFORE = process.env[GRACE]

/** One routed entry, as the reply carries it. */
interface TheRouting {
  for: { kind: string; id: string }
  because: string
  to: { kind: string; id: string } | null
  line: string
}

/** One addressee the office could not tell about, as the reply carries it. */
interface TheNotRouted {
  for: { kind: string; id: string }
  because: string
  line: string
}

// ============================================================ fixtures

function anAgent(handle: string): string {
  t.api.createRecord({
    workspaceId: WORKSPACE,
    kind: 'agent',
    title: handle,
    data: { handle, state: 'active', runtime: 'claude-code' },
    actor: t.api.HUMAN,
  })
  return idOf(handle)
}

function idOf(handle: string): string {
  const row = t.client.sqlite.prepare('SELECT id FROM agents WHERE handle = ?').get(handle) as { id: string } | undefined
  expect(row, `no agent bears the handle ${handle}`).toBeDefined()
  return row!.id
}

/** The registry name of the agent bearing this handle, which is what every line names it by. */
function nameOf(handle: string): string {
  const row = t.client.sqlite.prepare('SELECT name FROM agents WHERE handle = ?').get(handle) as { name: string }
  return row.name !== '' ? row.name : handle
}

const agentRef = (handle: string): { kind: 'agent'; id: string } => ({ kind: 'agent', id: idOf(handle) })

function setStartedBy(handle: string, by: { kind: string; id: string }): void {
  t.client.sqlite
    .prepare('UPDATE agents SET started_by_kind = ?, started_by_id = ? WHERE id = ?')
    .run(by.kind, by.id, idOf(handle))
  const columns = t.client.sqlite.prepare('PRAGMA table_info(agents)').all() as { name: string }[]
  if (columns.some((column) => column.name === 'owner_id')) {
    setFixtureOwner(t.client.sqlite, by.kind === 'agent' ? by.id : null, idOf(handle), 'id')
  }
}

function makeSecretary(handle: string): void {
  t.client.sqlite.prepare("UPDATE agents SET role = 'secretary' WHERE id = ?").run(idOf(handle))
}

/** A real process of this test's own, in its own group, registered against the session. */
async function aLiveProcessFor(sessionRecordId: string): Promise<void> {
  const child = spawn('sleep', ['120'], { detached: true, stdio: 'ignore' })
  child.unref()
  started.push(child)
  processForSession.set(sessionRecordId, child)
  expect(child.pid, 'the child did not start, so nothing below is measuring anything').toBeDefined()
  const { registerResource } = await import('../src/server/lib/resources.ts')
  registerResource({ workspaceId: WORKSPACE, sessionRecordId, type: 'process', key: String(child.pid), actor: t.api.HUMAN })
}

/** A running session serving the agent, with a live process: the reach reading reads this as a run. */
async function makeReachable(handle: string): Promise<void> {
  const session = t.api.createRecord({
    workspaceId: WORKSPACE,
    kind: 'session',
    title: 'a run of this agent',
    data: { state: 'running', runtime: 'claude-code', servingAgent: idOf(handle) },
    actor: t.api.HUMAN,
  }).id
  await aLiveProcessFor(session)
}

/**
 * A session that holds the agent's handle and has NO transcript on record, like that agent's.
 *
 * It names no serving agent, so it is not read as a run: the only thing that answers for it is the
 * reading behind the hold in answering.ts. `alive` gives it a live process; without one, the office
 * knows nothing of it is there. The hold is aged a hundred seconds once it is taken, past the lapse
 * and inside the grace this file sets, so it is kept and no longer beats.
 */
async function aHeldSessionWithNoTranscript(handle: string, alive: boolean): Promise<void> {
  const session = t.api.createRecord({
    workspaceId: WORKSPACE,
    kind: 'session',
    title: 'a session with no recorded transcript',
    data: { state: 'running', runtime: 'claude-code' },
    actor: t.api.HUMAN,
  }).id
  if (alive) await aLiveProcessFor(session)
  const reply = await app.inject({
    method: 'POST',
    url: `/api/handles/${encodeURIComponent(handle)}/hold`,
    headers: AS_THE_PERSON,
    payload: { session, machine: 'a-machine', runtime: 'claude-code' },
  })
  expect(reply.statusCode, reply.body).toBe(201)
  t.client.sqlite
    .prepare('UPDATE handle_holds SET last_heard_at = ? WHERE session_record_id = ? AND released_at IS NULL')
    .run(aStampOf(new Date(Date.now() - 100_000)), session)
  sessionOf.set(handle, session)
}

function dataOf(id: string): Record<string, unknown> {
  const row = t.client.sqlite.prepare('SELECT data FROM records WHERE id = ?').get(id) as { data: string }
  return JSON.parse(row.data) as Record<string, unknown>
}

function recipientsOf(messageId: string): string[] {
  return (
    t.client.sqlite
      .prepare('SELECT recipient_kind AS k, recipient_id AS id FROM message_delivery WHERE message_id = ? ORDER BY recipient_id')
      .all(messageId) as { k: string; id: string }[]
  ).map((one) => `${one.k}:${one.id}`)
}

async function send(
  headers: Record<string, string>,
  to: string,
  body: string,
): Promise<{ code: number; said: Record<string, unknown>; messageId: string }> {
  const reply = await app.inject({
    method: 'POST',
    url: '/api/records',
    headers,
    payload: { kind: 'message', title: body.slice(0, 40), data: { to: [{ kind: 'agent', id: to }], body } },
  })
  const said = reply.json() as Record<string, unknown>
  const record = said['record'] as { id: string } | undefined
  return { code: reply.statusCode, said, messageId: record?.id ?? '' }
}

const routedOf = (said: Record<string, unknown>): TheRouting[] => (said['routed'] as TheRouting[] | undefined) ?? []
const notRoutedOf = (said: Record<string, unknown>): TheNotRouted[] =>
  (said['notRouted'] as TheNotRouted[] | undefined) ?? []

/** The sentence the sender is told, word for word. */
const couldNotTell = (name: string): string =>
  `Mole Office could not tell whether ${name} is answering, so it did not also give this message to anybody else.`

beforeAll(async () => {
  process.env[GRACE] = '86400'
  t = await freshDb()
  const built = await apiApp()
  app = built.app
  await app.ready()

  anAgent('cnt-sender')

  // THE PROBLEM'S CASE: a secretary with a live process and no transcript.
  anAgent('cnt-secretary')
  makeSecretary('cnt-secretary')
  await aHeldSessionWithNoTranscript('cnt-secretary', true)

  // A WORKER IN THE SAME STATE, whose starter can be reached.
  anAgent('cnt-starter')
  await makeReachable('cnt-starter')
  anAgent('cnt-worker')
  setStartedBy('cnt-worker', agentRef('cnt-starter'))
  await aHeldSessionWithNoTranscript('cnt-worker', true)

  // THE CONTROL: the same worker shape, but nothing of its session is alive.
  anAgent('gone-starter')
  await makeReachable('gone-starter')
  anAgent('gone-worker')
  setStartedBy('gone-worker', agentRef('gone-starter'))
  await aHeldSessionWithNoTranscript('gone-worker', false)

  // A RUNG THE OFFICE COULD NOT TELL ABOUT, above a worker nothing is answering as, below a
  // reachable top.
  anAgent('rung-top')
  await makeReachable('rung-top')
  anAgent('rung-unread')
  setStartedBy('rung-unread', agentRef('rung-top'))
  await aHeldSessionWithNoTranscript('rung-unread', true)
  anAgent('rung-end')
  setStartedBy('rung-end', agentRef('rung-unread'))
}, 60_000)

afterAll(() => {
  for (const child of started) {
    try {
      if (child.pid !== undefined) process.kill(-child.pid, 'SIGKILL')
    } catch {
      // Already gone, which is not a failure of anything this file is testing.
    }
  }
  app.close()
  t.close()
  if (GRACE_BEFORE === undefined) delete process.env[GRACE]
  else process.env[GRACE] = GRACE_BEFORE
})

describe('a live process with no transcript is "could not tell", and nothing is routed on it', () => {
  it('reads the session behind the hold as "could not tell", not as known to be gone', async () => {
    const { theSessionBehindTheHold } = await import('../src/server/lib/answering.ts')
    const reading = theSessionBehindTheHold(
      { session: sessionOf.get('cnt-secretary')! } as unknown as HoldOnTheWire,
      WORKSPACE,
      new Date(),
    )
    expect(reading.answering).toBe(false)
    expect(reading.answering === false && reading.couldNotTell, reading.says ?? 'no sentence').toBe(true)
    expect(reading.says ?? '').toContain('no transcript was recorded for it')
    expect(reading.says ?? '').toContain('so whether it is still answering could not be read.')

    const { whyThisAgentCannotBeReached } = await import('../src/server/lib/worker.ts')
    const reach = whyThisAgentCannotBeReached(idOf('cnt-secretary'), WORKSPACE)
    expect(reach?.was).toBe('could not tell')
    expect(reach?.because).toBe(reading.says)
  })

  it("makes no copy for the owner when the secretary is the addressee, and tells the sender", async () => {
    const { code, said, messageId } = await send(asAgent(idOf('cnt-sender')), idOf('cnt-secretary'), 'A note for the secretary')
    expect(code, JSON.stringify(said)).toBe(201)
    expect(routedOf(said), 'a copy was routed on "could not tell"').toEqual([])
    expect(dataOf(messageId)['routed']).toBeUndefined()
    expect(recipientsOf(messageId)).toEqual([`agent:${idOf('cnt-secretary')}`])
    const told = notRoutedOf(said)
    expect(told).toHaveLength(1)
    expect(told[0]!.for).toEqual(agentRef('cnt-secretary'))
    expect(told[0]!.line).toBe(couldNotTell(nameOf('cnt-secretary')))
    expect(told[0]!.because).toContain('so whether it is still answering could not be read.')
  })

  it("makes no copy for the worker's starter when a person sends, and tells the sender", async () => {
    const { code, said, messageId } = await send(AS_THE_PERSON, idOf('cnt-worker'), 'A note for the worker')
    expect(code, JSON.stringify(said)).toBe(201)
    expect(routedOf(said), 'a copy was routed on "could not tell"').toEqual([])
    expect(recipientsOf(messageId)).toEqual([`agent:${idOf('cnt-worker')}`])
    expect(notRoutedOf(said).map((one) => one.line)).toEqual([couldNotTell(nameOf('cnt-worker'))])
  })
})

describe('an agent known to be unreachable is still routed up its chain', () => {
  it('reads a held session with no live process and no transcript as known not answering', async () => {
    const { theSessionBehindTheHold } = await import('../src/server/lib/answering.ts')
    const reading = theSessionBehindTheHold(
      { session: sessionOf.get('gone-worker')! } as unknown as HoldOnTheWire,
      WORKSPACE,
      new Date(),
    )
    expect(reading.answering).toBe(false)
    expect(reading.answering === false && reading.couldNotTell).toBe(false)
    expect(reading.says ?? '').toContain('so nothing shows it is still answering.')
  })

  it('gives the reachable owner a copy and says nothing of "could not tell"', async () => {
    const { code, said, messageId } = await send(AS_THE_PERSON, idOf('gone-worker'), 'A note for a gone worker')
    // A CURRENT HOLD HOLDS THE HANDLE, SO THE SEND STAYS 201, though nothing is behind the hold: the waiter takes
    // the message when it comes. This worker is known to be unreachable, so the copy is still routed up the chain.
    expect(code, JSON.stringify(said)).toBe(201)
    const entry = routedOf(said)[0]
    expect(entry, JSON.stringify(said)).toBeDefined()
    expect(entry!.for).toEqual(agentRef('gone-worker'))
    expect(entry!.to).toEqual(agentRef('gone-starter'))
    const { t: word } = await import('../src/shared/i18n.ts')
    expect(entry!.line).toContain(word('chatEnglish.routed.ending.ownerReached', { reached: nameOf('gone-starter'), addressee: nameOf('gone-worker') }))
    expect(recipientsOf(messageId)).toEqual([`agent:${idOf('gone-starter')}`, `agent:${idOf('gone-worker')}`].sort())
    expect(said['notRouted']).toBeUndefined()
  })
})

describe('a rung the office could not tell about is not passed over', () => {
  it('ends the walk at that rung, gives it the copy, and says the office could not tell', async () => {
    const { code, said, messageId } = await send(asAgent(idOf('cnt-sender')), idOf('rung-end'), 'A note up a chain')
    expect(code, JSON.stringify(said)).toBe(409)
    const entry = routedOf(said)[0]
    expect(entry, JSON.stringify(said)).toBeDefined()
    expect(entry!.to, 'the walk passed over a rung it could not tell about').toEqual(agentRef('rung-unread'))
    const { t: word } = await import('../src/shared/i18n.ts')
    expect(entry!.line).toContain(word('chatEnglish.routed.ending.ownerUncertain', { reached: nameOf('rung-unread'), addressee: nameOf('rung-end') }))
    expect(recipientsOf(messageId)).toEqual([`agent:${idOf('rung-end')}`, `agent:${idOf('rung-unread')}`].sort())
  })
})

describe('a copy given to an uncertain owner', () => {
  async function waitingCopy(prefix: string, topAnswers: boolean) {
    anAgent(`${prefix}-top`)
    if (topAnswers) await makeReachable(`${prefix}-top`)
    anAgent(`${prefix}-middle`)
    setStartedBy(`${prefix}-middle`, agentRef(`${prefix}-top`))
    await aHeldSessionWithNoTranscript(`${prefix}-middle`, true)
    anAgent(`${prefix}-end`)
    setStartedBy(`${prefix}-end`, agentRef(`${prefix}-middle`))
    const sent = await send(AS_THE_PERSON, idOf(`${prefix}-end`), 'A copy awaiting its owner')
    expect(sent.code).toBe(409)
    expect(routedOf(sent.said)[0]?.to).toEqual(agentRef(`${prefix}-middle`))
    const { DELIVERY_MARKS } = await import('../src/shared/messages.ts')
    const row = () => t.client.sqlite.prepare('SELECT mark FROM message_delivery WHERE message_id = ? AND recipient_id = ?')
      .get(sent.messageId, idOf(`${prefix}-middle`)) as { mark: string } | undefined
    expect(row()?.mark).toBe(DELIVERY_MARKS[0])
    const child = processForSession.get(sessionOf.get(`${prefix}-middle`)!)!
    const exited = new Promise<void>((resolve) => child.once('exit', () => resolve()))
    process.kill(-child.pid!, 'SIGKILL')
    await exited
    const { whyThisAgentCannotBeReached } = await import('../src/server/lib/worker.ts')
    expect(whyThisAgentCannotBeReached(idOf(`${prefix}-middle`), WORKSPACE)?.was).toBe('nothing answering')
    const { sweepDeadLetters } = await import('../src/server/lib/deadletters.ts')
    const sweep = () => sweepDeadLetters({ type: 'system', id: 'mole-office' })
    return { message: sent.messageId, row, sweep, queued: DELIVERY_MARKS[0] }
  }

  it('loads only uncertain-owner retry candidates from a mixed queued inbox through the routed index', async () => {
    const { message, sweep } = await waitingCopy('uncertain-candidates', true)
    const ordinary: string[] = []
    for (let i = 0; i < 8; i += 1) {
      const sent = await send(AS_THE_PERSON, idOf(i < 4 ? 'cnt-worker' : 'gone-worker'), `An ordinary queued note ${i}`)
      expect(sent.messageId).not.toBe('')
      ordinary.push(sent.messageId)
    }

    const reads: { sql: string; values: unknown[]; rows: unknown }[] = []
    const prepare = t.client.sqlite.prepare.bind(t.client.sqlite)
    const spy = vi.spyOn(t.client.sqlite, 'prepare').mockImplementation(((sql: string) => {
      const statement = prepare(sql)
      const all = statement.all.bind(statement) as (...values: unknown[]) => unknown
      ;(statement as unknown as { all: (...values: unknown[]) => unknown }).all = (...values: unknown[]) => {
        const rows = all(...values)
        if (new Error().stack?.includes('uncertainOwnerRetryCandidates')) reads.push({ sql, values, rows })
        return rows
      }
      return statement
    }) as never)
    try {
      sweep()
    } finally {
      spy.mockRestore()
    }
    const candidateRead = reads.find((one) => /json_each/i.test(one.sql))
    expect(candidateRead, 'the retry asks SQLite for uncertain routes').toBeDefined()
    expect(JSON.stringify(candidateRead!.rows)).toContain(message)
    for (const id of ordinary) expect(JSON.stringify(reads.map((one) => one.rows))).not.toContain(id)
    const plan = t.client.sqlite.prepare(`EXPLAIN QUERY PLAN ${candidateRead!.sql}`).all(...candidateRead!.values) as { detail: string }[]
    const routedIndex = (t.client.sqlite.prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'records' AND name LIKE '%message%routed%'").get() as { name: string }).name
    expect(plan.map((step) => step.detail).join('\n')).toContain(routedIndex)
    expect(recipientsOf(message)).toContain(`agent:${idOf('uncertain-candidates-top')}`)
  })

  it('routes a copy to the next reachable owner after the uncertain owner stops, once', async () => {
    const { message, row, sweep, queued } = await waitingCopy('uncertain-retry', true)
    const before = dataOf(message)
    sweep()
    sweep()
    expect(row()?.mark).toBe(queued)
    expect(recipientsOf(message)).toEqual([`agent:${idOf('uncertain-retry-end')}`, `agent:${idOf('uncertain-retry-middle')}`, `agent:${idOf('uncertain-retry-top')}`].sort())
    const after = dataOf(message)
    expect(after['to']).toEqual(before['to'])
    expect(after['sentBy']).toEqual(before['sentBy'])
    expect(after['body']).toEqual(before['body'])
    expect((after['routed'] as TheRouting[]).filter((route) => route.to?.id === idOf('uncertain-retry-top'))).toHaveLength(1)
  })

  it('lets the original addressee receive the message before retrying the owners', async () => {
    const { message, sweep } = await waitingCopy('uncertain-direct', true)
    const before = dataOf(message)
    const { localStamp } = await import('../src/shared/time.ts')
    t.api.createRecord({
      workspaceId: WORKSPACE, kind: 'session', title: 'A waiting test run',
      data: { state: 'finished', runtime: 'claude-code', servingAgentId: idOf('uncertain-direct-end'), deliveringMessage: 'test-message', providerSession: 'uncertain-direct-conversation', waitsUntil: localStamp(new Date(Date.now() + 30 * 60_000)) },
      actor: t.api.HUMAN,
    })
    sweep()
    sweep()
    expect(dataOf(message)).toEqual(before)
    expect(recipientsOf(message)).toEqual([`agent:${idOf('uncertain-direct-end')}`, `agent:${idOf('uncertain-direct-middle')}`].sort())
  })

  it('does not forward a copy while the original addressee has recent output', async () => {
    const { message, sweep } = await waitingCopy('uncertain-recent', true)
    const before = dataOf(message)
    const { localStamp } = await import('../src/shared/time.ts')
    t.api.createRecord({
      workspaceId: WORKSPACE, kind: 'session', title: 'A recently speaking test run',
      data: { state: 'finished', runtime: 'claude-code', servingAgentId: idOf('uncertain-recent-end'), lastOutputAt: localStamp(new Date()) },
      actor: t.api.HUMAN,
    })
    sweep()
    sweep()
    expect(dataOf(message)).toEqual(before)
    expect(recipientsOf(message)).toEqual([`agent:${idOf('uncertain-recent-end')}`, `agent:${idOf('uncertain-recent-middle')}`].sort())
  })

  it('keeps the copy queued until an owner can receive it', async () => {
    const { message, row, sweep, queued } = await waitingCopy('uncertain-wait', false)
    sweep()
    sweep()
    expect(row()?.mark).toBe(queued)
    expect(recipientsOf(message)).toEqual([`agent:${idOf('uncertain-wait-end')}`, `agent:${idOf('uncertain-wait-middle')}`].sort())
    await makeReachable('uncertain-wait-top')
    sweep()
    sweep()
    expect(recipientsOf(message)).toEqual([`agent:${idOf('uncertain-wait-end')}`, `agent:${idOf('uncertain-wait-middle')}`, `agent:${idOf('uncertain-wait-top')}`].sort())
    expect((dataOf(message)['routed'] as TheRouting[]).filter((route) => route.to?.id === idOf('uncertain-wait-top'))).toHaveLength(1)
  })
})

describe("a run's reply the office could not tell about is logged, and a check of it logs nothing", () => {
  /** The reply the message worker files for a run, as tests/a-message-nobody-can-take-goes-up-the-chain-of-starters.test.ts files it. */
  const aRunsReply = (body: string): { id: string } =>
    t.api.createRecord({
      workspaceId: WORKSPACE,
      kind: 'message',
      title: body.slice(0, 40),
      data: { body, to: [agentRef('cnt-secretary')], sentBy: { kind: 'agent', id: 'whoever-served' }, inReplyTo: 'talk-1', fromRun: 'the-run' },
      actor: { type: 'agent', id: 'mole-office/worker' },
      senderIsTheRun: true,
    })

  it("prints the line for the written reply and nothing for the checked one", async () => {
    const { writeOrCheck } = await import('../src/server/lib/only-a-check.ts')
    const line = couldNotTell(nameOf('cnt-secretary'))
    const lines: string[] = []
    const printed = vi.spyOn(console, 'log').mockImplementation((...parts) => {
      lines.push(parts.map((one) => String(one)).join(' '))
    })
    try {
      // THE CONTROL: written, the reply has no caller to answer, so the process log carries the line.
      writeOrCheck('write', () => aRunsReply('The run says it is written.'))
      expect(lines.filter((one) => one.includes(line)), JSON.stringify(lines)).toHaveLength(1)
      // CHECKED, nothing went anywhere, so nothing is logged.
      lines.length = 0
      const before = t.client.sqlite.prepare("SELECT COUNT(*) AS n FROM records WHERE kind = 'message'").get() as { n: number }
      writeOrCheck('check', () => aRunsReply('The run says it is only checked.'))
      expect(lines.filter((one) => one.includes(line)), JSON.stringify(lines)).toEqual([])
      const after = t.client.sqlite.prepare("SELECT COUNT(*) AS n FROM records WHERE kind = 'message'").get() as { n: number }
      expect(after.n, 'the check wrote a message').toBe(before.n)
    } finally {
      printed.mockRestore()
    }
  })
})
