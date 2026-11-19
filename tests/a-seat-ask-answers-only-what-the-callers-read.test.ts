// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * AN ASK FOR A TEST SEAT ANSWERS THE ASKER'S ROW AND NOTHING ELSE, GIVES SEATS AS IT DID, AND A BATCH IN LINE ASKS
 * AT A BOUNDED PACE.
 *
 * The door is `POST /api/slots/acquire` (src/server/api/slots.ts:79, `acquireSlot` in
 * src/server/lib/slots.ts). A caller in line asks again for the same process group, and the office answers about
 * the same row; that is how a waiter learns its place. The answer used to carry the whole pool: every held seat and
 * every row waiting, each with its session, holder and detail. The callers read only the asker's row (id, pool,
 * state, seat, position), the office's sentence, and, for the merge tool, the machine limits; everything else is on
 * `GET /api/slots`.
 *
 * Every session, process, load and free space here is made up. No real process is read and nothing is signalled: the
 * office is handed a process table this test controls, and the wait between asks is counted on a made-up clock rather
 * than by waiting.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { FastifyInstance, LightMyRequestResponse } from 'fastify'
import { freshDb, type TestDb } from './helpers.ts'
import * as BatchSeat from '../tools/test-batch-seat.mjs'

type ResourcesLib = typeof import('../src/server/lib/resources.ts')
type OsProbe = ResourcesLib['LINUX_PROBE']
type OsProcess = NonNullable<ReturnType<OsProbe['processById']>>

interface Harness {
  t: TestDb
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
    machineNow: () => ({ loadOneMinute: 1, freeBytes: null }),
    rootFreeBytes: () => 500_000_000_000,
    killProcessGroup: () => {
      throw new Error('a slot never signals anything, and this test signals nothing')
    },
    stopContainer: () => {
      throw new Error('this test stops nothing')
    },
  } as OsProbe
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
  h = { t, app, live }
})

afterEach(async () => {
  const res = await import('../src/server/lib/resources.ts')
  res.useOsProbe(res.LINUX_PROBE)
  await h.app.close()
  h.t.close()
})

/** A running session record, and its id. */
function session(title = 'a made-up run that wants a seat'): string {
  return h.t.api.createRecord({
    workspaceId: 'default',
    kind: 'session',
    title,
    data: { state: 'running', runtime: 'claude-code' },
    actor: h.t.api.HUMAN,
  }).id
}

/** A process on the fake machine. A group leader is the process whose pid is its group's id. */
function start(pid: number, command = 'npm test'): void {
  h.live.set(pid, {
    pid,
    pgid: pid,
    ppid: 1,
    command,
    startedAt: '2026-11-04 10:00:00',
  })
}

function end(...pids: number[]): void {
  for (const pid of pids) h.live.delete(pid)
}

function as(sessionId: string): Record<string, string> {
  return {
    'x-mole-office-actor-type': 'agent',
    'x-mole-office-actor-id': 'claude-code',
    'x-mole-office-session': sessionId,
  }
}

function acquire(sessionId: string, body: Record<string, unknown>): Promise<LightMyRequestResponse> {
  return h.app.inject({
    method: 'POST',
    url: '/api/slots/acquire',
    headers: as(sessionId),
    payload: body,
  })
}

interface AskedSlot {
  id: string
  pool: string
  state: 'granted' | 'queued'
  seat: number | null
  position: number | null
}

interface Answer {
  slot: AskedSlot
  pool: { machine: { gate: string; state: string; says: string }[] }
  asked: 'new' | 'again'
  says: string
}

function answerOf(reply: LightMyRequestResponse): Answer {
  expect(reply.statusCode, reply.body).toBe(200)
  return reply.json() as Answer
}

/** The whole pool as GET /api/slots answers it, which is where everything the ask no longer carries stays. */
async function poolFromTheList(name: string): Promise<Record<string, unknown>> {
  const reply = await h.app.inject({ method: 'GET', url: '/api/slots' })
  expect(reply.statusCode, reply.body).toBe(200)
  const found = (reply.json() as { pools: Record<string, unknown>[] }).pools.find((pool) => pool.name === name)
  expect(found, reply.body).toBeDefined()
  return found as Record<string, unknown>
}

