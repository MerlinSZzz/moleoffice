// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE FIRST REVISION OF A RECORD THAT IS OLDER THAN THE LEDGER, AND THE HONESTY IT NEEDS.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THE HONESTY IS MOST OF THIS FILE
 * ---------------------------------------------------------------------------------------
 *
 * A record written before the `revisions` table existed has no stored history of its CONTENT.
 * `changes` says what changed and never what it was — a `create` row keeps the record's title and
 * nothing else — so what such a record held on any earlier day was never written down anywhere and
 * cannot be recovered. The only thing a migration can see is what it holds now.
 *
 * So the backfill writes one revision per record holding today's content, and everything
 * interesting about it is what it must NOT claim. It must not call that content the record as
 * created, because nobody knows what that was. It must not stamp it with the record's creation
 * date, because that would be a measurement nobody took. It must not attribute it to the person who
 * wrote the record, because a migration wrote it. Getting any of those wrong is a fabricated
 * observation, which is invariant 3 of USER.md, and it is the kind that reads as perfectly
 * reasonable in a code review.
 *
 * The other half is that it must be safe to run twice, because `npm run db:migrate` is run again
 * every time anybody adds a migration, and because an archive restored tomorrow carries revisions
 * with it.
 */

import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
// Safe as a normal import, unlike most things under src/server: this module opens no database. It
// takes the connection as a parameter, and its own header says why — importing lib/records.ts from
// a migration would open the owner's real database at import time.
import {
  baselineNote,
  describeRevisionBackfill,
  migrateRevisions,
  planRevisionBaselines,
} from '../src/server/db/revision-backfill.ts'
import { buildTheFirstOfficeInAHook, apiApp, at, freshDb, one, type TestDb } from './helpers.ts'

// The first office of this process is built in a hook, so each case below keeps its 5 s for what it tests.
buildTheFirstOfficeInAHook()

let t: TestDb

beforeEach(async () => {
  t = await freshDb()
})
afterEach(() => {
  t.close()
})

interface StoredRevision {
  record_id: string
  seq: number
  op: string
  content_hash: string
  workspace_id: string | null
  kind: string
  title: string
  summary: string | null
  data: string
  deleted_at: string | null
  actor_type: string
  actor_id: string
  session_id: string | null
  at: string
  note: string | null
}

function allRevisions(): StoredRevision[] {
  return t.client.sqlite
    .prepare('SELECT * FROM revisions ORDER BY record_id, seq')
    .all() as StoredRevision[]
}

function revisionsOf(recordId: string): StoredRevision[] {
  return allRevisions().filter((r) => r.record_id === recordId)
}

/**
 * A RECORD THAT EXISTS AND HAS NO REVISION — the state this whole migration is for.
 *
 * Written with raw SQL and not through `createRecord`, because that is what one of these records
 * really is: a row filed before the ledger existed, so nothing wrote a revision beside it. Going
 * through the product's own write path would produce a record WITH a revision, which is the case the
 * migration must leave alone, and this file needs both.
 */
function anOldRecord(spec: {
  id: string
  kind?: string
  title: string
  summary?: string | null
  data?: string
  createdAt?: string
  deletedAt?: string | null
}): void {
  t.client.sqlite
    .prepare(
      'INSERT INTO records (id, workspace_id, owner_id, created_at, updated_at, kind, title, summary, data, ' +
        'deleted_at, origin) VALUES (@id, @workspace_id, @owner_id, @created_at, @created_at, @kind, @title, ' +
        '@summary, @data, @deleted_at, @origin)',
    )
    .run({
      id: spec.id,
      workspace_id: 'default',
      owner_id: THE_TEST_OFFICES_OWNER.id,
      created_at: spec.createdAt ?? '2026-07-01 09:00:00',
      kind: spec.kind ?? 'note',
      title: spec.title,
      summary: spec.summary ?? null,
      data: spec.data ?? '{}',
      deleted_at: spec.deletedAt ?? null,
      origin: 'authored',
    })
}

