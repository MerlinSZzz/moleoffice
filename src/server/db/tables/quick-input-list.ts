// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { sql } from 'drizzle-orm'
import { check, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'

/**
 * THE PERSON'S LIST OF QUICK INPUTS, migration 0272.
 *
 * One row for the whole installation, in the shape `price_table` uses. `inputs` is the JSON list the office may type
 * into an agent's terminal when the agent asks, and `readQuickInputList` in src/shared/quick-inputs.ts is its one shape
 * check. Migration 0272 writes the starting list, stamped `migration` / `0272`. A clear keeps the row with `inputs`
 * NULL, stamped with who cleared it, so a restore carries the clear over that starting row.
 */
export const quickInputList = sqliteTable('quick_input_list', {
  onlyRow: integer('only_row').primaryKey().notNull(),
  inputs: text('inputs'),
  updatedAt: text('updated_at').notNull(),
  updatedByKind: text('updated_by_kind').notNull(),
  updatedById: text('updated_by_id').notNull(),
}, table => [
  check('quick_input_list_singleton', sql`${table.onlyRow} = 1`),
  check('quick_input_list_json', sql`${table.inputs} IS NULL OR json_valid(${table.inputs})`),
])
