// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A NEW ASK FOR A BROWSER TEST SEAT THAT HAS TO WAIT IS COUNTED, AND NOTHING ELSE IS.
 *
 * Every session, process and moment here is made up. No real process is read and nothing is
 * signalled: the office is handed a process table this test controls.
 *
 * The row `browser-test-seats` is counted in `acquireSlot` when a new ask is put in line in the
 * browser-tests pool. An ask again by the same group is not a new ask, and an ask put in line in the
 * full-suite pool is counted on that pool's own row, `whole-suite-seats`, so neither counts here.
 * tests/a-held-seat-and-the-whole-suites-seats-are-gate-rows.test.ts proves the full-suite row.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
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

beforeEach(async () => {
  seatsBefore = process.env[BROWSER_SEATS]
  process.env[BROWSER_SEATS] = '1'
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
  if (seatsBefore === undefined) delete process.env[BROWSER_SEATS]
  else process.env[BROWSER_SEATS] = seatsBefore
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

/** The made-up gate row as the table holds it, read past every door. */
function count(): { would_stop: number; stopped: number; reminded: number } | undefined {
  return h.t.client.sqlite
    .prepare("SELECT would_stop, stopped, reminded FROM gate_counts WHERE gate = 'browser-test-seats'")
    .get() as { would_stop: number; stopped: number; reminded: number } | undefined
}

describe('a new browser test ask that waits is counted once', () => {
  it('grants the first ask and counts nothing', async () => {
    start(100, 100, 'vitest run tests/some-page.test.ts')
    const first = slotOf(await acquire(session(), { pool: 'browser-tests', pid: 100 }))
    expect([first.state, first.seat]).toEqual(['granted', 1])
    expect(count()).toBeUndefined()
  })

  it('counts the second group in line, and not the same group asking again', async () => {
    start(100, 100, 'vitest run tests/some-page.test.ts')
    start(200, 200, 'vitest run tests/another-page.test.ts')
    slotOf(await acquire(session(), { pool: 'browser-tests', pid: 100 }))
    const waiting = session()
    const second = slotOf(await acquire(waiting, { pool: 'browser-tests', pid: 200 }))
    expect([second.state, second.position]).toEqual(['queued', 1])
    expect(count()).toEqual({ would_stop: 1, stopped: 0, reminded: 0 })

    const again = await acquire(waiting, { pool: 'browser-tests', pid: 200 })
    expect((again.json() as { asked: string }).asked).toBe('again')
    expect(count()).toEqual({ would_stop: 1, stopped: 0, reminded: 0 })
  })

  it('counts nothing on this row when the full-suite pool puts a second group in line', async () => {
    start(100, 100, 'npm test')
    start(200, 200, 'npm test')
    slotOf(await acquire(session(), { pool: 'full-suite', pid: 100 }))
    const second = slotOf(await acquire(session(), { pool: 'full-suite', pid: 200 }))
    expect([second.state, second.position]).toEqual(['queued', 1])
    expect(count()).toBeUndefined()
  })
})
