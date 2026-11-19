// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE KEPT FIELDS OF EVERY SESSION ARE READ AGAIN WHERE A ROW CHANGED (src/server/lib/session-fields.ts). Wave 13y
 * round 17, ruled in message FPmvDaVp3RtV.
 *
 * The minute's questions take their candidate runs from fields kept between passes. A pass that missed a write would
 * answer from what a run was, not what it is. So these tests write through the product's own doors, each of which sets
 * `updated_at`, and ask again at once.
 *
 * THE CLOCK IS HELD (only `Date`), so the tests decide whether a write falls in the same second as the last reading.
 * The stamps are whole seconds, so a write in that second leaves `updated_at` as it was when the row was read.
 *
 * CONTROL: every test passes at the tip. MUTATIONS, each run and each red:
 *   1. A later reading reads no row again: the loop over `again` in `theFieldsOfEverySession` removed.
 *   2. A row stamped in the second the last reading began is not read again: `|| row.updatedAt >= kept.lastReading`
 *      removed. Red in the first test only.
 *   3. A deleted row stays: `keep` tests `row.deleted === 2` in place of `=== 1`.
 *   4. A new row is not read: a later reading passes over every id it does not already keep.
 *   5. (Round 17b.) A later reading counts its day from now, not from the last reading: the old bound
 *      `localStamp(new Date(now - A_STAMP_CAN_STEP_BACK_BY))` put back. Red in the last test only.
 */
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { freshDb, type TestDb } from './helpers.ts'

let t: TestDb

const NINE = new Date(2026, 9, 10, 9, 0, 0, 0)

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NINE)
  t = await freshDb()
  // THE ROLE CARDS ARE READ ONCE, AS THE SERVER READS THEM WHEN IT STARTS: a patch asks for them.
  const { GOVERNANCE_GUARDS } = await import('../src/server/lib/records.ts')
  const { readTheRoleCards } = await import('../src/server/lib/roles.ts')
  readTheRoleCards({ guardActKeys: GOVERNANCE_GUARDS.flatMap((one) => [one.actKey, one.personAct]) })
})

afterEach(() => {
  t?.close()
  vi.useRealTimers()
})

/**
 * A session filed through the door, then given its state straight in the throwaway database in the same moment, as
 * the seal at create writes in the moment of the insert. The door that starts a run asks for much this test is not about.
 */
function aRunningSession(title: string, workspaceId = 'default'): string {
  const run = t.api.createRecord({ workspaceId, kind: 'session', title, data: { servingAgent: 'ag-test' }, actor: t.api.HUMAN })
  t.client.sqlite.prepare("UPDATE records SET data = json_set(data, '$.state', 'running') WHERE id = ?").run(run.id)
  return run.id
}

async function theRunningIds(workspaceId = 'default'): Promise<string[]> {
  const { theSessionIdsWhere } = await import('../src/server/lib/session-fields.ts')
  return theSessionIdsWhere(workspaceId, (one) => one.state === 'running').sort()
}

const later = (seconds: number): void => {
  vi.setSystemTime(new Date(Date.now() + seconds * 1_000))
}

it('a data patch is seen by the next reading, in the same second as the last reading and in a later one', async () => {
  const first = aRunningSession('A test run patched in the same second')
  const second = aRunningSession('A test run patched a minute later')
  expect(await theRunningIds()).toEqual([first, second].sort())

  // THE SAME SECOND: the patch leaves `updated_at` at the stamp the row had when it was read.
  t.api.patchRecord(first, { dataPatch: { state: 'idle' } }, t.api.HUMAN)
  expect(await theRunningIds(), 'after a patch in the second of the last reading').toEqual([second])

  later(60)
  t.api.patchRecord(second, { dataPatch: { state: 'idle' } }, t.api.HUMAN)
  expect(await theRunningIds(), 'after a patch a minute later').toEqual([])
})

it('a deleted session leaves, a new one comes in, and a restored one comes back', async () => {
  const gone = aRunningSession('A test run deleted later')
  expect(await theRunningIds()).toEqual([gone])

  later(60)
  const fresh = aRunningSession('A test run filed later')
  t.api.deleteRecord(gone, t.api.HUMAN)
  expect(await theRunningIds(), 'after one delete and one new run').toEqual([fresh])

  later(60)
  t.api.restoreRecord(gone, t.api.HUMAN)
  expect(await theRunningIds(), 'after the restore').toEqual([fresh, gone].sort())
})

it('a run moved to another project is asked about in that project', async () => {
  const moved = aRunningSession('A test run moved later')
  expect(await theRunningIds()).toEqual([moved])
  later(60)
  t.client.sqlite
    .prepare("INSERT INTO workspaces (id, title, note, created_at, updated_at) VALUES ('elsewhere', 'Elsewhere', NULL, ?, ?)")
    .run('2026-10-10 08:00:00', '2026-10-10 08:00:00')
  t.api.fileRecordsInWorkspace([moved], 'elsewhere', t.api.HUMAN)
  expect(await theRunningIds(), 'in the project it left').toEqual([])
  expect(await theRunningIds('elsewhere'), 'in the project it went to').toEqual([moved])
})

it('a row written in a gap of more than a day between two readings is seen by the reading after the gap', async () => {
  // A HOST ASLEEP WHILE THE SERVER STAYS UP: one reading, then nothing for three days.
  const patched = aRunningSession('A test run patched during the gap')
  expect(await theRunningIds()).toEqual([patched])

  later(2 * 24 * 3_600)
  const writtenInTheGap = aRunningSession('A test run filed two days after the last reading')
  t.api.patchRecord(patched, { dataPatch: { state: 'idle' } }, t.api.HUMAN)

  later(25 * 3_600)
  expect(await theRunningIds(), 'more than a day after both writes').toEqual([writtenInTheGap])
})
