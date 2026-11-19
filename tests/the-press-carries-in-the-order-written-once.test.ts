// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE PRESS TO START A NEW AGENT CARRIES AN AGENT'S WAITING MESSAGES IN THE ORDER THE REST OF THE OFFICE KEEPS, AND READS
 * THAT ORDER FROM THE ONE PLACE EACH PART OF IT IS WRITTEN. Wave 13y round 34, the second finding of round 33's review
 * of the press fix.
 *
 * WHAT WAS FOUND. The press reads two orders. The waiter's order (`everythingWaitingFor` in src/server/lib/handles.ts:
 * urgent messages, then the person's, then the rest, oldest first in each) says which project comes first, and so which
 * project a message seen from two projects is carried from. The queue's order (`theQueue` in src/server/lib/worker.ts:
 * urgent messages, then the rest, oldest first in each) says the order within one project. The press fix of round 33
 * wrote both a second time inside the press, the waiter's in `theProjectsWithMessagesWaitingFor` and the queue's in the
 * press's ORDER BY. The test beside it compared the press with the full reading in three cases, so a change to one copy
 * failed a test only where it changed those three.
 *
 * WHAT THIS HOLDS.
 *   1. In every combination of the facts that decide either order, the press carries the messages the full reading
 *      carries, in its order and from its project. The facts: urgent (true, false, absent, or the word "true"); who sent
 *      it (the person, an agent, a sender that names nobody, no sender, the office); the project it was written in (one
 *      of two, or none); the project it is about (none, or one of the two). Each of the 180 combinations is one message.
 *      When each was written is three seconds shared out at random, and the rows are stored in a random order, three
 *      times over with three seeds. Then the same in 200 small sets of two to eight of those messages, because in the
 *      set of all of them the urgent ones alone decide which project comes first. The full reading is the press as it
 *      was before round 33: the projects of `everythingWaitingFor`, then each project's `theQueue`.
 *   2. With the waiter's order changed, the press still carries in the full reading's order. The change moves the
 *      messages of the project `everythingWaitingFor` names last to the front of its list, through a spy on
 *      src/server/lib/handles.ts, so the other project comes second.
 *   3. With the queue's order changed, the same. The change turns round what `urgentAtTheFront` in
 *      src/shared/messages.ts gives, through a mock of that file.
 * So a press that keeps its own copy of either order, in SQL or in a script, fails 2 or 3 in every case where the copy
 * and the order would differ, and not only in the cases a test thought of. Each change is first shown to change the full
 * reading, so neither passes by changing nothing.
 *
 * WHAT IT DOES NOT HOLD. Whether either order is the right one. Which messages are carried at all, which
 * tests/the-would-carry-door-does-not-inspect-the-queue.test.ts holds. A comment, which a third rule puts into a
 * project's view (`aCommentOnARecordOf`): no message here is one.
 */
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, expect, it, vi } from 'vitest'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'

const OWNER = { 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON }
const A = 'default'
const B = 'other-order-project'

// THE TWO CHANGES, off until a test turns one on.
//
// THE WAITER'S ORDER IS CHANGED WITH A SPY, installed in the hook after the app is built, and not with a
// `vi.doMock`. The mock that was here imported the real handles module through `importOriginal`; that import walks
// handles.ts to records.ts to worker.ts and back to handles.ts, and the worker took the real function before the mock
// was in place, so the press never saw the change while the full reading did. The spy replaces the module's export in
// place, which every importer reaches through its live binding, so the press is asked the same question the full
// reading is. The queue's order is still mocked below: that mock is made before `freshDb` and nothing on its graph holds
// the function before it is in place.
let changeTheWaitersOrder = false
let turnTheQueuesOrderRound = false
vi.doMock('../src/shared/messages.ts', async (importOriginal) => {
  const real = await importOriginal<Record<string, unknown>>()
  const urgentAtTheFront = real['urgentAtTheFront'] as (<T>(rows: readonly T[]) => T[]) | undefined
  return {
    ...real,
    urgentAtTheFront: <T,>(rows: readonly T[]): T[] => {
      if (urgentAtTheFront === undefined) throw new Error('src/shared/messages.ts has no urgentAtTheFront, and something asked it for the order.')
      const ordered = urgentAtTheFront(rows)
      return turnTheQueuesOrderRound ? [...ordered].reverse() : ordered
    },
  }
})

