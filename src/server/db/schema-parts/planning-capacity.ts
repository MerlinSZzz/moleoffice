// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { primaryKey, real, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { aPartTable } from '../part-tables.ts'

const existingArchive = { existingArchive: true } as const

/**
 * HOW MANY HOURS A PERIOD ACTUALLY HOLDS, when somebody has said.
 *
 * A row per period that has been given one, and NO ROW IS NOT ZERO — it means nobody has said how
 * much time this week holds, so `fitOf` answers null for free hours rather than computing them from
 * a number nobody gave. A default working week would be exactly the plausible guess this product
 * refuses everywhere else: it would report a week as fitting when the truth is that nobody looked.
 *
 * Person-level, like `allocations`, and for the same settled reason.
 */
export const planningCapacity = aPartTable(sqliteTable(
  'planning_capacity',
  {
    /** 'month' | 'week' | 'day'. */
    horizon: text('horizon').notNull(),
    /** The period key this is the capacity of. */
    period: text('period').notNull(),
    /** Hours available. Somebody typed this; nothing derives it from a calendar. */
    hours: real('hours').notNull(),
    /** Why it is this number — "three teaching days" — when there is something to say. */
    note: text('note'),
    updatedAt: text('updated_at').notNull(),
    updatedBy: text('updated_by').notNull(),
  },
  (table) => [primaryKey({ columns: [table.horizon, table.period] })],
), existingArchive)
