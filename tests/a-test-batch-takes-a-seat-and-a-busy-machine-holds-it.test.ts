// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A BATCH OF NAMED TEST FILES TAKES A SEAT, AND A BUSY MACHINE HOLDS A NEW ONE BACK (wave 13r round AY).
 *
 * Every session, process, load and free space here is made up. No real process or disk is read and
 * nothing is signalled: the office is handed a probe this test controls, and no batch is started.
 *
 * The pool `test-batches` has three seats by default, the row `test-batch-seats`. No new seat is
 * handed out while the one-minute load is above the row `test-batch-load-limit` (14), or while the
 * root file system has fewer gigabytes free than the row `test-batch-disk-limit` (90). A seat already
 * held is kept. A figure the probe cannot read holds nothing back, and the answer says that limit was
 * not checked, and why.
 *
 * The office's sentences are read from its answer: each limit says itself in `pool.machine`, and a case checks
 * that the waiter's words carry that sentence, and that the sentence carries the figure the case made up and the limit.
 */

import { afterEach, beforeEach, expect, it } from 'vitest'
import type { FastifyInstance, LightMyRequestResponse } from 'fastify'
import { gateNamed } from '../src/config/gates.mjs'
import { freshDb, type TestDb } from './helpers.ts'

type ResourcesLib = typeof import('../src/server/lib/resources.ts')
type OsProbe = ResourcesLib['LINUX_PROBE']
type OsProcess = NonNullable<ReturnType<OsProbe['processById']>>

/** What the made-up machine reads now. Undefined leaves the probe without the method, as on a machine that has none. */
interface Machine {
  load?: number | null
  freeBytes?: number | null
}

interface Harness {
  t: TestDb
  res: ResourcesLib
  app: FastifyInstance
  live: Map<number, OsProcess>
}

const GB = 1_000_000_000

/** A process table and a machine the test can change between requests. It never signals anything. */
function fakeProbe(live: Map<number, OsProcess>, machine: Machine): OsProbe {
  const probe: OsProbe = {
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
  if (machine.load !== undefined) probe.machineNow = () => ({ loadOneMinute: machine.load ?? null, freeBytes: null })
  if (machine.freeBytes !== undefined) probe.rootFreeBytes = () => machine.freeBytes ?? null
  return probe
}

let h: Harness
/** A quiet machine with room to spare, unless a case changes it. */
let machine: Machine

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
  machine = { load: 2.5, freeBytes: 400 * GB }
  h = { t, res, app, live }
  useTheMachine()
})

afterEach(async () => {
  h.res.useOsProbe(h.res.LINUX_PROBE)
  await h.app.close()
  h.t.close()
})

/** Hand the office the probe for the machine as `machine` now says. */
function useTheMachine(): void {
  h.res.useOsProbe(fakeProbe(h.live, machine))
}

/** A made-up running session record, and its id. */
function session(title = 'A made-up run that wants a test-batch seat'): string {
  return h.t.api.createRecord({
    workspaceId: 'default',
    kind: 'session',
    title,
    data: { state: 'running', runtime: 'claude-code' },
    actor: h.t.api.HUMAN,
  }).id
}

/** A made-up batch on the fake machine, leading its own process group. */
function start(pid: number): void {
  h.live.set(pid, { pid, pgid: pid, ppid: 1, command: 'node tools/run-named-tests.mjs', startedAt: '2026-11-04 10:00:00' })
}

function as(sessionId: string): Record<string, string> {
  return {
    'x-mole-office-actor-type': 'agent',
    'x-mole-office-actor-id': 'claude-code',
    'x-mole-office-session': sessionId,
  }
}

interface Slot {
  id: string
  state: 'granted' | 'queued'
  seat: number | null
  position: number | null
}

interface Limit {
  gate: string
  state: 'holds' | 'clear' | 'unchecked'
  limit: number
  says: string
}

/** A pool as the doors show it. */
interface Pool {
  name: string
  capacity: number
  held: { seat: number | null }[]
  freeSeats: number[]
  machine: Limit[]
  says: string
}

