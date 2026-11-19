// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { sql } from 'drizzle-orm'
import { check, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { aPartTable } from '../part-tables.ts'

/**
 * ONE ROW ONCE THE STORED READING-MEASURE WORDS CARRY THEIR NEW NAMES, AND NO ROW BEFORE THAT.
 *
 * By a decision, the preset word `readable` is named narrow instead, so the old `narrow` became
 * `narrowest` and the old `readable` became `narrow`.
 * src/server/db/measure-words.ts moves the stored words and writes this row in the same
 * transaction. It skips when the row is there, because a stored `narrow` cannot say which of the
 * two names it was written under, and a second run would move it again.
 *
 * AUTHORED, and nothing can recompute it: whether the words in this database were renamed is not
 * something the words themselves can say. A whole-installation archive carries it beside the
 * records it is about.
 *
 * ONE WAY, AND NO ROUTE WRITES IT. The migration writes the one row, once.
 */
export const measureWordsRenamed = aPartTable(sqliteTable(
  'measure_words_renamed',
  {
    /** Always 1. The CHECK below is what makes that true in SQL. */
    onlyRow: integer('only_row').primaryKey().notNull(),
    /** When the migration renamed the words. LOCAL wall clock. */
    renamedAt: text('renamed_at').notNull(),
    /** Always the same sentence, saying what was renamed to what. */
    because: text('because').notNull(),
  },
  (table) => [check('measure_words_renamed_singleton', sql`${table.onlyRow} = 1`)],
), { existingArchive: true })
