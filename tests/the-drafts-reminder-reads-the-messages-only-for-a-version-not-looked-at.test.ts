// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE DRAFTS REMINDER READS THE MESSAGES ONLY FOR A DRAFT VERSION IT HAS NOT LOOKED AT.
 *
 * `sendTheDraftRemindersThatAreDue` (src/server/lib/drafts.ts) finds the reminders already said by reading every
 * message in the office. It does that only for a due draft version that no pass in this run of the server has looked at.
 * Each pass below runs with a count of its own (`aFreshCount` and `countedApart` in src/server/lib/slow-requests.ts, as
 * the reminders' pass counts its drafts step), so what it ran inside SQLite is read, not guessed. A pass 59 minutes after
 * the draft was filed cannot reach the message scan, because no draft is due yet, so its count is that of a pass without
 * the scan. The read of the said list is two statements. The first reads the office's id from its registry row
 * (`moleOfficeIdFromItsRow` in src/server/lib/participants.ts) and gives one row. The second is the message scan, and it
 * gives one row for each reminder already said.
 *
 * A REMINDER SAID BEFORE THE SERVER STARTED is written here through `writeASystemLineToOne`, with the line and marks the
 * pass writes. Each test opens a fresh database, which loads drafts.ts again, so each starts with nothing looked at, as
 * a restart does.
 *
 * THE MUTATIONS EACH TEST MUST GO RED FOR:
 *   never consulted  — the remembered set is never consulted, so the scan runs on every pass: both tests.
 *   remembered early — a version is remembered when a pass first meets it, before it is due and decided, so a new due
 *                      version is never reminded: both tests.
 *   no version       — the set is keyed by the draft without its version, so a new version is never reminded: the second.
 */

import { afterEach, beforeEach, expect, it } from 'vitest'
import { SYSTEM_LINES } from '../src/shared/groups.ts'
import { moleOffice } from '../src/shared/participants.ts'
import { freshDb, type TestDb } from './helpers.ts'

let t: TestDb
let drafts: typeof import('../src/server/lib/drafts.ts')
let slow: typeof import('../src/server/lib/slow-requests.ts')
let groups: typeof import('../src/server/lib/groups.ts')
let ledger: typeof import('../src/server/db/who-wrote-records.ts')

const THE_OFFICE = { type: 'system', id: moleOffice().id } as const

beforeEach(async () => {
  t = await freshDb()
  drafts = await import('../src/server/lib/drafts.ts')
  slow = await import('../src/server/lib/slow-requests.ts')
  groups = await import('../src/server/lib/groups.ts')
  ledger = await import('../src/server/db/who-wrote-records.ts')
  slow.measureTheStatementsOf(t.client.sqlite)
})

afterEach(() => {
  t?.close()
})

/** A draft the person keeps and does not send. */
function aDraft(): string {
  return t.api.createRecord({
    kind: 'draft',
    title: 'Synthetic draft left unsent',
    workspaceId: 'default',
    actor: t.api.HUMAN,
    data: { body: 'Synthetic words.', for: [{ kind: 'person', id: t.api.HUMAN.id }], becomes: 'message' },
  }).id
}

/** The reminder about the draft's newest version, as a pass before the server started wrote it. Answers that version. */
function saidBeforeTheStart(draft: string): number {
  const version = ledger.theEndsOfTheLedger([draft]).get(draft)!.newestSeq
  groups.writeASystemLineToOne(
    { kind: 'person', id: t.api.HUMAN.id },
    'default',
    SYSTEM_LINES.aDraftIsNotSent('Synthetic: a reminder said before the server started.'),
    THE_OFFICE,
    undefined,
    { draft, draftVersion: version },
  )
  return version
}

/** One pass of the draft reminder, `n` minutes after `from`, with what it ran inside SQLite. */
function aPass(from: number, n: number): { reminded: string[]; statements: number; rows: number } {
  const did = slow.aFreshCount()
  const reminded = slow.countedApart(did, () => drafts.sendTheDraftRemindersThatAreDue(new Date(from + n * 60_000), THE_OFFICE))
  return { reminded, statements: did.statements, rows: did.rows }
}

/**
 * The version each office line about one draft names, oldest first. The tie is broken by `rowid`, which rises with each
 * insert, because lines written in the same second have the same `created_at` and `id` is random.
 */
function linesAbout(draft: string): number[] {
  return (
    t.client.sqlite
      .prepare(
        `SELECT json_extract(data, '$.extra.draftVersion') AS version FROM records
          WHERE kind = 'message' AND deleted_at IS NULL AND json_extract(data, '$.extra.draft') = ?
          ORDER BY created_at, rowid`,
      )
      .all(draft) as { version: number }[]
  ).map((one) => one.version)
}

it('reads the messages once in two passes over a draft version already said, and says nothing again', () => {
  const id = aDraft()
  const from = Date.now()
  const version = saidBeforeTheStart(id)
  const notDue = aPass(from, 59)
  const passes = [aPass(from, 61), aPass(from, 62)]
  // THE FIRST DUE PASS READS THE SAID LIST: the office's id and its row, then the scan and the one reminder said.
  expect(passes.map((one) => one.statements - notDue.statements), 'statements beyond a pass that cannot reach the scan').toEqual([2, 0])
  expect(passes.map((one) => one.rows - notDue.rows), 'rows beyond a pass that cannot reach the scan').toEqual([2, 0])
  expect([notDue, ...passes].flatMap((one) => one.reminded)).toEqual([])
  expect(linesAbout(id)).toEqual([version])
})

it('looks at a new version of that draft once, and reminds it once when it is due', () => {
  const id = aDraft()
  const from = Date.now()
  const first = saidBeforeTheStart(id)
  expect(aPass(from, 61).reminded).toEqual([])
  t.api.patchRecord(id, { dataPatch: { body: 'Synthetic words, changed.', remindAfterMinutes: 120 } }, t.api.HUMAN)
  const notDue = aPass(from, 63)
  const due = aPass(from, 125)
  const after = aPass(from, 126)
  expect([notDue, due, after].map((one) => one.reminded)).toEqual([[], [id], []])
  expect({ statements: after.statements, rows: after.rows }, 'the pass after the reminder read more than a pass that cannot reach the scan').toEqual({
    statements: notDue.statements,
    rows: notDue.rows,
  })
  const versions = linesAbout(id)
  expect(versions).toHaveLength(2)
  expect(versions[0]).toBe(first)
  expect(versions[1]).toBeGreaterThan(first)
})
