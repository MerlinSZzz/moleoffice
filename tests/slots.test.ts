// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE MACHINE'S SHARED TEST SEATS ARE HANDED OUT BY THE OFFICE, AND A SEAT ENDS WITH ITS GROUP.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS PINS
 * ---------------------------------------------------------------------------------------
 *
 * DECISIONS R7(2) of 21 September 2026: the full-suite lock and the browser-test slots, which were
 * directories agents took by hand, become slots the office keeps in the resource ledger. This file
 * drives the three doors (`GET /api/slots`, `POST /api/slots/acquire`, `POST /api/slots/:id/release`)
 * against a FAKE machine, so each rule is shown on a process table the test controls:
 *
 *   - a pool grants at most its number of seats, and the rest wait in the order they asked;
 *   - asking again for the same process group is the same request, which is how a waiter polls;
 *   - a seat is held by a process GROUP and is handed on once nothing in that group runs, including
 *     when the leader's pid has been given to another program, and not while the group runs on
 *     after its leader exited;
 *   - the browser pool's size is the setting, and a setting that is not a size is a loud failure;
 *   - a pid whose start time does not match is refused, which is what a pid read inside a
 *     sandbox's container looks like, and a process row names the holder instead;
 *   - a running seat is not given back by somebody else without `force`, and the ledger's kill
 *     door never signals a slot.
 *
 * tests/slot-tool.test.ts drives the same doors through node tools/slot.mjs against real processes.
 */

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { FastifyInstance, LightMyRequestResponse } from 'fastify'
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
const BROWSER_SEATS = 'MOLE_OFFICE_BROWSER_TEST_SLOTS'
let seatsBefore: string | undefined
let t: TestDb
let res: ResourcesLib
let app: FastifyInstance

beforeAll(async () => {
  t = await freshDb()
  res = await import('../src/server/lib/resources.ts')
  const Fastify = (await import('fastify')).default
  const { installErrorHandling } = await import('../src/server/lib/http.ts')
  const { resourceRoutes } = await import('../src/server/api/resources.ts')
  const { slotRoutes } = await import('../src/server/api/slots.ts')
  app = Fastify({ logger: false })
  installErrorHandling(app)
  await app.register(resourceRoutes, { prefix: '/api' })
  await app.register(slotRoutes, { prefix: '/api' })
  await app.ready()
}, 60_000)

beforeEach(() => {
  seatsBefore = process.env[BROWSER_SEATS]
  const live = new Map<number, OsProcess>()
  res.useOsProbe(fakeProbe(live))
  h = { t, res, app, live }
})

afterEach(async () => {
  if (seatsBefore === undefined) delete process.env[BROWSER_SEATS]
  else process.env[BROWSER_SEATS] = seatsBefore
  h.res.useOsProbe(h.res.LINUX_PROBE)
  // THE LEDGER IS THE OFFICE'S, and these cases read it whole. The rows a case asked for are put
  // back to nothing, so the next case finds every pool as empty as a new office's.
  t.client.sqlite.exec('DELETE FROM session_resources')
})

afterAll(async () => {
  await app.close()
  t.close()
})

/** A running session record, and its id. */
function session(title = 'a run that wants a seat'): string {
  return h.t.api.createRecord({
    workspaceId: 'default',
    kind: 'session',
    title,
    data: { state: 'running', runtime: 'claude-code' },
    actor: h.t.api.HUMAN,
  }).id
}

/** A process on the fake machine. A group leader is the process whose pid is its group's id. */
function start(pid: number, pgid: number, command: string, startedAt = '2026-09-21 10:00:00'): void {
  h.live.set(pid, { pid, pgid, ppid: 1, command, startedAt })
}

function end(...pids: number[]): void {
  for (const pid of pids) h.live.delete(pid)
}

/** The headers of a session asking: an agent the office needs no registration for, and the session. */
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