interface Answer {
  slot: Slot
  pool: { machine: Limit[] }
  asked: 'new' | 'again'
  says: string
}

/** The answer's limit set by the gate row `gate`. */
function theLimit(answer: { pool: { machine: Limit[] } }, gate: string): Limit {
  const found = answer.pool.machine.find((m) => m.gate === gate)
  expect(found, JSON.stringify(answer.pool.machine)).toBeDefined()
  return found!
}

async function acquire(sessionId: string, pid: number): Promise<Answer> {
  const reply: LightMyRequestResponse = await h.app.inject({
    method: 'POST',
    url: '/api/slots/acquire',
    headers: as(sessionId),
    payload: { pool: 'test-batches', pid },
  })
  expect(reply.statusCode, reply.body).toBe(200)
  return reply.json() as Answer
}

async function release(sessionId: string, slotId: string): Promise<{ handedOn: string[]; says: string }> {
  const reply = await h.app.inject({ method: 'POST', url: `/api/slots/${slotId}/release`, headers: as(sessionId), payload: {} })
  expect(reply.statusCode, reply.body).toBe(200)
  return reply.json() as { handedOn: string[]; says: string }
}

/** The test-batches pool as GET /api/slots shows it. */
async function thePool(): Promise<Pool> {
  const reply = await h.app.inject({ method: 'GET', url: '/api/slots' })
  expect(reply.statusCode, reply.body).toBe(200)
  const found = (reply.json() as { pools: Pool[] }).pools.find((pool) => pool.name === 'test-batches')
  expect(found, reply.body).toBeDefined()
  return found!
}

/** The person's saved number, written as the settings door stores it; a second choice replaces the first. */
function chosen(name: string, value: string): void {
  h.t.client.sqlite
    .prepare('INSERT INTO runtime_settings (name, value) VALUES (?, ?) ON CONFLICT(name) DO UPDATE SET value = excluded.value')
    .run(name, value)
}

/** The gate's row of counts, read past every door. */
function count(gate: string): { would_stop: number; stopped: number; reminded: number } | undefined {
  return h.t.client.sqlite
    .prepare('SELECT would_stop, stopped, reminded FROM gate_counts WHERE gate = ?')
    .get(gate) as { would_stop: number; stopped: number; reminded: number } | undefined
}

// Mutation: give test-batches four seats, or the browser pool's size; leave test-batches out of the pools; count the
// waiting batch on another row, or not at all.
it('seats three batches, puts a fourth in line, and seats it when one is given back or its group ends', async () => {
  for (const pid of [100, 200, 300, 400, 500]) start(pid)
  const owners = [session(), session(), session()]
  const seated = [await acquire(owners[0]!, 100), await acquire(owners[1]!, 200), await acquire(owners[2]!, 300)]
  expect(seated.map((a) => [a.slot.state, a.slot.seat])).toEqual([['granted', 1], ['granted', 2], ['granted', 3]])
  expect(count('test-batch-seats')).toBeUndefined()

  const fourth = session()
  const waiting = await acquire(fourth, 400)
  expect([waiting.slot.state, waiting.slot.position]).toEqual(['queued', 1])
  const poolWhileWaiting = await thePool()
  expect([poolWhileWaiting.capacity, poolWhileWaiting.held.length, poolWhileWaiting.freeSeats]).toEqual([3, 3, []])
  // The seats made it wait, not the machine.
  expect(waiting.pool.machine.map((m) => m.state)).toEqual(['clear', 'clear'])
  expect(count('test-batch-seats')).toEqual({ would_stop: 1, stopped: 0, reminded: 0 })

  const given = await release(owners[1]!, seated[1]!.slot.id)
  expect(given.handedOn).toHaveLength(1)
  expect(given.handedOn[0]).toContain(waiting.slot.id)
  expect((await acquire(fourth, 400)).slot).toMatchObject({ state: 'granted', seat: 2 })

  const fifth = session()
  expect((await acquire(fifth, 500)).slot.state).toBe('queued')
  h.live.delete(300)
  const after = await acquire(fifth, 500)
  expect(after.slot).toMatchObject({ state: 'granted', seat: 3 })
  expect(count('test-batch-seats')).toEqual({ would_stop: 2, stopped: 0, reminded: 0 })
  expect(count('whole-suite-seats')).toBeUndefined()
  expect(count('browser-test-seats')).toBeUndefined()
})

