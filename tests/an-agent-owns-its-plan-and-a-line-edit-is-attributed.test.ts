// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * AN AGENT'S PLAN IS A PLAN IT OWNS, AND A LINE IT CHANGES CARRIES ITS OWN TIMESTAMP.
 *
 * Criterion P3 of design/planning/ACCEPTANCE.md: "Agents plan and replan. An agent's plan is a plan
 * it owns: its parts as lines, a window per stretch of days, and a trajectory when the order
 * matters. Reordering, adding or dropping a line is a revision with a reason and a time; the page
 * shows what was planned against what was done. A sudden task is a line added with its reason (the
 * README: asked on 4 September). Hours stay the person's: an agent proposes, never commits."
 *
 * ---------------------------------------------------------------------------------------
 * THE "REASON" CLAUSE IS BUILT NOW, IN ITS OWN FILE
 * ---------------------------------------------------------------------------------------
 *
 * This file used to say the reason clause was not built: `linePatch` in src/server/api/plans.ts had
 * fields for `text`, `remark`, `recordId` and `replacing` — no `reason` — and there was no revision
 * table. That stopped being true with migration 0170 and a decision of the secretary's: adding,
 * reordering and dropping a plan line each require a reason and keep a `plan_line_revisions` row,
 * read back through GET /api/plans/:id/lines/:lineId/revisions. That half of P3 is proved in
 * tests/a-plan-line-change-keeps-its-reason.test.ts, in its own file because it is its own table.
 *
 * WHAT THIS FILE STILL PROVES, AND WHY IT IS STILL HERE. The two facts below are about OWNERSHIP and
 * ATTRIBUTION, and neither is the reason clause: an agent owns the plan it creates, and a line's
 * edit is timestamped and attributed to whoever made it. They stay pinned here.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS FILE PINS
 * ---------------------------------------------------------------------------------------
 *
 *   1. A PLAN AN AGENT CREATES IS STAMPED AS THAT AGENT'S: `createdBy` on the reply names the
 *      actor, not "the person" and not nobody.
 *   2. A LINE'S EDIT IS ATTRIBUTED TO WHOEVER MADE IT, EVEN WHEN THAT IS A DIFFERENT AGENT FROM THE
 *      ONE THAT WROTE THE PLAN: `updatedBy` after the edit names the editor, and `updatedAt` is a
 *      real, present timestamp — its own time, distinct from having no time at all.
 *
 * Proved by mutation with a control run of this file first: in src/server/lib/plans.ts's
 * `patchLine`, changing `updatedBy: stampOf(actor)` to the constant `'nobody'` turns case 2 red —
 * the edit is no longer attributed to whoever made it — restored afterwards.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { apiApp, freshDb, type TestDb } from './helpers.ts'

let t: TestDb
let app: FastifyInstance

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
}, 60_000)

afterAll(async () => {
  await app.close()
  t.close()
})

function asAgent(id: string): Record<string, string> {
  return { 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': id }
}
async function post(url: string, payload: unknown, agent: string): Promise<{ status: number; body: any }> {
  const res = await app.inject({ method: 'POST', url, payload: payload as object, headers: asAgent(agent) })
  return { status: res.statusCode, body: res.json() }
}
async function patch(url: string, payload: unknown, agent: string): Promise<{ status: number; body: any }> {
  const res = await app.inject({ method: 'PATCH', url, payload: payload as object, headers: asAgent(agent) })
  return { status: res.statusCode, body: res.json() }
}

describe('an agent owns the plan it creates, and a line it changes is attributed to it', () => {
  it('stamps a plan an agent creates as that agent\'s own', async () => {
    const made = await post('/api/plans', { title: 'An agent\'s own plan' }, 'claude-code/tester')
    expect(made.status, JSON.stringify(made.body)).toBe(201)
    expect(made.body.plan.createdBy, 'the plan does not say which agent made it').toBe('agent:claude-code/tester')
  })

  it('attributes a line\'s change to whoever made it, with a real timestamp', async () => {
    const made = await post('/api/plans', { title: 'A plan with one line' }, 'claude-code/tester')
    const planId = made.body.plan.id as string

    const line = await post(
      `/api/plans/${planId}/lines`,
      { text: 'Do the first thing', reason: 'the first thing in this agent plan' },
      'claude-code/tester',
    )
    expect(line.status, JSON.stringify(line.body)).toBe(201)
    const lineId = line.body.line.id as string
    expect(line.body.line.updatedBy).toBe('agent:claude-code/tester')
    expect(typeof line.body.line.updatedAt).toBe('string')
    expect(line.body.line.updatedAt.length).toBeGreaterThan(0)

    // A DIFFERENT AGENT MAKES THE CHANGE, so attribution can only be right if it is read off THIS
    // write and not carried over from whoever made the line.
    const changed = await patch(
      `/api/plans/${planId}/lines/${lineId}`,
      { text: 'Do the first thing, revised' },
      'claude-code/reviewer',
    )
    expect(changed.status, JSON.stringify(changed.body)).toBe(200)
    expect(changed.body.line.updatedBy, 'the edit is not attributed to the agent that made it').toBe('agent:claude-code/reviewer')
    expect(typeof changed.body.line.updatedAt).toBe('string')
    expect(changed.body.line.updatedAt.length).toBeGreaterThan(0)
  })
})
