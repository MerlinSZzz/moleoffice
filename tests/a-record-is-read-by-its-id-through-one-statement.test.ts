// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A RECORD IS READ BY ITS ID THROUGH ONE STATEMENT PER DATABASE HANDLE, NOT A STATEMENT PREPARED FOR EACH READ.
 *
 * Round 26 of wave 13y. MEASURED FIRST, 13 October 2026, on the made copy of the office at scale
 * (.scratch/r14/live-scale.db): one reading of GET /api/waiting read a record by its id 2,033 times, most of them to
 * ask who settles a fork. Each read built the statement's text again and had SQLite prepare it again, about 40 µs a
 * read. The same read through a statement prepared once is about 3.5 µs, and a warm reading of the door went from
 * about 430 ms to about 360 ms. `agentByHandle` in lib/participants.ts keeps its statement the same way.
 *
 * WHAT THIS FILE PROVES.
 *   - Six reads by id prepare the statement at most once. It is counted at the database handle, so the count does not
 *     depend on how fast the machine is.
 *   - The answers are the stored rows: a live record, a deleted record with the time it was deleted, and null for an
 *     id that no record has.
 *
 * THREE-RUN PROOF, in the commit message with the commands and log paths: CONTROL red before the change; MUTATION
 * back to a statement prepared for each read, red; RESTORE green.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { freshDb, type TestDb } from './helpers.ts'

let t: TestDb
let live = ''
let gone = ''

beforeAll(async () => {
  t = await freshDb()
  live = t.api.createRecord({ kind: 'note', title: 'the record that is still there', workspaceId: 'default', data: { body: 'kept' }, actor: t.api.HUMAN }).id
  gone = t.api.createRecord({ kind: 'note', title: 'the record that was deleted', workspaceId: 'default', data: { body: 'deleted' }, actor: t.api.HUMAN }).id
  t.api.deleteRecord(gone, t.api.HUMAN)
})
afterAll(() => {
  t.close()
})

/** The stored row of one record, read with SQL written here rather than by the reader under test. */
function theStoredRow(id: string): { title: string; data: string; deleted_at: string | null } {
  const row = t.client.sqlite.prepare('SELECT title, data, deleted_at FROM records WHERE id = ?').get(id) as { title: string; data: string; deleted_at: string | null } | undefined
  if (row === undefined) throw new Error(`no stored row for ${id}`)
  return row
}

describe('reading a record by its id', () => {
  it('prepares the statement at most once over six reads, and answers with the stored rows', () => {
    const sqlite = t.client.sqlite as unknown as { prepare: (text: string) => unknown }
    const original = sqlite.prepare
    const byId: string[] = []
    sqlite.prepare = function (this: unknown, text: string) {
      if (/from "records" where "records"\."id" = \?/.test(text)) byId.push(text)
      return original.call(this, text)
    }
    const answers: ReturnType<typeof t.api.getRecord>[] = []
    try {
      for (let i = 0; i < 2; i++) for (const id of [live, gone, 'no-record-has-this-id']) answers.push(t.api.getRecord(id))
    } finally {
      sqlite.prepare = original
    }

    expect(byId.length, byId.join('\n')).toBeLessThanOrEqual(1)

    const [keptRecord, deletedRecord, nothing] = answers
    const kept = theStoredRow(live)
    expect(keptRecord?.id).toBe(live)
    expect(keptRecord?.title).toBe(kept.title)
    expect(keptRecord?.data).toEqual(JSON.parse(kept.data))
    expect(keptRecord?.deletedAt).toBeNull()
    const deleted = theStoredRow(gone)
    expect(deleted.deleted_at).not.toBeNull()
    expect(deletedRecord?.id).toBe(gone)
    expect(deletedRecord?.title).toBe(deleted.title)
    expect(deletedRecord?.deletedAt).toBe(deleted.deleted_at)
    expect(nothing).toBeNull()
    // THE SECOND ROUND OF READS ANSWERS AS THE FIRST DID, so a kept statement does not carry one read's answer into the next.
    expect(answers.slice(3)).toEqual(answers.slice(0, 3))
  })
})
