// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { index, real, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { aPartTable } from '../part-tables.ts'

const existingArchive = { existingArchive: true } as const

export const planningIntents = aPartTable(sqliteTable(
  'planning_intents',
  {
    /** nanoid. */
    id: text('id').primaryKey(),
    /** What the person wrote, EXACTLY as they wrote it. Never trimmed, parsed away or repaired. */
    said: text('said').notNull(),
    /** The canonical work this is about, or NULL because it is not about a record yet. */
    recordId: text('record_id'),
    /** The plan line this was written on, or NULL because it was not written on one. */
    planLineId: text('plan_line_id'),
    /** 'month' | 'week' | 'day', or NULL when no period was read from the words. */
    horizon: text('horizon'),
    /** The period key that was read, or NULL when none was. Never a guess. */
    period: text('period'),
    /** The hours that were read, or NULL when none were. Null is not zero. */
    hours: real('hours'),
    /** kept | offered | committed. Only `committed` is in any total. */
    state: text('state').notNull().default('kept'),
    /** LOCAL wall clock. Who wrote it: `${actor.type}:${actor.id}`. */
    createdAt: text('created_at').notNull(),
    createdBy: text('created_by').notNull(),
  },
  (table) => [
    // The two reads there are: the intents on one plan line, and the intents about one record.
    index('planning_intents_line_idx').on(table.planLineId),
    index('planning_intents_record_idx').on(table.recordId),
  ],
), existingArchive)
