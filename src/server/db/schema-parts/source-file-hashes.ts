// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { aPartTable } from '../part-tables.ts'

const existingDerived = { existingDerived: true } as const

export const sourceFileHashes = aPartTable(sqliteTable(
  'source_file_hashes',
  {
    workspaceId: text('workspace_id').notNull().default('default'),
    /**
     * Which repository this file is in, from `repositories.id`. In the key, and nullable, for the two
     * reasons `source_files.repository_id` gives in full.
     */
    repositoryId: text('repository_id'),
    path: text('path').notNull(),
    hash: text('hash').notNull(),
    builtAt: text('built_at').notNull(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.workspaceId, t.repositoryId, t.path] }),
  }),
), existingDerived)

export type SourceFileHashRow = typeof sourceFileHashes.$inferSelect
