// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE OFFICE'S LOAD GROUPS ONE OPERATION'S CALLS BY WHO MADE THEM, AND RECORDS NOTHING NEW.
 *
 * Round 78 of wave 13y. The timing records keep each call's route, caller, purpose, client and target, but until this
 * round no door split one operation by them, so nobody could say which caller of record.read costs the time. Now
 * `GET /api/office/load/calls?operation=<name>[&days=<n>]` reads one operation's calls in the project over the days
 * asked, the kept window for traced calls when none are asked, and groups them by route, caller, purpose, client
 * address and origin, and whether the call's target is the caller's own run. For each group it gives the calls, the
 * refusals (status 400 to 499), the calls that waited on purpose, the median, the 95th percentile and the total of the
 * other calls' milliseconds, and the bytes sent back. The counted hours, which stand where long-poll rows were, carry
 * no caller, so they are given once beside the groups and in none of them.
 *
 * This file writes made-up call rows straight into a fresh test database: 140 calls of record.read in the project with
 * every mix of route, caller, purpose, client and target, some refused, some waiting on purpose, some with no bytes;
 * and calls the door must leave out: in another project, older than the window, and of another operation.
 *
 *   1  each group is what an independent count of the same rows gives, with the medians by the office's own median;
 *   2  the groups add up to what GET /api/usage/operations says for record.read over the same days;
 *   3  days narrows the window, and the default is the kept window for traced calls;
 *   4  the door writes no record, no change and no counted hour, and no call row but its own;
 *   5  a missing operation, an operation the office does not have, and days outside the window are refused.
 *
 * MUTATIONS: leave status 404 out of the refusals, count a waiting call in the median, take the 95th percentile by
 * another rank, add the waiting calls' time to the total, drop the project from the read, or give the target as the
 * caller's own run when it is any run, and case 1 is red, and with the project dropped case 2 as well. Put the counted
 * hours into a group, and cases 1 and 2 are red. Ignore days, and case 3 is red. Let an unknown operation through, and
 * case 5 is red. Before the door, every case is red, because no route answers.
 */
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { apiApp, freshDb, type TestDb } from './helpers.ts'

const PROJECT = 'default'
const OPERATION = 'record.read'
const DAY = 86_400_000
const HEADERS = { 'x-mole-office-workspace': PROJECT }

interface ACall {
  id: string
  atMs: number
  operation: string
  route: string | null
  status: number
  waits: number
  ms: number
  bytes: number | null
  workspaceId: string
  actorType: string | null
  actorId: string | null
  sessionId: string | null
  purpose: string | null
  targetId: string | null
  clientAddr: string | null
  clientOrigin: string | null
}

interface AGroup {
  route: string | null
  caller: { type: string | null; id: string | null }
  purpose: string | null
  client: { addr: string | null; origin: string | null }
  targetIsTheirOwnRun: boolean | null
  calls: number
  refused: number
  waited: number
  msMedian: number | null
  msP95: number | null
  msTotal: number
  bytes: number
}

interface TheReply {
  operation: string
  days: number
  workspaceId: string
  calls: number
  foldedCalls: number
  groups: AGroup[]
}

const ROUTES = ['/api/records/:id', '/api/records/:id/lineage']
const CALLERS: [string | null, string | null][] = [['agent', 'invented-worker'], ['agent', 'invented-hook'], ['human', 'invented-person'], [null, null]]
const PURPOSES = ['invented-stop-hook', 'invented-words', null]
const CLIENTS: [string | null, string | null][] = [['127.0.0.1', null], ['127.0.0.1', 'http://localhost:5173'], [null, null]]
const STATUSES = [200, 200, 404, 200, 403, 200, 500]
const FOLDED = 37

let t: TestDb
let app: FastifyInstance
let now = 0
let traced = 0
let medianOf: (values: readonly number[]) => number | null = () => null
const calls: ACall[] = []

