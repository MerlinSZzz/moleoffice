// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * GIVING BACK A HELD SEAT, AND THE WHOLE SUITE'S SEATS, ARE GATE ROWS (wave 13r round N; uuH_OcQ4oI6-).
 *
 * Every session, process and moment here is made up. No real process is read and nothing is
 * signalled: the office is handed a process table this test controls.
 *
 * `giving-back-a-held-seat` is checked in `releaseSlot`, where a caller other than the asking
 * session gives back a seat whose process group still runs, without force. At block it is refused
 * as before. At off it is given back, and the row's note says the gate was off. `whole-suite-seats`
 * is the full-suite pool's size, one by default, and a new ask put in line there is counted.
 */

import { afterEach, beforeEach, expect, it } from 'vitest'
import type { FastifyInstance, LightMyRequestResponse } from 'fastify'
import { gateNamed } from '../src/config/gates.mjs'
import { freshDb, type TestDb } from './helpers.ts'

type ResourcesLib = typeof import('../src/server/lib/resources.ts')
type OsProbe = ResourcesLib['LINUX_PROBE']
type OsProcess = NonNullable<ReturnType<OsProbe['processById']>>

interface Harness {
  t: TestDb
  res: ResourcesLib
  app: FastifyInstance
  live: Map<number, OsProcess>
}

/** A process table the test can change between requests. It never signals anything. */
function fakeProbe(live: Map<number, OsProcess>): OsProbe {
  return {
    platform: 'fake',
    processById: (pid) => live.get(pid) ?? null,
    processesInGroup: (pgid) => [...live.values()].filter((p) => p.pgid === pgid),
    listeningPorts: () => [],
    gpu: () => ({ available: true, processes: [] }),
    containers: () => ({ available: true, containers: [] }),
    locks: () => ({ files: [], unreadable: [] }),
    ownProcessGroup: () => 999_999,
    killProcessGroup: () => {
      throw new Error('a slot never signals anything, and this test signals nothing')
    },
    stopContainer: () => {
      throw new Error('this test stops nothing')
    },
  }
}

let h: Harness

beforeEach(async () => {
  const t = await freshDb()
  const res = await import('../src/server/lib/resources.ts')
  const Fastify = (await import('fastify')).default
  const { installErrorHandling } = await import('../src/server/lib/http.ts')
  const { resourceRoutes } = await import('../src/server/api/resources.ts')
  const { slotRoutes } = await import('../src/server/api/slots.ts')
  const app = Fastify({ logger: false })
  installErrorHandling(app)
  await app.register(resourceRoutes, { prefix: '/api' })
  await app.register(slotRoutes, { prefix: '/api' })
  await app.ready()
  const live = new Map<number, OsProcess>()
  res.useOsProbe(fakeProbe(live))
  h = { t, res, app, live }
})

afterEach(async () => {
  h.res.useOsProbe(h.res.LINUX_PROBE)
  await h.app.close()
  h.t.close()
})

/** A made-up running session record, and its id. */
function session(title = 'A made-up run that wants a seat'): string {
  return h.t.api.createRecord({
    workspaceId: 'default',
    kind: 'session',
    title,
    data: { state: 'running', runtime: 'claude-code' },
    actor: h.t.api.HUMAN,
  }).id
}

/** A made-up process on the fake machine. A group leader is the process whose pid is its group's id. */
function start(pid: number, pgid: number, command: string, startedAt = '2026-09-21 10:00:00'): void {
  h.live.set(pid, { pid, pgid, ppid: 1, command, startedAt })
}

/** The headers of a made-up session asking. */
function as(sessionId: string): Record<string, string> {
  return {
    'x-mole-office-actor-type': 'agent',
    'x-mole-office-actor-id': 'claude-code',
    'x-mole-office-session': sessionId,
  }
}

function acquire(sessionId: string, body: Record<string, unknown>): Promise<LightMyRequestResponse> {
  return h.app.inject({ method: 'POST', url: '/api/slots/acquire', headers: as(sessionId), payload: body })
}

function release(sessionId: string, slotId: string, body: Record<string, unknown> = {}): Promise<LightMyRequestResponse> {
  return h.app.inject({ method: 'POST', url: `/api/slots/${slotId}/release`, headers: as(sessionId), payload: body })
}

interface Slot {
  id: string
  state: 'granted' | 'queued'
  seat: number | null
  position: number | null
}

function slotOf(reply: LightMyRequestResponse): Slot {
  expect(reply.statusCode, reply.body).toBe(200)
  return (reply.json() as { slot: Slot }).slot
}

/** The person's saved position or number, written as the settings door stores it. */
function chosen(name: string, value: string): void {
  h.t.client.sqlite.prepare('INSERT INTO runtime_settings (name, value) VALUES (?, ?)').run(name, value)
}

