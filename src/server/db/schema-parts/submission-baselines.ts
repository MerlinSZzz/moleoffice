// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { aPartTable } from '../part-tables.ts'

const existingArchive = { existingArchive: true } as const

/**
 * WHERE THE REVISIONS LEDGER STOOD WHEN A RUN WAS FILED, so a seal can name what a record held
 * before that run touched it. Criterion C34.
 *
 * `submission_events` STOOD BESIDE THIS AND IS GONE, dropped by migration 0154. It copied every
 * revision, change and link row as it was written, for facts the database already had. A decision
 * followed: a seal keeps pointers and hashes and copies nothing.
 *
 * `watermark` IS A ROWID IN `revisions`, not a count of anything. That table is append-only —
 * nothing in this repository deletes from it — so its rowids are its insertion order. It was a
 * position in `submission_events` until 0154 converted every row it could.
 *
 * NULLABLE, AND NULL IS A POSITION THAT COULD NOT BE RECOVERED. `recovered` says which of three this
 * row is: `live` for a row the trigger wrote after 0154, `converted` for an old row whose position
 * was worked out exactly from the events, and `not-recovered` for one where the evidence did not
 * support a value. A plausible number in that last case would be indistinguishable from a real one.
 */
export const submissionBaselines = aPartTable(sqliteTable('submission_baselines', {
  runId: text('run_id').primaryKey().notNull(),
  watermark: integer('watermark'),
  recovered: text('recovered').notNull(),
}), existingArchive)
