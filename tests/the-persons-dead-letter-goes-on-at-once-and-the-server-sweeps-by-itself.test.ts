// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { setFixtureOwner } from './agent-owner-fixture.ts'
/** A person’s waiting letters follow their owners, and the server still sweeps on its own. */

import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'

let t: TestDb
let app: FastifyInstance
let groups: typeof import('../src/server/lib/groups.ts')
let deadletters: typeof import('../src/server/lib/deadletters.ts')

const WORKSPACE = 'default'
const AS_THE_PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': WORKSPACE,
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

const THRESHOLDS = ['MOLE_OFFICE_DEAD_LETTER_AFTER_DAYS', 'MOLE_OFFICE_DEAD_LETTER_AFTER_COUNT'] as const
const thresholdsBefore = new Map<string, string | undefined>()

// ============================================================ fixtures

/** Register an agent and give back its registry id. */
function anAgent(handle: string, role: string): string {
  t.api.createRecord({
    workspaceId: WORKSPACE,
    kind: 'agent',
    title: handle,
    data: { handle, state: 'active', runtime: 'claude-code' },
    actor: t.api.HUMAN,
  })
  t.client.sqlite.prepare('UPDATE agents SET role = ? WHERE id = ?').run(role, idOf(handle))
  return idOf(handle)
}

function idOf(handle: string): string {
  const row = t.client.sqlite.prepare('SELECT id FROM agents WHERE handle = ?').get(handle) as { id: string } | undefined
  expect(row, `no agent bears the handle ${handle}`).toBeDefined()
  return row!.id
}

function startedByThePerson(handle: string): void {
  t.client.sqlite.prepare('UPDATE agents SET started_by_kind = ?, started_by_id = ? WHERE id = ?').run('person', THE_PERSON, idOf(handle))
}

function setOwner(handle: string, owner: string | null): void {
  const columns = t.client.sqlite.prepare('PRAGMA table_info(agents)').all() as { name: string }[]
  if (columns.some((column) => column.name === 'owner_id')) {
    setFixtureOwner(t.client.sqlite, owner, idOf(handle), 'id')
  }
}

async function reachable(handle: string): Promise<void> {
  const { localStamp } = await import('../src/shared/time.ts')
  t.api.createRecord({ workspaceId: WORKSPACE, kind: 'session', title: 'A test owner waiting for work', actor: t.api.HUMAN,
    data: { state: 'finished', runtime: 'claude-code', servingAgentId: idOf(handle), deliveringMessage: 'test-message',
      providerSession: `test-conversation-${handle}`, waitsUntil: localStamp(new Date(Date.now() + 30 * 60_000)) } })
}

function retire(handle: string): void {
  t.client.sqlite.prepare("UPDATE agents SET retired = 1, retired_because = 'the piece of work is done' WHERE id = ?").run(idOf(handle))
}

function dataOf(id: string): Record<string, unknown> {
  const row = t.client.sqlite.prepare('SELECT data FROM records WHERE id = ?').get(id) as { data: string }
  return JSON.parse(row.data) as Record<string, unknown>
}

function deliveriesOf(messageId: string): { recipientId: string; mark: string }[] {
  return t.client.sqlite
    .prepare('SELECT recipient_id AS recipientId, mark FROM message_delivery WHERE message_id = ? ORDER BY recipient_id')
    .all(messageId) as { recipientId: string; mark: string }[]
}

function markOf(messageId: string, handle: string): string | undefined {
  return deliveriesOf(messageId).find((one) => one.recipientId === idOf(handle))?.mark
}

/** The person sends one letter to one agent. Answers the reply's status, its body and the message id. */
async function thePersonWrites(to: string, body: string): Promise<{ status: number; reply: Record<string, unknown>; id: string }> {
  const reply = await app.inject({
    method: 'POST',
    url: '/api/records',
    headers: AS_THE_PERSON,
    payload: { kind: 'message', title: body.slice(0, 40), data: { to: [{ kind: 'agent', id: to }], body } },
  })
  const said = reply.json() as Record<string, unknown> & { record?: { id: string } }
  expect(said.record?.id, `the letter was not stored: ${reply.body.slice(0, 400)}`).toBeTruthy()
  return { status: reply.statusCode, reply: said, id: said.record!.id }
}

