// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE RUNS FILED SINCE A MOMENT ARE READ THROUGH THEIR STAMPS, AND THE TIME EACH WAS FILED STILL DECIDES
 * (`theRunsFiledSince`, src/server/lib/usage-receipts.ts). Wave 13y round 17.
 *
 * The week-use notice asks every minute for the runs filed in each login's week, and the usage window asks for a chosen
 * span. Both read every session row and parsed it. Now only the rows whose `updated_at` is at or after a day before the
 * moment are read, which every run filed since the moment is, and `created_at` decides as before.
 *
 * THE CLOCK IS HELD (only `Date`), so each run is filed at a known time.
 *
 * CONTROL: the test passes at the tip. MUTATIONS, each run and each red:
 *   1. The window starts a day after the moment, not a day before it (`fromMs + 24 * 3_600_000`).
 *   2. The window has no day of margin (`fromMs - 0`): the run whose stamps a clock change put out of order is missed.
 *   3. The time each run was filed no longer decides: the `at < fromMs` test removed.
 */
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { freshDb, type TestDb } from './helpers.ts'

let t: TestDb

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
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

const at = (hour: number, minute = 0): Date => new Date(2026, 9, 10, hour, minute, 0, 0)

function aRunFiledAt(when: Date, title: string, workspaceId = 'default'): string {
  vi.setSystemTime(when)
  return t.api.createRecord({ workspaceId, kind: 'session', title, data: { servingAgent: 'ag-test' }, actor: t.api.HUMAN }).id
}

it('gives the runs filed since the moment, in one project or in all, and no run filed before it', async () => {
  const before = aRunFiledAt(at(6), 'A test run filed before the moment and changed after it')
  const inside = aRunFiledAt(at(8, 30), 'A test run filed after the moment')
  const elsewhere = aRunFiledAt(at(8, 40), 'A test run filed after the moment in another project', 'elsewhere')
  const deleted = aRunFiledAt(at(8, 45), 'A test run filed after the moment and deleted')
  t.api.deleteRecord(deleted, t.api.HUMAN)
  // A CLOCK SET BACK AN HOUR AFTER THE RUN WAS FILED, written straight in the throwaway database: its `updated_at` is
  // earlier than its `created_at` and than the moment, which the day of margin is for.
  const setBack = aRunFiledAt(at(8, 50), 'A test run whose clock was set back')
  t.client.sqlite.prepare('UPDATE records SET updated_at = ? WHERE id = ?').run('2026-10-10 07:50:00', setBack)
  vi.setSystemTime(at(9))
  t.api.patchRecord(before, { dataPatch: { state: 'idle' } }, t.api.HUMAN)

  const { theRunsFiledSince } = await import('../src/server/lib/usage-receipts.ts')
  const moment = at(8).getTime()
  expect(theRunsFiledSince(moment, null).map((run) => run.id).sort(), 'in every project').toEqual([inside, elsewhere, setBack].sort())
  expect(theRunsFiledSince(moment, 'default').map((run) => run.id).sort(), 'in one project').toEqual([inside, setBack].sort())
})
