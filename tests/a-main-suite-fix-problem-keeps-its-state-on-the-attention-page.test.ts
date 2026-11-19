// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A PROBLEM WHOSE STATE LIVES ONLY IN ITS MAIN-SUITE FIX GETS THAT STATE ON THE ATTENTION PAGE.
 *
 * A problem filed for a red main suite may carry no `data.state`. Its state is then worked out from
 * `data.mainSuiteFix` (`readWorkState` in src/shared/work.ts): open while nothing has returned or fixed it,
 * fixed once a repair has landed and the suite is green again, worked around once a take-out has landed.
 * The attention page is drawn from `attentionNow` (src/server/lib/records.ts), which reads each record with
 * only the fields of `data` the rule reads (`THE_FIELDS_THE_ATTENTION_RULE_READS`, in
 * src/server/lib/records/reading.ts). That list did not name `mainSuiteFix`, so the rule saw such a problem
 * as one with no state at all: it was put among the records with no state word instead of on the list, and
 * a promise due when it finished could never come due.
 *
 * WHAT IS HELD, on made-up records only (the main-suite fix is the kind's own made-up example):
 *   - a main-suite-fix problem with no stored state and no outcome is on the attention list, with the state
 *     word `readWorkState` gives it from the whole record, and not among the records with no state word;
 *   - a promise owed outside, due when a fixed main-suite-fix problem finishes, has come due;
 *   - the attention rule gives the same answer from the fields it reads as from the whole records, on these
 *     records and on ordinary ones beside them, so every other record reads as it did.
 *
 * THREE-RUN PROOF, in the commit message: CONTROL green; a MUTATION of one line red; RESTORE green, checked
 * with cmp against a saved copy.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { freshDb, type TestDb } from './helpers.ts'
import { MAIN_SUITE_FIX_EXAMPLE } from '../src/shared/main-suite-fix.ts'
import { readWorkState } from '../src/shared/work.ts'

const HERE = 'made-up-main-suite'
const NOW = new Date(2026, 9, 20, 12, 0, 0).getTime()

/** The kind's own made-up main-suite fix, with a landed repair and the green receipt that fixed requires. */
const FIXED = {
  ...MAIN_SUITE_FIX_EXAMPLE,
  fixedReceipt: { recordId: 'made-up-green', seq: 1 as const, contentHash: '1'.repeat(16) },
  outcome: { fixed: 'c'.repeat(40) },
}

let t: TestDb
let R: typeof import('../src/server/lib/records.ts')
let A: typeof import('../src/shared/attention.ts')

beforeAll(async () => {
  t = await freshDb()
  R = await import('../src/server/lib/records.ts')
  A = await import('../src/shared/attention.ts')
  const db = t.client.sqlite
  db.prepare(`INSERT INTO workspaces (id, title, created_at, updated_at) VALUES (?, 'Made-up main suite', '2026-10-01 09:00:00', '2026-10-01 09:00:00')`).run(HERE)
  const add = db.prepare(
    `INSERT INTO records (id, workspace_id, owner_id, created_at, updated_at, kind, title, summary, data, deleted_at, origin)
     VALUES (?, ?, 'owner', '2026-10-01 09:00:00', '2026-10-01 09:00:00', ?, ?, NULL, ?, NULL, 'fixture')`,
  )
  const long = 'Words the attention rule never reads. '.repeat(20)
  add.run('msf-open', HERE, 'problem', 'A made-up red main suite nobody has fixed', JSON.stringify({ mainSuiteFix: MAIN_SUITE_FIX_EXAMPLE, symptom: long }))
  add.run('msf-fixed', HERE, 'problem', 'A made-up red main suite a repair fixed', JSON.stringify({ mainSuiteFix: FIXED, symptom: long }))
  add.run('msf-promise', HERE, 'task', 'A made-up promise due when the repair finishes', JSON.stringify({ state: 'doing', owed_to: 'the printer shop', due: { recordId: 'msf-fixed' }, body: long }))
  // ORDINARY RECORDS BESIDE THEM: a stored state that stopped short, one that is under way, a problem whose stored
  // state is read before its main-suite fix, a main-suite fix the schema refuses, and a record with no state.
  add.run('plain-blocked', HERE, 'task', 'A made-up task that stopped', JSON.stringify({ state: 'blocked', consequence: { bearer: 'person', what: 'the rig may move' }, body: long }))
  add.run('plain-doing', HERE, 'task', 'A made-up task under way', JSON.stringify({ state: 'doing', body: long }))
  add.run('msf-stored', HERE, 'problem', 'A made-up problem whose stored state is fixed', JSON.stringify({ state: 'fixed', mainSuiteFix: MAIN_SUITE_FIX_EXAMPLE }))
  add.run('msf-unreadable', HERE, 'problem', 'A made-up problem whose main-suite fix is not one', JSON.stringify({ mainSuiteFix: { receipt: 'not a receipt' } }))
  add.run('plain-none', HERE, 'task', 'A made-up task with no state', JSON.stringify({ body: long }))
}, 60_000)

afterAll(() => {
  t.close()
})

/** The whole stored `data` of one made-up record. */
function wholeDataOf(id: string): unknown {
  return R.getRecord(id)?.data
}

describe('a main-suite-fix problem with no stored state, on the attention page', () => {
  it('is on the list, with the state its main-suite fix gives it', () => {
    const derived = readWorkState(wholeDataOf('msf-open'))
    expect(derived.source, 'the made-up problem takes its state from its main-suite fix').toBe('derived from mainSuiteFix')
    expect(typeof derived.state, 'the main-suite fix gives it a state word').toBe('string')
    const reading = R.attentionNow({ workspaceId: HERE, resources: [], now: NOW })
    const row = [...reading.visible, ...reading.remainder].find((one) => one.recordId === 'msf-open')
    expect(row, 'the problem is on the attention list').toBeDefined()
    expect(row?.state).toBe(derived.state)
    expect(reading.noState.some((one) => one.recordId === 'msf-open'), 'it is not among the records with no state word').toBe(false)
  })

  it('makes a promise due when it is fixed come due', () => {
    expect(readWorkState(wholeDataOf('msf-fixed')).source).toBe('derived from mainSuiteFix')
    const reading = R.attentionNow({ workspaceId: HERE, resources: [], now: NOW })
    const row = [...reading.visible, ...reading.remainder].find((one) => one.recordId === 'msf-promise')
    expect(row, 'the promise owed outside is on the list').toBeDefined()
    expect(row?.reason.owed?.trigger?.recordId).toBe('msf-fixed')
    expect(row?.reason.owed?.trigger?.finished, row?.reason.owed?.trigger?.note).toBe(true)
  })
})

describe('the attention rule, read from the fields it uses', () => {
  it('gives the same answer as from the whole records, for these records and the ordinary ones beside them', () => {
    const input = (records: unknown[]) => ({
      now: NOW,
      records: records as Parameters<typeof A.computeAttention>[0]['records'],
      links: R.allLinks(HERE),
      changes: [],
      resources: [],
      dueMs: (stamp: string) => new Date(`${stamp}T00:00:00`).getTime(),
    })
    const whole = A.computeAttention(input(R.listRecords({ workspaceId: HERE, includeDeleted: true })))
    const narrow = A.computeAttention(input(R.listRecordsForTheAttentionRule(HERE)))
    // The comparison is about something: the ordinary records are read, and each kind of answer is given.
    expect(whole.counts.candidates, 'every made-up record is a candidate').toBeGreaterThanOrEqual(8)
    for (const id of ['msf-open', 'msf-promise', 'plain-blocked']) expect([...whole.visible, ...whole.remainder].some((one) => one.recordId === id), id).toBe(true)
    for (const id of ['msf-unreadable', 'plain-none']) expect(whole.noState.some((one) => one.recordId === id), id).toBe(true)
    expect(JSON.stringify(narrow)).toBe(JSON.stringify(whole))
  })
})
