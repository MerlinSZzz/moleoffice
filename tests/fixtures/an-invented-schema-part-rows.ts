// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE MADE-UP ROWS AND SENTENCES OF tests/fixtures/an-invented-schema-part.ts, in a file of their own.
 *
 * A part file exports its tables and nothing else, because schema.ts re-exports everything a part
 * exports. The test reads these to look for each row in the archive and after the restore, and for
 * each sentence where the export and the restore proof print it.
 */

/** Two rows of the table a restore compares that has a project column. */
export const NOTES = [
  { id: 'made-up-note-1', workspace_id: 'default', settled: 1, shape: JSON.stringify({ sides: 3, names: ['a', 'b'] }), hours: 2 },
  { id: 'made-up-note-2', workspace_id: 'default', settled: 0, shape: null, hours: null },
] as const

/** One row of the table a restore compares that belongs to no project. */
export const HOURS = [{ day: '2026-10-23', hours: 7 }] as const

export const NO_PROJECT = "A made-up count of hours in a test is the whole installation's and no single project's"

/** What the table a restore may lose says, and the row its fill writes. */
export const SCAN = {
  why:
    'A made-up table a scan would rebuild in a test: every row describes the files of the machine it was ' +
    'taken on, so no archive carries it.',
  repair: 'A made-up repair in a test: scan the files again on the restored machine.',
  path: 'made/up/path.md',
} as const

/** What the retired table an archive carries says. Nothing fills it; the test writes its one row. */
export const RETIRED = {
  why:
    'A made-up retired table in a test: a later migration copied every row out of it, and nothing ' +
    'under src/ writes it any more.',
  id: 'made-up-retired-1',
} as const

/** What the table no archive carries and the proof leaves out says. The test writes its one row. */
export const LEFT_OUT = {
  why:
    'A made-up table in a test that was taken out of backups and exports: its only writer was deleted, ' +
    'so nothing puts a row in it.',
  id: 'made-up-left-out-1',
} as const