/** The made-up calls, the same in every run but for the moment they are counted back from. */
function theCalls(): ACall[] {
  const out: ACall[] = []
  const base = (n: number, over: Partial<ACall>): ACall => {
    const [actorType, actorId] = CALLERS[n % CALLERS.length]!
    const [clientAddr, clientOrigin] = CLIENTS[Math.floor(n / 4) % CLIENTS.length]!
    const session = actorType === 'agent' ? `invented-run-${String(n % 3)}` : null
    const target = n % 5 === 0 ? null : n % 5 === 1 || n % 5 === 3 ? session : 'invented-run-other'
    return {
      id: `invented-call-${String(n)}`,
      atMs: now - (n + 1) * 60_000,
      operation: OPERATION,
      route: n % 13 === 0 ? null : ROUTES[Math.floor(n / 7) % ROUTES.length]!,
      status: STATUSES[n % STATUSES.length]!,
      waits: n % 11 === 0 ? 1 : 0,
      ms: (n * 37) % 200 + (n % 2) * 0.5,
      bytes: n % 9 === 0 ? null : (n * 131) % 5000,
      workspaceId: PROJECT,
      actorType,
      actorId,
      sessionId: session,
      purpose: PURPOSES[Math.floor(n / 2) % PURPOSES.length]!,
      targetId: target,
      clientAddr,
      clientOrigin,
      ...over,
    }
  }
  for (let n = 0; n < 140; n++) out.push(base(n, {}))
  // NONE OF THESE IS THE DOOR'S: another project, two days older than the window, another operation, and one a day and
  // a half old, which only a read of one day leaves out.
  for (let n = 0; n < 6; n++) out.push(base(n, { id: `invented-elsewhere-${String(n)}`, workspaceId: 'invented-elsewhere' }))
  for (let n = 0; n < 6; n++) out.push(base(n, { id: `invented-old-${String(n)}`, atMs: now - (traced + 2) * DAY }))
  for (let n = 0; n < 6; n++) out.push(base(n, { id: `invented-list-${String(n)}`, operation: 'record.list' }))
  out.push(base(3, { id: 'invented-day-and-a-half', atMs: now - 1.5 * DAY }))
  return out
}

/** The same rows, grouped by hand: what the door must give, in no particular order. */
function reference(fromMs: number): AGroup[] {
  const kept = calls.filter((c) => c.workspaceId === PROJECT && c.operation === OPERATION && c.atMs >= fromMs)
  const groups = new Map<string, ACall[]>()
  for (const c of kept) {
    const own = c.targetId === null ? null : c.sessionId !== null && c.targetId === c.sessionId
    const key = JSON.stringify([c.route, c.actorType, c.actorId, c.purpose, c.clientAddr, c.clientOrigin, own])
    groups.set(key, [...(groups.get(key) ?? []), c])
  }
  return [...groups.values()].map((rows) => {
    const first = rows[0]!
    const timed = rows.filter((c) => c.waits !== 1).map((c) => c.ms).sort((a, b) => a - b)
    return {
      route: first.route,
      caller: { type: first.actorType, id: first.actorId },
      purpose: first.purpose,
      client: { addr: first.clientAddr, origin: first.clientOrigin },
      targetIsTheirOwnRun: first.targetId === null ? null : first.sessionId !== null && first.targetId === first.sessionId,
      calls: rows.length,
      refused: rows.filter((c) => c.status >= 400 && c.status < 500).length,
      waited: rows.filter((c) => c.waits === 1).length,
      msMedian: medianOf(timed),
      msP95: timed.length === 0 ? null : timed[Math.ceil(0.95 * timed.length) - 1]!,
      msTotal: timed.reduce((sum, ms) => sum + ms, 0),
      bytes: rows.reduce((sum, c) => sum + (c.bytes ?? 0), 0),
    }
  })
}

/** A group's key, to compare two lists of groups in one order. */
const keyOf = (g: AGroup): string => JSON.stringify([g.route, g.caller, g.purpose, g.client, g.targetIsTheirOwnRun])
const inKeyOrder = (groups: readonly AGroup[]): AGroup[] => [...groups].sort((a, b) => keyOf(a).localeCompare(keyOf(b)))

async function ask(query: string): Promise<{ status: number; body: unknown }> {
  const reply = await app.inject({ method: 'GET', url: `/api/office/load/calls${query}`, headers: HEADERS })
  return { status: reply.statusCode, body: reply.json() as unknown }
}

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  ;({ medianOf } = await import('../src/shared/median.ts'))
  const { theRequestWindows } = await import('../src/server/lib/what-is-kept.ts')
  traced = theRequestWindows().traced.value
  now = Date.now()
  calls.push(...theCalls())
  const insert = t.client.sqlite.prepare(
    `insert into api_calls (id, at_ms, operation, effect, route, method, waits, status, ms, bytes, workspace_id, actor_type,
       actor_id, session_id, identity_source, purpose, target_id, target_kind, client_addr, client_origin)
     values (?, ?, ?, 'read', ?, 'GET', ?, ?, ?, ?, ?, ?, ?, ?, 'header', ?, ?, ?, ?, ?)`,
  )
  const { localStamp } = await import('../src/shared/time.ts')
  t.client.sqlite.transaction(() => {
    for (const c of calls) {
      insert.run(c.id, c.atMs, c.operation, c.route, c.waits, c.status, c.ms, c.bytes, c.workspaceId, c.actorType, c.actorId,
        c.sessionId, c.purpose, c.targetId, c.targetId === null ? null : 'record', c.clientAddr, c.clientOrigin)
    }
    // THE COUNTED HOUR, which carries no caller and so belongs in no group.
    t.client.sqlite
      .prepare(`insert into hourly_calls (id, hour, operation, workspace_id, listener, calls) values ('invented-hour', ?, ?, ?, 'remote', ?)`)
      .run(localStamp(new Date(now)).slice(0, 13), OPERATION, PROJECT, FOLDED)
  })()
}, 60_000)

