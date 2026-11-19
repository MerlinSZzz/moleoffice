// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { aPartTable, type ExistingMeasured } from '../part-tables.ts'

const existingMeasured: ExistingMeasured = { existingMeasured: true }

/**
 * How far the office has read each day file of the gate-count spool, in bytes (src/server/lib/gate-count-spool.ts). A
 * file's lines up to here are counted in `gate_counts` or sent to the rejects file, so a line is counted once, also
 * across a restart. `file` is the day file's name alone, such as `2026-10-24.jsonl`.
 */
export const gateCountSpoolReads = aPartTable(sqliteTable('gate_count_spool_reads', {
  file: text('file').primaryKey().notNull(),
  bytes: integer('bytes').notNull(),
}), existingMeasured)
