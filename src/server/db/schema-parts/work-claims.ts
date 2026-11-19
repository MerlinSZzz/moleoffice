// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { index, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { aPartTable } from '../part-tables.ts'
import { workspaces } from './workspaces.ts'

const existingArchive = { existingArchive: true } as const

export const workClaims = aPartTable(sqliteTable(
  'work_claims',
  {
    /** nanoid, so one claim can be cited. */
    id: text('id').primaryKey(),
    /** The project the work is in. */
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspaces.id),
    /** `person` or `agent`, and the id in that registry: who is working on it. */
    claimantKind: text('claimant_kind').notNull(),
    claimantId: text('claimant_id').notNull(),
    /** The `records` row of kind `session` for the run whose life this lease follows. */
    run: text('run').notNull(),
    /** A JSON list of {what, id}: the records and the paths this claim is about. */
    things: text('things').notNull(),
    /** LOCAL wall clock. No SQL default, for the reason `reader_anchors` gives. */
    openedAt: text('opened_at').notNull(),
    /** When the run last said it was still working on this, or NULL because it never has. */
    renewedAt: text('renewed_at'),
    /** When whoever made it said they had finished, or NULL because nobody has. */
    releasedAt: text('released_at'),
    /** One plain sentence saying why, when `released_at` is set. NULL otherwise. */
    releasedBecause: text('released_because'),
  },
  (t) => [
    index('work_claims_workspace_idx').on(t.workspaceId),
    index('work_claims_claimant_idx').on(t.claimantKind, t.claimantId),
    index('work_claims_run_idx').on(t.run),
  ],
), existingArchive)
