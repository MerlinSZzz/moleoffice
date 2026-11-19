// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { index, real, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { aPartTable } from '../part-tables.ts'

const existingArchive = { existingArchive: true } as const

/**
 * ONE LINE OF A PLAN: THE WORDS SOMEBODY WROTE, AND AT MOST ONE RECORD THEY FILED IT AS.
 *
 * The words are stored exactly as typed. Nothing parses them on the way in, nothing normalises them
 * and nothing repairs them. `src/shared/plandoc.ts` reads them into headings, bullets, tick boxes
 * and tables for DISPLAY only, and prints verbatim anything it cannot read.
 *
 * ---------------------------------------------------------------------------------------
 * FILING A LINE DOES NOT COPY THE TITLE
 * ---------------------------------------------------------------------------------------
 *
 * When a person files a line as work, the line's words seed the new record's title once. After that
 * they are two separate facts: "what I wrote about this" and "what this record is called". Nothing
 * derives one from the other, nothing keeps them equal, and where they disagree the plan draws both.
 * Disagreement is shown, never repaired.
 *
 * `record_id` names a record in whatever project that record is in, exactly as `allocations` does,
 * and it carries no authority: reading that record still goes through the project boundary.
 *
 * `position` is a real number so a line inserted between two others takes the midpoint and no other
 * row has to move. The stored order is the document order, and sorting a table view never changes
 * it.
 *
 * NO `created_at` AND NO `created_by`. A line is written and rewritten; who touched it last and when
 * is what "changed since you read this" needs, and a creation stamp nobody reads would be a column
 * to keep true for nothing.
 *
 * AUTHORED, and no `workspace_id`, for the reason `plans` gives.
 */
export const planLines = aPartTable(sqliteTable(
  'plan_lines',
  {
    /** nanoid. */
    id: text('id').primaryKey(),
    /** The plan this line belongs to. */
    planId: text('plan_id').notNull(),
    /** Where it sits in the document. A real number, so an insert takes a midpoint. */
    position: real('position').notNull(),
    /** The line exactly as typed, empty string included — a blank line is a line. */
    text: text('text').notNull(),
    /**
     * The record this line was filed as, or NULL because nobody has filed it.
     *
     * NULL is the ordinary case and it means "this is still writing". It is a stored column and not
     * characters inside `text` on purpose: a link typed into text that a person edits by hand breaks
     * the moment they delete a bracket, and it puts a record id on screen.
     */
    recordId: text('record_id'),
    /** The writer's own note about this line, or NULL. The one field that is not about the record. */
    remark: text('remark'),
    /** LOCAL wall clock. Who wrote it: `${actor.type}:${actor.id}`, like every other stamp here. */
    updatedAt: text('updated_at').notNull(),
    updatedBy: text('updated_by').notNull(),
  },
  (table) => [
    // The two reads there are: the whole of one plan in order, and every line naming one record.
    index('plan_lines_plan_idx').on(table.planId, table.position),
    index('plan_lines_record_idx').on(table.recordId),
  ],
), existingArchive)