/** Three records with no revisions, one of them soft-deleted, one carrying real `data`. */
function threeOldRecords(): string[] {
  anOldRecord({ id: 'old-one-0001', title: 'a note written before the ledger' })
  anOldRecord({
    id: 'old-two-0002',
    kind: 'task',
    title: 'a task written before the ledger',
    summary: 'it has a summary too',
    data: JSON.stringify({ state: 'doing', effort_hours: 4 }),
    createdAt: '2026-06-02 11:30:00',
  })
  anOldRecord({
    id: 'old-three-03',
    title: 'a note that was deleted before the ledger',
    deletedAt: '2026-07-20 16:00:00',
  })
  return ['old-one-0001', 'old-two-0002', 'old-three-03']
}

// ============================================================ 1. one baseline per record

describe('the backfill', () => {
  it('gives every record that has no revision exactly one, and numbers it 1', () => {
    const ids = threeOldRecords()
    expect(allRevisions(), 'the records were written with revisions already beside them').toEqual([])

    const report = migrateRevisions(t.client.sqlite)

    expect(report.written).toBe(ids.length)
    expect(report.alreadyDone).toBe(false)
    expect(report.tableMissing).toBe(false)
    for (const id of ids) {
      const only = one(revisionsOf(id), `revision of record ${id}`)
      expect(only.seq, `record ${id} was given a revision numbered ${only.seq}`).toBe(1)
      expect(only.op).toBe('baseline')
    }
    expect(allRevisions().length, 'the backfill wrote a revision for something that is not a record').toBe(ids.length)
  })

  it('covers a soft-deleted record too, and its baseline says it was deleted', () => {
    threeOldRecords()
    migrateRevisions(t.client.sqlite)
    // A deleted record is kept, is restorable, and has content worth keeping. One that came back
    // from an archive with no revision while its neighbours had one would be a hole in the ledger
    // that nothing explains.
    const only = one(revisionsOf('old-three-03'), 'revision of the deleted record')
    expect(only.deleted_at).toBe('2026-07-20 16:00:00')
  })

  it('holds what the record contains, under the same token a read of it hands back', async () => {
    threeOldRecords()
    migrateRevisions(t.client.sqlite)

    const built = await apiApp()
    const app = built.app
    try {
      for (const id of ['old-one-0001', 'old-two-0002', 'old-three-03']) {
        const res = await app.inject({
          method: 'GET',
          url: `/api/records/${id}`,
          headers: { 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id },
        })
        expect(res.statusCode, `GET /api/records/${id} answered ${res.statusCode}`).toBe(200)
        const served = res.json() as { record: Record<string, unknown>; version: string }
        const only = one(revisionsOf(id), `revision of record ${id}`)
        expect({
          kind: only.kind,
          title: only.title,
          summary: only.summary,
          data: JSON.parse(only.data) as unknown,
          workspaceId: only.workspace_id,
        }).toEqual({
          kind: served.record['kind'],
          title: served.record['title'],
          summary: served.record['summary'],
          data: served.record['data'],
          workspaceId: served.record['workspaceId'],
        })
        // The token a baseline is named by is the very string a read of the record hands back as
        // `version`, so a compare-and-set built from a baseline is accepted by the server.
        expect(only.content_hash, `the baseline of ${id} is named by a token the API never served`).toBe(served.version)
      }
    } finally {
      await app.close()
    }
  })
})

// ============================================================ 2. what a baseline must not claim

