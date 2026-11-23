// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE MACHINE LIST READS AN INDEX RANGE, AND GIVES THE SAME ROWS. The machines a participant was seen from
 * (`machinesSeenFrom` in src/server/lib/participants.ts, part of the profile read) used to read every row of
 * `api_calls`, because no index of the table led with the actor. The table grows with every request, so the
 * profile read grew with it.
 *
 * THE OFFICE. A fresh one, with every migration, and every row in it made up and written straight to the tables:
 * a person, five agents and their calls. The office has no `sqlite_stat1`, as a real one has none, so SQLite
 * chooses its plan here as it chooses there. Every time is a local wall-clock moment, so each `lastSeen` below is
 * written out by hand and holds in any timezone.
 *
 * THE CASES:
 *   1. The same rows as before, worked out by hand: a person; an agent with calls under its handle and under its
 *      registry id, on the same and on other addresses; calls of another agent, and calls with the same ids but the
 *      other actor type, which do not count; rows with no address, which are left out; thirteen addresses, of which
 *      the list keeps the twelve newest, newest first; and an agent with no calls, whose list is empty.
 *   2. An agent whose registry id and handle are the same has each call counted once.
 *   3. The statement the list runs, asked `EXPLAIN QUERY PLAN` with the values it was given, never scans
 *      `api_calls`: each step over the table searches `api_calls_actor_address_idx` by the actor type and the id.
 *   4. No temporary tree sits beside those searches, so the calls are grouped in the index's own order and are not
 *      sorted one by one. The trees left are over the few rows the searches give.
 *   5. The statement the list runs is the one the module exports, so the plan read here is the code's own text.
 *
 * WHAT MUST TURN THESE RED. Each of these breaks at least one case:
 *   - the index dropped from the migration, or the statement no longer naming it by its terms, so the plan scans
 *     (3, 4);
 *   - `client_addr IS NOT NULL` left out of a branch: the partial index no longer serves it, so the plan scans (3),
 *     and the calls with no address come back as a row (1);
 *   - `actor_type` left out of a branch: the calls with the same ids and the other type count (1), and the index
 *     can no longer be searched by the id (3);
 *   - the branch for the registry id, or the one for the handle, left out (1);
 *   - the limit changed, or not bound from the caller's number (1);
 *   - the order turned round (1);
 *   - `max` made `min`, in a branch or in the outer read (1);
 *   - the outer `sum` made `count` (1, 2);
 *   - the term that leaves out the handle's branch when the handle is the registry id dropped, so each call of
 *     such an agent is counted twice (2);
 *   - the index's columns put in another order, so the calls must be sorted before they are grouped (3, 4);
 *   - the list reading a copy of the statement instead of the exported one (5).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { MachineSeenFrom } from '../src/shared/profile.ts'
import type { ParticipantRef } from '../src/shared/participants.ts'
import { freshDb, type TestDb } from './helpers.ts'

let t: TestDb
let participants: typeof import('../src/server/lib/participants.ts')

/** The index the list searches. */
const INDEX = 'api_calls_actor_address_idx'

/** One statement that ran, with the values it was given. */
interface ACaughtStatement {
  text: string
  args: unknown[]
}

/** Every statement that runs during `work`, caught on the prototype of better-sqlite3's statements. */
function theStatementsDuring<T>(work: () => T): { answer: T; caught: ACaughtStatement[] } {
  const prototype = Object.getPrototypeOf(t.client.sqlite.prepare('SELECT 1')) as Record<string, unknown>
  const originals = new Map<string, (...args: unknown[]) => unknown>()
  const caught: ACaughtStatement[] = []
  for (const how of ['all', 'get', 'iterate', 'run'] as const) {
    const original = prototype[how] as (...args: unknown[]) => unknown
    originals.set(how, original)
    prototype[how] = function (this: { source: string }, ...args: unknown[]) {
      caught.push({ text: this.source, args })
      return original.apply(this, args)
    }
  }
  try {
    return { answer: work(), caught }
  } finally {
    for (const [how, original] of originals) prototype[how] = original
  }
}

