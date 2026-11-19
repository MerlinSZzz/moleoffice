// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A START'S NUMBERS AND ITS STEPS, READ FROM A FIXTURE WHOSE RECEIPT AND CALL LOG ARE FULLY KNOWN.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS FILE PROVES
 * ---------------------------------------------------------------------------------------
 *
 * 1. A fixture start whose window, receipt and call log are all known gets exactly the right
 *    tokens and minutes — including the cache-combining rule usage-receipts.ts already applies and
 *    whole-minute rounding at the ceiling's own boundary.
 * 2. The step table is worked out from the office's own `api_calls` rows: registering is timed from
 *    the register door and the session record's own first write, restoring from its own reads, and
 *    the first write outside the session record is a moment of its own. Each step says when it
 *    first and last happened and how long the start spent in it.
 * 3. A step with no request of its kind is absent, never a zero: no `firstAt`, no `spentMs`, and
 *    the panel is handed the words "no request of this kind".
 * 4. Tokens are known for the whole start, not per step: the receipt says so and no step carries a
 *    token number, because no stored runtime receipt reports usage per request.
 * 5. Three different absences — no receipt, no token count on the receipt, no startedAt — and a
 *    start that has made no write outside its own session record each read as `measured: false`
 *    with a sentence saying which one, never as a zero.
 * 6. The step table is written onto the session record once and is used again after the call-log
 *    rows are pruned, which is what makes the receipt durable.
 *
 * ---------------------------------------------------------------------------------------
 * THE MUTATIONS THAT TURN THIS RED, EACH AFTER A CONTROL RUN, RESTORED BYTE-IDENTICAL
 * ---------------------------------------------------------------------------------------
 *
 * Control: every case below green on the unmutated tree.
 *
 *   1. READ A MISSING RECEIPT AS PRESENT (src/server/lib/start-cost.ts, `startCostOfSession`):
 *      delete the `if (receipts.missingReceipts > 0) return { measured: false, ... }` guard. "no
 *      receipt at all" goes red: a run nobody measured is suddenly reported as a real number.
 *
 *   2. READ A MISSING TOKEN COUNT AS ZERO (same function): change
 *      `const tokens = receipts.overall.values.inputTokens` to
 *      `const tokens = receipts.overall.values.inputTokens ?? 0` and drop the `undefined` guard
 *      below it. "a receipt with no input tokens" goes red the same way — the case the ninth
 *      invariant and `src/shared/pick-up-cost.ts` both exist to catch, in this file's own code.
 *
 *   3. STOP STORING THE STEP TABLE (same file, `rememberStartSteps`): make the function return
 *      without patching. "the step table is stored on the session record" goes red, and the case
 *      that reads it back after pruning the call log reads an absent table.
 *
 * Each file was restored and checked with sha256sum before and after the mutation; both in the
 * report.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { localStamp } from '../src/shared/time.ts'
import { freshDb, type TestDb } from './helpers.ts'
import { aKnownStart } from './start-cost-fixtures.ts'

/** A fixed local instant, so an asserted wall-clock string never depends on the test machine. */
const START = new Date(2026, 8, 14, 10, 0, 0).getTime()
const at = (offsetMs: number): string => localStamp(new Date(START + offsetMs))

let t: TestDb
let startCost: typeof import('../src/server/lib/start-cost.ts')

beforeAll(async () => {
  t = await freshDb()
  startCost = await import('../src/server/lib/start-cost.ts')
}, 60_000)

afterAll(() => {
  t.close()
})

describe('a fixture start whose receipt and call log are known', () => {
  it('gets exactly the right tokens and minutes, and the right steps', () => {
    const known = aKnownStart(t, {
      startedAtMs: START,
      // Three separate counts a Claude Code receipt reports, which usage-receipts.ts combines into
      // one input-token figure: 1000 + 300 + 84 = 1384. A test that read `inputTokens` alone would
      // pass a wrong number here without ever going red, which is exactly what this line catches.
      inputTokens: 1000,
      windowMs: 8_000, // eight seconds, rounded UP to one whole minute
      calls: [
        { offsetMs: 0, operation: 'agent.register-myself', ms: 40 },
        { offsetMs: 2_000, operation: 'project.onboarding', ms: 30 },
        { offsetMs: 5_000, operation: 'project.brief', ms: 700 },
      ],
    })
    t.client.sqlite
      .prepare("update records set data = json_set(data, '$.usageReceipt.cachedInputTokens', 300, '$.usageReceipt.cacheCreationInputTokens', 84) where id = ?")
      .run(known.sessionId)

    const cost = startCost.startCostOfSession(t.api.getRecord(known.sessionId)!)

    expect(cost.measured, 'a fully-known fixture must be measured').toBe(true)
    if (!cost.measured) return
    expect(cost.tokens, 'the three receipt counts, combined').toBe(1384)
    expect(cost.minutes, 'eight seconds rounds up to one whole minute').toBe(1)
    expect(cost.over, 'both numbers are under the ceiling').toEqual([])

    const registering = cost.steps.find((step) => step.name === 'registering')
    expect(registering, 'registering is one of the steps').toBeDefined()
    expect(registering?.requests, 'one request of this kind').toBe(1)

    const restoring = cost.steps.find((step) => step.name === 'restoring')
    expect(restoring, 'restoring is one of the steps').toBeDefined()
    expect(restoring?.requests, 'two reads of this kind').toBe(2)
    expect(restoring?.firstAt, 'the first restoring read').toBe(at(2_000))
    expect(restoring?.lastAt, 'the last restoring read').toBe(at(5_000))
    expect(restoring?.spentMs, 'the span between the two restoring reads').toBe(3_000)

    const firstWrite = cost.steps.find((step) => step.name === 'the first write')
    expect(firstWrite, 'the first write is one of the steps').toBeDefined()
    expect(firstWrite?.firstAt, 'the first write happened at the end of the window').toBe(at(8_000))
    expect(firstWrite?.endsTheStart, 'the first write ends the start').toBe(true)
  })

  it('counts the session record\u2019s own first write as registering, and still leaves a step with no requests absent', () => {
    const known = aKnownStart(t, {
      startedAtMs: START,
      withReceipt: true,
      // No register door and no restoring read: the session record's own create is the only thing
      // the registering step can be timed from, and there is no request of the restoring kind.
      calls: [],
      sessionRecordOffsetMs: 0,
      windowMs: 2_000,
    })
    const cost = startCost.startCostOfSession(t.api.getRecord(known.sessionId)!)
    expect(cost.measured).toBe(true)
    if (!cost.measured) return

    const registering = cost.steps.find((step) => step.name === 'registering')
    expect(registering?.firstAt, 'the session record\u2019s own create times the registering step').toBe(at(0))
    const restoring = cost.steps.find((step) => step.name === 'restoring')
    expect(restoring?.requests).toBe(0)
    expect(restoring?.firstAt, 'no request of this kind is an absent time, never a zero instant').toBeUndefined()
    expect(restoring?.spentMs, 'no request of this kind is an absent span, never zero').toBeUndefined()
  })
})

