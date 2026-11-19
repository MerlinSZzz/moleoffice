// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { aPartTable, type ExistingArchive } from '../part-tables.ts'

const existingArchive: ExistingArchive = { existingArchive: true }

export const runtimeSettings = aPartTable(sqliteTable('runtime_settings', {
  name: text('name').primaryKey().notNull(),
  value: text('value').notNull(),
  until: text('until'),
}), existingArchive)
