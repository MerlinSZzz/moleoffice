// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { aPartTable } from '../part-tables.ts'

const existingArchive = { existingArchive: true } as const

// ---------------------------------------------------------------------------- panel layouts

/**
 * Where a reader dragged the panels on a page. One row per saved layout.
 *
 * AUTHORED, and the only table here whose contents a person made with a mouse rather than with
 * words. Losing it means the home page comes back rearranged, which is small but is not nothing:
 * it is the one thing in the database that cannot be reconstructed from anything anybody typed.
 *
 * `id` is the page the layout belongs to, chosen by the browser — "home" today.
 *
 * THIS TABLE IS RETIRED AND CAN NO LONGER GAIN A ROW. PUT /api/layout/:id was its only writer and
 * it was deleted with the draggable panel grid on 2026-08-10 — see the header of
 * src/web/components/PanelGrid.tsx. The table is kept because dropping one is a destructive
 * migration and these migrations only ever add, and because a database made before that date may
 * hold a row. NO BACKUP AND NO EXPORT CARRIES IT, by a decision.
 * That decision replaced decision 3 in design/stages-audit/DECISIONS.md. The table is on
 * `LEFT_OUT_OF_BACKUPS_AND_EXPORTS` in table-name-lists.ts. The table itself stays declared and
 * migrated, and nothing deletes a row of it in the office's own database.
 *
 * `layout` is OPAQUE JSON that was owned by the browser. It is declared as plain `text` rather
 * than as a json column because nothing on the server ever looked inside it.
 *
 * WHY IT WAS NOT A RECORD is the same three reasons `reader_anchors` above gives, in the same
 * order. The short form: a layout was written on every drag, and every write through
 * lib/records.ts appends to `changes`, which IS the daily view — so a day of research would have
 * been buried under "layout updated" rows.
 *
 * `updated_by` exists because the house rule is that every write is attributed. It is not in
 * `changes` for the reason just given, but "who moved my panels" must still be answerable, and an
 * agent rearranging a human's home page is worth being able to see.
 */
export const panelLayouts = aPartTable(sqliteTable(
  'panel_layouts',
  {
    /** Which workspace. One today and it is always 'default'; here because every other table has it. */
    workspaceId: text('workspace_id').notNull().default('default'),
    /** The page this layout belongs to. Was restricted to a short printable slug by the deleted route. */
    id: text('id').notNull(),
    /** The browser's own JSON, stored untouched. */
    layout: text('layout').notNull(),
    /**
     * When it was saved, LOCAL, in the form shared/time.ts writes. No SQL default, for the reason
     * `reader_anchors.last_seen_at` gives: `datetime('now')` is UTC and would be wrong by the
     * machine's offset for the one caller that forgets. The writer passes `now()`.
     */
    updatedAt: text('updated_at').notNull(),
    /** Who saved it: `${actor.type}:${actor.id}`, so "human:owner" or "agent:claude-code". */
    updatedBy: text('updated_by').notNull(),
  },
  (t) => ({
    // One row per page per workspace. Saving the same page twice is the same layout, moved.
    pk: primaryKey({ columns: [t.workspaceId, t.id] }),
  }),
), existingArchive)

export type PanelLayoutRow = typeof panelLayouts.$inferSelect
