// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { integer, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { aPartTable, type ExistingMeasured } from '../part-tables.ts'

const existingMeasured: ExistingMeasured = { existingMeasured: true }

/** Daily encounters with gates, including the positions that allowed the work through. */
export const gateCounts = aPartTable(sqliteTable('gate_counts', {
  gate: text('gate').notNull(),
  day: text('day').notNull(),
  wouldStop: integer('would_stop').default(0).notNull(),
  stopped: integer('stopped').default(0).notNull(),
  reminded: integer('reminded').default(0).notNull(),
  ignored: integer('ignored').default(0).notNull(),
  heeded: integer('heeded').default(0).notNull(),
}, (t) => [primaryKey({columns: [t.gate, t.day]})]), existingMeasured)
