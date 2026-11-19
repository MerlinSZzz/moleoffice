// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * The queue reuses the handle-hold statement and reads each answer afresh (wave 13y round 42).
 *
 * Before writing this criterion, the exact bound query searched handle_holds_one_live_per_agent_idx
 * on both the made-up database and a small fresh migrated database, with four different agent ids.
 * The criterion counts preparations rather than asking for another plan. The answer cases pass on
 * the old code too; the preparation case is red there. All rows here are synthetic test fixtures.
 * Mutations: prepare on every call again; bind another agent's id; keep the first returned row.
 */
import { afterAll, beforeAll, expect, it, vi } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { THE_PERSON } from '../src/shared/person.ts'
import { localStamp } from '../src/shared/time.ts'
import { apiApp, freshDb, type TestDb } from './helpers.ts'

const HOLD_READ = 'select "id", "agent_id", "session_record_id", "machine", "runtime", "claimed_at", "last_heard_at", "released_at", "released_because" from "handle_holds" where ("handle_holds"."agent_id" = ? and "handle_holds"."released_at" is null)'
const HEADERS = { 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON }
let t: TestDb
let app: FastifyInstance
let worker: typeof import('../src/server/lib/worker.ts')
let handles: typeof import('../src/server/lib/handles.ts')
let at: number
let counting = false
const prepared: string[] = []
const ran: unknown[][] = []
const mapped: unknown[] = []
const agents: string[] = []
const sessions: string[] = []

