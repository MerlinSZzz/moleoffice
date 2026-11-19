// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'
import { aPartTable } from '../part-tables.ts'

const existingArchive = { existingArchive: true } as const

export const repositories = aPartTable(sqliteTable(
  'repositories',
  {
    /** anOfficeId() in src/server/lib/ids.ts, the way links.id is made. */
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id').notNull(),
    /** What a person reads: `mole-office`, `calibration`. */
    name: text('name').notNull(),
    /** What this repository holds, in the words of whoever registered it. NULL means nobody said. */
    note: text('note'),
    /** An absolute path on THIS machine, or NULL because there is no checkout of it here. */
    root: text('root'),

    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
    /** `${actor.type}:${actor.id}`, the spelling every other table uses. */
    createdBy: text('created_by').notNull(),
  },
  (t) => [uniqueIndex('repositories_name_idx').on(t.workspaceId, t.name)],
), existingArchive)