/** An office notice to one agent, written the way the office writes one. */
function anOfficeNotice(handle: string, line: string): string {
  return groups.writeASystemLineToOne({ kind: 'agent', id: idOf(handle) }, WORKSPACE, { line, said: null, notice: 'aCounterFired' }, { type: 'agent', id: 'mole-office/worker' }).id
}

/** The routed entries this letter carries for one addressee. */
function routedFor(messageId: string, handle: string): { to: { kind: string; id: string } | null; said?: Record<string, unknown>; line: string; inSummary?: string }[] {
  const routed = (dataOf(messageId)['routed'] ?? []) as { for: { id: string }; to: { kind: string; id: string } | null; said?: Record<string, unknown>; line: string; inSummary?: string }[]
  return routed.filter((one) => one.for.id === idOf(handle))
}

/** How many sweep lines there are. */
function theSweepLines(): number {
  return (
    t.client.sqlite.prepare("SELECT COUNT(*) AS n FROM records WHERE kind = 'message' AND json_extract(data, '$.deadLetterSweep') IS NOT NULL").get() as { n: number }
  ).n
}

async function lettersFromThePersonWaiting(): Promise<number> {
  const reply = await app.inject({ method: 'GET', url: '/api/office/dead-letter-secretary', headers: AS_THE_PERSON })
  expect(reply.statusCode, reply.body).toBe(200)
  return (reply.json() as { lettersFromThePersonWaiting: number }).lettersFromThePersonWaiting
}

/**
 * WHAT STARTING AN AGENT RUN WRITES, counted. The server starts no run itself: the worker's pass is the one
 * path that starts one. What the server can write is the gate to it: a message's `runWasAskedFor` (the
 * person's press, `askForARunFor`), a new agent (the press "start a new agent", `startANewAgentFor`), or a
 * session record, which is a run's own row.
 */
function whatStartingARunWrites(): { askedFor: number; agents: number; sessions: number } {
  const one = (sql: string): number => (t.client.sqlite.prepare(sql).get() as { n: number }).n
  return {
    askedFor: one("SELECT COUNT(*) AS n FROM records WHERE kind = 'message' AND json_extract(data, '$.runWasAskedFor') IS NOT NULL"),
    agents: one('SELECT COUNT(*) AS n FROM agents'),
    sessions: one("SELECT COUNT(*) AS n FROM records WHERE kind = 'session'"),
  }
}

/** Wait, at most `ms`, until `done` answers true. Answers whether it did. */
async function until(done: () => boolean, ms: number): Promise<boolean> {
  const end = Date.now() + ms
  while (Date.now() < end) {
    if (done()) return true
    await new Promise((resolve) => setTimeout(resolve, 20))
  }
  return done()
}

// ============================================================ the world

beforeAll(async () => {
  for (const name of THRESHOLDS) {
    thresholdsBefore.set(name, process.env[name])
    process.env[name] = '100000'
  }
  t = await freshDb()
  groups = await import('../src/server/lib/groups.ts')
  deadletters = await import('../src/server/lib/deadletters.ts')
  const built = await apiApp()
  app = built.app
  await app.ready()

  anAgent('sec-a', 'secretary')
  anAgent('owner-at-once', 'secretary')
  anAgent('owner-later', 'secretary')
  anAgent('agent-writer', 'worker')
  for (const handle of ['w-waits', 'w-at-once', 'w-ownerless', 'w-agent', 'w-old']) {
    anAgent(handle, 'worker')
    startedByThePerson(handle)
    retire(handle)
  }
}, 60_000)

