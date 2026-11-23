// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE PLAN OF STALE LEDGERS NAMES EACH RECORD BY ITS NEWEST REVISION, OLDEST RECORD FIRST.
 *
 * `planStaleLedgers` (src/server/db/revision-backfill.ts) answers which records have a newest revision that no longer
 * holds what the record holds, with that revision's number, ordered by the record's creation moment and then by its
 * id. Two callers rely on the whole answer: `migrateRevisions` writes its catch-up rows in that order, each numbered
 * one past `newest_seq`, and `theGapsInTheLedger` names the first five in the re-mint's refusal. This file holds the
 * whole answer for one ledger, so a change to how the rows are read cannot change it with nothing failing.
 *
 * The ledger is six made-up notes, written with raw SQL and given their baselines by the ledger pass itself:
 *   - three are then changed by raw SQL and keep no revision, as the two data migrations named in that file do: one in
 *     its data, one in its title, one in its summary. They are stale, and their newest revision is 1;
 *   - one is changed through the product, so it has two revisions, and is then put back by raw SQL to what its first
 *     revision holds. Only the older revision matches it, so it is stale, and its newest revision is 2;
 *   - one is changed through the product and left alone. Only its newest revision matches it, so it is up to date;
 *   - one keeps its baseline and is up to date.
 * Their creation order is not the order they were inserted in, nor the order of their ids, nor the order their
 * revisions were written in. Two of them share a creation moment and were inserted in the order their ids do not
 * have, so the id decides between those two.
 *
 * Proved against these mutations, each in `planStaleLedgers`, each made on its own and then put back:
 *   1. `ORDER BY r.created_at, r.id` removed: the rows come in the order SQLite reads them, and the order is wrong;
 *   2. the newest revision taken as the oldest, `max(w.seq)` made `min(w.seq)`: the note put back to its first revision
 *      drops out, the note changed through the product comes in with 1, and the answer is wrong;
 *   3. the comparison skipped for one row, the row read first kept out without being compared: the earliest stale
 *      note drops out.
 * Every id, title and word here is made up, in a throwaway office.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
// Safe as normal imports: neither module opens a database. The ledger pass is handed its connection, and the hash
// module imports nothing that does.
import { migrateRevisions, planStaleLedgers } from '../src/server/db/revision-backfill.ts'
import { contentOf, versionOf } from '../src/server/db/version.ts'
import { at, buildTheFirstOfficeInAHook, freshDb, type TestDb } from './helpers.ts'
import { THE_TEST_OFFICES_OWNER } from './the-test-offices-owner.ts'

// The first office of this process is built in a hook, so the case below keeps its 5 s for what it tests.
buildTheFirstOfficeInAHook()

let t: TestDb

beforeEach(async () => {
  t = await freshDb()
})
afterEach(() => {
  t.close()
})

// The six notes, by the order their ids sort in.
const A = 'ledger-a-001'
const B = 'ledger-b-001'
const D = 'ledger-d-001'
const K = 'ledger-k-001'
const M = 'ledger-m-001'
const Z = 'ledger-z-001'

interface Revision {
  seq: number
  content_hash: string
  kind: string
  title: string
  summary: string | null
  data: string
  deleted_at: string | null
}

/**
 * A note with no revision, as a record filed before the ledger is. Raw SQL, because the product's own write would
 * file a revision beside it, and this note's first revision is the baseline the ledger pass gives it.
 */
function aNote(id: string, createdAt: string): void {
  t.client.sqlite
    .prepare(
      'INSERT INTO records (id, workspace_id, owner_id, created_at, updated_at, kind, title, summary, data, ' +
        "deleted_at, origin) VALUES (?, 'default', ?, ?, ?, 'note', ?, NULL, '{}', NULL, 'authored')",
    )
    .run(id, THE_TEST_OFFICES_OWNER.id, createdAt, createdAt, `made-up note ${id}`)
}

function revisionsOf(id: string): Revision[] {
  return t.client.sqlite
    .prepare(
      'SELECT seq, content_hash, kind, title, summary, data, deleted_at FROM revisions ' +
        'WHERE record_id = ? ORDER BY seq',
    )
    .all(id) as Revision[]
}

