// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE RUNTIME PAGE SHOWS WHAT THE LAST STARTS COST, AGAINST THE PERSON'S CEILING, AND WHAT EACH STEP COST.
 *
 * `tests/absence-weight.test.ts` proves an unmeasured start in RuntimePage.tsx is
 * drawn through `Absence` rather than as a bare sentence. This file proves the rest: that
 * `GET /api/runtime` really carries the panel's data, wired to the ceiling in
 * `src/shared/start-cost.ts` and to the same `startCostOfSession` the fixture tests drive directly,
 * for a green start, a red one and one nobody measured, all in the same read — and that a measured
 * start carries its step table, which is what the panel draws beside the two numbers.
 */
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { RuntimeRecord } from '../src/shared/runtime.ts'
import { START_COST_CEILING, START_STEPS } from '../src/shared/start-cost.ts'
import { localStamp } from '../src/shared/time.ts'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { aKnownStart } from './start-cost-fixtures.ts'

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

async function runtime(): Promise<RuntimeRecord> {
  const reply = await app.inject({ method: 'GET', url: '/api/runtime' })
  expect(reply.statusCode, reply.body).toBe(200)
  return reply.json() as RuntimeRecord
}

describe('GET /api/runtime carries what the last starts cost', () => {
  it('reads the same ceiling every other file reads, and rows for a green, a red and an unmeasured start', async () => {
    const green = aKnownStart(t, { inputTokens: 10 })
    const red = aKnownStart(t, { inputTokens: 20_000 })
    const unmeasured = aKnownStart(t, { withReceipt: false })

    const read = await runtime()

    expect(read.starts.ceiling).toEqual(START_COST_CEILING)

    const row = (sessionId: string) => {
      const found = read.starts.recent.find((r) => r.sessionId === sessionId)
      expect(found, `no row for session ${sessionId}`).toBeDefined()
      return found!
    }

    const greenRow = row(green.sessionId)
    expect(greenRow.cost.measured).toBe(true)
    if (greenRow.cost.measured) expect(greenRow.cost.over).toEqual([])

    const redRow = row(red.sessionId)
    expect(redRow.cost.measured).toBe(true)
    if (redRow.cost.measured) expect(redRow.cost.over).toContain('tokens')

    const unmeasuredRow = row(unmeasured.sessionId)
    expect(unmeasuredRow.cost.measured).toBe(false)
    if (!unmeasuredRow.cost.measured) expect(unmeasuredRow.cost.why.length).toBeGreaterThan(0)

    expect(read.starts.overCeilingCount).toBeGreaterThanOrEqual(1)
    expect(read.starts.unmeasuredCount).toBeGreaterThanOrEqual(1)
  })

  it('carries every step of a measured start, so the panel has the step table to draw', async () => {
    const start = new Date(2026, 8, 14, 10, 0, 0).getTime()
    const at = (offsetMs: number): string => localStamp(new Date(start + offsetMs))
    const known = aKnownStart(t, {
      startedAtMs: start,
      windowMs: 4_000,
      calls: [{ offsetMs: 1_000, operation: 'project.onboarding' }],
    })
    const read = await runtime()
    const found = read.starts.recent.find((r) => r.sessionId === known.sessionId)
    expect(found, 'the measured start is on the panel').toBeDefined()
    expect(found!.cost.measured).toBe(true)
    if (!found!.cost.measured) return
    expect(found!.cost.steps.map((step) => step.name)).toEqual(START_STEPS.map((step) => step.name))
    const restoring = found!.cost.steps.find((step) => step.name === 'restoring')!
    expect(restoring.firstAt, 'the restoring read the office answered').toBe(at(1_000))
    const firstWrite = found!.cost.steps.find((step) => step.name === 'the first write')!
    expect(firstWrite.firstAt, 'the first write that ended the start').toBe(at(4_000))
  })

  it('looks at the most recent sessions and answers within the panel\'s own limit', async () => {
    for (let i = 0; i < 3; i += 1) aKnownStart(t, { inputTokens: 5 })
    const read = await runtime()
    expect(read.starts.recent.length).toBeGreaterThanOrEqual(3)
    expect(read.starts.recent.length).toBeLessThanOrEqual(20)
  })
})
