// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { aPartTable } from '../part-tables.ts'

const existingArchive = { existingArchive: true } as const

// ---------------------------------------------------------------------------- panel layouts

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
    updatedBy: text('updated_by').notNull(),
  },
  (t) => ({
    // One row per page per workspace. Saving the same page twice is the same layout, moved.
    pk: primaryKey({ columns: [t.workspaceId, t.id] }),
  }),
), existingArchive)

export type PanelLayoutRow = typeof panelLayouts.$inferSelect
