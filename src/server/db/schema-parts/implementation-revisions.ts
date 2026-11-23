// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'
import { aPartTable } from '../part-tables.ts'
import { repositories } from './repositories.ts'

const existingArchive = { existingArchive: true } as const

/**
 * A CODE REVISION SOMEBODY NAMED, kept as the opaque string they supplied.
 *
 * AUTHORED. A caller supplies a string; Mole Office stores it against a repository and resolves nothing.
 *
 * THERE IS NO COLUMN SAYING WHETHER THIS IS A COMMIT, A TAG OR A BRANCH. Those are Git's words,
 * Mole Office cannot check any of them, and a column holding an unverifiable classification is the fifth
 * engineering rule broken with extra steps. A caller who wants to say what it is writes it in `note`.
 *
 * NOTHING HERE IS A ROW IN `revisions`. That table is the Mole Office record version ledger. A code
 * revision is a reference a read resolves by joining, never a row copied in.
 */
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
