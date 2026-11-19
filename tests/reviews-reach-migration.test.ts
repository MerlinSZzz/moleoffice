// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * HOW WIDE EVERY STORED REVIEW IS, WRITTEN DOWN — AND THE PARTIAL UNIQUE INDEX THAT ONLY MEANS
 * ANYTHING ONCE IT IS.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS UNDER TEST
 * ---------------------------------------------------------------------------------------
 *
 * design/round-ten/migrations/reviews-reach.ts. Two acts in one transaction:
 *
 *   act one — every review whose entry names a `page` or a `uiSurface` target gets `reach='global'`,
 *             because `SCOPE_READERS` was already collecting the whole project for both of them.
 *             Everything else reads `local`, which the column already holds.
 *   act two — `CREATE UNIQUE INDEX reviews_one_global_collecting ...`, AFTER act one.
 *
 * ---------------------------------------------------------------------------------------
 * THE ONE THING THIS FILE EXISTS FOR THAT THE CORPUS CANNOT SHOW
 * ---------------------------------------------------------------------------------------
 *
 * Measured on 26 August 2026 by design/round-ten/scratch/w7-reviews-reach-count.mjs: the owner's
 * corpus holds **2** reviews and **0** whose entry names either wide kind. So the `global` half runs
 * on nothing there, and the loud failure the index is bought for — a corpus already holding two
 * project-wide reviews collecting in one project — cannot be made to happen on it. THE FIXTURE IS
 * THE ONLY PLACE THAT FAILURE CAN BE SEEN, and the case below builds it and watches the whole
 * transaction refuse by name. The plan says the index is proved on a fixture rather than on the
 * corpus; this is that fixture.
 *
 * ---------------------------------------------------------------------------------------
 * IT IS NOT REGISTERED AND THIS FILE ASSERTS THAT
 * ---------------------------------------------------------------------------------------
 *
 * `npm run db:migrate` runs on every clone and on every server start, including the owner's. There
 * is no migration window in this run, so registering this file is what would take the owner's server down.
 * The last cases here read `drizzle/meta/_journal.json` and `src/server/db/migrate.ts` and fail if
 * either has learned about it.
 *
 * Every failing case here was proved by mutation, with a control run of this file first.
 */

import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type Database from 'better-sqlite3'
import { freshDb, type TestDb } from './helpers.ts'
import {
  INDEX_NAME,
  INDEX_SQL,
  countReachShapes,
  describeReviewsReach,
  indexSqlIn,
  migrateReviewsReach,
  planReviewsReach,
} from '../src/server/db/reviews-reach.ts'

const WORKSPACE = 'panelx'

let t: TestDb
let sqlite: Database.Database

beforeEach(async () => {
  t = await freshDb()
  sqlite = t.client.sqlite as unknown as Database.Database
  // THE INDEX IS DROPPED BEFORE EVERY CASE, and that is a fact about window B rather than tidying up.
  // `freshDb` runs the product's own `migrateInPlace`, and since window B this step is registered in
  // it — so by the time a case starts, the index it creates is already there and the backfill has
  // already run. Every case below is about what this step does to a corpus that has NOT had it, so
  // the fixture puts the database back into that state, which is the only state it will ever meet.
  sqlite.prepare(`DROP INDEX IF EXISTS ${INDEX_NAME}`).run()
})

afterEach(() => t.close())

/**
 * Write a review row straight into the table.
 *
 * STRAIGHT IN, AND THAT IS THE POINT: `startReview` writes `reach: 'local'` and no route writes
 * anything else, so going through the door could not produce a row this migration has anything to
 * say about. These are rows that got in before the column existed.
 */
function review(
  id: string,
  opts: { targetKind?: string | null; entry?: string; state?: string; reach?: string; workspaceId?: string } = {},
): void {
  const entry =
    opts.entry ??
    JSON.stringify(
      opts.targetKind === null ? { view: 'a screen' } : { target: { kind: opts.targetKind ?? 'record', recordId: 'r1' } },
    )
  sqlite
    .prepare(
      'INSERT INTO reviews (id, workspace_id, entry, state, started_at, started_by, reach) VALUES (?,?,?,?,?,?,?)',
    )
    .run(id, opts.workspaceId ?? WORKSPACE, entry, opts.state ?? 'collecting', '2026-08-26 09:00:00', `human:${THE_TEST_OFFICES_OWNER.id}`, opts.reach ?? 'local')
}

/** The reach a row holds now, read back from the table. */
function reachOf(id: string): string {
  return sqlite.prepare('SELECT reach FROM reviews WHERE id = ?').pluck().get(id) as string
}

