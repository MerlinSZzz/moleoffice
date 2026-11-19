// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { sql } from 'drizzle-orm'
import { check, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'

/**
 * THE DIRECTORIES SOMEBODY ADDED BY HAND AS PREVIEW ROOTS, per project.
 *
 * Criterion U4 as rewritten: the directories a preview may read
 * are derived, and a press on the Settings page adds one by hand for the odd case, recorded. That
 * hand-added list is the one part of the derivation no existing row can hold honestly, so it is a
 * singleton row in the shape `office_scene_settings` already uses. `settings` holds a JSON object
 * keyed by workspace id, each value a list of {path, addedBy, addedAt, why}. The strict zod schema
 * and the one reader are in src/server/lib/preview-roots.ts.
 */
export const previewRootAdditions = sqliteTable('preview_root_additions', {
  onlyRow: integer('only_row').primaryKey().notNull(),
  settings: text('settings').notNull(),
  updatedAt: text('updated_at').notNull(),
  updatedByKind: text('updated_by_kind').notNull(),
  updatedById: text('updated_by_id').notNull(),
  authority: text('authority'),
}, table => [check('preview_root_additions_singleton', sql`${table.onlyRow} = 1`)])
