// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { index, integer, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { aPartTable } from '../part-tables.ts'

/**
 * THE CASTING TABLE (选角表), migration 0189. By a decision, the table holds for each role the
 * program, the model and the effort the office casts it with, and one sentence
 * why.
 *
 * One row per role card and project; `project` is '' for the row that holds for every project. Each
 * cell has its value and, in the `_from` column beside it, where the value came from, as JSON read by
 * `readCastingCellSource` in src/shared/casting.ts, or NULL when the cell is empty. SINCE MIGRATION 0190
 * NOTHING READS OR WRITES IT: 0190 copied every row into `casting_rows` and left this table as it was.
 */
export const casting = aPartTable(sqliteTable('casting', {
  role: text('role').notNull(),
  project: text('project').notNull().default(''),
  program: text('program'),
  programFrom: text('program_from'),
  model: text('model'),
  modelFrom: text('model_from'),
  effort: text('effort'),
  effortFrom: text('effort_from'),
  why: text('why'),
  whyFrom: text('why_from'),
  changedAt: text('changed_at').notNull(),
  changedByKind: text('changed_by_kind').notNull(),
  changedById: text('changed_by_id').notNull(),
  authority: text('authority'),
}, table => [primaryKey({ columns: [table.role, table.project] })]), { existingArchive: true })

/**
 * EVERY CHANGE TO A CASTING ROW, append-only, migration 0189: who, when, the row before and after as
 * JSON, and the decisions the writer named. Since migration 0190 nothing reads or writes it: 0190 copied
 * every row, with its id, into `casting_row_changes`.
 */
export const castingChanges = aPartTable(sqliteTable('casting_changes', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  role: text('role').notNull(),
  project: text('project').notNull().default(''),
  at: text('at').notNull(),
  byKind: text('by_kind').notNull(),
  byId: text('by_id').notNull(),
  authority: text('authority'),
  decisions: text('decisions').notNull(),
  note: text('note'),
  before: text('before'),
  after: text('after').notNull(),
}, table => [index('casting_changes_row').on(table.role, table.project, table.id)]), { existingArchive: true })
