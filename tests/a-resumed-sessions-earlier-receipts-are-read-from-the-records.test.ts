// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A RESUMED SESSION'S EARLIER RECEIPTS ARE READ FROM THE RECORDS. Wave 13p round 30b, check 9jTDpL3ri5xJ.
 *
 * Round 30 counted each session's receipts once, as its newest figure minus its figure before the seven days. Its test
 * handed the reading a stand-in for the runs filed before the window, so the query that finds them and the wiring that
 * calls it were never run. This file runs both on a scratch database with real session records:
 *   - `theRunsOfSessionsFiledBefore` (src/server/lib/usage-receipts.ts) returns the runs of the named conversations filed
 *     before the moment, and no run filed after it, no run of another conversation and no deleted run;
 *   - `theWeekOfALogin` with no reader handed in (FROM_DISK_AND_RECORDS in src/server/lib/logins-week.ts) takes the
 *     earlier figure away, so a conversation resumed across rounds counts what it used inside the window.
 *
 * MUTATION PROOF, after a control run, each restored byte-identical; the round's report names the results.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { freshDb, type TestDb } from './helpers.ts'
import { localStamp } from '../src/shared/time.ts'
import { THE_LOGINS } from '../src/shared/logins-week.ts'

let t: TestDb
let receipts: typeof import('../src/server/lib/usage-receipts.ts')
let week: typeof import('../src/server/lib/logins-week.ts')

const DAY = 24 * 60 * 60 * 1000
const NOW = Date.now()
/** The start of the seven days the codex login reads, as theWeekOfALogin works it out from NOW. */
const WINDOW_FROM = NOW - 7 * DAY
const id: Record<string, string> = {}

/** One run of the codex tool, filed `daysAgo` days before NOW, naming `conversation` and costing `costUsd` so far. */
function aRun(name: string, daysAgo: number, conversation: string | null, costUsd: number): void {
  id[name] = t.api.createRecord({
    kind: 'session',
    title: `Synthetic run ${name}`,
    workspaceId: 'default',
    actor: { type: 'agent', id: 'synthetic-runner' },
    origin: 'fixture',
    data: { state: 'finished', adaptedTool: 'codex', ...(conversation === null ? {} : { providerSession: conversation }), usageReceipt: { costUsd } },
  }).id
  t.client.sqlite.prepare('UPDATE records SET created_at = ? WHERE id = ?').run(localStamp(new Date(NOW - daysAgo * DAY)), id[name])
}

beforeAll(async () => {
  t = await freshDb()
  receipts = await import('../src/server/lib/usage-receipts.ts')
  week = await import('../src/server/lib/logins-week.ts')
  // Conversation R, resumed across three rounds: 10.00 before the seven days, then 12.00 and 15.00 inside them.
  aRun('r1', 9, 'R', 10)
  aRun('r2', 3, 'R', 12)
  aRun('r3', 1, 'R', 15)
  // Conversation S, filed before the window only: never asked for, so never read.
  aRun('s1', 10, 'S', 40)
  // A deleted run of R before the window, with a higher figure: a deleted record is not read.
  aRun('r0', 8, 'R', 11)
  t.client.sqlite.prepare("UPDATE records SET deleted_at = created_at WHERE id = ?").run(id['r0'])
}, 120_000)

afterAll(() => {
  t.close()
})

describe('the runs of a session filed before the window', () => {
  it('are the named conversation’s runs filed before the moment, and nothing else', () => {
    const found = receipts.theRunsOfSessionsFiledBefore(['R'], WINDOW_FROM).map((one) => one.id)
    expect(found).toEqual([id['r1']])
  })

  it('are read for each conversation named, and none for an empty list', () => {
    const found = receipts.theRunsOfSessionsFiledBefore(['R', 'S'], WINDOW_FROM).map((one) => one.id).sort()
    expect(found).toEqual([id['r1'], id['s1']].sort())
    expect(receipts.theRunsOfSessionsFiledBefore([], WINDOW_FROM)).toEqual([])
  })
})

describe('the week reads them through its own wiring', () => {
  it('counts a resumed conversation as its newest figure minus its figure before the seven days', () => {
    const codex = THE_LOGINS.find((one) => one.login === 'codex')!
    // No reader is handed in: this is the path the inbox and the agent page take.
    const reading = week.theWeekOfALogin(codex, NOW)
    if (reading.readFrom !== 'receipts') throw new Error(`codex is read from ${reading.readFrom}, not from receipts.`)
    expect(reading.receipts).toMatchObject({ runs: 2, costGivenBy: 2, sessions: 1, runsWithNoSession: 0, sessionsWhoseFigureFell: 0 })
    expect(reading.usd).toBeCloseTo(5, 9)
    expect(reading.says).toContain('5.00 US dollars over 1 session.')
  })
})
