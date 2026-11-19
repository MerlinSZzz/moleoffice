// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE CHANGE LOG'S APPEND ORDER, COPIED INTO THE COLUMN MIGRATION 0194 ADDED. Problem BhszTJsVC8rF.
 *
 * Migration 0194 adds `changes.append_order`, empty on every row that exists, and a trigger that
 * numbers every row inserted after it. This step fills the rows that were already there, each with
 * its own rowid. The rowid is the order SQLite appended those rows in, and it is the order
 * `newestChange` and `readingSinceAnchor` read until this column existed. So no reader's answer
 * changes on the day this runs.
 *
 * WHAT IT WRITES: `changes.append_order`, only where it is NULL. It changes no value anybody wrote and
 * repairs no history. It is TypeScript and not an UPDATE in the `.sql` file because a `.sql` migration
 * here may not rewrite rows (tests/migration.test.ts), and this step is declared in that test's
 * DATA_MIGRATIONS list instead.
 *
 * IT RUNS FIRST OF THE DATA STEPS. Some later steps insert change rows, and the trigger numbers each
 * one after the highest number in the table. If one of those ran before this step, it would take a
 * number an older row is about to be given. The check below refuses that case rather than writing two
 * rows at one place.
 *
 * A SECOND RUN WRITES NOTHING: no row is NULL any more.
 */

import type Database from 'better-sqlite3'

/**
 * How many change rows this step numbered. Zero on every run after the first.
 *
 * ZERO AS WELL ON A DATABASE MIGRATED ONLY AS FAR AS A FILE BEFORE 0194, which the migration tests
 * build: there is no column to fill, and 0194 has not run, so no row can be missing a number.
 */
export function migrateAppendOrder(sqlite: Database.Database): number {
  const columns = sqlite.prepare("SELECT name FROM pragma_table_info('changes')").all() as { name: string }[]
  if (!columns.some((column) => column.name === 'append_order')) return 0
  const empty = (sqlite.prepare('SELECT count(*) AS n FROM changes WHERE append_order IS NULL').get() as { n: number }).n
  if (empty === 0) return 0
  const numbered = (sqlite.prepare('SELECT count(*) AS n FROM changes WHERE append_order IS NOT NULL').get() as { n: number }).n
  if (numbered > 0) {
    throw new Error(
      `The change log holds ${String(empty)} row(s) with no place in its append order and ${String(numbered)} row(s) ` +
        'that already have one. This step gives each empty row its own rowid, which is only right when no row has ' +
        'a place yet: otherwise two rows could get one place. Nothing was written. Something inserted change rows ' +
        'between migration 0194 and this step; find what did, and restore the file from the copy taken before the ' +
        'migration.',
    )
  }
  return sqlite.prepare('UPDATE changes SET append_order = rowid WHERE append_order IS NULL').run().changes
}

/** The line `describeOutcome` prints about this step. */
export function describeAppendOrder(numbered: number): string {
  return numbered === 0
    ? 'change log order: every change row already had its place in the order it was appended in'
    : `change log order: ${String(numbered)} change row(s) given their place in the order they were appended in, copied from their rowid`
}