// Mutation: seat a waiter while the load is above the limit; hold at the limit itself; take a held seat back; leave the
// figure or the limit out of the words; count the wait on the seats' row.
it('holds a new seat while the one-minute load is above the limit, names the figure and the limit, and keeps a held seat', async () => {
  start(100)
  start(200)
  const first = session()
  const held = await acquire(first, 100)
  expect(held.slot.state).toBe('granted')

  machine.load = 15.2
  useTheMachine()
  const second = session()
  const waiting = await acquire(second, 200)
  expect([waiting.slot.state, waiting.slot.position]).toEqual(['queued', 1])
  const poolWhileHeld = await thePool()
  expect([poolWhileHeld.held.length, poolWhileHeld.freeSeats]).toEqual([1, [2, 3]])
  const load = theLimit(waiting, 'test-batch-load-limit')
  expect([load.state, load.limit]).toEqual(['holds', 14])
  expect(load.says).toContain('15.2')
  expect(load.says).toContain('14')
  expect(waiting.says).toContain(load.says)
  // The free space is within its limit, so the waiter is not told about it.
  const disk = theLimit(waiting, 'test-batch-disk-limit')
  expect(disk.state).toBe('clear')
  expect(waiting.says).not.toContain(disk.says)
  expect(count('test-batch-load-limit')).toEqual({ would_stop: 1, stopped: 0, reminded: 0 })
  expect(count('test-batch-seats')).toBeUndefined()
  expect(count('test-batch-disk-limit')).toBeUndefined()
  expect((await thePool()).says).toContain(load.says)

  // The seat already held is not taken back, and asking again for the waiter still waits.
  expect((await acquire(first, 100)).slot).toMatchObject({ state: 'granted', seat: 1 })
  expect((await acquire(second, 200)).slot.state).toBe('queued')

  machine.load = 14
  useTheMachine()
  expect((await acquire(second, 200)).slot).toMatchObject({ state: 'granted', seat: 2 })
  expect(count('test-batch-load-limit')).toEqual({ would_stop: 1, stopped: 0, reminded: 0 })
})

// Mutation: seat a waiter while the free space is below the limit; count gigabytes as 1024³ bytes; hold at the limit
// itself; leave the figure or the limit out of the words; count the wait on the load row.
it('holds a new seat while the root file system has less free than the limit, and names the figure and the limit', async () => {
  start(100)
  machine.freeBytes = 85_560_000_000
  useTheMachine()
  const asker = session()
  const waiting = await acquire(asker, 100)
  expect([waiting.slot.state, waiting.slot.position]).toEqual(['queued', 1])
  const disk = theLimit(waiting, 'test-batch-disk-limit')
  expect([disk.state, disk.limit]).toEqual(['holds', 90])
  // 85,560,000,000 bytes is shown rounded down, so it is never shown on the wrong side of the limit.
  expect(disk.says).toContain('85.5')
  expect(disk.says).not.toContain('85.6')
  expect(disk.says).toContain('90')
  expect(waiting.says).toContain(disk.says)
  expect(count('test-batch-disk-limit')).toEqual({ would_stop: 1, stopped: 0, reminded: 0 })
  expect(count('test-batch-load-limit')).toBeUndefined()
  expect(count('test-batch-seats')).toBeUndefined()

  // Ninety gigabytes of 1,000,000,000 bytes is not below the limit: 90 GiB would be more.
  machine.freeBytes = 90 * GB
  useTheMachine()
  expect((await acquire(asker, 100)).slot).toMatchObject({ state: 'granted', seat: 1 })
})

