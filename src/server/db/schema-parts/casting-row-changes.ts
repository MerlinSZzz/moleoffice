// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { aPartTable } from '../part-tables.ts'

/**
 * EVERY CHANGE TO A CASTING, append-only, migration 0190: which casting, what (add, change, remove, mark,
 * unmark, migrate), who, when, the row before and after as JSON, and the decisions the writer named. It
 * holds the history of migration 0189's table too, copied with its ids.
 */
export const castingRowChanges = aPartTable(sqliteTable('casting_row_changes', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  castingId: integer('casting_id').notNull(),
  role: text('role').notNull(),
  project: text('project').notNull().default(''),
  what: text('what').notNull(),
  at: text('at').notNull(),
  byKind: text('by_kind').notNull(),
  byId: text('by_id').notNull(),
  authority: text('authority'),
  decisions: text('decisions').notNull(),
  note: text('note'),
  before: text('before'),
  after: text('after'),
}, table => [
  index('casting_row_changes_casting').on(table.castingId, table.id),
  index('casting_row_changes_role').on(table.role, table.id),
]), { existingArchive: true })
