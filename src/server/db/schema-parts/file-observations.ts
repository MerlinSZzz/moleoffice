// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { aPartTable } from '../part-tables.ts'

const existingArchive = { existingArchive: true } as const

export const fileObservations = aPartTable(sqliteTable(
  'file_observations',
  {
    /** anOfficeId() in src/server/lib/ids.ts. */
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id').notNull(),
    /** Groups every row one rebuild wrote. */
    scanId: text('scan_id').notNull(),
    /** `repositories.id`, or NULL for a row written before repositories had ids. */
    repositoryId: text('repository_id'),
    /** Repository-relative, exactly as `source_files.path` holds it. */
    path: text('path').notNull(),
    /** `added`, `changed` or `removed`. */
    change: text('change').notNull(),
    /** The content hash after the change. NULL for `removed`. */
    hash: text('hash'),
    /** LOCAL wall clock: the stamp of the scan that saw it. */
    seenAt: text('seen_at').notNull(),
    /** The previous scan's `built_at`. NULL when there was no previous scan. */
    since: text('since'),
    /** 1 when there was no previous index to compare against. */
    firstScan: integer('first_scan').notNull(),
  },
  (t) => [
    index('file_observations_when_idx').on(t.workspaceId, t.seenAt),
    index('file_observations_path_idx').on(t.workspaceId, t.path, t.seenAt),
  ],
), existingArchive)
