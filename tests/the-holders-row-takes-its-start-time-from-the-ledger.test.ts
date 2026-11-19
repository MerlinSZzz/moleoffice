// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE TERMINAL HOLDER'S SESSION ROW TAKES ITS PROCESS'S START TIME FROM THE LEDGER, AS THE MESSAGE WORKER'S DOES.
 * Wave 13y round 33, item 9.8 (a).
 *
 * The holder reads its own start time once (src/holder/index.mjs) and sends none in its hello when it cannot read its
 * own entry in the process table. The row `recordTheHolder` files then named the pid with no start time, so the Agent
 * runs page drew the third mark for a holder that was running. The ledger row filed beside it had a start time all the
 * same, because the ledger reads the holder's process itself. Round 32 read this and changed nothing.
 *
 * WHAT THIS HOLDS, with this test's own process standing in for the holder, because the ledger refuses a pid nothing
 * runs under:
 *   1. a holder that sends no start time: its row's process block has the start time of its ledger row, and the next
 *      record of the same holder finds that row standing rather than filing another;
 *   2. a holder that sends its own start time: its row's start time is still its ledger row's, and the two agree.
 *
 * WHAT IT DOES NOT HOLD. The row's `data.startedAt`, which a holder that sent no start time does not have (item 9.8 (c),
 * round 34): tests/a-holder-that-sends-no-start-time-has-none-on-its-row.test.ts.
 */
import { afterEach, beforeEach, expect, it } from 'vitest'
import { freshDb, one, type TestDb } from './helpers.ts'

let t: TestDb

beforeEach(async () => {
  t = await freshDb()
})

afterEach(() => {
  t.close()
})

/** Record this test's process as the holder, and read back the row and the ledger row it filed. */
async function recordAHolderThatSent(startedAt: string | null): Promise<{
  filed: { sessionRecordId: string; filed: boolean }
  recorded: { pid: number | null; pidStartedAt: string | null }
  ledgerStartedAt: string | null
  again: { sessionRecordId: string; filed: boolean }
}> {
  const { recordTheHolder } = await import('../src/server/lib/terminals.ts')
  const { listResources } = await import('../src/server/lib/resources.ts')
  const { getRecord } = await import('../src/server/lib/records.ts')
  const { theRecordedProcessOf } = await import('../src/config/own-rows.mjs')
  const { settings } = await import('../src/config/settings.mjs')
  const hello = { protocol: 1, pid: process.pid, startedAt, database: settings().databasePath }
  const filed = recordTheHolder(hello)
  const row = getRecord(filed.sessionRecordId)
  if (row === null) throw new Error(`the holder's row ${filed.sessionRecordId} could not be read back`)
  const ledger = one(listResources({ workspaceId: settings().workspace, sessionRecordId: filed.sessionRecordId }), "the holder's ledger row")
  return { filed, recorded: theRecordedProcessOf(row), ledgerStartedAt: ledger.osStartedAt, again: recordTheHolder(hello) }
}

it('1: a holder that sends no start time of its own: its row takes the ledger row\'s, and stands for the next record of it', async () => {
  const read = await recordAHolderThatSent(null)
  expect(read.filed.filed).toBe(true)
  expect(read.ledgerStartedAt, 'the ledger reads the start time of the process itself').toMatch(/^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d$/)
  expect(read.recorded).toEqual({ pid: process.pid, pidStartedAt: read.ledgerStartedAt })
  expect(read.again, 'the same holder recorded again finds its row standing').toEqual({ sessionRecordId: read.filed.sessionRecordId, filed: false })
})

it('2: a holder that sends its own start time: its row has the ledger row\'s, and the two agree', async () => {
  const { startTimeOf } = await import('../src/config/session-process.mjs')
  const { localStampOf } = await import('../src/config/stopped-run-cause.mjs')
  const own = startTimeOf(process.pid)
  if (own === null) throw new Error('this test cannot read its own start time, which the holder reads the same way')
  const read = await recordAHolderThatSent(localStampOf(own))
  expect(read.ledgerStartedAt).toBe(localStampOf(own))
  expect(read.recorded).toEqual({ pid: process.pid, pidStartedAt: read.ledgerStartedAt })
  expect(read.again).toEqual({ sessionRecordId: read.filed.sessionRecordId, filed: false })
})
