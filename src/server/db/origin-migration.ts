// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * Write the measured origin onto every row the measurement is about, and nothing else.
 *
 * ---------------------------------------------------------------------------------------
 * DECISION 13: WHAT THIS WRITES, DECLARED
 * ---------------------------------------------------------------------------------------
 *
 * Decision 13 says a migration should normally preserve rows without rewriting them, that one which
 * must rebuild or copy rows is an explicit named exception, and that there is no hidden migration
 * rewrite. So here is this one, named:
 *
 *   IT WRITES ONE COLUMN: `records.origin`. It writes it only where that column is NULL, and
 *   migration 0005 — which runs moments earlier in the same command — is what made it NULL on every
 *   row. It reads no other column to decide anything, changes no other column, creates no row,
 *   deletes no row, and rebuilds no table.
 *
 * THAT IS NOT THE CLASS OF MIGRATION DECISION 13 IS GUARDING AGAINST, and it is declared anyway. The
 * expensive migration is the one that alters a value somebody wrote; this one fills a column that
 * was empty a moment before and could not have held anything. It is on the DATA_MIGRATIONS list in
 * tests/migration.test.ts as a writer of exactly one column, and the test that proves there is no
 * hidden rewrite compares every cell of every table before and after and holds it to that.
 *
 * ---------------------------------------------------------------------------------------
 * WHERE THE VALUES COME FROM, AND WHY THERE IS NO RULE HERE
 * ---------------------------------------------------------------------------------------
 *
 * FROM A MEASUREMENT THE CALLER HANDS IN, AND NOTHING IN THIS REPOSITORY HANDS ONE IN. It used to
 * come from `MEASURED_ORIGINS` in ./origin-inventory.ts: 385 lines, one per row of the corpus that
 * existed when the column arrived, produced by two independent lines of evidence that had to agree
 * on every row. That table was the owner's own record ids and record titles written into the
 * product's source, so it left this repository on 5 September 2026 and is kept outside it.
 *
 * IT LEFT BECAUSE THE ROWS IT DESCRIBES ALREADY CARRY THE FACT. The measurement was applied on
 * 11 August 2026 and `records.origin` has held the answer ever since; the archive carries the
 * column, so a restored database comes back stamped. Measured on a backup of the owner's live
 * database on 5 September 2026: 1,924 records, none with a NULL origin, all 385 measured rows still
 * present and still stamped. There was nothing left for the measurement to do.
 *
 * SO THE DEFAULT MEASUREMENT IS THE EMPTY ONE, and every unstamped row is then reported as
 * unmeasured — the honest reading of a database nobody has measured. A caller who holds the old
 * measurement, which is in the owner's private data repository under `data/inventories/`, can hand
 * it in and get exactly the behaviour that shipped before. The tests hand in a made-up measurement,
 * which is how the matching, the refusals and the counting stay proved.
 *
 * NOTHING IN THIS FILE INFERS AN ORIGIN. Not from a title, not from a kind, not from a date, not
 * from who wrote the record. `fixture` is a fact about the write path, the writer knows it, and
 * every reconstruction of it after the fact is a guess — including the plausible-sounding ones, and
 * especially the ones that would be right most of the time. A row this file cannot find in the
 * measurement KEEPS ITS NULL and is counted, because "nobody has recorded how this record entered
 * the corpus" is a real answer with a sentence of its own in shared/types.ts, and it is the answer
 * that is true.
 *
 * SO A DATABASE THAT IS NOT THIS ONE COMES OUT ENTIRELY UNSTAMPED, deliberately. A colleague's
 * Mole Office, or a database rebuilt by `npm run db:reset`, holds different rows with different ids; the
 * measurement is not about them; they are reported as unmeasured and left alone. The alternative is
 * a rule that would stamp them, and a rule is the thing that must not exist.
 *
 * ---------------------------------------------------------------------------------------
 * THE ONE ASSUMPTION, AND WHAT HAPPENS WHEN IT BREAKS
 * ---------------------------------------------------------------------------------------
 *
 * The assumption is that the row at a measured id is still the row that was measured. It is checked
 * rather than trusted: the `kind` and the `title` recorded beside each id must both still match. If
 * either has changed, the row is NOT stamped and the difference is reported by name. A record whose
 * title somebody edited is a small, honest false negative — it stays NULL and says so — and the
 * alternative is stamping a provenance onto a row this file has no measurement of.
 *
 * ---------------------------------------------------------------------------------------
 * SAFE TO RUN TWICE
 * ---------------------------------------------------------------------------------------
 *
 * It only ever writes where `origin IS NULL`, so the second run finds every measured row already
 * stamped, writes nothing, and reports `alreadyDone`. That is also what makes it safe after a
 * restore: the archive carries the stamp, the restored rows already have it, and this changes
 * nothing. It has no journal row and cannot have one — it decides what to do by looking at the data,
 * exactly as ./blocks-migration.ts does, and for the same reason it lives here rather than in
 * drizzle/.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS STILL OPEN, SAID HERE BECAUSE IT IS THIS FILE'S GAP
 * ---------------------------------------------------------------------------------------
 *
 * TWO WRITE PATHS DO NOT STAMP YET, so every record created after the measurement carries NULL.
 * `createRecord` in src/server/lib/records.ts should stamp `authored`, and scripts/seed.ts should
 * stamp `fixture` on what it writes; both files belong to other work and neither is touched here.
 * Until they do, a fresh `npm run db:reset` produces a corpus with no origins at all — which reads
 * honestly as "nobody recorded this" and is nonetheless not the finished feature.
 *
 * THE EXPORT DOES NOT CARRY THE COLUMN YET EITHER. `REGION_COLUMNS.records` in
 * src/server/lib/export.ts lists the record columns the archive writes, `origin` is not among them,
 * and tests/export-format.test.ts fails on exactly that until somebody adds it. That failure is the
 * test doing its job: shared/types.ts requires the origin to survive an export, and the column list
 * is where that is decided.
 */

