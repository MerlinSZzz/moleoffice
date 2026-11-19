// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * PLANS AND THE SCHEDULE BELONG TO THE PERSON, ACROSS WORKSPACES.
 *
 * Criterion P8 of design/planning/ACCEPTANCE.md: "A person's plans, windows, allocations and
 * capacity ... are stored with the person, in the world the person calls home, and never inside a
 * workspace; a plan line may name work in any workspace of any world the person can reach; ... the
 * person's schedule moves with the person (their login) and shows, on one calendar, the work of
 * every workspace it names. Today the product already keeps plans outside workspaces and the
 * schedule per person; P8 keeps that line when worlds and sync arrive."
 *
 * WHAT THIS FILE MEASURED FIRST. The `allocations` table (src/server/db/schema.ts) has no
 * `workspace_id` column at all, and `GET /api/planning/:horizon/:period` reads them with
 * `allocationsIn(horizon, period)` — no workspace argument anywhere in that call. So the schedule
 * is not scoped by workspace today; this file proves that in the one way that matters to a reader:
 * an allocation made against work in one project reads back when asked from a different one.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS FILE PINS
 * ---------------------------------------------------------------------------------------
 *
 *   1. An allocation naming a task filed in workspace "planning-p8-a" is created.
 *   2. Reading the same period while sending `x-mole-office-workspace: planning-p8-b` (a second,
 *      unrelated workspace) still shows that allocation, with the task's own workspace named on it
 *      — the schedule is not the second workspace's and not filtered out of it.
 *
 * Proved by mutation with a control run of this file first: in
 * src/server/api/planning.ts's `GET /planning/:horizon/:period` handler, filtering `mine` down to
 * entries whose work is in the caller's own workspace (added for this proof only) turns this file's
 * case red — the allocation vanishes when read from workspace "planning-p8-b" — restored afterwards.
 */
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { apiApp, freshDb, type TestDb } from './helpers.ts'

let t: TestDb
let app: FastifyInstance

beforeEach(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
})
afterEach(async () => {
  await app.close()
  t.close()
})

function headers(workspace: string): Record<string, string> {
  return {
    'x-mole-office-actor-type': 'human',
    'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id,
    'x-mole-office-workspace': workspace,
  }
}
async function post(url: string, payload: unknown, workspace: string): Promise<{ status: number; body: any }> {
  const res = await app.inject({ method: 'POST', url, payload: payload as object, headers: headers(workspace) })
  return { status: res.statusCode, body: res.json() }
}
async function get(url: string, workspace: string): Promise<{ status: number; body: any }> {
  const res = await app.inject({ method: 'GET', url, headers: headers(workspace) })
  return { status: res.statusCode, body: res.json() }
}

describe('an allocation belongs to the person, and reads back from a second workspace', () => {
  it('an allocation made against work in one workspace shows up when read from another', async () => {
    const a = await post('/api/workspaces', { id: 'planning-p8-a', title: 'Planning P8, workspace A' }, 'default')
    expect(a.status, JSON.stringify(a.body)).toBe(201)
    const b = await post('/api/workspaces', { id: 'planning-p8-b', title: 'Planning P8, workspace B' }, 'default')
    expect(b.status, JSON.stringify(b.body)).toBe(201)

    const task = await post('/api/records', { kind: 'task', title: 'Work planned from workspace A' }, 'planning-p8-a')
    expect(task.status, JSON.stringify(task.body)).toBe(201)
    const taskId = task.body.record.id as string

    const period = '2026-W37'
    const allocated = await post(
      '/api/planning/allocations',
      { horizon: 'week', period, recordId: taskId, plannedHours: 4 },
      'planning-p8-a',
    )
    expect(allocated.status, JSON.stringify(allocated.body)).toBe(201)

    // READ FROM A DIFFERENT WORKSPACE ENTIRELY — never planning-p8-a.
    const read = await get(`/api/planning/week/${period}`, 'planning-p8-b')
    expect(read.status, JSON.stringify(read.body)).toBe(200)
    const entries = read.body.entries as { allocation: { recordId: string }; work: { id: string; workspaceId: string } | null }[]
    const mine = entries.find((one) => one.allocation.recordId === taskId)
    expect(mine, 'the allocation made from workspace A did not read back from workspace B').toBeDefined()
    expect(mine?.work?.workspaceId, 'the work\'s own project should still say "planning-p8-a"').toBe('planning-p8-a')
  })
})