describe('an ask for a seat answers only what a caller reads', () => {
  // Mutation: return the whole SlotView or the whole PoolView again, or add handedOn back.
  it('carries the asker row, the machine limits and the office sentence, and nothing else', async () => {
    start(100)
    const mine = answerOf(await acquire(session(), { pool: 'full-suite', pid: 100 }))
    expect(Object.keys(mine).sort()).toEqual(['asked', 'pool', 'says', 'slot'])
    expect(Object.keys(mine.slot).sort()).toEqual(['id', 'pool', 'position', 'seat', 'state'])
    expect(Object.keys(mine.pool)).toEqual(['machine'])
    expect(mine.slot).toMatchObject({
      pool: 'full-suite',
      state: 'granted',
      seat: 1,
      position: null,
    })
    // The row's other fields and the pool's lists are still on GET /api/slots; the ask does not repeat them.
    const listed = await poolFromTheList('full-suite')
    expect(Array.isArray(listed.held)).toBe(true)
    expect(JSON.stringify(mine)).not.toContain('"detail"')
    expect(JSON.stringify(mine)).not.toContain('"holder"')
    expect(JSON.stringify(mine)).not.toContain('"handedOn"')
    expect(JSON.stringify(mine)).not.toContain('"waiting"')
  })

  // Mutation: put a different pool's rows in the answer; leave the machine limits out of a test-batches answer.
  it('keeps the machine limits the merge tool names, and only for the pool that has them', async () => {
    start(100)
    start(200)
    const suite = answerOf(await acquire(session(), { pool: 'full-suite', pid: 100 }))
    expect(suite.pool.machine).toEqual([])
    const batch = answerOf(await acquire(session(), { pool: BatchSeat.TEST_BATCH_POOL, pid: 200 }))
    expect(Object.keys(batch.pool)).toEqual(['machine'])
    expect(batch.pool.machine.map((one) => one.gate)).toEqual(['test-batch-load-limit', 'test-batch-disk-limit'])
    // The made-up machine is quiet and roomy, so both limits are read and neither holds; a holding limit would say so
    // in the answer's sentence and withhold the seat, which is the pool's behaviour and unchanged here.
    expect(batch.pool.machine.map((one) => one.state)).toEqual(['clear', 'clear'])
  })
})

describe('seats and places are given as before', () => {
  // Mutation: hand a seat to a later ask first; answer a second ask from the same group with a second row; leave a
  // place in line after its group ends.
  it('gives the one full-suite seat in ask order, keeps a place, and frees the seat when its group ends', async () => {
    start(100)
    start(200)
    start(300)
    const first = answerOf(await acquire(session(), { pool: 'full-suite', pid: 100 }))
    const second = answerOf(await acquire(session(), { pool: 'full-suite', pid: 200 }))
    const third = answerOf(await acquire(session(), { pool: 'full-suite', pid: 300 }))
    expect([first.slot.state, first.slot.seat, first.slot.position]).toEqual(['granted', 1, null])
    expect([second.slot.state, second.slot.seat, second.slot.position]).toEqual(['queued', null, 1])
    expect([third.slot.state, third.slot.seat, third.slot.position]).toEqual(['queued', null, 2])
    // The same group asking again is the same row and the same place, and a second pid in the group is the same too.
    const again = answerOf(await acquire(session(), { pool: 'full-suite', pid: 200 }))
    expect(again.asked).toBe('again')
    expect(again.slot.id).toBe(second.slot.id)
    expect(again.slot.position).toBe(1)
    start(201)
    h.live.set(201, { ...h.live.get(200)!, pid: 201, pgid: 200 })
    const anotherPid = answerOf(await acquire(session(), { pool: 'full-suite', pid: 201 }))
    expect(anotherPid.slot.id).toBe(second.slot.id)
    // The holder's group dies: the next ask gives the seat to the first in line, in order.
    end(100)
    const handedOn = answerOf(await acquire(session(), { pool: 'full-suite', pid: 200 }))
    expect([handedOn.slot.state, handedOn.slot.seat]).toEqual(['granted', 1])
    expect(handedOn.asked).toBe('again')
    const stillWaiting = answerOf(await acquire(session(), { pool: 'full-suite', pid: 300 }))
    expect([stillWaiting.slot.state, stillWaiting.slot.position]).toEqual(['queued', 1])
  })

  // Mutation: seat a waiter whose group has ended; send a queued row to another pool.
  it('does not seat a group that ended, and keeps the seats of the three test-batches pool', async () => {
    for (const pid of [100, 200, 300, 400]) start(pid)
    const owners = [session(), session(), session()]
    const seated = []
    for (let i = 0; i < 3; i += 1)
      seated.push(
        answerOf(
          await acquire(owners[i]!, {
            pool: BatchSeat.TEST_BATCH_POOL,
            pid: 100 + i * 100,
          })
        )
      )
    expect(seated.map((one) => one.slot.seat)).toEqual([1, 2, 3])
    const waiting = answerOf(await acquire(session(), { pool: BatchSeat.TEST_BATCH_POOL, pid: 400 }))
    expect([waiting.slot.state, waiting.slot.position]).toEqual(['queued', 1])
    // The fourth's group ends before a seat is free: its place goes at once, and the fifth takes the next seat.
    end(400)
    start(500)
    const fifth = answerOf(await acquire(session(), { pool: BatchSeat.TEST_BATCH_POOL, pid: 500 }))
    expect([fifth.slot.state, fifth.slot.position]).toEqual(['queued', 1])
  })
})