import type Database from 'better-sqlite3'
import { readOrigin, type RecordOrigin } from '@shared/types.ts'

/**
 * One row of a corpus as somebody measured it, with everything needed to recognise it again.
 *
 * Declared here because this is the only file that reads one. The 385-row measurement this shape
 * was written for is in the owner's private data repository under `data/inventories/`; see the
 * header for why it is not here.
 */
export interface MeasuredOrigin {
  /** The record's id, which is what the stamp is matched on. */
  id: string
  /** What the evidence said this row is. */
  origin: RecordOrigin
  /** The kind it had when measured. Checked, not used to decide anything. */
  kind: string
  /** The title it had when measured. Checked, not used to decide anything. */
  title: string
}

/**
 * What this repository ships: nothing measured.
 *
 * Not a placeholder for a measurement that is coming. It is the whole truth about a database this
 * code has never seen, and it is also true of the owner's, whose rows carry their origin already.
 */
const NOTHING_MEASURED: readonly MeasuredOrigin[] = []

/** A row this migration would not stamp, and why. Every one of these leaves a NULL behind. */
export interface OriginNote {
  kind:
    /** The id is in no measurement, so nothing here knows anything about this row. */
    | 'not_measured'
    /** The id was measured, and the row at it is not the row that was measured. */
    | 'title_changed'
    | 'kind_changed'
    /** The column already holds a word that is not one of RECORD_ORIGINS. */
    | 'unreadable_origin'
  recordId: string
  detail: string
}

export interface OriginMigrationReport {
  /**
   * True when `records` has no `origin` column, so migration 0005 has not been applied here.
   *
   * REPORTED RATHER THAN THROWN, because migrating to an intermediate point is a real thing to do —
   * tests/migration.test.ts builds databases at 0000 and at 0003 on purpose, to check what the next
   * migration does to a database that already has rows in it. A data migration that crashed on those
   * would make the intermediate state untestable, which is the state every migration accident
   * happens in. Nothing is stamped and the report says why, in the same breath.
   */
  columnMissing: boolean
  /** True when no row needed a stamp: every row already had one, or there are no rows. */
  alreadyDone: boolean
  /** Rows stamped `fixture` by THIS run. */
  fixture: number
  /** Rows stamped `authored` by THIS run. */
  authored: number
  /** Rows that already carried a readable origin and were not touched. */
  alreadyStamped: number
  /** Rows left NULL by this run. One note below explains each. */
  unstamped: number
  notes: OriginNote[]
}

/** A record as this file needs it. Read with raw SQL, so nothing is parsed that need not be. */
interface RecordRow {
  id: string
  kind: string
  title: string
  origin: string | null
}

/** One row's fate, decided before anything is written. */
interface PlannedStamp {
  id: string
  origin: RecordOrigin
}

/**
 * Work out what would be stamped, without writing any of it.
 *
 * Exported for the same reason `planBlockMigration` is: an operator can see what a migration would
 * do to their corpus before it does it, and a test can assert on a refusal without a database it is
 * willing to lose.
 */
