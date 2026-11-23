// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { aPartTable } from '../part-tables.ts'

const existingArchive = { existingArchive: true } as const

/**
 * WHAT ONE SCAN SAW ABOUT ONE FILE AT ONE MOMENT.
 *
 * AUTHORED, and that is not obvious, so here is the argument. `source_files` describes the present
 * and any scan rebuilds it. A row here is a DATED OBSERVATION and nothing can rebuild it: the
 * comparison a rebuild makes against the scan it is replacing exists for one reply and is then
 * unrecoverable. A work domain accepted on Tuesday cannot otherwise ask on Friday what changed,
 * because four scans have run in between and each threw its predecessor away.
 *
 * IT STORES NO FILE CONTENT, NO DIFF, NO AUTHOR, NO PARENT, NO BRANCH AND NO MESSAGE. You cannot
 * reconstruct one line of any file from it, you cannot ask who changed something, and you cannot ask
 * what it looked like before. The owner's boundary is that Git owns implementation history, and the
 * first thing on the owner's list of failures is building a second Git. Ten columns, and an eleventh that
 * answered any of those questions would break the boundary this table is allowed to exist inside.
 *
 * `repository_id` IS AN ID AND NOT A ROOT PATH. A root moves; a checkout that moved would split one
 * repository's observation history in two with nothing failing. NULL has one stated meaning: this
 * row was written before repositories had ids, by the one process that scans one root.
 *
 * `first_scan` MARKS THE WAVE THAT IS NOT A WAVE. A workspace whose index is empty — after a
 * restore, or on its first rebuild — sees the whole repository as `added`. That is true and it is
 * not a fortnight of work, so the row says which it was and a drift read answers "cannot say"
 * rather than "everything changed".
 *
 * NOTHING PRUNES IT, deliberately. A rule that deletes observations deletes the evidence a drift
 * read depends on.
 */
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