afterAll(async () => {
  await app.close()
  t.close()
  for (const name of THRESHOLDS) {
    const before = thresholdsBefore.get(name)
    if (before === undefined) delete process.env[name]
    else process.env[name] = before
  }
})

// ============================================================ the record door

let waiting = ''

describe('the record door keeps the original letter and follows its owners', () => {
  it('leaves an ownerless retired addressee waiting with its original letter', async () => {
    const sent = await thePersonWrites(idOf('w-waits'), 'A letter waiting for its own owner')
    waiting = sent.id
    const { OWNERLESS_ROUTING_ENDING } = await import('../src/shared/messages.ts')
    expect(sent.status).toBe(409)
    expect(routedFor(waiting, 'w-waits')[0]).toMatchObject({ to: null, said: { ending: { how: OWNERLESS_ROUTING_ENDING } } })
    expect(deliveriesOf(waiting)).toEqual([{ recipientId: idOf('w-waits'), mark: 'queued' }])
    expect(dataOf(waiting)).toMatchObject({ to: [{ kind: 'agent', id: idOf('w-waits') }], sentBy: { kind: 'person', id: THE_PERSON }, body: 'A letter waiting for its own owner' })
  })

  it('gives a person’s letter to its reachable owner, independent of the fixed secretary', async () => {
    const named = await app.inject({ method: 'POST', url: '/api/office/dead-letter-secretary', headers: AS_THE_PERSON, payload: { agent: 'sec-a' } })
    expect(named.statusCode).toBe(200)
    await reachable('owner-at-once')
    setOwner('w-at-once', idOf('owner-at-once'))
    const sent = await thePersonWrites(idOf('w-at-once'), 'A letter for its reachable owner')
    expect(sent.status).toBe(409)
    expect(routedFor(sent.id, 'w-at-once').map((one) => one.to)).toEqual([{ kind: 'agent', id: idOf('owner-at-once') }])
    expect(markOf(sent.id, 'owner-at-once')).toBe('queued')
    expect(markOf(sent.id, 'w-at-once')).toBe('queued')
    expect(markOf(sent.id, 'sec-a')).toBeUndefined()
    expect(dataOf(sent.id)).toMatchObject({ to: [{ kind: 'agent', id: idOf('w-at-once') }], sentBy: { kind: 'person', id: THE_PERSON }, body: 'A letter for its reachable owner' })
    expect(theSweepLines()).toBe(0)
  })

  it('keeps another ownerless letter waiting even when a fixed secretary is named', async () => {
    const sent = await thePersonWrites(idOf('w-ownerless'), 'A letter with no owner')
    expect(sent.status).toBe(409)
    expect(routedFor(sent.id, 'w-ownerless').map((one) => one.to)).toEqual([null])
    expect(deliveriesOf(sent.id)).toEqual([{ recipientId: idOf('w-ownerless'), mark: 'queued' }])
    expect(dataOf(sent.id)).toMatchObject({ to: [{ kind: 'agent', id: idOf('w-ownerless') }], sentBy: { kind: 'person', id: THE_PERSON }, body: 'A letter with no owner' })
  })
})

describe("the server's own timer, with no worker running", () => {
  const log: string[] = []
  let before: ReturnType<typeof whatStartingARunWrites>

  it('sweeps a waiting letter to its newly reachable owner once', async () => {
    await reachable('owner-later')
    setOwner('w-waits', idOf('owner-later'))
    before = whatStartingARunWrites()
    const stop = deadletters.startTheDeadLetterSweep((line) => log.push(line), 20, () => new Date(Date.now() + 60 * 60 * 1000))
    try {
      const reached = await until(() => routedFor(waiting, 'w-waits').some((one) => one.to?.id === idOf('owner-later')), 5_000)
      expect(reached).toBe(true)
    } finally {
      stop()
    }
    expect(markOf(waiting, 'owner-later')).toBe('queued')
    expect(markOf(waiting, 'sec-a')).toBeUndefined()
    expect(dataOf(waiting)).toMatchObject({ to: [{ kind: 'agent', id: idOf('w-waits') }], sentBy: { kind: 'person', id: THE_PERSON }, body: 'A letter waiting for its own owner' })
    deadletters.sweepDeadLetters(t.api.HUMAN)
    expect(routedFor(waiting, 'w-waits').filter((one) => one.to?.id === idOf('owner-later'))).toHaveLength(1)
    expect(deliveriesOf(waiting).filter((one) => one.recipientId === idOf('owner-later'))).toHaveLength(1)
    expect(log.some((line) => line.startsWith('The dead-letter sweep ran on its own:'))).toBe(true)
    expect(theSweepLines()).toBeGreaterThan(0)
  })

  it('starts no agent run: nothing asks for a run, and no agent or session record is made', () => {
    expect(whatStartingARunWrites()).toEqual(before)
  })
})

