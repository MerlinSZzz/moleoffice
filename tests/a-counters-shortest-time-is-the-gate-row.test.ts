// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE OFFICE'S SHORTEST TIME BETWEEN TWO FIRINGS IS THE COUNTER-SPACING GATE ROW.
 *
 * A counter's creator may set a longer time for it and never a shorter one. The shortest time is read
 * from its row each time it is needed, so a person may change it while the server runs.
 *
 * EVERY COUNTER, AGENT AND VALUE HERE IS MADE UP. No worker or check tool starts.
 */

import type { FastifyInstance } from 'fastify'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { apiApp, freshDb, type TestDb } from './helpers.ts'

let t: TestDb
let app: FastifyInstance

const START = new Date('2026-09-23T09:00:00')

const asPerson = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id,
}
const asKeeper = { ...asPerson, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': 'counter-keeper' }

/** A counter the test may file, with every value made up. */
const A_COUNTER = {
  title: 'Made-up trials',
  counts: 'Made-up trials run on the gripper.',
  triggers: [{ kind: 'count', n: 1 }],
  action: { kind: 'task', title: 'Look at the made-up trials' },
}

/** File a counter through its own door, and hand back the whole answer. */
async function file(body: Record<string, unknown>): Promise<{ statusCode: number; body: string }> {
  const r = await app.inject({ method: 'POST', url: '/api/counters', headers: asKeeper, payload: body })
  return { statusCode: r.statusCode, body: r.body }
}

/** File a counter that must be accepted, and hand back its id. */
async function aCounter(body: Record<string, unknown>): Promise<string> {
  const r = await file(body)
  expect(r.statusCode, r.body).toBe(201)
  return (JSON.parse(r.body) as { counter: { id: string } }).counter.id
}

/** Add to a counter through its own door, and hand back what the door said. */
async function add(id: string, because: string): Promise<{
  counter: { count: number }
  fired: { seq: number } | null
  heldBack: { because: string; count: number } | null
}> {
  const r = await app.inject({ method: 'POST', url: `/api/counters/${id}/add`, headers: asKeeper, payload: { by: 1, because } })
  expect(r.statusCode, r.body).toBe(201)
  return JSON.parse(r.body) as never
}

/** One counter as its own door reads it back. */
async function read(id: string): Promise<{ counter: { atMostOnceEvery: number } }> {
  const r = await app.inject({ method: 'GET', url: `/api/counters/${id}`, headers: asPerson })
  expect(r.statusCode, r.body).toBe(200)
  return JSON.parse(r.body) as never
}

/** The count of the counter-spacing gate, or undefined when nothing has counted it. */
function count(): { would_stop: number; stopped: number; reminded: number } | undefined {
  return t.client.sqlite
    .prepare("SELECT would_stop, stopped, reminded FROM gate_counts WHERE gate = 'counter-spacing'")
    .get() as { would_stop: number; stopped: number; reminded: number } | undefined
}

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  const r = await app.inject({
    method: 'POST',
    url: '/api/agents/started',
    headers: asPerson,
    payload: { handle: 'counter-keeper', name: 'Synthetic counter keeper' },
  })
  expect(r.statusCode, r.body).toBe(201)
}, 60_000)

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(START)
  vi.stubEnv('MOLE_OFFICE_COUNTER_SPACING_MINUTES', '30')
  t.client.sqlite.prepare("DELETE FROM gate_counts WHERE gate = 'counter-spacing'").run()
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.useRealTimers()
})

afterAll(async () => {
  await app?.close()
  t?.close()
})

describe("a counter's shortest time is the counter-spacing row", () => {
  it('refuses a limit below the row, naming the row and Gates, and makes a longer one', async () => {
    vi.stubEnv('MOLE_OFFICE_COUNTER_SPACING_MINUTES', '60')
    const refused = await file({ ...A_COUNTER, atMostOnceEvery: 45 })
    expect(refused.statusCode, refused.body).toBe(400)
    const error = (JSON.parse(refused.body) as { error: string }).error
    expect(error, 'the refusal does not name the row number').toContain('at most once every 60 minutes')
    expect(error, 'the refusal does not say where the number is changed').toContain('Gates')
    expect(error, 'the refusal does not name the shorter time it was asked for').toContain('once every 45')
    expect(error).toContain('Nothing was written.')

    const made = await aCounter({ ...A_COUNTER, title: 'Made-up trials with a longer limit', atMostOnceEvery: 90 })
    expect((await read(made)).counter.atMostOnceEvery).toBe(90)
  })

  it('stores the row when a counter names no limit, with the row at 60', async () => {
    vi.stubEnv('MOLE_OFFICE_COUNTER_SPACING_MINUTES', '60')
    const id = await aCounter({ ...A_COUNTER, title: 'Made-up trials with the row as its limit' })
    expect((await read(id)).counter.atMostOnceEvery).toBe(60)
  })

  it('fires, then holds a later firing back by the row once it is raised, and counts it once', async () => {
    const id = await aCounter({ ...A_COUNTER, title: 'Made-up trials at the shortest time' })
    const first = await add(id, 'The first made-up trial.')
    expect(first.fired, 'the first made-up trial did not fire').not.toBeNull()

    vi.setSystemTime(new Date('2026-09-23T09:40:00'))
    vi.stubEnv('MOLE_OFFICE_COUNTER_SPACING_MINUTES', '60')
    const held = await add(id, 'A made-up trial forty minutes after the firing.')
    expect(held.fired, 'it fired inside the raised row').toBeNull()
    expect(held.heldBack, 'nothing was written to say the firing was held back').not.toBeNull()
    expect(held.heldBack?.because, 'the held-back row does not name the raised row').toContain('at most once every 60 minutes')
    expect(count()).toEqual({ would_stop: 1, stopped: 0, reminded: 0 })

    vi.setSystemTime(new Date('2026-09-23T09:41:00'))
    const again = await add(id, 'Another made-up trial in the same held spell.')
    expect(again.heldBack, 'a second held-back row for one held spell').toBeNull()
    expect(count(), 'the second trigger in the same spell counted the gate again').toEqual({ would_stop: 1, stopped: 0, reminded: 0 })
  })

  it('does not count a firing held back only by the limit its creator chose', async () => {
    const id = await aCounter({ ...A_COUNTER, title: 'Made-up trials with their own longer limit', atMostOnceEvery: 120 })
    const first = await add(id, 'The first made-up trial of the longer limit.')
    expect(first.fired).not.toBeNull()

    vi.setSystemTime(new Date('2026-09-23T09:40:00'))
    const held = await add(id, 'A made-up trial forty minutes later.')
    expect(held.fired, 'it fired inside its own limit').toBeNull()
    expect(held.heldBack?.because, 'the held-back row does not name the counter’s own limit').toContain('at most once every 120 minutes')
    expect(count(), 'a firing held back by its own limit was counted as this gate').toBeUndefined()
  })
})
