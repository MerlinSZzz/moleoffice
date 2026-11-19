// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { sql } from 'drizzle-orm'
import { check, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'

/** Shared scene choices, separate from installation identity and work records. */
export const officeSceneSettings = sqliteTable('office_scene_settings', {
  onlyRow: integer('only_row').primaryKey().notNull(),
  settings: text('settings').notNull(),
  updatedAt: text('updated_at').notNull(),
  updatedByKind: text('updated_by_kind').notNull(),
  updatedById: text('updated_by_id').notNull(),
  authority: text('authority'),
}, table => [check('office_scene_settings_singleton', sql`${table.onlyRow} = 1`)])
