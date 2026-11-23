// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { aPartTable } from '../part-tables.ts'

const existingDerived = { existingDerived: true } as const

/**
 * The content hash of each indexed file, and the build it belongs to.
 *
 * DERIVED. It is what makes "changed" exact: an edit that swaps one constant leaves the size, the
 * line count and the import list identical, and a report built by comparing those fields calls
 * that file unchanged.
 *
 * A SIDE TABLE RATHER THAN A COLUMN ON `source_files`, for one reason worth keeping: `SourceFile`
 * in shared/types.ts is the shape the browser draws and the API serves, and a hash is of no use to
 * either. Keeping it beside the row rather than in it means the served shape stays exactly what
 * somebody reading the types expects.
 *
 * `built_at` is carried per row so a hash from an older build can be recognised and ignored rather
 * than trusted. There are real databases on disk where the file rows and the hashes came from
 * different scans.
 */
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
