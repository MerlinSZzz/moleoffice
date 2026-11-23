// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { index, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { aPartTable } from '../part-tables.ts'
import { workspaces } from './workspaces.ts'

const existingArchive = { existingArchive: true } as const

/**
 * WHAT AN AGENT IS WORKING ON, AND UNTIL WHEN. One row per claim, added by migration 0121.
 *
 * Criterion M13, which absorbs an earlier proposal. A claim says who is working, which run is
 * doing it, and what is being worked on. A second live claim naming the same thing opens a group
 * with both agents and the owner in it (M11), and the group's `about` column is what stops a second
 * group being opened for the same overlap.
 *
 * `things` IS JSON AND NOT A SECOND TABLE. The migration's own header says why and what it costs:
 * overlap is worked out over the live claims in TypeScript, which is a handful of rows, and a second
 * table would make one claim two rows that can disagree about whether it exists.
 *
 * THERE IS NO EXPIRY COLUMN. A lease ends when its run ends, and how that is read is in
 * src/server/lib/claims.ts. A number of minutes here would be a guess about how long work takes.
 */
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