function stamp(secondsAgo = 0): string { return localStamp(new Date(at - secondsAgo * 1000)) }
function hold(id: string, index: number, secondsAgo: number, released = false): void {
  t.client.sqlite.prepare('insert into handle_holds (id, agent_id, session_record_id, machine, runtime, claimed_at, last_heard_at, released_at, released_because) values (?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .run(id, agents[index], sessions[index], 'fixture-machine', 'claude-code', stamp(1000), stamp(secondsAgo), released ? stamp() : null, released ? 'fixture release' : null)
}

beforeAll(async () => {
  vi.stubEnv('MOLE_OFFICE_HANDLE_BEAT_SECONDS', '20')
  vi.stubEnv('MOLE_OFFICE_HANDLE_LAPSES_AFTER_SECONDS', '90')
  vi.stubEnv('MOLE_OFFICE_HANDLE_GRACE_SECONDS', '120')
  t = await freshDb()
  // Observe drizzle's mapped result, after its column-to-field conversion, without exporting a private reader.
  type MappedRead = { get: (...args: unknown[]) => unknown }
  const session = (t.client.db as unknown as { session: { prepareQuery: (query: { sql: string }, ...rest: unknown[]) => MappedRead } }).session
  const prepareQuery = session.prepareQuery
  session.prepareQuery = function (query, ...rest) {
    const statement = prepareQuery.call(this, query, ...rest)
    if (query.sql === HOLD_READ) {
      const get = statement.get
      statement.get = function (...args) {
        const row = get.apply(this, args)
        mapped.push(row)
        return row
      }
    }
    return statement
  }
  const sqlite = t.client.sqlite as unknown as { prepare: (sql: string) => Record<string, unknown> }
  const prepare = sqlite.prepare
  sqlite.prepare = function (this: unknown, text: string) {
    if (counting && text === HOLD_READ) prepared.push(text)
    const statement = prepare.call(this, text)
    const get = statement.get as (...args: unknown[]) => unknown
    statement.get = function (this: unknown, ...args: unknown[]) {
      if (counting && text === HOLD_READ) ran.push(args)
      return get.apply(this, args)
    }
    return statement
  }
  app = (await apiApp()).app
  await app.ready()
  worker = await import('../src/server/lib/worker.ts')
  handles = await import('../src/server/lib/handles.ts')
  at = Math.floor(Date.now() / 1000) * 1000
  for (let i = 0; i < 5; i++) {
    const handle = `hold-statement-${i}`
    const made = await app.inject({ method: 'POST', url: '/api/agents/started', headers: HEADERS, payload: { handle, name: `Synthetic hold reader ${i}`, runtime: 'claude-code' } })
    expect(made.statusCode, made.body).toBeLessThan(300)
    const listed = (await app.inject({ method: 'GET', url: '/api/participants', headers: HEADERS })).json() as { agents: { id: string; handle: string }[] }
    agents.push(listed.agents.find(one => one.handle === handle)!.id)
    const id = `hold-session-${i}`
    sessions.push(id)
    const data = { state: 'finished', runtime: 'claude-code', servingAgent: agents[i], servingAgentId: agents[i], startedByMoleOffice: true }
    t.client.sqlite.prepare('insert into records (id, workspace_id, owner_id, created_at, updated_at, kind, title, data, origin) values (?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run(id, 'default', THE_PERSON, stamp(), stamp(), 'session', id, JSON.stringify(data), 'fixture')
    const messageId = `hold-message-${i}`
    const message = { body: 'Synthetic hold statement fixture', sentBy: { kind: 'person', id: THE_PERSON }, to: [{ kind: 'agent', id: agents[i] }], writtenIn: { project: 'default' } }
    t.client.sqlite.prepare('insert into records (id, workspace_id, owner_id, created_at, updated_at, kind, title, data, origin) values (?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run(messageId, 'message-centre', THE_PERSON, stamp(), stamp(), 'message', messageId, JSON.stringify(message), 'fixture')
    t.client.sqlite.prepare('insert into message_delivery (id, message_id, recipient_kind, recipient_id, mark, at) values (?, ?, ?, ?, ?, ?)')
      .run(`hold-delivery-${i}`, messageId, 'agent', agents[i], 'queued', stamp())
  }
  hold('fresh-hold', 0, 0)
  hold('kept-hold', 1, 105)
  hold('released-hold', 2, 0, true)
  hold('lapsed-hold', 3, 1000)
}, 120_000)

afterAll(async () => { await app?.close(); t?.close(); vi.unstubAllEnvs() })

it('keeps the whole mapped row, its field order and nulls, and undefined for released or absent holds', () => {
  mapped.length = 0
  for (const i of [0, 2, 4]) handles.theLiveHoldOn(agents[i]!, true, at)
  const expected = { id: 'fresh-hold', agentId: agents[0], sessionRecordId: sessions[0], machine: 'fixture-machine', runtime: 'claude-code', claimedAt: stamp(1000), lastHeardAt: stamp(), releasedAt: null, releasedBecause: null }
  expect(mapped).toEqual([expected, undefined, undefined])
  expect(Object.keys(mapped[0] as object)).toEqual(Object.keys(expected))
})

it('keeps fresh, kept, released, lapsed and absent holds distinct, with read-only lapse and release', () => {
  expect(handles.theLiveHoldOn(agents[0]!, true, at)).toMatchObject({ id: 'fresh-hold', agent: { id: agents[0] }, session: sessions[0], state: 'fresh', quietFor: 0 })
  expect(handles.theLiveHoldOn(agents[1]!, true, at)).toMatchObject({ id: 'kept-hold', state: 'kept', quietFor: 105 })
  for (const i of [2, 3, 4]) expect(handles.theLiveHoldOn(agents[i]!, true, at)).toBeNull()
  expect(t.client.sqlite.prepare('select released_at from handle_holds where id = ?').get('lapsed-hold')).toEqual({ released_at: null })
  expect(handles.theLiveHoldOn(agents[3]!, false, at)).toBeNull()
  expect(t.client.sqlite.prepare('select released_at, released_because from handle_holds where id = ?').get('lapsed-hold')).toMatchObject({ released_at: expect.any(String), released_because: expect.stringContaining('longer than the 120 seconds') })
})

function queueAnswer(): unknown[] {
  return worker.theQueue('default').filter(row => row.messageId.startsWith('hold-message-')).map(row => ({
    message: row.messageId, run: row.runningAlready, says: row.runningAlreadySays, held: row.heldByALiveSession,
  }))
}

it('keeps the queue answer and reads a new hold, a new beat, and a release on the next ask', () => {
  const first = queueAnswer() as { message: string; run: string | null; says: string | null; held: string | null }[]
  expect(first).toHaveLength(5)
  for (const row of first) {
    const i = Number(row.message.slice(-1))
    expect(row.run).toBe(i < 2 ? sessions[i] : null)
    expect(row.says).toEqual(i < 2 ? expect.stringContaining('A run Mole Office started is answering') : null)
    expect(row.held).toBeNull()
  }
  t.client.sqlite.prepare('update handle_holds set released_at = ?, released_because = ? where id = ?').run(stamp(), 'fixture changed', 'fresh-hold')
  expect((queueAnswer() as typeof first).find(row => row.message === 'hold-message-0')?.run).toBeNull()
  hold('replacement-hold', 0, 1000)
  expect(handles.theLiveHoldOn(agents[0]!, true, at)).toBeNull()
  t.client.sqlite.prepare('update handle_holds set last_heard_at = ? where id = ?').run(stamp(), 'replacement-hold')
  expect(handles.theLiveHoldOn(agents[0]!, true, at)).toMatchObject({ id: 'replacement-hold', state: 'fresh' })
  expect(queueAnswer()).toEqual(first)
})


it('keeps the claim and let-go callers fresh, including a repeat claim, a refusal, and a lapsed takeover', () => {
  const claim = (i: number, session = sessions[i]!) => handles.holdTheHandle({ handle: `hold-statement-${i}`, session, workspaceId: 'default', machine: 'fixture-machine', runtime: 'claude-code' })
  const first = claim(4)
  expect(first.tookOverFrom).toBeNull()
  expect(claim(4).hold.id).toBe(first.hold.id)
  expect(() => claim(4, sessions[0])).toThrow('held by')
  expect(() => handles.letTheHandleGo('hold-statement-4', sessions[0]!, 'fixture refusal')).toThrow('Only the session')
  expect(handles.letTheHandleGo('hold-statement-4', sessions[4]!, 'fixture let go')).toMatchObject({ id: first.hold.id, state: 'released', releasedBecause: 'fixture let go' })
  expect(() => handles.letTheHandleGo('hold-statement-4', sessions[4]!, 'again')).toThrow('nothing to let go of')
  expect(claim(4).hold.id).not.toBe(first.hold.id)
  hold('takeover-hold', 3, 1000)
  const takeover = claim(3, sessions[4])
  expect(takeover.tookOverFrom).toMatchObject({ id: 'takeover-hold', state: 'released', session: sessions[3] })
  expect(takeover.hold).toMatchObject({ session: sessions[4], state: 'fresh' })
})