// ============================================================================ act one

describe('every review that was project-wide in all but name says so', () => {
  it('widens a review started from a page and one started from a part of the screen, and nothing else', () => {
    // ONE OF THE TWO WIDE ONES IS FINISHED. Two of them COLLECTING in one project is the state the
    // index forbids, and the case below is where that is proved; here the subject is act one.
    review('rv-page', { targetKind: 'page' })
    review('rv-surface', { targetKind: 'uiSurface', state: 'collected' })
    review('rv-record', { targetKind: 'record' })
    review('rv-plan', { targetKind: 'planLine' })

    const done = migrateReviewsReach(sqlite, countReachShapes(sqlite))

    expect(reachOf('rv-page')).toBe('global')
    expect(reachOf('rv-surface')).toBe('global')
    expect(reachOf('rv-record')).toBe('local')
    expect(reachOf('rv-plan')).toBe('local')
    expect(done.setGlobal).toBe(2)
    // READ, DECIDED, AND FOUND ALREADY RIGHT is not the same answer as WRITTEN, and the report keeps
    // them apart. The plan's row 7 calls the second half "2 set local"; on a corpus where the column
    // defaults to `local` that is two rows nothing has to be done to.
    expect(done.affirmedLocal).toBe(2)
    expect(done.rowsWritten).toBe(2)
  })

  it('never narrows a review that already says it is project-wide, whatever its entry names', () => {
    // From the wave that lands global review, a person may start a project-wide review from wherever
    // they are standing — so a `global` review's entry is free to name a record, and narrowing on the
    // entry would delete that person's press.
    review('rv-chosen', { targetKind: 'record', reach: 'global' })
    const done = migrateReviewsReach(sqlite, countReachShapes(sqlite))
    expect(reachOf('rv-chosen')).toBe('global')
    expect(done.alreadyGlobal).toBe(1)
    expect(done.rowsWritten).toBe(0)
    expect(done.notes.map((one) => one.kind)).toContain('already_global')
  })

  it('leaves a review whose entry it cannot read a target kind out of exactly as it is, and names it', () => {
    review('rv-prose', { entry: 'the background to a piece of hardware' })
    review('rv-notarget', { targetKind: null })
    const done = migrateReviewsReach(sqlite, countReachShapes(sqlite))
    expect(reachOf('rv-prose')).toBe('local')
    expect(reachOf('rv-notarget')).toBe('local')
    expect(done.notes.map((one) => one.kind)).toContain('unreadable_entry')
    expect(done.notes.map((one) => one.kind)).toContain('no_target')
    expect(done.rowsWritten).toBe(0)
  })

  it('refuses a corpus it has not been told the numbers for, and names both of them', () => {
    review('rv-page', { targetKind: 'page' })
    expect(() => migrateReviewsReach(sqlite, { reviews: 21, wide: 10 })).toThrow(/not the one that was counted/)
    // AND NOTHING WAS WRITTEN. The refusal is before the transaction, not inside a half-done one.
    expect(reachOf('rv-page')).toBe('local')
    expect(indexSqlIn(sqlite)).toBeNull()
  })
})

// ============================================================================ act two

