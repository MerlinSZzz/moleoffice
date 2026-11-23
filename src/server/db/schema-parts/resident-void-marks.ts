// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'
import { aPartTable } from '../part-tables.ts'
import { agents } from './agents.ts'

/**
 * A FILE IN A RESIDENT'S SPACE MARKED VOID, with the reason. By a decision, a wrong entry is marked
 * void, never deleted. The file stays; a page draws it struck through with
 * this reason beside it. One mark per path.
 */
export const residentVoidMarks = aPartTable(sqliteTable(
  'resident_void_marks',
  {
    id: text('id').primaryKey(),
    residentId: text('resident_id')
      .notNull()
      .references(() => agents.id),
    /** The file's path inside the space, relative, with forward slashes. */
    path: text('path').notNull(),
    because: text('because').notNull(),
    markedAt: text('marked_at').notNull(),
    markedByKind: text('marked_by_kind').notNull(),
    markedById: text('marked_by_id').notNull(),
  },
  (t) => [uniqueIndex('resident_void_marks_one_per_path').on(t.residentId, t.path)],
), { existingArchive: true })