let t: TestDb
let app: FastifyInstance
let agent = ''

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  // THE WAITER'S ORDER, CHANGED IN PLACE. See the comment above the flags: a mock of the module did not reach the
  // press, because the worker had already taken the real function; the spy replaces the export every importer reads.
  const handles = await import('../src/server/lib/handles.ts')
  const realEverythingWaitingFor = handles.everythingWaitingFor
  vi.spyOn(handles, 'everythingWaitingFor').mockImplementation((agentId: string) => {
    const list = realEverythingWaitingFor(agentId)
    if (!changeTheWaitersOrder) return list
    // THE PROJECT THE LIST NAMES LAST COMES FIRST, everything else as it was: wherever the list names two projects,
    // this changes which comes first. Turning the list round does not always do that.
    const last = [...new Set(list.map((one) => one.writtenIn?.project))].filter((one) => one !== undefined).at(-1)
    return [...list.filter((one) => one.writtenIn?.project === last), ...list.filter((one) => one.writtenIn?.project !== last)]
  })
  const made = await app.inject({ method: 'POST', url: '/api/agents/started', headers: OWNER,
    payload: { handle: 'order-checker', name: 'Order Checker', workArea: ['src'] } })
  expect(made.statusCode, made.body).toBe(201)
  agent = made.json().agent.id as string
}, 60_000)

afterAll(async () => {
  await app?.close()
  t?.close()
})

/** A small seeded generator, so a failing seed can be run again and give the same messages. */
function numbersFrom(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let x = Math.imul(state ^ (state >>> 15), 1 | state)
    x ^= x + Math.imul(x ^ (x >>> 7), 61 | x)
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296
  }
}

const URGENT = [true, false, undefined, 'true']
const SENT_BY = [
  { kind: 'person', id: THE_PERSON },
  { kind: 'agent', id: 'an-agent-of-the-office' },
  { kind: 'person', id: '' },
  undefined,
  { kind: 'agent', id: 'mole-office' },
]
const WRITTEN_IN = [{ project: A }, { project: B }, undefined]
const ABOUT = [undefined, A, B]

/** Every combination of the facts that decide either order: the data of one message each. */
const COMBINATIONS: Record<string, unknown>[] = []
for (const urgent of URGENT) for (const sentBy of SENT_BY) for (const writtenIn of WRITTEN_IN) for (const aboutProject of ABOUT) {
  const data: Record<string, unknown> = { body: 'Made-up words for the order test.' }
  if (urgent !== undefined) data['urgent'] = urgent
  if (sentBy !== undefined) data['sentBy'] = sentBy
  if (writtenIn !== undefined) data['writtenIn'] = writtenIn
  if (aboutProject !== undefined) data['aboutProject'] = aboutProject
  COMBINATIONS.push(data)
}

/** These messages, in place of the last ones, written and queued for the agent at times and in a storage order drawn from `random`. */
function theMessages(chosen: readonly Record<string, unknown>[], random: () => number): void {
  const sql = t.client.sqlite
  sql.prepare("DELETE FROM message_delivery WHERE message_id LIKE 'order-case-%'").run()
  sql.prepare("DELETE FROM records WHERE id LIKE 'order-case-%'").run()
  const cases = chosen.map((data, i) => ({ id: `order-case-${String(i)}`, data, at: `2026-10-14 10:00:0${String(Math.floor(random() * 3))}` }))
  // STORED IN A RANDOM ORDER, so the rowid that breaks a tie of the same second is not the order the cases were made in.
  for (let i = cases.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[cases[i], cases[j]] = [cases[j]!, cases[i]!]
  }
  const record = sql.prepare("INSERT INTO records (id, workspace_id, kind, title, data, origin, owner_id, created_at, updated_at) VALUES (?, 'message-centre', 'message', ?, ?, 'fixture', ?, ?, ?)")
  const delivery = sql.prepare("INSERT INTO message_delivery (id, message_id, recipient_kind, recipient_id, mark, at) VALUES (?, ?, 'agent', ?, 'queued', ?)")
  sql.transaction(() => {
    for (const one of cases) {
      record.run(one.id, one.id, JSON.stringify(one.data), THE_PERSON, one.at, one.at)
      delivery.run(`${one.id}-delivery`, one.id, agent, one.at)
    }
  })()
}