describe('a baseline revision', () => {
  it('says on the row that it is not the record as it was created', () => {
    threeOldRecords()
    const report = migrateRevisions(t.client.sqlite)
    const only = one(revisionsOf('old-one-0001'), 'revision')

    // The sentence is read from the function that writes it, so this asserts the row carries the
    // note rather than restating what the note says — restating it would be the same words in two
    // places with nothing making them agree.
    expect(only.note).toBe(baselineNote(report.at))
    // And the sentence itself really says the three things it has to say, in plain words. This is
    // the one place they are checked, because a note that quietly lost them would still be a note.
    expect(only.note).toContain('NOT the record as it was created')
    expect(only.note).toContain('never stored')
    expect(only.note).toContain('a migration wrote it')
  })

  it('is attributed to the system, not to whoever wrote the record', () => {
    threeOldRecords()
    migrateRevisions(t.client.sqlite)
    const only = one(revisionsOf('old-one-0001'), 'revision')
    // The record's owner is the test office's owner. Attributing this row to them would put words in their mouth about a
    // revision they never made.
    expect({ actorType: only.actor_type, actorId: only.actor_id }).toEqual({
      actorType: 'system',
      actorId: 'system',
    })
    expect(only.session_id, 'a migration is not a session').toBeNull()
  })

  it("is stamped with the migration's own moment, never with the record's creation date", () => {
    threeOldRecords()
    const report = migrateRevisions(t.client.sqlite)
    for (const row of allRevisions()) {
      expect(row.at, 'a baseline carries a moment other than the one the migration ran at').toBe(report.at)
    }
    // Both records were created weeks before this run, and neither date appears on a revision.
    // Putting the creation date on content that is not the creation content would read as "this is
    // what it looked like on 1 July" about a row last edited in August.
    const dates = allRevisions().map((r) => r.at)
    expect(dates).not.toContain('2026-07-01 09:00:00')
    expect(dates).not.toContain('2026-06-02 11:30:00')
  })

  it('is called a baseline and never a create, because nobody performed this write', () => {
    threeOldRecords()
    migrateRevisions(t.client.sqlite)
    expect([...new Set(allRevisions().map((r) => r.op))]).toEqual(['baseline'])
  })

  it('writes no change row, so the day the migration runs is not buried under it', () => {
    threeOldRecords()
    const before = t.client.sqlite.prepare('SELECT count(*) AS n FROM changes').get() as { n: number }
    migrateRevisions(t.client.sqlite)
    const after = t.client.sqlite.prepare('SELECT count(*) AS n FROM changes').get() as { n: number }
    // `changes` IS the daily page. A row per record saying "a baseline was recorded" would bury
    // whatever really happened that day, and a baseline is not an event in the work.
    expect(after.n).toBe(before.n)
  })
})

// ============================================================ 3. running it twice

describe('running the backfill again', () => {
  it('writes nothing the second time, and says so', () => {
    threeOldRecords()
    migrateRevisions(t.client.sqlite)
    const afterTheFirst = allRevisions()

    const second = migrateRevisions(t.client.sqlite)

    expect(second.written).toBe(0)
    expect(second.alreadyDone).toBe(true)
    expect(second.alreadyCovered).toBe(3)
    expect(second.at, 'a run that wrote nothing reported a moment it stamped nothing with').toBe('')
    // Not one row added, and not one row touched: every cell is what the first run left.
    expect(allRevisions()).toEqual(afterTheFirst)
    expect(describeRevisionBackfill(second)).toContain('nothing to backfill')
  })

  it('leaves alone a record that already has a history, and only fills the ones with none', () => {
    // Written through the product, so it has a real create revision and then an edit.
    const live = t.api.createRecord({
      workspaceId: 'default',
      kind: 'note',
      title: 'a note written after the ledger existed',
      actor: t.api.HUMAN,
    })
    t.api.updateRecord(live.id, { summary: 'and then edited' }, t.api.HUMAN)
    const itsHistory = revisionsOf(live.id)
    expect(itsHistory.map((r) => r.op)).toEqual(['create', 'update'])

    threeOldRecords()
    const report = migrateRevisions(t.client.sqlite)

    expect(report.written, 'the backfill wrote a baseline for a record that already had a history').toBe(3)
    expect(revisionsOf(live.id), 'the backfill rewrote a record that already had a history').toEqual(itsHistory)
    // A record that already had one is counted as covered rather than silently ignored.
    expect(report.alreadyCovered).toBe(1)
  })

  it('is what a fully migrated database has already been through, so it has nothing left to do', () => {
    // `freshDb` runs `migrateInPlace`, which runs this migration last of the five. A database that
    // has just been built therefore owes no baselines, and a second run must agree.
    const report = migrateRevisions(t.client.sqlite)
    expect(report.alreadyDone).toBe(true)
    expect(report.written).toBe(0)
  })
})

