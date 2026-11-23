// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { aPartTable } from '../part-tables.ts'

/**
 * EVERY CHANGE TO A CASTING LABEL, append-only, migration 0349: which label, what (add, rename, change, remove,
 * migrate), who, when, and the label before and after as JSON. It keeps a removed label's history and last name.
 */
export const castingLabelChanges = aPartTable(sqliteTable('casting_label_changes', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  labelId: integer('label_id').notNull(),
  what: text('what').notNull(),
  at: text('at').notNull(),
  byKind: text('by_kind').notNull(),
  byId: text('by_id').notNull(),
  authority: text('authority'),
  note: text('note'),
  before: text('before'),
  after: text('after'),
}, table => [index('casting_label_changes_label').on(table.labelId, table.id)]), { existingArchive: true })