afterAll(async () => {
  await app?.close()
  t?.close()
})

it('1 each group is what an independent count of the same rows gives', async () => {
  const { status, body } = await ask(`?operation=${OPERATION}`)
  expect(status, JSON.stringify(body).slice(0, 400)).toBe(200)
  const reply = body as TheReply
  const expected = reference(now - traced * DAY)
  expect(expected.length).toBeGreaterThan(20)
  expect(expected.some((g) => g.targetIsTheirOwnRun === true) && expected.some((g) => g.targetIsTheirOwnRun === false)).toBe(true)
  expect(expected.some((g) => g.msMedian === null)).toBe(true)
  expect(inKeyOrder(reply.groups)).toEqual(inKeyOrder(expected))
  expect(reply.foldedCalls).toBe(FOLDED)
  expect(reply.calls).toBe(expected.reduce((sum, g) => sum + g.calls, 0))
  // THE DEAREST FIRST: by total time, then by calls.
  for (let i = 1; i < reply.groups.length; i++) {
    const [a, b] = [reply.groups[i - 1]!, reply.groups[i]!]
    expect(a.msTotal > b.msTotal || (a.msTotal === b.msTotal && a.calls >= b.calls), `${keyOf(a)} before ${keyOf(b)}`).toBe(true)
  }
})

it('2 the groups add up to what the usage door says for the operation over the same days', async () => {
  const mine = (await ask(`?operation=${OPERATION}&days=3`)).body as TheReply
  const usage = await app.inject({ method: 'GET', url: '/api/usage/operations?days=3', headers: HEADERS })
  expect(usage.statusCode).toBe(200)
  const reading = (usage.json() as { operations: { operation: string; calls: number; foldedCalls: number; refused: number; bytes: number }[] }).operations
    .find((one) => one.operation === OPERATION)!
  expect(reading).toBeDefined()
  const sum = (pick: (g: AGroup) => number): number => mine.groups.reduce((total, g) => total + pick(g), 0)
  expect({ calls: mine.calls + mine.foldedCalls, foldedCalls: mine.foldedCalls, refused: sum((g) => g.refused), bytes: sum((g) => g.bytes) })
    .toEqual({ calls: reading.calls, foldedCalls: reading.foldedCalls, refused: reading.refused, bytes: reading.bytes })
  expect(sum((g) => g.calls)).toBe(mine.calls)
})

it('3 days narrows the window, and the default is the kept window for traced calls', async () => {
  const whole = (await ask(`?operation=${OPERATION}`)).body as TheReply
  expect({ operation: whole.operation, days: whole.days, workspaceId: whole.workspaceId }).toEqual({ operation: OPERATION, days: traced, workspaceId: PROJECT })
  const oneDay = (await ask(`?operation=${OPERATION}&days=1`)).body as TheReply
  expect(oneDay.days).toBe(1)
  expect(inKeyOrder(oneDay.groups)).toEqual(inKeyOrder(reference(now - DAY)))
  expect(whole.calls - oneDay.calls).toBe(1)
})

it('4 the door writes no record, no change and no counted hour, and no call row but its own', async () => {
  const sqlite = t.client.sqlite
  const count = (sql: string): number => (sqlite.prepare(sql).get() as { n: number }).n
  const counts = (): Record<string, number> => ({
    records: count('select count(*) as n from records'),
    changes: count('select count(*) as n from changes'),
    hours: count('select count(*) as n from hourly_calls'),
    otherCalls: count(`select count(*) as n from api_calls where operation is null or operation != 'office.load.calls'`),
  })
  const before = counts()
  expect((await ask(`?operation=${OPERATION}`)).status).toBe(200)
  expect((await ask(`?operation=${OPERATION}&days=2`)).status).toBe(200)
  await new Promise((done) => setTimeout(done, 50))
  expect(counts()).toEqual(before)
})

it('5 a missing operation, one the office does not have, and days outside the window are refused', async () => {
  for (const query of ['', '?days=1', '?operation=no.such.operation', `?operation=${OPERATION}&days=0`, `?operation=${OPERATION}&days=${String(traced + 1)}`,
    `?operation=${OPERATION}&days=one`, `?operation=${OPERATION}&what=else`]) {
    const { status, body } = await ask(query)
    expect({ query, status }).toEqual({ query, status: 400 })
    expect(JSON.stringify(body)).toContain('The query string')
  }
})