describe('a waiting batch asks at a pace set by its place', () => {
  // Mutation: wait the same time wherever the batch is; cap above 60 s; ask again at once when the place is unknown.
  it('waits five seconds at the front, longer further back, and counts the asks from place ten to a seat', () => {
    expect(typeof BatchSeat.waitBeforeAskingAgain).toBe('function')
    expect(BatchSeat.waitBeforeAskingAgain(1)).toBe(BatchSeat.A_WAITING_BATCH_ASKS_EVERY_MS)
    expect(BatchSeat.waitBeforeAskingAgain(2)).toBe(2 * BatchSeat.A_WAITING_BATCH_ASKS_EVERY_MS)
    expect(BatchSeat.waitBeforeAskingAgain(5)).toBe(5 * BatchSeat.A_WAITING_BATCH_ASKS_EVERY_MS)
    expect(BatchSeat.waitBeforeAskingAgain(10)).toBe(10 * BatchSeat.A_WAITING_BATCH_ASKS_EVERY_MS)
    expect(BatchSeat.waitBeforeAskingAgain(13)).toBe(BatchSeat.A_WAITING_BATCH_ASKS_AT_MOST_EVERY_MS)
    // A granted answer returns before the wait. A queued answer with no place is asked again at today's 5 s pace,
    // never in a loop with no pause.
    expect(BatchSeat.waitBeforeAskingAgain(null)).toBe(BatchSeat.A_WAITING_BATCH_ASKS_EVERY_MS)
    expect(BatchSeat.waitBeforeAskingAgain(undefined)).toBe(BatchSeat.A_WAITING_BATCH_ASKS_EVERY_MS)

    // The line says the wait the batch really uses: 10 s at place 2, so it is printed again when the place changes.
    expect(BatchSeat.waitsForASeat('a made-up sentence', 2)).toBe(
      `run-named-tests: waits for a ${BatchSeat.TEST_BATCH_POOL} seat, asking again every 10 s. a made-up sentence`
    )
    expect(BatchSeat.waitsForASeat('a made-up sentence', 1)).toContain('asking again every 5 s.')
    expect(BatchSeat.waitsForASeat('a made-up sentence', null)).toContain('asking again every 5 s.')

    // The asks in an hour at a place that does not move: that place's wait, counted on a made-up clock.
    const inAnHour = (place: number): number => Math.floor(3_600_000 / BatchSeat.waitBeforeAskingAgain(place))
    expect(inAnHour(1)).toBe(720)
    expect(inAnHour(2)).toBe(360)
    expect(inAnHour(5)).toBe(144)
    expect(inAnHour(10)).toBe(72)

    // A whole wait from place 10: the made-up line clears one place within each wait, so the place falls by one
    // after every ask, down to the ask that finds the seat.
    let place = 10
    let elapsed = 0
    let asks = 1 // the first ask, at place 10
    while (place > 0) {
      elapsed += BatchSeat.waitBeforeAskingAgain(place)
      place -= 1
      asks += 1
    }
    // Eleven asks in 275 s, which is 144 an hour: no answer is more than a minute old on the way.
    expect(elapsed).toBe(BatchSeat.A_WAITING_BATCH_ASKS_EVERY_MS * 55)
    expect(asks).toBe(11)
    expect(Math.round((asks / elapsed) * 3_600_000)).toBe(144)
  })
})