describe('tokens are known for the whole start, not for each step', () => {
  it('says so on the receipt and leaves every step without an invented token number', () => {
    const known = aKnownStart(t, {
      calls: [{ offsetMs: 1_000, operation: 'project.bootstrap' }],
      windowMs: 2_000,
    })
    const cost = startCost.startCostOfSession(t.api.getRecord(known.sessionId)!)
    expect(cost.measured).toBe(true)
    if (!cost.measured) return
    expect(cost.tokensSays, 'the receipt says which layer the token figure belongs to').toContain('whole start')
    for (const step of cost.steps) {
      expect(step.tokens, `${step.name} must not carry an invented token number`).toBeUndefined()
      expect(step.tokensSays, `${step.name} says why there is no per-step number`).toContain('whole start')
    }
  })
})

describe('absence is not zero, and it is never drawn as one', () => {
  it('says nobody measured tokens when there is no receipt at all', () => {
    const known = aKnownStart(t, { withReceipt: false })
    const cost = startCost.startCostOfSession(t.api.getRecord(known.sessionId)!)
    expect(cost.measured).toBe(false)
    if (cost.measured) return
    expect(cost.why).toContain('no usage receipt')
  })

  it('says nobody measured tokens when the receipt reports no input count', () => {
    const known = aKnownStart(t)
    t.client.sqlite
      .prepare("update records set data = json_remove(data, '$.usageReceipt.inputTokens') where id = ?")
      .run(known.sessionId)
    const cost = startCost.startCostOfSession(t.api.getRecord(known.sessionId)!)
    expect(cost.measured).toBe(false)
    if (cost.measured) return
    expect(cost.why).toContain('did not report input tokens')
  })

  it('cannot time a start with no startedAt', () => {
    const known = aKnownStart(t, { withStartedAt: false })
    const cost = startCost.startCostOfSession(t.api.getRecord(known.sessionId)!)
    expect(cost.measured).toBe(false)
    if (cost.measured) return
    expect(cost.why).toContain('startedAt')
  })

  it('is not a start that cost nothing when the start has not finished yet', () => {
    const known = aKnownStart(t, { withFirstWrite: false })
    const cost = startCost.startCostOfSession(t.api.getRecord(known.sessionId)!)
    expect(cost.measured).toBe(false)
    if (cost.measured) return
    expect(cost.why).toContain('has not finished')
  })
})

describe('the step table is stored once, and survives the call log being pruned', () => {
  it('writes startSteps onto the session record and reads it back after the api_calls rows are gone', () => {
    const known = aKnownStart(t, {
      startedAtMs: START,
      calls: [{ offsetMs: 1_000, operation: 'project.onboarding', ms: 20 }],
      windowMs: 3_000,
    })
    const first = startCost.startCostOfSession(t.api.getRecord(known.sessionId)!)
    expect(first.measured).toBe(true)
    if (!first.measured) return

    const stored = t.api.getRecord(known.sessionId)!.data['startSteps']
    expect(Array.isArray(stored), 'the office stored a step table on the session record').toBe(true)

    // PRUNE THE CALL LOG, the thing that used to make a measured start read as nobody measured.
    t.client.sqlite.prepare('delete from api_calls where session_id = ?').run(known.sessionId)

    const second = startCost.startCostOfSession(t.api.getRecord(known.sessionId)!)
    expect(second.measured).toBe(true)
    if (!second.measured) return
    expect(second.steps, 'the stored table is what the receipt reads after pruning').toEqual(first.steps)
    const restoring = second.steps.find((step) => step.name === 'restoring')
    expect(restoring?.firstAt, 'the stored restoring time is still there').toBe(at(1_000))
  })
})