/** The token of what the record holds now, through the same two functions the ledger pass uses. */
function tokenOf(id: string): string {
  const row = t.client.sqlite
    .prepare('SELECT kind, title, summary, data, deleted_at FROM records WHERE id = ?')
    .get(id) as { kind: string; title: string; summary: string | null; data: string; deleted_at: string | null }
  return versionOf(
    contentOf({
      kind: row.kind,
      title: row.title,
      summary: row.summary,
      data: JSON.parse(row.data) as Record<string, unknown>,
      deletedAt: row.deleted_at,
    }),
  )
}

/** A row of the plan's answer, for a note of the default project that is not deleted. */
function stale(id: string, title: string, summary: string | null, data: string, newestSeq: number) {
  return { id, workspace_id: 'default', kind: 'note', title, summary, data, deleted_at: null, newest_seq: newestSeq }
}

describe('the plan of stale ledgers', () => {
  it('names every stale record and no other, by its newest revision, oldest record first and then by id', () => {
    // Inserted in this order. The creation order is M, D, A, Z, then B and K at one moment.
    aNote(Z, '2001-02-10 10:00:00')
    aNote(D, '2001-01-20 10:00:00')
    aNote(K, '2001-03-15 10:00:00')
    aNote(A, '2001-02-01 10:00:00')
    aNote(M, '2001-01-05 10:00:00')
    aNote(B, '2001-03-15 10:00:00')
    const baselines = migrateRevisions(t.client.sqlite)
    expect(baselines.written, 'the ledger pass did not give each of the six notes one baseline').toBe(6)
    expect(baselines.caughtUp, 'a ledger had fallen behind before any note was changed').toBe(0)

    // Two notes changed through the product, which files a second revision of each.
    t.api.updateRecord(Z, { summary: 'changed through the product' }, t.api.HUMAN)
    t.api.updateRecord(D, { summary: 'changed through the product' }, t.api.HUMAN)

    // Three notes changed by raw SQL, with no revision, as a data migration changes one.
    t.client.sqlite.prepare('UPDATE records SET data = ? WHERE id = ?').run('{"also_waiting_on":"a made-up task"}', M)
    t.client.sqlite.prepare('UPDATE records SET title = ? WHERE id = ?').run('made-up note k, retitled by hand', K)
    t.client.sqlite.prepare('UPDATE records SET summary = ? WHERE id = ?').run('a summary written by hand', B)

    // One note put back by raw SQL to what its first revision holds.
    const first = at(revisionsOf(Z), 0, 'first revision of the note put back')
    t.client.sqlite
      .prepare('UPDATE records SET kind = ?, title = ?, summary = ?, data = ?, deleted_at = ? WHERE id = ?')
      .run(first.kind, first.title, first.summary, first.data, first.deleted_at, Z)

    // THE FIXTURE IS WHAT THE HEADER SAYS IT IS: which revisions each note has, and which of them match it.
    for (const id of [A, B, K, M]) expect(revisionsOf(id).map((r) => r.seq), `the revisions of ${id}`).toEqual([1])
    for (const id of [D, Z]) expect(revisionsOf(id).map((r) => r.seq), `the revisions of ${id}`).toEqual([1, 2])
    const zOne = at(revisionsOf(Z), 0, 'revision 1 of Z')
    const zTwo = at(revisionsOf(Z), 1, 'revision 2 of Z')
    expect(tokenOf(Z), 'the note put back does not match its first revision').toBe(zOne.content_hash)
    expect(tokenOf(Z), 'the note put back still matches its newest revision').not.toBe(zTwo.content_hash)
    const dOne = at(revisionsOf(D), 0, 'revision 1 of D')
    const dTwo = at(revisionsOf(D), 1, 'revision 2 of D')
    expect(tokenOf(D), 'the note changed through the product does not match its newest').toBe(dTwo.content_hash)
    expect(tokenOf(D), 'the note changed through the product still matches its first').not.toBe(dOne.content_hash)
    const aOne = at(revisionsOf(A), 0, 'baseline of A')
    expect(tokenOf(A), 'the untouched note does not match its baseline').toBe(aOne.content_hash)

    // THE WHOLE ANSWER: the stale notes and no other record, each with its newest revision's number, in order.
    expect(planStaleLedgers(t.client.sqlite)).toEqual({
      tableMissing: false,
      records: [
        stale(M, `made-up note ${M}`, null, '{"also_waiting_on":"a made-up task"}', 1),
        stale(Z, `made-up note ${Z}`, null, '{}', 2),
        stale(B, `made-up note ${B}`, 'a summary written by hand', '{}', 1),
        stale(K, 'made-up note k, retitled by hand', null, '{}', 1),
      ],
    })
  })
})
