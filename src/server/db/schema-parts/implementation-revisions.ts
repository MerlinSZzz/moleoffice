// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'
import { aPartTable } from '../part-tables.ts'
import { repositories } from './repositories.ts'

const existingArchive = { existingArchive: true } as const

export const implementationRevisions = aPartTable(sqliteTable(
  'implementation_revisions',
  {
    /** anOfficeId() in src/server/lib/ids.ts. */
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id').notNull(),
    repositoryId: text('repository_id')
      .notNull()
      .references(() => repositories.id),
    /** The opaque string the caller supplied. Never parsed and never resolved. */
    ref: text('ref').notNull(),
    /** What a person reads instead, such as `R42`. NULL means nobody gave it one. */
    label: text('label'),
    /** What this revision is, in the caller's words. NULL means nobody said. */
    note: text('note'),
    statedAt: text('stated_at').notNull(),
    statedBy: text('stated_by').notNull(),
  },
  (t) => [uniqueIndex('implementation_revisions_ref_idx').on(t.workspaceId, t.repositoryId, t.ref)],
), existingArchive)
