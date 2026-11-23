// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'
import { aPartTable } from '../part-tables.ts'

/**
 * THE CASTING LABELS, migration 0349. A label names a kind of work and can be made,
 * renamed and removed on the Casting page, with what it means. One row per label, for the whole installation; the
 * unique index keeps two labels from sharing a name. `meaning_from` is where the meaning came from, as JSON read by
 * `readCastingCellSource` in src/shared/casting.ts, or NULL when nobody has written a meaning. A Casting row's
 * `labels` holds the ids. A removed label's row is deleted. The reader and the writers are in
 * src/server/lib/casting-labels.ts.
 */
export const castingLabels = aPartTable(sqliteTable('casting_labels', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  meaning: text('meaning'),
  meaningFrom: text('meaning_from'),
  changedAt: text('changed_at').notNull(),
  changedByKind: text('changed_by_kind').notNull(),
  changedById: text('changed_by_id').notNull(),
  authority: text('authority'),
}, table => [uniqueIndex('casting_labels_name').on(table.name)]), { existingArchive: true })
