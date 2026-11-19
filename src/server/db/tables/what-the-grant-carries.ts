// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { sql } from 'drizzle-orm'
import { check, sqliteTable, text } from 'drizzle-orm/sqlite-core'

/**
 * WHAT THE PERSON'S GRANT CARRIES IN THIS OFFICE, door by door, migration 0287. The secretary card's lists are the
 * default; one row here is one door this office's person changed, with its answer and who changed it and when. A door
 * with no row has the card's answer, and "use the default" deletes the row.
 *
 * READ AND WRITTEN ONLY BY src/server/lib/what-the-grant-carries.ts. `mayPressForThePerson` reads it by primary key.
 */
export const whatTheGrantCarries = sqliteTable('what_the_grant_carries', {
  /** The name the card's lists use: an operation, or a name beside the doors (src/shared/what-the-grant-carries.ts). */
  door: text('door').primaryKey().notNull(),
  /** One of `THE_ANSWERS_ABOUT_A_DOOR`: kept, ask-first or may-press. */
  answer: text('answer').notNull(),
  /** LOCAL wall clock, from the office's clock. No SQL default, for the reason `changes.at` gives. */
  updatedAt: text('updated_at').notNull(),
  updatedByKind: text('updated_by_kind').notNull(),
  updatedById: text('updated_by_id').notNull(),
}, table => [check('what_the_grant_carries_answer', sql`${table.answer} IN ('kept', 'ask-first', 'may-press')`)])
