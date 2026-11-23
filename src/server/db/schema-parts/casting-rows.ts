// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { sql } from 'drizzle-orm'
import { check, index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'
import { aPartTable } from '../part-tables.ts'

/**
 * SEVERAL CASTINGS FOR EACH ROLE, migration 0190, with probability added by migration 0268, work group added by
 * migration 0318, and labels and out-until added by migration 0349, which leaves work_group unread. Each role may be cast several ways, and which suits depends on the task's
 * difficulty, the quota it uses and the cost for what it gives. One row per casting, with an id of its own;
 * `project` is '' for a casting that holds for every project. Each cell has its value and, in the `_from` column
 * beside it, where the value came from, as JSON read by `readCastingCellSource` in src/shared/casting.ts, or NULL
 * when the cell is empty. `marked` is 1 on the one row of a role's scope the tools take; the unique index keeps two
 * out of one scope. The reader and the writers are in src/server/lib/casting.ts. The two tables of migration 0189
 * in casting-legacy.ts are kept as they were and nothing reads them.
 */
export const castingRows = aPartTable(sqliteTable('casting_rows', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  role: text('role').notNull(),
  project: text('project').notNull().default(''),
  marked: integer('marked').notNull().default(0),
  program: text('program'),
  programFrom: text('program_from'),
  model: text('model'),
  modelFrom: text('model_from'),
  effort: text('effort'),
  effortFrom: text('effort_from'),
  difficulty: text('difficulty'),
  difficultyFrom: text('difficulty_from'),
  quota: text('quota'),
  quotaFrom: text('quota_from'),
  cost: text('cost'),
  costFrom: text('cost_from'),
  probability: text('probability'),
  probabilityFrom: text('probability_from'),
  workGroup: text('work_group'),
  workGroupFrom: text('work_group_from'),
  labels: text('labels'),
  labelsFrom: text('labels_from'),
  outUntil: text('out_until'),
  outUntilFrom: text('out_until_from'),
  why: text('why'),
  whyFrom: text('why_from'),
  changedAt: text('changed_at').notNull(),
  changedByKind: text('changed_by_kind').notNull(),
  changedById: text('changed_by_id').notNull(),
  authority: text('authority'),
}, table => [
  index('casting_rows_scope').on(table.role, table.project, table.id),
  uniqueIndex('casting_rows_one_mark').on(table.role, table.project).where(sql`marked = 1`),
  check('casting_rows_marked', sql`${table.marked} IN (0, 1)`),
]), { existingArchive: true })
