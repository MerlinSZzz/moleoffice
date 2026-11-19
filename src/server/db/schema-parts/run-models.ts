// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { sql } from 'drizzle-orm'
import { check, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { aPartTable } from '../part-tables.ts'

/**
 * THE MODEL A RUN USES, AS THE SETTINGS PAGE SETS IT. Criterion U2.
 *
 * One row for the whole installation, in the shape `preview_root_additions` uses. `settings` holds
 * a JSON object with the office's choice for a run answering a message. A builder's model for each
 * role card, and the check's, are in the `casting` table below since migration 0189; a row written
 * before it may still hold them, unread. The shape and its one strict reader
 * are in src/shared/run-models.ts; the writer and `theModelARunGets` are in
 * src/server/lib/run-models.ts. No row means nobody has set anything.
 */
export const runModels = aPartTable(sqliteTable('run_models', {
  onlyRow: integer('only_row').primaryKey().notNull(),
  settings: text('settings').notNull(),
  updatedAt: text('updated_at').notNull(),
  updatedByKind: text('updated_by_kind').notNull(),
  updatedById: text('updated_by_id').notNull(),
  authority: text('authority'),
}, table => [check('run_models_singleton', sql`${table.onlyRow} = 1`)]), { existingArchive: true })