/** One step of a plan, with the step it sits under. */
interface APlanStep {
  id: number
  parent: number
  detail: string
}

function thePlanOf(statement: ACaughtStatement): APlanStep[] {
  return t.client.sqlite.prepare(`EXPLAIN QUERY PLAN ${statement.text}`).all(...(statement.args as never[])) as APlanStep[]
}

/** The one statement over `api_calls` that the list of `who` runs. */
function theStatementOverTheCalls(who: ParticipantRef): ACaughtStatement {
  const over = theStatementsDuring(() => participants.machinesSeenFrom(who)).caught.filter((one) => /\bapi_calls\b/u.test(one.text))
  expect(over.length, 'the statements over api_calls').toBe(1)
  return over[0]!
}

const PERSON = { id: 'made-up-person-default', handle: 'made-up-person-shelf' }
const DEFAULT = { id: 'made-up-agent-id-default', handle: 'made-up-agent-default' }
const SECOND = { id: 'made-up-agent-id-second', handle: 'made-up-agent-second' }
const SHELF = { id: 'made-up-agent-id-shelf', handle: 'made-up-agent-shelf' }
/** The agent whose registry id and handle are the same. */
const BOX = { id: 'made-up-agent-box', handle: 'made-up-agent-box' }
const QUIET = { id: 'made-up-agent-id-quiet', handle: 'made-up-agent-quiet' }

/** A local wall-clock moment, `YYYY-MM-DD HH:MM:SS`, as epoch milliseconds. */
function at(stamp: string): number {
  const [day, time] = stamp.split(' ') as [string, string]
  const [year, month, date] = day.split('-').map(Number) as [number, number, number]
  const [hours, minutes, seconds] = time.split(':').map(Number) as [number, number, number]
  return new Date(year, month - 1, date, hours, minutes, seconds).getTime()
}

/** One call: who said they made it, as which type, from which address, and when. */
type ACall = [actorType: string, actorId: string, address: string | null, stamp: string]

const CALLS: ACall[] = [
  // The person, under its registry id.
  ['human', PERSON.id, '192.0.2.1', '2026-10-02 09:00:00'],
  ['human', PERSON.id, '192.0.2.1', '2026-10-04 10:00:00'],
  ['human', PERSON.id, '127.0.0.1', '2026-10-03 11:00:00'],
  // Left out: no address, and the same id as the other type.
  ['human', PERSON.id, null, '2026-10-05 12:00:00'],
  ['agent', PERSON.id, '198.51.100.7', '2026-10-06 08:00:00'],

  // The default agent, under its handle and under its registry id.
  ['agent', DEFAULT.handle, '192.0.2.10', '2026-10-07 09:00:00'],
  ['agent', DEFAULT.id, '192.0.2.10', '2026-10-08 09:00:00'],
  ['agent', DEFAULT.handle, '192.0.2.10', '2026-10-06 09:00:00'],
  ['agent', DEFAULT.id, '198.51.100.20', '2026-10-09 09:00:00'],
  ['agent', DEFAULT.id, '198.51.100.20', '2026-10-05 09:00:00'],
  ['agent', DEFAULT.handle, '203.0.113.30', '2026-10-04 09:00:00'],
  ['agent', DEFAULT.handle, '203.0.113.30', '2026-10-03 09:00:00'],
  // Left out: no address under either name, each newer than every call the list keeps.
  ['agent', DEFAULT.handle, null, '2026-10-10 09:00:00'],
  ['agent', DEFAULT.id, null, '2026-10-10 10:00:00'],
  // Left out: the same names as the other type, on an address the agent uses and on one it does not.
  ['human', DEFAULT.handle, '192.0.2.10', '2026-10-11 09:00:00'],
  ['human', DEFAULT.id, '203.0.113.99', '2026-10-12 09:00:00'],
  // Left out: another agent's calls, on the default agent's addresses.
  ['agent', SECOND.id, '192.0.2.10', '2026-10-13 09:00:00'],
  ['agent', SECOND.handle, '198.51.100.20', '2026-10-02 09:00:00'],

  // The shelf agent on thirteen addresses, two calls each: one under its registry id in the morning and one under
  // its handle in the evening of the same day. The days are not in the order of the addresses.
  ...(
    [
      ['192.0.2.101', '05'],
      ['192.0.2.102', '10'],
      ['192.0.2.103', '02'],
      ['192.0.2.104', '07'],
      ['192.0.2.105', '12'],
      ['192.0.2.106', '04'],
      ['192.0.2.107', '09'],
      ['192.0.2.108', '01'],
      ['192.0.2.109', '06'],
      ['192.0.2.110', '11'],
      ['192.0.2.111', '03'],
      ['192.0.2.112', '08'],
      ['192.0.2.113', '13'],
    ] as const
  ).flatMap(([address, day]): ACall[] => [
    ['agent', SHELF.id, address, `2026-10-${day} 08:00:00`],
    ['agent', SHELF.handle, address, `2026-10-${day} 20:00:00`],
  ]),

  // The box agent, whose registry id and handle are one string.
  ['agent', BOX.id, '127.0.0.1', '2026-10-01 09:00:00'],
  ['agent', BOX.id, '127.0.0.1', '2026-10-02 09:00:00'],
  ['agent', BOX.id, '127.0.0.1', '2026-10-03 09:00:00'],
  ['agent', BOX.id, '192.0.2.50', '2026-10-04 09:00:00'],
]