// Mutation: hold a seat back on a figure nobody could read; seat it without a word; leave out that the probe has no
// such reading; or say the same reason for a probe without the method and for a null.
it('hands out a seat when a figure cannot be read, and says which limit was not checked, and why', async () => {
  start(100)
  start(200)
  machine = {}
  useTheMachine()
  const granted = await acquire(session(), 100)
  expect(granted.slot).toMatchObject({ state: 'granted', seat: 1 })
  const unread = granted.pool.machine
  expect(unread.map((m) => [m.gate, m.state, m.limit])).toEqual([
    ['test-batch-load-limit', 'unchecked', 14],
    ['test-batch-disk-limit', 'unchecked', 90],
  ])
  for (const m of unread) {
    expect(m.says).toContain(String(m.limit))
    // Why: the probe this case made, named by its platform, has no such reading.
    expect(m.says).toContain('fake')
    expect(granted.says).toContain(m.says)
  }
  expect(unread[0]!.says).not.toBe(unread[1]!.says)
  expect((await thePool()).machine.map((m) => [m.gate, m.state])).toEqual([
    ['test-batch-load-limit', 'unchecked'],
    ['test-batch-disk-limit', 'unchecked'],
  ])

  machine = { load: null, freeBytes: null }
  useTheMachine()
  const second = await acquire(session(), 200)
  expect(second.slot).toMatchObject({ state: 'granted', seat: 2 })
  const nulls = second.pool.machine
  expect(nulls.map((m) => [m.gate, m.state, m.limit])).toEqual([
    ['test-batch-load-limit', 'unchecked', 14],
    ['test-batch-disk-limit', 'unchecked', 90],
  ])
  nulls.forEach((m, i) => {
    expect(m.says).toContain(String(m.limit))
    expect(second.says).toContain(m.says)
    // A reading that came back empty is another reason than a probe without the reading.
    expect(m.says).not.toContain('fake')
    expect(m.says).not.toBe(unread[i]!.says)
  })
  expect(count('test-batch-load-limit')).toBeUndefined()
  expect(count('test-batch-disk-limit')).toBeUndefined()
})

// Mutation: read any of the three rows once at start, or use its default whatever the person chose.
it('takes the seats and both limits from the gate rows, and a changed row changes them', async () => {
  for (const pid of [100, 200, 300]) start(pid)
  chosen(gateNamed('test-batch-seats').setting, '2')
  expect((await thePool()).capacity).toBe(2)
  expect((await acquire(session(), 100)).slot.state).toBe('granted')
  expect((await acquire(session(), 200)).slot.state).toBe('granted')
  const third = session()
  const waiting = await acquire(third, 300)
  expect(waiting.slot.state).toBe('queued')
  const poolWhileThirdWaits = await thePool()
  expect([poolWhileThirdWaits.capacity, poolWhileThirdWaits.held.length, poolWhileThirdWaits.freeSeats]).toEqual([2, 2, []])

  chosen(gateNamed('test-batch-seats').setting, '5')
  machine = { load: 15.2, freeBytes: 85_560_000_000 }
  useTheMachine()
  const held = await acquire(third, 300)
  expect(held.slot.state).toBe('queued')
  expect(held.pool.machine.map((m) => [m.state, m.limit])).toEqual([['holds', 14], ['holds', 90]])
  for (const m of held.pool.machine) expect(held.says).toContain(m.says)

  chosen(gateNamed('test-batch-load-limit').setting, '20')
  chosen(gateNamed('test-batch-disk-limit').setting, '50')
  const seated = await acquire(third, 300)
  expect(seated.slot).toMatchObject({ state: 'granted', seat: 3 })
  expect(seated.pool.machine.map((m) => [m.state, m.limit])).toEqual([['clear', 20], ['clear', 50]])
  for (const m of seated.pool.machine) expect(seated.says).not.toContain(m.says)
  const after = await thePool()
  expect([after.capacity, after.held.length]).toEqual([5, 3])
})
