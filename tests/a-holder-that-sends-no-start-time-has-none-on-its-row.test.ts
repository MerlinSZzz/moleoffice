// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A TERMINAL HOLDER THAT SENDS NO START TIME OF ITS OWN HAS NONE ON ITS SESSION ROW. Wave 13y round 34, item 9.8 (c).
 *
 * The holder reads its own start time once (src/holder/index.mjs) and sends none in its hello when it cannot read its
 * own entry in the process table. `recordTheHolder` then wrote the moment the server recorded it as the row's
 * `data.startedAt`, and the run's page drew that moment as the holder's start. The server's time is not the holder's
 * start, so the row now leaves the field out, and the run's page says the start time is unknown and when the office
 * first recorded the row (tests/a-run-with-no-recorded-start-says-its-start-time-is-unknown.test.ts).
 *
 * WHAT THIS HOLDS, with this test's own process standing in for the holder, because the ledger refuses a pid nothing
 * runs under:
 *   1. a holder that sends no start time: its row has no `data.startedAt`;
 *   2. a holder that sends its own start time: its row's `data.startedAt` is that time.
 *
 * WHAT IT DOES NOT HOLD. The start time the server reads for the holder's process block (item 9.8 (a),
 * tests/the-holders-row-takes-its-start-time-from-the-ledger.test.ts). Whether that reading should be shown as the start
 * when the holder sent none is a question still open in round 34, so this leaves the field out in that case too.
 */
import { afterEach, beforeEach, expect, it } from 'vitest'
import { freshDb, type TestDb } from './helpers.ts'

let t: TestDb

beforeEach(async () => {
  t = await freshDb()
})

afterEach(() => {
  t.close()
})

/** Record this test's process as a holder that sent `startedAt`, and read back the row it filed. */
async function theRowOfAHolderThatSent(startedAt: string | null): Promise<Record<string, unknown>> {
  const { recordTheHolder } = await import('../src/server/lib/terminals.ts')
  const { getRecord } = await import('../src/server/lib/records.ts')
  const { settings } = await import('../src/config/settings.mjs')
  const filed = recordTheHolder({ protocol: 1, pid: process.pid, startedAt, database: settings().databasePath })
  expect(filed.filed).toBe(true)
  const row = getRecord(filed.sessionRecordId)
  if (row === null) throw new Error(`the holder's row ${filed.sessionRecordId} could not be read back`)
  return row.data
}

it('1: a holder that sends no start time of its own has no start time on its row', async () => {
  const data = await theRowOfAHolderThatSent(null)
  expect(data['state']).toBe('running')
  expect(Object.hasOwn(data, 'startedAt'), `the row says it started at ${String(data['startedAt'])}, which the holder never sent`).toBe(false)
})

it('2: a holder that sends its own start time has that time on its row', async () => {
  const data = await theRowOfAHolderThatSent('2026-10-15 01:02:03')
  expect(data['startedAt']).toBe('2026-10-15 01:02:03')
})
