// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { aPartTable } from '../part-tables.ts'

/**
 * A COMMENT WHOSE WORDS HAD ALREADY GONE OUT WHEN MOLE OFFICE STOPPED STORING A WORD FOR IT.
 *
 * AUTHORED, and nothing can recompute a row of it: the fact it records is exactly the fact that was
 * lost. A backup that did not carry it would, after a restore, answer "these words never went out"
 * for comments that had — the wrong answer, from the gate built to stop exactly that.
 *
 * ONE WAY, AND NO ROUTE WRITES IT. One migration writes these rows, once, so nothing can walk one
 * back. `because` always reads the same sentence, because there is only one thing to say.
 *
 * NO `workspace_id`. A row belongs to the project its annotation belongs to, one row along, and
 * `SCOPED_THROUGH` in schema.ts is where that is declared. Without that entry these
 * rows would be read as belonging to no project at all, beside the planning layer, which they are
 * not.
 */
export const annotationWordsFixed = aPartTable(sqliteTable('annotation_words_fixed', {
  /** The comment record. It is the identity of the row: one marker per comment, or none. */
  annotationId: text('annotation_id').primaryKey(),
  /** When the old field was stamped, taken from the change log. LOCAL wall clock. */
  fixedAt: text('fixed_at').notNull(),
  /** Always the same sentence: these words had gone out, and no conversation recorded which comment from. */
  because: text('because').notNull(),
}), { existingArchive: true })