export function planOriginStamps(
  sqlite: Database.Database,
  measurement: readonly MeasuredOrigin[] = NOTHING_MEASURED,
): {
  columnMissing: boolean
  stamps: PlannedStamp[]
  alreadyStamped: number
  notes: OriginNote[]
} {
  const measured = new Map(measurement.map((m) => [m.id, m]))
  const stamps: PlannedStamp[] = []
  const notes: OriginNote[] = []
  let alreadyStamped = 0

  // Asked of the database rather than assumed from the migration folder, because this file has no
  // way to know which migrations the caller pointed drizzle at. See `columnMissing` above.
  const hasColumn =
    (sqlite.prepare("SELECT count(*) AS n FROM pragma_table_info('records') WHERE name = 'origin'").get() as {
      n: number
    }).n > 0
  if (!hasColumn) return { columnMissing: true, stamps, alreadyStamped, notes }

  // Every record, including the soft-deleted ones. How a row entered the corpus does not change
  // when somebody deletes it, and a deleted record can be restored — one that came back carrying no
  // origin, while its neighbours carried one, would read as a row somebody had judged differently.
  const rows = sqlite.prepare('SELECT id, kind, title, origin FROM records').all() as RecordRow[]

  for (const row of rows) {
    if (row.origin !== null) {
      // A word already there is left exactly as it is. This branch is what makes a second run a
      // no-op, and it is also the only thing standing between a restored archive and this file
      // overwriting a stamp that came back with it.
      if (readOrigin(row.origin) === null) {
        notes.push({
          kind: 'unreadable_origin',
          recordId: row.id,
          detail:
            `"${row.title}" already stores the origin "${row.origin}", which is not one of the two words ` +
            `RECORD_ORIGINS declares. It is left exactly as written: something wrote it on purpose and this ` +
            `migration does not know what it meant. \`readOrigin\` answers null for it, so every reader treats ` +
            `it as unstamped until somebody says otherwise.`,
        })
      }
      alreadyStamped++
      continue
    }

    const known = measured.get(row.id)
    if (known === undefined) {
      notes.push({
        kind: 'not_measured',
        recordId: row.id,
        detail:
          `"${row.title}" (${row.kind}) is not in the measurement, so nothing here knows how it entered the ` +
          `corpus. It keeps its NULL. Either it was written after the measurement was taken, or this is a ` +
          `different database — in both cases the honest answer is that nobody has recorded it.`,
      })
      continue
    }
    if (known.title !== row.title) {
      notes.push({
        kind: 'title_changed',
        recordId: row.id,
        detail:
          `the record ${row.id} was measured as "${known.title}" and is now called "${row.title}". The ` +
          `measurement is a fact about a row, and this is not demonstrably that row, so it is NOT stamped. ` +
          `Somebody who knows the record can set its origin by hand.`,
      })
      continue
    }
    if (known.kind !== row.kind) {
      notes.push({
        kind: 'kind_changed',
        recordId: row.id,
        detail:
          `the record ${row.id} ("${row.title}") was measured as a ${known.kind} and is now a ${row.kind}. ` +
          `That is not the row that was measured, so it is NOT stamped.`,
      })
      continue
    }
    stamps.push({ id: row.id, origin: known.origin })
  }

  return { columnMissing: false, stamps, alreadyStamped, notes }
}

/**
 * Apply the stamps. One transaction, and it either all lands or none of it does.
 *
 * `dryRun` plans and reports and writes nothing, which is what an operator should run first against
 * a copy of anything they care about.
 */
export function migrateOrigins(
  sqlite: Database.Database,
  opts: { dryRun?: boolean; measurement?: readonly MeasuredOrigin[] } = {},
): OriginMigrationReport {
  const { columnMissing, stamps, alreadyStamped, notes } = planOriginStamps(sqlite, opts.measurement)

  const report: OriginMigrationReport = {
    columnMissing,
    alreadyDone: stamps.length === 0,
    fixture: stamps.filter((s) => s.origin === 'fixture').length,
    authored: stamps.filter((s) => s.origin === 'authored').length,
    alreadyStamped,
    // Counted from the notes rather than from a second subtraction, so the number and the
    // explanations cannot disagree: every unstamped row has exactly one note, and every note that
    // is not about an already-stamped row is about an unstamped one.
    unstamped: notes.filter((n) => n.kind !== 'unreadable_origin').length,
    notes,
  }
  if (stamps.length === 0) return report
  if (opts.dryRun === true) return report

  // `WHERE origin IS NULL` as well as `WHERE id = ?`, so that even a plan built against a row that
  // was stamped in between cannot overwrite the newer value. The plan is read and applied inside one
  // command, so this is belt and braces rather than a race anybody has seen — but the cost is one
  // clause and the thing it protects is a provenance claim.
  const stamp = sqlite.prepare('UPDATE records SET origin = @origin WHERE id = @id AND origin IS NULL')
  const run = sqlite.transaction(() => {
    for (const s of stamps) stamp.run({ id: s.id, origin: s.origin })
  })
  run()

  // NO `changes` ROW IS WRITTEN FOR A STAMP, and that is deliberate rather than an omission.
  // `changes` IS the daily page — a day is a filter on `at` — so 385 rows saying "origin recorded"
  // would bury whatever really happened on the day this migration is run, which is the same argument
  // that keeps reader anchors and panel layouts out of the log. The stamp is also not an event in
  // the work: it records something that was already true when the record was written, and back-dating
  // 385 change rows to the moments those records were created would be inventing history. What the
  // operator sees instead is this report, printed by `npm run db:migrate`.
  return report
}
