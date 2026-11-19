// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * OVER THE CEILING IS RED. UNDER IT IS GREEN. PROVED BY MOVING THE FIXTURE, NEVER THE CEILING.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS FILE PROVES
 * ---------------------------------------------------------------------------------------
 *
 * Three sessions, built by the same fixture helper `tests/start-cost-measured.test.ts` drives, whose
 * only difference from one another is the number that crosses one line: a plain start under both
 * ceiling numbers is green; a start whose tokens alone are over, whose minutes alone are over, and
 * one whose both are over, are each red on exactly the dimension that was moved. There is no
 * tool-round case any more: a decision retired that number. A test that still
 * moved it would be measuring a fact the office no longer keeps. `START_COST_CEILING` itself is read,
 * never edited, by every case here — the fixtures move, not the ceiling.
 *
 * ---------------------------------------------------------------------------------------
 * THE MUTATION THAT TURNS THIS RED, AFTER A CONTROL RUN, RESTORED BYTE-IDENTICAL
 * ---------------------------------------------------------------------------------------
 *
 * Control: every case below green on the unmutated tree.
 *
 *   DROP THE TOKENS COMPARISON (src/shared/start-cost.ts, `startCostOverage`): delete
 *   `if (tokens > ceiling.tokens) over.push('tokens')`. "a start over the ceiling on tokens alone"
 *   goes red, because a real 20,000-token start is suddenly reported as green.
 *
 * Restored and checked with sha256sum before and after the mutation; both in the report.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { START_COST_CEILING } from '../src/shared/start-cost.ts'
import { freshDb, type TestDb } from './helpers.ts'
import { aKnownStart } from './start-cost-fixtures.ts'

let t: TestDb
let startCost: typeof import('../src/server/lib/start-cost.ts')

beforeAll(async () => {
  t = await freshDb()
  startCost = await import('../src/server/lib/start-cost.ts')
}, 60_000)

afterAll(() => {
  t.close()
})

// Comfortably under both ceiling numbers, and shared by every case below except for the one
// dimension each case deliberately moves across its own line.
const UNDER = { inputTokens: 100, windowMs: 60_000 }

describe('a plain start under every number is green', () => {
  it('crosses neither line', () => {
    const known = aKnownStart(t, UNDER)
    const cost = startCost.startCostOfSession(t.api.getRecord(known.sessionId)!)
    expect(cost.measured).toBe(true)
    if (cost.measured) expect(cost.over).toEqual([])
  })
})

describe('a start over the ceiling on tokens alone', () => {
  it('is red on tokens and green on minutes', () => {
    expect(START_COST_CEILING.tokens, 'this fixture must really be over the person\'s tokens ceiling').toBeLessThan(20_000)
    const known = aKnownStart(t, { ...UNDER, inputTokens: 20_000 })
    const cost = startCost.startCostOfSession(t.api.getRecord(known.sessionId)!)
    expect(cost.measured).toBe(true)
    if (cost.measured) expect(cost.over).toEqual(['tokens'])
  })
})

describe('a start over the ceiling on minutes alone', () => {
  it('is red on minutes and green on tokens', () => {
    // 2 minutes 1 second, rounded up to 3 whole minutes — one whole minute over the person's ceiling of 2.
    const windowMs = 121_000
    expect(Math.ceil(windowMs / 60_000), 'this fixture must really be over the person\'s minutes ceiling').toBeGreaterThan(
      START_COST_CEILING.minutes,
    )
    const known = aKnownStart(t, { ...UNDER, windowMs })
    const cost = startCost.startCostOfSession(t.api.getRecord(known.sessionId)!)
    expect(cost.measured).toBe(true)
    if (cost.measured) expect(cost.over).toEqual(['minutes'])
  })
})

describe('a start over the ceiling on both at once', () => {
  it('names every dimension that is over, not just the first it finds', () => {
    const known = aKnownStart(t, { inputTokens: 20_000, windowMs: 121_000 })
    const cost = startCost.startCostOfSession(t.api.getRecord(known.sessionId)!)
    expect(cost.measured).toBe(true)
    if (cost.measured) expect(cost.over.sort()).toEqual(['minutes', 'tokens'])
  })
})

describe('exactly on the ceiling is still green, because the rule is "over", not "at or over"', () => {
  it('a start at exactly the tokens ceiling is not flagged', () => {
    const known = aKnownStart(t, { ...UNDER, inputTokens: START_COST_CEILING.tokens })
    const cost = startCost.startCostOfSession(t.api.getRecord(known.sessionId)!)
    expect(cost.measured).toBe(true)
    if (cost.measured) expect(cost.over).toEqual([])
  })
})
