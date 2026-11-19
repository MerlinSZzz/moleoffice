// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * AN AGENT'S WINDOW IS DRAWN BESIDE THE PERSON'S HOURS AND ENTERS NO TOTAL. Criterion P5.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS IS A SEPARATE TEST FROM tests/the-schedule-draws-agents-windows.test.ts
 * ---------------------------------------------------------------------------------------
 *
 * That file holds the drawing: the owner word, the second colour and the sums a pure function
 * returns. This one holds the ROUTE. It writes one allocation for a task, reads the week's total,
 * then writes an agent's window on the same task and reads the total again. The two readings must be
 * the same reply, and the number must be exactly what the allocation said, because P5's whole last
 * clause is that a window enters no total.
 *
 * ---------------------------------------------------------------------------------------
 * THE MUTATION
 * ---------------------------------------------------------------------------------------
 *
 *   api/planning.ts: `fitOf(load, …)` counts the windows overlapping the period
 *       → "the total is exactly the hours somebody wrote" goes red.
 */

import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { apiApp, freshDb, type TestDb } from './helpers.ts'

let db: TestDb
let app: FastifyInstance
let taskId = ''

const HUMAN = {
  'content-type': 'application/json',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id,
  'x-mole-office-workspace': 'default',
}
const AGENT = { ...HUMAN, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': 'perception' }

interface WeekReply {
  fit: { load: { plannedHours: number; allocations: number }; capacityHours: number | null }
}

async function getWeek(): Promise<WeekReply> {
  const res = await app.inject({ method: 'GET', url: '/api/planning/week/2026-W37' })
  expect(res.statusCode).toBe(200)
  return JSON.parse(res.body) as WeekReply
}

beforeAll(async () => {
  db = await freshDb()
  const built = await apiApp()
  app = built.app
  await app.ready()
  const made = await app.inject({
    method: 'POST',
    url: '/api/records',
    headers: HUMAN,
    payload: { kind: 'task', title: 'Reprint the jaw', data: { state: 'doing' } },
  })
  expect(made.statusCode).toBe(201)
  taskId = (JSON.parse(made.body) as { record: { id: string } }).record.id
  const alloc = await app.inject({
    method: 'POST',
    url: '/api/planning/allocations',
    headers: HUMAN,
    payload: { horizon: 'week', period: '2026-W37', recordId: taskId, plannedHours: 3 },
  })
  expect(alloc.statusCode).toBe(201)
})

afterAll(async () => {
  await app.close()
  db.close()
})

describe("an agent's window is beside the hours and in no total", () => {
  it('reads the same total before and after the window, and the number is what was written', async () => {
    const before = await getWeek()
    expect(before.fit.load.plannedHours).toBe(3)
    expect(before.fit.load.allocations).toBe(1)

    const placed = await app.inject({
      method: 'POST',
      url: '/api/planning/windows',
      headers: AGENT,
      payload: { recordId: taskId, startsOn: '2026-09-08', endsOn: '2026-09-10' },
    })
    expect(placed.statusCode).toBe(201)

    const after = await getWeek()
    expect(after.fit).toEqual(before.fit)

    // AND THE WINDOW ITSELF CARRIES NO HOURS, which is why it could not have entered one.
    const listed = await app.inject({ method: 'GET', url: '/api/planning/windows?from=2026-09-07&to=2026-09-13' })
    const body = JSON.parse(listed.body) as { windows: { window: Record<string, unknown> }[]; owners: Record<string, string> }
    expect(body.windows).toHaveLength(1)
    expect(Object.keys(body.windows[0]!.window)).not.toContain('plannedHours')
    expect(Object.keys(body.windows[0]!.window)).not.toContain('actualHours')
    // And the stamp that says whose it is reaches the wire, because P5's second colour needs it.
    expect(body.owners[body.windows[0]!.window['id'] as string]).toBe('agent:perception')
  })
})
