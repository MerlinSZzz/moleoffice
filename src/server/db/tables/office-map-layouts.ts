// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { sql } from 'drizzle-orm'
import { check, sqliteTable, text } from 'drizzle-orm/sqlite-core'

/** Stable shared map assignments cannot be reconstructed from only today's roster. */
export const officeMapLayouts = sqliteTable('office_map_layouts', {
  configurationKey: text('configuration_key').primaryKey().notNull(),
  data: text('data').notNull(),
  updatedAt: text('updated_at').notNull(),
}, table => [check('office_map_layouts_json', sql`json_valid(${table.data})`)])
