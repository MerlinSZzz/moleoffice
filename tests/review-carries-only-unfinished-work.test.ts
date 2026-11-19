// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE SCHEDULE'S REVIEW CARRIES ONLY WORK THAT HAS NOT FINISHED (problem tgxPBBSdFhK7).
 *
 * The review of a period lists, as carried, the work that had time in it and is still not done. It
 * named two finished states by hand, `done` and `fixed`, so a fulfilled obligation and a problem
 * that was worked around stayed carried, and the review told the person finished work was still to
 * do. It now asks progressOf, the one table of state meanings, whether the work has finished.
 *
 * Made-up records in a fresh test database; nothing here is a real person's work.
 */

import Fastify, { type FastifyInstance } from 'fastify'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { AGENT, freshDb, type TestDb } from './helpers.ts'

let t: TestDb
let app: FastifyInstance

beforeEach(async () => {
  t = await freshDb()
  const { recordRoutes } = await import('../src/server/api/records.ts')
  const { planningRoutes } = await import('../src/server/api/planning.ts')
  const { installErrorHandling } = await import('../src/server/lib/http.ts')
  app = Fastify()
  installErrorHandling(app)
  await app.register(recordRoutes, { prefix: '/api' })
  await app.register(planningRoutes, { prefix: '/api' })
  await app.ready()
})

afterEach(async () => {
  await app.close()
  t.close()
})

function file(kind: string, title: string, data: Record<string, unknown>): string {
  return t.api.createRecord({ workspaceId: 'default', kind: kind as never, title, data, actor: AGENT }).id
}

async function plan(id: string): Promise<void> {
  const res = await app.inject({
    method: 'POST',
    url: '/api/planning/allocations',
    payload: { horizon: 'week', period: '2026-W36', recordId: id, plannedHours: 2 },
  })
  expect(res.statusCode, res.body).toBe(201)
}

describe('the review of a period carries only work that has not finished', () => {
  it('leaves out a fulfilled obligation and a worked-around problem, and keeps an open task', async () => {
    const promise = file('obligation', 'Send the tide tables to Harbour Survey', {
      state: 'fulfilled',
      done: true,
      owedTo: 'Harbour Survey',
    })
    const problem = file('problem', 'The kiln log drops its last line', { state: 'worked_around' })
    const open = file('task', 'Label the sample jars', { state: 'todo' })
    const finished = file('task', 'Order more jars', { state: 'done' })
    for (const id of [promise, problem, open, finished]) await plan(id)

    const res = await app.inject({ method: 'GET', url: '/api/planning/review/week/2026-W36' })
    expect(res.statusCode, res.body).toBe(200)
    const body = JSON.parse(res.body) as {
      counts: { allocations: number; carried: number }
      carried: { work: { id: string } | null }[]
    }
    expect(body.counts.allocations).toBe(4)
    const carriedIds = body.carried.map((e) => e.work?.id)
    expect(carriedIds, 'a fulfilled obligation was carried as work not done').not.toContain(promise)
    expect(carriedIds, 'a worked-around problem was carried as work not done').not.toContain(problem)
    expect(carriedIds).not.toContain(finished)
    expect(carriedIds).toEqual([open])
    expect(body.counts.carried).toBe(1)
  })
})