describe('the partial unique index, created after the backfill and not before it', () => {
  it('creates it with the declared predicate, character for character', () => {
    review('rv-record', { targetKind: 'record' })
    const done = migrateReviewsReach(sqlite, countReachShapes(sqlite))
    expect(done.indexCreated).toBe(true)
    expect(indexSqlIn(sqlite)).toBe(INDEX_SQL)
    expect(INDEX_SQL).toContain(`WHERE reach = 'global' AND state = 'collecting'`)
  })

  it('then refuses a second project-wide review collecting in the same project', () => {
    review('rv-page', { targetKind: 'page' })
    migrateReviewsReach(sqlite, countReachShapes(sqlite))
    // THE INDEX IS WHAT REFUSES, and this is the state it was bought to make impossible.
    expect(() =>
      sqlite
        .prepare('INSERT INTO reviews (id, workspace_id, entry, state, started_at, started_by, reach) VALUES (?,?,?,?,?,?,?)')
        .run('rv-second', WORKSPACE, '{"target":{"kind":"page"}}', 'collecting', '2026-08-26 10:00:00', `human:${THE_TEST_OFFICES_OWNER.id}`, 'global'),
    ).toThrow(/UNIQUE/)
  })

  it('lets one project-wide review collect per project, and any number that are not collecting', () => {
    review('rv-a', { targetKind: 'page', workspaceId: 'panelx' })
    review('rv-b', { targetKind: 'page', workspaceId: 'thor', state: 'collecting' })
    review('rv-done', { targetKind: 'page', state: 'sent' })
    review('rv-done2', { targetKind: 'page', state: 'collected' })
    const done = migrateReviewsReach(sqlite, countReachShapes(sqlite))
    expect(done.setGlobal).toBe(4)
    expect(done.indexCreated).toBe(true)
  })

  /**
   * THE LOUD FAILURE, AND IT IS THE REASON THE INDEX IS NOT DECLARED IN `schema.ts`.
   *
   * Created in window A it would have been created against a corpus where nothing was `global` yet,
   * and would have been satisfied in silence forever. Created here, after the backfill has decided
   * each review's reach, a corpus that already holds two project-wide reviews collecting in one
   * project cannot get past it — and the whole transaction rolls back, so the reach each review was
   * about to be given is not kept either.
   */
  it('refuses the whole thing when the backfill would produce two collecting at once, and names them', () => {
    review('rv-one', { targetKind: 'page' })
    review('rv-two', { targetKind: 'uiSurface' })
    let message = ''
    try {
      migrateReviewsReach(sqlite, countReachShapes(sqlite))
    } catch (err) {
      message = (err as Error).message
    }
    expect(message).toContain(INDEX_NAME)
    expect(message).toContain('rv-one')
    expect(message).toContain('rv-two')
    expect(message).toContain('panelx')
    // NOTHING WAS KEPT — not the index, and not the reach either review was about to be given.
    expect(indexSqlIn(sqlite)).toBeNull()
    expect(reachOf('rv-one')).toBe('local')
    expect(reachOf('rv-two')).toBe('local')
  })

  it('refuses when an index of that name is already there with a different predicate', () => {
    review('rv-record', { targetKind: 'record' })
    sqlite.prepare(`CREATE UNIQUE INDEX ${INDEX_NAME} ON reviews (workspace_id) WHERE state = 'collecting'`).run()
    expect(() => migrateReviewsReach(sqlite, countReachShapes(sqlite))).toThrow(/different definition/)
  })
})

// ============================================================================ twice

describe('it is safe to run twice', () => {
  it('plans nothing and writes nothing the second time, and says so', () => {
    review('rv-page', { targetKind: 'page' })
    review('rv-record', { targetKind: 'record' })

    const first = migrateReviewsReach(sqlite, countReachShapes(sqlite))
    expect(first.alreadyDone).toBe(false)
    expect(first.rowsWritten).toBe(1)
    expect(first.indexCreated).toBe(true)

    const planned = planReviewsReach(sqlite)
    expect(planned.moves).toEqual([])
    expect(planned.indexAlreadyThere).toBe(true)

    const second = migrateReviewsReach(sqlite, countReachShapes(sqlite))
    expect(second.alreadyDone).toBe(true)
    expect(second.rowsWritten).toBe(0)
    expect(second.indexCreated).toBe(false)
    expect(second.indexAlreadyThere).toBe(true)
    expect(describeReviewsReach(second)).toContain('Nothing to do')

    // AND THE DATABASE IS WHERE THE FIRST RUN LEFT IT.
    expect(reachOf('rv-page')).toBe('global')
    expect(reachOf('rv-record')).toBe('local')
    expect(indexSqlIn(sqlite)).toBe(INDEX_SQL)
  })

  it('reports nothing to do on a corpus that never had a wide review, once the index is there', () => {
    review('rv-record', { targetKind: 'record' })
    migrateReviewsReach(sqlite, countReachShapes(sqlite))
    const again = migrateReviewsReach(sqlite, countReachShapes(sqlite))
    expect(again.alreadyDone).toBe(true)
  })
})

// ============================================================================ the corpus

describe('the number it was sized at is a measurement of this corpus and not the plan\'s first figure', () => {
  it('counts what is there in the plan\'s own two statements', () => {
    review('rv-a', { targetKind: 'page' })
    review('rv-b', { targetKind: 'record' })
    review('rv-c', { targetKind: 'uiSurface' })
    expect(countReachShapes(sqlite)).toEqual({ reviews: 3, wide: 2 })
  })

  it('answers zero on a database with no reviews table at all', () => {
    // A database migrated part-way. The step reads rather than assumes.
    sqlite.prepare('DROP TABLE reviews').run()
    expect(countReachShapes(sqlite)).toEqual({ reviews: 0, wide: 0 })
  })
})

// ============================================================================ not registered