beforeAll(async () => {
  t = await freshDb()
  participants = await import('../src/server/lib/participants.ts')
  const sqlite = t.client.sqlite
  const picture = (sqlite.prepare('SELECT id FROM assets LIMIT 1').get() as { id: string }).id
  sqlite
    .prepare("INSERT INTO people (id, name, handle, avatar_asset_id, state, state_at, created_at) VALUES (?, 'Made-up person', ?, ?, NULL, NULL, '2026-09-30 09:00:00')")
    .run(PERSON.id, PERSON.handle, picture)
  const addAgent = sqlite.prepare("INSERT INTO agents (id, name, handle, avatar_asset_id, retired, created_at) VALUES (?, 'Made-up agent', ?, ?, 0, '2026-09-30 09:00:00')")
  for (const agent of [DEFAULT, SECOND, SHELF, BOX, QUIET]) addAgent.run(agent.id, agent.handle, picture)
  const addCall = sqlite.prepare(
    "INSERT INTO api_calls (id, at_ms, method, status, ms, identity_source, actor_type, actor_id, client_addr) VALUES (?, ?, 'GET', 200, 1, 'header', ?, ?, ?)",
  )
  sqlite.transaction(() => {
    CALLS.forEach(([actorType, actorId, address, stamp], n) => addCall.run(`made-up-call-${String(n).padStart(3, '0')}`, at(stamp), actorType, actorId, address))
  })()
}, 120_000)

afterAll(() => {
  t?.close()
})

const listOf = (who: ParticipantRef): MachineSeenFrom[] => participants.machinesSeenFrom(who)

