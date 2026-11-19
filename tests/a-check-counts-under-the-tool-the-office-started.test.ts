// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE USAGE PAGE COUNTS A CHECK UNDER THE TOOL ITS RUN DECLARED, NOT UNDER THE RUNTIME ITS RECEIPT NAMES.
 *
 * Problem Ev1f_CZ6roye, and the secretary's answer vFGUngaLB98_ of 25 September 2026. A check's session
 * record says `runtime: 'inspection-tool'`, and its receipt says `runtime: 'claude-code'`, because
 * the check ran Claude. The runtime row used to read the receipt first, so every check with a
 * receipt was counted under claude-code: on the live office it read "153 runs, 153 missing" while
 * 135 checks had a receipt.
 *
 * Since problem uh6-H72Zik9H the runtime row counts the tool a run declared,
 * `adaptedTool`, and nothing else, as the calls split does. A check declares no adapted tool, so it
 * is in the "not declared" row, with its receipt counted there; it is still never counted under
 * claude-code. The receipt's runtime is not read, for a check or for any other run.
 *
 * MUTATION: read the receipt's runtime where nothing is declared (`byRuntime: isAgentRuntime(declared) ?
 * declared : word(receipt?.runtime)` in src/server/lib/usage-receipts.ts) → both cases below red.
 *
 * The runs here are made up by this test. No model ran and no check ran.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { freshDb, type TestDb } from './helpers.ts'
import type { UsageReceipt } from '../src/shared/usage-receipts.ts'

type Summation = typeof import('../src/server/lib/usage-receipts.ts').receiptsFromRuns

/** What a check's receipt says: the check ran Claude. */
const CLAUDE_RECEIPT: UsageReceipt = { runtime: 'claude-code', model: 'claude-sonnet-5', inputTokens: 22, outputTokens: 9457, inputIncludesCached: false }

let t: TestDb
let receiptsFromRuns: Summation

beforeAll(async () => {
  // The summation module opens the database when it is imported, so the test database is named first.
  t = await freshDb()
  receiptsFromRuns = (await import('../src/server/lib/usage-receipts.ts')).receiptsFromRuns
})

afterAll(() => {
  t?.close()
})

describe('the runtime row of the usage page', () => {
  it('counts a check that carries a Claude receipt under "not declared", with no receipt missing', () => {
    const read = receiptsFromRuns([{ id: 'check-1', data: { runtime: 'inspection-tool', usageReceipt: CLAUDE_RECEIPT } }], { state: 'none' })
    const row = read.byRuntime.find((one) => one.name === null)
    expect(row?.runs).toEqual(['check-1'])
    expect(row?.missingReceipts).toBe(0)
    expect(row?.values.outputTokens).toBe(9457)
    expect(read.byRuntime.find((one) => one.name === 'claude-code')).toBeUndefined()
    expect(read.byRuntime.find((one) => one.name === 'inspection-tool'), 'the free word was counted as a tool').toBeUndefined()
    // The model row still says the check ran Claude's model.
    expect(read.byModel.find((one) => one.name === 'claude-sonnet-5')?.runs).toEqual(['check-1'])
  })

  it('counts a run by the tool it declared, and never by the receipt runtime', () => {
    const read = receiptsFromRuns(
      [
        { id: 'run-1', data: { usageReceipt: CLAUDE_RECEIPT } },
        { id: 'run-2', data: { runtime: 'codex-cli', adaptedTool: 'codex', usageReceipt: CLAUDE_RECEIPT } },
      ],
      { state: 'none' },
    )
    expect(read.byRuntime.find((one) => one.name === 'claude-code'), 'the receipt runtime was counted as the declared tool').toBeUndefined()
    expect(read.byRuntime.find((one) => one.name === null)?.runs).toEqual(['run-1'])
    expect(read.byRuntime.find((one) => one.name === 'codex')?.runs).toEqual(['run-2'])
  })
})