/** The gate's row of counts, read past every door. */
function count(gate: string): { would_stop: number; stopped: number; reminded: number } | undefined {
  return h.t.client.sqlite
    .prepare('SELECT would_stop, stopped, reminded FROM gate_counts WHERE gate = ?')
    .get(gate) as { would_stop: number; stopped: number; reminded: number } | undefined
}

// Mutation: at block, give the seat back; count the refusal as only would_stop, or not at all; or count a release with
// force, which passes the gate.
it('refuses at block to let another caller give back a seat whose group still runs, and counts it as stopped', async () => {
  start(100, 100, 'npm test')
  const asker = session()
  const held = slotOf(await acquire(asker, { pool: 'full-suite', pid: 100 }))
  const other = session('A made-up run that gives back a seat it did not ask for')
  const refused = await release(other, held.id)
  expect(refused.statusCode, refused.body).toBe(409)
  expect(count('giving-back-a-held-seat')).toEqual({ would_stop: 1, stopped: 1, reminded: 0 })
  // The seat is still held: its own session gives it back.
  const own = await release(asker, held.id)
  expect(own.statusCode, own.body).toBe(200)
  // Force passes the gate, so it is not counted.
  start(200, 200, 'npm test')
  const second = slotOf(await acquire(asker, { pool: 'full-suite', pid: 200 }))
  const forced = await release(other, second.id, { force: true })
  expect(forced.statusCode, forced.body).toBe(200)
  expect(count('giving-back-a-held-seat')).toEqual({ would_stop: 1, stopped: 1, reminded: 0 })
})

// Mutation: at off, refuse as before; leave the note as it was; count the release as stopped, or not at all.
it('at off lets another caller give back a seat whose group still runs, hands it on, says so in the row, and counts it', async () => {
  chosen(gateNamed('giving-back-a-held-seat').setting, 'off')
  start(100, 100, 'npm test')
  start(200, 200, 'npm test')
  const held = slotOf(await acquire(session(), { pool: 'full-suite', pid: 100 }))
  const waiting = slotOf(await acquire(session(), { pool: 'full-suite', pid: 200 }))
  expect(waiting.state).toBe('queued')
  const given = await release(session('A made-up run that gives back a seat it did not ask for'), held.id)
  expect(given.statusCode, given.body).toBe(200)
  const answer = given.json() as { note: string; handedOn: string[] }
  const { BECAUSE_THE_GATE_WAS_OFF } = await import('../src/server/lib/slots.ts')
  expect(answer.note.endsWith(BECAUSE_THE_GATE_WAS_OFF), answer.note).toBe(true)
  // The second suite is seated while the first still runs: what the gate at block prevents.
  expect(answer.handedOn).toHaveLength(1)
  expect(count('giving-back-a-held-seat')).toEqual({ would_stop: 1, stopped: 0, reminded: 0 })
})

// Mutation: give the full-suite pool another number than the row's; count the first ask, the same group asking again,
// or the browser test row instead.
it('gives the whole suite one seat by default, and counts a new ask that has to wait', async () => {
  start(100, 100, 'npm test')
  start(200, 200, 'npm test')
  const first = slotOf(await acquire(session(), { pool: 'full-suite', pid: 100 }))
  expect([first.state, first.seat]).toEqual(['granted', 1])
  expect(count('whole-suite-seats')).toBeUndefined()
  const waiting = session()
  const second = slotOf(await acquire(waiting, { pool: 'full-suite', pid: 200 }))
  expect([second.state, second.position]).toEqual(['queued', 1])
  expect(count('whole-suite-seats')).toEqual({ would_stop: 1, stopped: 0, reminded: 0 })
  const again = await acquire(waiting, { pool: 'full-suite', pid: 200 })
  expect((again.json() as { asked: string }).asked).toBe('again')
  expect(count('whole-suite-seats')).toEqual({ would_stop: 1, stopped: 0, reminded: 0 })
  expect(count('browser-test-seats')).toBeUndefined()
})

// Mutation: read the full-suite pool's size once at start, or as one whatever the person chose.
it('gives the whole suite as many seats as the person chose', async () => {
  chosen(gateNamed('whole-suite-seats').setting, '2')
  start(100, 100, 'npm test')
  start(200, 200, 'npm test')
  start(300, 300, 'npm test')
  const first = slotOf(await acquire(session(), { pool: 'full-suite', pid: 100 }))
  const second = slotOf(await acquire(session(), { pool: 'full-suite', pid: 200 }))
  expect([first.state, first.seat, second.state, second.seat]).toEqual(['granted', 1, 'granted', 2])
  expect(count('whole-suite-seats')).toBeUndefined()
  const third = await acquire(session(), { pool: 'full-suite', pid: 300 })
  expect(slotOf(third).state).toBe('queued')
  const pools = (await h.app.inject({ method: 'GET', url: '/api/slots' })).json() as { pools: { name: string; capacity: number }[] }
  expect(pools.pools.find((pool) => pool.name === 'full-suite')?.capacity).toBe(2)
  expect(count('whole-suite-seats')).toEqual({ would_stop: 1, stopped: 0, reminded: 0 })
})
