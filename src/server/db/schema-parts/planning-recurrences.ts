// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { index, real, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { aPartTable } from '../part-tables.ts'

const existingArchive = { existingArchive: true } as const

/**
 * WORK THAT COMES ROUND AGAIN.
 *
 * The smallest recurrence that covers what a person actually does: a daily login, a thing on chosen
 * weekdays, a weekly task, a monthly review. **Not a calendar engine** — there is no timezone rule,
 * no exception list, no "third Tuesday", no end date, because none of those has been needed and
 * each is a whole subsystem.
 *
 * A RECURRENCE IS NOT AN OCCURRENCE. This row says "this work comes round on these days"; the
 * occurrences are ordinary allocations, made when a week or a day is planned. So completing today's
 * occurrence completes that allocation and nothing else — the settled rule, which is exactly what
 * stops a daily login being marked done for ever the first time somebody does it.
 *
 * Person-level, like the rest of the planning layer: it names a record that stays in its own
 * project, and a week of routines spans projects.
 */
export const planningRecurrences = aPartTable(sqliteTable(
  'planning_recurrences',
  {
    id: text('id').primaryKey(),
    /** The canonical work that comes round. It is not copied; this names it. */
    recordId: text('record_id').notNull(),
    /**
     * How often, in the only three shapes this supports: `daily`, `weekly`, or `weekdays`.
     *
     * `weekdays` reads `days` beside it. Three words rather than a grammar, because a grammar is
     * the calendar engine this deliberately is not.
     */
    every: text('every').notNull(),
    /** For `weekdays`: ISO weekday numbers, 1 = Monday, comma-separated. Null otherwise. */
    days: text('days'),
    /** Hours each occurrence is expected to take, or NULL — which means nobody said, as ever. */
    hoursEach: real('hours_each'),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
    createdBy: text('created_by').notNull(),
  },
  (table) => [index('planning_recurrences_record_idx').on(table.recordId)],
), existingArchive)
