// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { sql } from 'drizzle-orm'
import { check, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'

/**
 * THE PRICE TABLE THE PERSON SETS IN SETTINGS. Criterion U3.
 *
 * One fact for the whole installation, so it is a singleton row in the shape
 * `preview_root_additions` uses. It is not a general settings table: migration 0152 says why there
 * is none. `settings` holds the JSON table, {currency, prices}, and `readPriceTable` in
 * src/shared/price-table.ts is the one shape check. No row means nobody has set a table.
 */
export const priceTable = sqliteTable('price_table', {
  onlyRow: integer('only_row').primaryKey().notNull(),
  settings: text('settings').notNull(),
  updatedAt: text('updated_at').notNull(),
  updatedByKind: text('updated_by_kind').notNull(),
  updatedById: text('updated_by_id').notNull(),
  authority: text('authority'),
}, table => [check('price_table_singleton', sql`${table.onlyRow} = 1`)])
