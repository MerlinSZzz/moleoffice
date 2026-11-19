// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'
import { aPartTable } from '../part-tables.ts'

const existingArchive = { existingArchive: true } as const

/**
 * ONE CHANGE TO A PLAN'S LINES, KEPT WITH THE REASON SOMEBODY GAVE. Criterion P3 of
 * design/planning/ACCEPTANCE.md, built on a decision.
 *
 * ---------------------------------------------------------------------------------------
 * WHY A PLAN LINE IS NOT IN THE RECORD REVISION LEDGER, AND WHY `remark` IS NOT THE REASON
 * ---------------------------------------------------------------------------------------
 *
 * `revisions` is keyed by `record_id` and `saveRevision` in src/server/lib/records.ts
 * refuses a row when no record answers that id, because a revision stores a record's CONTENT — a
 * plan line has no kind, title, summary or data, so there is nothing honest to write there. The
 * `changes` ledger is record-keyed in the same way. A plan line is not a record and cannot become
 * one. `plan_lines.remark` is dead: db/plan-note-migration.ts emptied it into the line's words, and
 * it holds one note per line rather than one reason per change, so a reorder would overwrite the
 * reason of the add. This table is the smallest honest home for the fact.
 *
 * ---------------------------------------------------------------------------------------
 * A REASON IS REQUIRED, AND HERE IS WHAT IT IS FOR
 * ---------------------------------------------------------------------------------------
 *
 * Adding, reordering or dropping a plan line keeps one row here with the reason the writer gave,
 * in their own words. The doors refuse a change with no reason, so `reason` is NOT NULL and is
 * never a placeholder. The reason is the one part of a change that nothing else can reconstruct,
 * which is why it is the part Mole Office asks for.
 *
 * ONE ROW PER LINE PER CHANGE, NOT ONE PER WRITE. A whole-document save may add one line, move
 * another and drop a third, and each is a different fact with the same reason: so a save writes the
 * rows it is about and no row for a line whose words alone changed. A text edit is not one of the
 * three acts P3 names.
 *
 * `op` is one of `added`, `reordered` or `dropped` — the criterion's own three words. `seq` is
 * 1-based and per line, the way `revisions.seq` is per record, so "the one before this" has an
 * answer even when several changes share a moment; the unique index below makes a gap or a repeat
 * impossible to write. `changed_by` is the stamp shape every planning table uses: `${type}:${id}`.
 *
 * NO BACKFILL. A line that existed before this table has no row here, and its read-back says the
 * ledger starts when it starts rather than inventing a revision it never had.
 *
 * NO FOREIGN KEY ON `plan_id` OR `line_id`, for the reason `changes.record_id` gives: the history
 * has to survive the row it is about, and a line that was dropped must keep the reason it was
 * dropped. AUTHORED, and no `workspace_id`, for the reason `plans` gives.
 */
export const planLineRevisions = aPartTable(sqliteTable(
  'plan_line_revisions',
  {
    /** nanoid. */
    id: text('id').primaryKey(),
    /** The plan this change was to. */
    planId: text('plan_id').notNull(),
    /** The line the change was to, kept after the line is gone. */
    lineId: text('line_id').notNull(),
    /** 1-based, per line, so the ledger reads oldest first even when two changes share a moment. */
    seq: integer('seq').notNull(),
    /** `added`, `reordered` or `dropped`. The word list is PLAN_LINE_CHANGE_OPS in lib/plans.ts. */
    op: text('op').notNull(),
    /** The writer's own reason, required on every change and never generated. */
    reason: text('reason').notNull(),
    /** LOCAL wall clock. */
    at: text('at').notNull(),
    /** Who: `${actor.type}:${actor.id}`, like every other stamp in this table's family. */
    changedBy: text('changed_by').notNull(),
  },
  (table) => [
    // THE ONE THAT MAKES IT A LEDGER, and the one the read-back walks: one line's changes, oldest
    // first, without a scan. Modelled on `revisions_record_seq_idx`.
    uniqueIndex('plan_line_revisions_line_seq_idx').on(table.lineId, table.seq),
  ],
), existingArchive)