// ============================================================ 4. looking before writing

describe('what the backfill says it would do', () => {
  it('names every record it would fill and writes none of them', () => {
    const ids = threeOldRecords()
    const plan = planRevisionBaselines(t.client.sqlite)

    expect(plan.tableMissing).toBe(false)
    expect(plan.records.map((r) => r.id).sort()).toEqual([...ids].sort())
    expect(allRevisions(), 'planning wrote something').toEqual([])

    // The dry run says the same number and writes nothing either, which is what an operator should
    // run first against a copy of anything they care about.
    const dry = migrateRevisions(t.client.sqlite, { dryRun: true })
    expect(dry.written).toBe(ids.length)
    expect(allRevisions()).toEqual([])
  })

  it('fills the oldest record first, so the ledger is built in a readable order', () => {
    threeOldRecords()
    const plan = planRevisionBaselines(t.client.sqlite)
    // Ordered by the record's creation date. Not a claim about the baselines themselves — they all
    // share one moment — but the order the rows are written in is worth being stable.
    expect(at(plan.records, 0, 'planned record').id).toBe('old-two-0002')
  })

  it('says plainly that a database with no revisions table was never migrated to it', () => {
    threeOldRecords()
    // A database that has not been through migration 0060. Dropped here rather than built up to an
    // intermediate point, because what is under test is the ANSWER when the table is absent.
    t.client.sqlite.exec('DROP TABLE revisions')

    const report = migrateRevisions(t.client.sqlite)
    expect(report.tableMissing).toBe(true)
    expect(report.written).toBe(0)
    // REPORTED AND NOT THROWN: migrating to an intermediate point is a real thing to do, and a data
    // migration that crashed on one would make the intermediate state untestable.
    expect(describeRevisionBackfill(report)).toContain('has no `revisions` table')
    expect(describeRevisionBackfill(report)).toContain('NOTHING was written')
  })
})

// ============================================================ 5. what it tells the operator

describe('the report the migration prints', () => {
  it('says how many baselines it wrote, when, and what a baseline is not', () => {
    threeOldRecords()
    const said = describeRevisionBackfill(migrateRevisions(t.client.sqlite))
    expect(said).toContain('3 baseline revisions')
    expect(said).toContain('NOT the record as it was')
    expect(said).toContain('never stored')
  })

  it('says what a run that wrote no baseline did, instead of explaining baselines it did not write', () => {
    // A record with a ledger, then a write that kept no revision. The baseline pass has nothing to do
    // — every record already carries one — so only the catch-up pass fires.
    const note = t.api.createRecord({
      workspaceId: 'default',
      kind: 'note',
      title: 'a note the ledger stopped describing',
      data: { body: 'as written' },
      actor: t.api.HUMAN,
    })
    t.client.sqlite
      .prepare('UPDATE records SET data = ? WHERE id = ?')
      .run(JSON.stringify({ body: 'rewritten behind the ledger' }), note.id)

    const report = migrateRevisions(t.client.sqlite)
    expect(report.written).toBe(0)
    expect(report.caughtUp).toBe(1)

    const said = describeRevisionBackfill(report)
    expect(said).toContain('no longer described')
    expect(said).toContain(report.at)
    // NOT "0 baseline revisions written", and not the two sentences saying what a baseline holds.
    expect(said).not.toContain('0 baseline')
    expect(said).not.toContain('NOT the record as it was')
  })
})