describe('the machine list gives the same rows as before', () => {
  it("1. a person's, an agent's under both its names, the twelve newest of thirteen, and none", () => {
    expect(listOf({ kind: 'person', id: PERSON.id })).toEqual([
      { address: '192.0.2.1', lastSeen: '2026-10-04 10:00:00', calls: 2 },
      { address: '127.0.0.1', lastSeen: '2026-10-03 11:00:00', calls: 1 },
    ])
    expect(listOf({ kind: 'agent', id: DEFAULT.id })).toEqual([
      { address: '198.51.100.20', lastSeen: '2026-10-09 09:00:00', calls: 2 },
      { address: '192.0.2.10', lastSeen: '2026-10-08 09:00:00', calls: 3 },
      { address: '203.0.113.30', lastSeen: '2026-10-04 09:00:00', calls: 2 },
    ])
    expect(listOf({ kind: 'agent', id: SHELF.id })).toEqual([
      { address: '192.0.2.113', lastSeen: '2026-10-13 20:00:00', calls: 2 },
      { address: '192.0.2.105', lastSeen: '2026-10-12 20:00:00', calls: 2 },
      { address: '192.0.2.110', lastSeen: '2026-10-11 20:00:00', calls: 2 },
      { address: '192.0.2.102', lastSeen: '2026-10-10 20:00:00', calls: 2 },
      { address: '192.0.2.107', lastSeen: '2026-10-09 20:00:00', calls: 2 },
      { address: '192.0.2.112', lastSeen: '2026-10-08 20:00:00', calls: 2 },
      { address: '192.0.2.104', lastSeen: '2026-10-07 20:00:00', calls: 2 },
      { address: '192.0.2.109', lastSeen: '2026-10-06 20:00:00', calls: 2 },
      { address: '192.0.2.101', lastSeen: '2026-10-05 20:00:00', calls: 2 },
      { address: '192.0.2.106', lastSeen: '2026-10-04 20:00:00', calls: 2 },
      { address: '192.0.2.111', lastSeen: '2026-10-03 20:00:00', calls: 2 },
      { address: '192.0.2.103', lastSeen: '2026-10-02 20:00:00', calls: 2 },
    ])
    expect(listOf({ kind: 'agent', id: QUIET.id })).toEqual([])
  })

  it('2. an agent whose registry id and handle are the same has each call counted once', () => {
    expect(listOf({ kind: 'agent', id: BOX.id })).toEqual([
      { address: '192.0.2.50', lastSeen: '2026-10-04 09:00:00', calls: 1 },
      { address: '127.0.0.1', lastSeen: '2026-10-03 09:00:00', calls: 3 },
    ])
  })
})

describe('the machine list reads an index range', () => {
  const asked: ParticipantRef[] = [
    { kind: 'person', id: PERSON.id },
    { kind: 'agent', id: DEFAULT.id },
    { kind: 'agent', id: BOX.id },
  ]

  it(`3. never scans api_calls: each step over it searches ${INDEX} by the actor type and the id`, () => {
    for (const who of asked) {
      const plan = thePlanOf(theStatementOverTheCalls(who)).map((step) => step.detail)
      expect(plan.filter((step) => /\bSCAN api_calls\b/u.test(step)), `${who.kind} ${who.id}: ${JSON.stringify(plan)}`).toEqual([])
      expect(plan.some((step) => step.includes(INDEX)), `${who.kind} ${who.id}: ${JSON.stringify(plan)}`).toBe(true)
      const overTheCalls = plan.filter((step) => /\bapi_calls\b/u.test(step))
      expect(overTheCalls.length, JSON.stringify(plan)).toBeGreaterThan(0)
      for (const step of overTheCalls) {
        expect(step, JSON.stringify(plan)).toMatch(new RegExp(`^SEARCH api_calls USING COVERING INDEX ${INDEX} \\(actor_type=\\? AND actor_id=\\?`, 'u'))
      }
    }
  })

  it('4. groups the calls in the index order, with no temporary tree beside a search of them', () => {
    for (const who of asked) {
      const plan = thePlanOf(theStatementOverTheCalls(who))
      const besideTheCalls = new Set(plan.filter((step) => /\bapi_calls\b/u.test(step.detail)).map((step) => step.parent))
      expect(besideTheCalls.size, JSON.stringify(plan)).toBeGreaterThan(0)
      const trees = plan.filter((step) => /^USE TEMP B-TREE\b/u.test(step.detail) && besideTheCalls.has(step.parent))
      expect(trees, JSON.stringify(plan)).toEqual([])
    }
  })

  it('5. runs the statement the module exports', () => {
    const exported = (participants as unknown as Record<string, unknown>)['MACHINES_SEEN_FROM']
    expect(typeof exported, 'MACHINES_SEEN_FROM in src/server/lib/participants.ts').toBe('string')
    expect(theStatementOverTheCalls({ kind: 'agent', id: DEFAULT.id }).text).toBe(exported)
  })
})
