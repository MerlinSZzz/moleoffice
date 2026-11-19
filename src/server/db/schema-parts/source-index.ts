// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { integer, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { aPartTable } from '../part-tables.ts'

const existingDerived = { existingDerived: true } as const

export const sourceIndex = aPartTable(sqliteTable(
  'source_index',
  {
    /**
     * The workspace, and the primary key.
     *
     * Declared in the table clause below for the same reason `session_resources.id` is, and the
     * comment there is the full argument: `ensureSourceIndexTables` wrote
     * `workspace_id TEXT PRIMARY KEY DEFAULT 'default'`, SQLite leaves that nullable, and matching
     * it means one shape everywhere rather than one shape per database vintage.
     */
    workspaceId: text('workspace_id').default('default'),
    /**
     * Which repository this scan was of, from `repositories.id`. In the key beside the workspace.
     *
     * One project may point at several checkouts, so "which scan produced these rows" is a question
     * about a repository and not about a project. Before this column one workspace could hold one
     * index, and a second checkout silently replaced the first one's stamp.
     *
     * NULLABLE, with the meaning `source_files.repository_id` states in full: written before
     * repositories had ids, by the one process that scans one root. `root` on this row is what says
     * which directory it was, and it is a fact about the scan that happened rather than an identity.
     */
    repositoryId: text('repository_id'),
    /** When the scan ran, LOCAL. lib/sourceindex.ts refuses to serve an index whose stamp will not parse. */
    builtAt: text('built_at').notNull(),
    /** Who asked for the rebuild: `${actor.type}:${actor.id}`. */
    builtBy: text('built_by').notNull(),
    /** The directory that was scanned. */
    root: text('root').notNull(),
    /** How long the scan took. Shown so an index that is slow to rebuild says so. */
    scanMs: integer('scan_ms').notNull(),
    /** A JSON summary of what the scan skipped and why. Plain text here. */
    skipped: text('skipped').notNull(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.workspaceId, t.repositoryId] }),
  }),
), existingDerived)

export type SourceIndexRow = typeof sourceIndex.$inferSelect