/** Every combination, one message each. */
function theMessagesOfOneSeed(seed: number): void {
  theMessages(COMBINATIONS, numbersFrom(seed))
}

type Carried = { messageId: string; workspaceId: string; sentAt: string }
const facts = (rows: readonly Carried[]): Carried[] => rows.map(({ messageId, workspaceId, sentAt }) => ({ messageId, workspaceId, sentAt }))

/** What the press carried before round 33: the projects in the waiter's order, then each project's queue, each message once. */
async function theFullReading(): Promise<Carried[]> {
  const worker = await import('../src/server/lib/worker.ts')
  const { everythingWaitingFor } = await import('../src/server/lib/handles.ts')
  const projects = new Set(everythingWaitingFor(agent).map((one) => one.writtenIn?.project).filter((one): one is string => one !== undefined))
  const met = new Set<string>()
  return facts([...projects].flatMap((project) => worker.theQueue(project).filter((one) => {
    if (one.to.kind !== 'agent' || one.to.id !== agent || one.nobodyIsAnsweringAsIt === null || met.has(one.messageId)) return false
    met.add(one.messageId)
    return true
  })))
}

async function whatThePressCarries(): Promise<Carried[]> {
  const worker = await import('../src/server/lib/worker.ts')
  return facts(worker.whatThePressWouldCarry(agent))
}

const SEEDS = [1, 2, 3]

it('carries what the full reading carries, in its order and from its project, in every combination of the facts that decide the order', async () => {
  for (const seed of SEEDS) {
    theMessagesOfOneSeed(seed)
    const full = await theFullReading()
    // BOTH PROJECTS CARRY SOMETHING, so the order of the projects is part of what is compared.
    expect(new Set(full.map((one) => one.workspaceId)), `seed ${String(seed)}`).toEqual(new Set([A, B]))
    expect(await whatThePressCarries(), `seed ${String(seed)}`).toEqual(full)
  }
}, 120_000)

// A SMALL SET LETS EVERY RULE OF THE ORDER DECIDE SOMETHING. In the set of every combination the urgent messages name
// both projects, so they alone decide which project comes first, and a change to how the ordinary ones are ordered would
// not show. Two to eight messages drawn at random from the combinations, 200 times.
const SMALL_SETS = 200

it('carries what the full reading carries, in its order and from its project, in 200 small sets drawn from those combinations', async () => {
  let fromBothProjects = 0
  for (let n = 0; n < SMALL_SETS; n++) {
    const random = numbersFrom(1000 + n)
    const left = [...COMBINATIONS]
    const chosen = Array.from({ length: 2 + Math.floor(random() * 7) }, () => left.splice(Math.floor(random() * left.length), 1)[0]!)
    theMessages(chosen, random)
    const full = await theFullReading()
    if (new Set(full.map((one) => one.workspaceId)).size === 2) fromBothProjects += 1
    expect(await whatThePressCarries(), `small set ${String(n)}: ${JSON.stringify(chosen)}`).toEqual(full)
  }
  // THE ORDER OF THE PROJECTS IS COMPARED OFTEN, and not only in the large set.
  expect(fromBothProjects, 'small sets whose messages are carried from both projects').toBeGreaterThan(SMALL_SETS / 4)
}, 300_000)

it('still carries in the full reading\'s order when the waiter\'s order is changed', async () => {
  for (const seed of SEEDS) {
    theMessagesOfOneSeed(seed)
    const before = await theFullReading()
    changeTheWaitersOrder = true
    try {
      const full = await theFullReading()
      expect(full, `seed ${String(seed)}: changing the waiter's order changes the full reading`).not.toEqual(before)
      expect(await whatThePressCarries(), `seed ${String(seed)}: the press with the waiter's order changed`).toEqual(full)
    } finally {
      changeTheWaitersOrder = false
    }
  }
}, 120_000)

it('still carries in the full reading\'s order when the queue\'s order is changed', async () => {
  for (const seed of SEEDS) {
    theMessagesOfOneSeed(seed)
    const before = await theFullReading()
    turnTheQueuesOrderRound = true
    try {
      const full = await theFullReading()
      expect(full, `seed ${String(seed)}: turning the queue's order round changes the full reading`).not.toEqual(before)
      expect(await whatThePressCarries(), `seed ${String(seed)}: the press with the queue's order turned round`).toEqual(full)
    } finally {
      turnTheQueuesOrderRound = false
    }
  }
}, 120_000)