it('makes an agent’s already-waiting original accessible through one summary', async () => {
  const sender = idOf('agent-writer')
  const body = 'An agent’s original waiting letter'
  t.client.sqlite.prepare('UPDATE agents SET retired = 0 WHERE id = ?').run(idOf('w-agent'))
  await reachable('w-agent')
  const reply = await app.inject({ method: 'POST', url: '/api/records',
    headers: { ...AS_THE_PERSON, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': sender },
    payload: { kind: 'message', title: body, data: { to: [{ kind: 'agent', id: idOf('w-agent') }], body } } })
  expect(reply.statusCode).toBe(201)
  const row = t.client.sqlite.prepare("SELECT id FROM records WHERE kind = 'message' AND json_extract(data, '$.body') = ?").get(body) as { id: string }
  expect(row).toBeDefined()
  const id = row.id
  expect(routedFor(id, 'w-agent')).toEqual([])
  retire('w-agent')
  setOwner('w-agent', idOf('owner-later'))
  deadletters.sweepDeadLetters(t.api.HUMAN)
  deadletters.sweepDeadLetters(t.api.HUMAN)
  expect(dataOf(id)).toMatchObject({ to: [{ kind: 'agent', id: idOf('w-agent') }], sentBy: { kind: 'agent', id: sender }, body })
  const routes = routedFor(id, 'w-agent').filter((one) => one.to?.id === idOf('owner-later'))
  expect(routes).toHaveLength(1)
  expect(routes[0]!.inSummary).toBeTruthy()
  expect(deliveriesOf(routes[0]!.inSummary!).filter((one) => one.recipientId === idOf('owner-later'))).toHaveLength(1)
  expect(deliveriesOf(id).filter((one) => one.recipientId === idOf('owner-later'))).toEqual([])
  const viewed = await app.inject({ method: 'GET', url: `/api/messages/${id}`, headers: { ...AS_THE_PERSON, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': idOf('owner-later') } })
  expect(viewed.statusCode).toBe(200)
  expect(viewed.json()).toMatchObject({ message: { sentBy: { kind: 'agent', id: sender }, body } })
  expect(markOf(id, 'sec-a')).toBeUndefined()
})

// ============================================================ one place says when a sweep is due

describe('a press and the timer do not both sweep inside five minutes', () => {
  it('after a press, the timer finds no sweep due, and only the press wrote a line', async () => {
    const first = anOfficeNotice('w-old', 'Your session finished.')
    const pressed = await app.inject({ method: 'POST', url: '/api/dead-letters/sweep', headers: AS_THE_PERSON })
    expect(pressed.statusCode, pressed.body).toBe(200)
    expect(markOf(first, 'w-old')).toBe('archived')
    const lines = theSweepLines()
    // A NEW LETTER ARRIVES, which a second sweep would archive and write a line about.
    const second = anOfficeNotice('w-old', 'Another session finished.')
    const timer = deadletters.sweepIfDue({ type: 'system', id: 'mole-office' }, new Date())
    expect(timer.swept).toBe(false)
    expect(markOf(second, 'w-old')).toBe('queued')
    expect(theSweepLines()).toBe(lines)
  })
})