function release(sessionId: string, id: string, body: Record<string, unknown> = {}): Promise<LightMyRequestResponse> {
  return h.app.inject({ method: 'POST', url: `/api/slots/${id}/release`, headers: as(sessionId), payload: body })
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

/** The row as the table holds it, read past every door. */
function row(id: string): { key: string; released_at: string | null; release_note: string | null; pgid: number | null } {
  return h.t.client.sqlite
    .prepare('SELECT key, released_at, release_note, pgid FROM session_resources WHERE id = ?')
    .get(id) as { key: string; released_at: string | null; release_note: string | null; pgid: number | null }
}

describe('a pool hands its seats out in the order they were asked for', () => {
  it('grants the one full-suite seat, and puts the next two in line in order', async () => {
    start(100, 100, 'npm test')
    start(200, 200, 'npm test')
    start(300, 300, 'npm test')
    const first = slotOf(await acquire(session(), { pool: 'full-suite', pid: 100 }))
    const second = slotOf(await acquire(session(), { pool: 'full-suite', pid: 200 }))
    const third = slotOf(await acquire(session(), { pool: 'full-suite', pid: 300 }))

    expect([first.state, first.seat, row(first.id).pgid]).toEqual(['granted', 1, 100])
    expect([second.state, second.position]).toEqual(['queued', 1])
    expect([third.state, third.position]).toEqual(['queued', 2])
    expect(row(first.id).key).toBe('full-suite#1')
    expect(row(second.id).key).toBe('full-suite')
  })

  it('answers about the same row when the same group asks again, rather than joining the line twice', async () => {
    start(100, 100, 'npm test')
    start(200, 200, 'npm test')
    const s = session()
    slotOf(await acquire(session(), { pool: 'full-suite', pid: 100 }))
    const asked = await acquire(s, { pool: 'full-suite', pid: 200 })
    // A different pid of the same group is the same holder.
    start(201, 200, 'vitest')
    const again = await acquire(s, { pool: 'full-suite', pid: 201 })

    expect(slotOf(again).id).toBe(slotOf(asked).id)
    expect((again.json() as { asked: string }).asked).toBe('again')
    const live = h.t.client.sqlite
      .prepare("SELECT count(*) AS n FROM session_resources WHERE type = 'slot' AND released_at IS NULL")
      .get() as { n: number }
    expect(live.n).toBe(2)
  })

  it('seats the first in line when the holder gives its seat back', async () => {
    start(100, 100, 'npm test')
    start(200, 200, 'npm test')
    start(300, 300, 'npm test')
    const holderSession = session()
    const held = slotOf(await acquire(holderSession, { pool: 'full-suite', pid: 100 }))
    const secondSession = session()
    const second = slotOf(await acquire(secondSession, { pool: 'full-suite', pid: 200 }))
    const third = slotOf(await acquire(session(), { pool: 'full-suite', pid: 300 }))

    const given = await release(holderSession, held.id)
    expect(given.statusCode, given.body).toBe(200)
    expect(row(held.id).release_note).toContain('given back by the session that asked for it')
    // Seated during the release itself, so the next ask already reads granted.
    expect(row(second.id).key).toBe('full-suite#1')
    expect(slotOf(await acquire(secondSession, { pool: 'full-suite', pid: 200 })).state).toBe('granted')
    expect(slotOf(await acquire(session(), { pool: 'full-suite', pid: 300 })).id).toBe(third.id)
    expect(row(third.id).key).toBe('full-suite')
  })
})

describe('a seat is held by a process group and ends with it', () => {
  it('hands the seat on once nothing in the holding group is running, with nobody giving it back', async () => {
    start(100, 100, 'npm test')
    start(101, 100, 'vitest run')
    start(200, 200, 'npm test')
    const held = slotOf(await acquire(session(), { pool: 'full-suite', pid: 100 }))
    const waiting = session()
    expect(slotOf(await acquire(waiting, { pool: 'full-suite', pid: 200 })).state).toBe('queued')

    end(100, 101)
    const now = slotOf(await acquire(waiting, { pool: 'full-suite', pid: 200 }))

    expect([now.state, now.seat]).toEqual(['granted', 1])
    const closed = row(held.id)
    expect(closed.released_at).not.toBeNull()
    expect(closed.release_note).toContain('the process group holding it has ended')
  })

  it('keeps the seat while the group runs on after its leader has exited', async () => {
    start(100, 100, 'sh -c npm test')
    start(101, 100, 'vitest run')
    start(200, 200, 'npm test')
    slotOf(await acquire(session(), { pool: 'full-suite', pid: 100 }))
    const waiting = session()

    end(100)
    expect(slotOf(await acquire(waiting, { pool: 'full-suite', pid: 200 })).state).toBe('queued')
    end(101)
    expect(slotOf(await acquire(waiting, { pool: 'full-suite', pid: 200 })).state).toBe('granted')
  })

  it('does not let a program that was given the leader’s pid keep the seat', async () => {
    start(100, 100, 'npm test', '2026-09-21 10:00:00')
    start(200, 200, 'npm test')
    slotOf(await acquire(session(), { pool: 'full-suite', pid: 100 }))
    const waiting = session()
    expect(slotOf(await acquire(waiting, { pool: 'full-suite', pid: 200 })).state).toBe('queued')

    start(100, 100, 'a different program', '2026-09-21 11:30:00')
    expect(slotOf(await acquire(waiting, { pool: 'full-suite', pid: 200 })).state).toBe('granted')
  })

  it('names a seat whose group has ended in GET /api/slots and gives nothing back from a read', async () => {
    start(100, 100, 'npm test')
    const held = slotOf(await acquire(session(), { pool: 'full-suite', pid: 100 }))
    end(100)

    const read = await h.app.inject({ method: 'GET', url: '/api/slots' })
    expect(read.statusCode, read.body).toBe(200)
    const pools = (read.json() as { pools: { name: string; held: { id: string; holder: { liveness: { state: string } } }[]; says: string }[] }).pools
    const suite = pools.find((p) => p.name === 'full-suite')
    expect(suite?.held.map((s) => [s.id, s.holder.liveness.state])).toEqual([[held.id, 'gone']])
    expect(suite?.says).toContain('has ended')
    expect(row(held.id).released_at).toBeNull()
  })
})

describe('the browser-tests pool', () => {
  it('has as many seats as MOLE_OFFICE_BROWSER_TEST_SLOTS says', async () => {
    process.env[BROWSER_SEATS] = '2'
    for (const pid of [100, 200, 300]) start(pid, pid, 'vitest run tests/some-page.test.ts')
    const states = []
    for (const pid of [100, 200, 300]) states.push(slotOf(await acquire(session(), { pool: 'browser-tests', pid })))
    expect(states.map((s) => [s.state, s.seat ?? s.position])).toEqual([
      ['granted', 1],
      ['granted', 2],
      ['queued', 1],
    ])
  })

  it('hands out no seat when the setting is not a number of seats, and says which setting', async () => {
    process.env[BROWSER_SEATS] = 'lots'
    start(100, 100, 'vitest run')
    const reply = await acquire(session(), { pool: 'browser-tests', pid: 100 })
    expect(reply.statusCode).toBe(500)
    expect(reply.body).toContain(BROWSER_SEATS)
  })
})

describe('what asking for a seat refuses', () => {
  it('refuses a pool it does not know, and names the two it has', async () => {
    start(100, 100, 'npm test')
    const reply = await acquire(session(), { pool: 'full-suit', pid: 100 })
    expect(reply.statusCode).toBe(400)
    expect(reply.body).toContain('full-suite')
    expect(reply.body).toContain('browser-tests')
  })

  it('refuses a pid whose start time is not the one sent, which is what a pid read inside a container looks like', async () => {
    start(800, 800, 'bash', '2026-09-21 10:00:00')
    const reply = await acquire(session(), { pool: 'full-suite', pid: 800, startedAt: '2026-09-21 09:00:00' })
    expect(reply.statusCode).toBe(409)
    expect(String(reply.json().error)).toContain('{"resource"')
    const rows = h.t.client.sqlite.prepare("SELECT count(*) AS n FROM session_resources WHERE type = 'slot'").get() as {
      n: number
    }
    expect(rows.n).toBe(0)
  })

  it('takes the holder from a process row, for a caller whose own pid means nothing here', async () => {
    start(700, 700, 'node tools/sandbox-start.mjs')
    const s = session()
    const processRow = h.res.registerResource({
      workspaceId: 'default',
      sessionRecordId: s,
      type: 'process',
      key: '700',
      actor: h.t.api.HUMAN,
    })
    const slot = slotOf(await acquire(s, { pool: 'full-suite', resource: processRow.id }))
    expect([slot.state, row(slot.id).pgid]).toEqual(['granted', 700])
  })

  it('refuses a group whose leader has already exited, because nothing then tells it from a later group', async () => {
    start(810, 805, 'vitest run')
    const reply = await acquire(session(), { pool: 'full-suite', pid: 810 })
    expect(reply.statusCode).toBe(400)
    expect(reply.body).toContain('leader has already exited')
  })

  it('lets one session wait in one line once', async () => {
    start(100, 100, 'npm test')
    start(200, 200, 'npm test')
    start(300, 300, 'npm test')
    slotOf(await acquire(session(), { pool: 'full-suite', pid: 100 }))
    const s = session()
    slotOf(await acquire(s, { pool: 'full-suite', pid: 200 }))
    const twice = await acquire(s, { pool: 'full-suite', pid: 300 })
    expect(twice.statusCode).toBe(409)
    expect(twice.body).toContain('already in line')
  })
})

describe('giving a seat back', () => {
  it('refuses somebody else’s running seat without force, and writes the force into the row', async () => {
    start(100, 100, 'npm test')
    const held = slotOf(await acquire(session(), { pool: 'full-suite', pid: 100 }))
    const stranger = session('somebody else')

    const refused = await release(stranger, held.id)
    expect(refused.statusCode).toBe(409)
    expect(row(held.id).released_at).toBeNull()

    const forced = await release(stranger, held.id, { force: true })
    expect(forced.statusCode, forced.body).toBe(200)
    expect(row(held.id).release_note).toContain('with force')
  })

  it('is not done by the ledger’s kill door, which points at the slot door and signals nothing', async () => {
    start(100, 100, 'npm test')
    const s = session()
    const held = slotOf(await acquire(s, { pool: 'full-suite', pid: 100 }))
    const reply = await h.app.inject({
      method: 'POST',
      url: `/api/resources/${held.id}/release`,
      headers: as(s),
      payload: { force: true },
    })
    expect(reply.statusCode).toBe(400)
    expect(reply.body).toContain(`/api/slots/${held.id}/release`)
    expect(row(held.id).released_at).toBeNull()
  })

  it('cannot be written through POST /api/resources, which points at the slot door', async () => {
    const reply = await h.app.inject({
      method: 'POST',
      url: '/api/resources',
      headers: as(session()),
      payload: { type: 'slot', key: 'full-suite' },
    })
    expect(reply.statusCode).toBe(400)
    expect(reply.body).toContain('POST /api/slots/acquire')
  })
})
