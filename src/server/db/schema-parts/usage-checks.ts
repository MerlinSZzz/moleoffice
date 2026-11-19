// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { aPartTable } from '../part-tables.ts'

/**
 * WHAT A CONTRADICTION CHECK SAID AT THE TIME. One row per check per bootstrap call.
 *
 * MEASURED. Storing the outcome is the only way to have this fact at all: a check compares two
 * durable sources as they stand, and neither side keeps the history that would let the comparison be
 * recomputed for a past date. Absence here is not "nothing was wrong", it is "nobody looked", and
 * the two must not be mixed.
 *
 * A STORED ROW IS READ ONLY AS WHAT THE CHECK SAID THEN, never as what it says now. Every live
 * surface recomputes. The trace view is this table's only reader and draws each row with its own
 * time beside it.
 */
export const usageChecks = aPartTable(sqliteTable(
  'usage_checks',
  {
    /** nanoid. */
    id: text('id').primaryKey(),
    /** When the check ran, epoch milliseconds. */
    atMs: integer('at_ms').notNull(),
    /** The `api_calls` row of the bootstrap call that ran it. NULL when that row was not written. */
    callId: text('call_id'),
    /** Copied from that row so the check lands inside the trace and prunes with it. NULL when the caller sent no trace. */
    traceId: text('trace_id'),
    /** Which check, from the declared set. */
    checkId: text('check_id').notNull(),
    /** 1, 0, or NULL WHEN THE CHECK COULD NOT RUN. The fifth engineering rule as a column. */
    passed: integer('passed'),
    /** The two numbers it compared, so a reader sees how far apart they were. NULL when it could not run. */
    leftN: integer('left_n'),
    rightN: integer('right_n'),
  },
  (t) => [
    index('usage_checks_trace_idx').on(t.traceId, t.atMs),
    // Answers "how long has this contradiction stood", which nothing in this product can answer today.
    index('usage_checks_check_idx').on(t.checkId, t.atMs),
  ],
), { existingMeasured: true })
