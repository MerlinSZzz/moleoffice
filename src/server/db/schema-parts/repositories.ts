// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'
import { aPartTable } from '../part-tables.ts'

const existingArchive = { existingArchive: true } as const

// ------------------------------------------------------- the code a record is implemented by

/**
 * A CHECKOUT THIS PROJECT'S WORK IS IMPLEMENTED IN, named so a relationship can point at it.
 *
 * AUTHORED. Somebody registered this repository; nothing can work out that it exists.
 *
 * `id` is identity and `name` is presentation, which is the rule `records.title` already follows.
 * Relationship rows reference the id. Nothing resolves a repository by its name except a person
 * typing one, and that lookup refuses when two answer.
 *
 * `name` IS UNIQUE INSIDE A PROJECT, which is different from how `records.title` behaves. A title
 * may repeat because a title is a label on somebody's thought. A repository name is how a person
 * tells two checkouts apart in a path prefix, and two called `firmware` in one project would make
 * every relationship ambiguous on screen.
 *
 * `root` MAY BE NULL AND NULL IS A REAL ANSWER: this repository is named, and there is no checkout
 * of it on this machine. It can hold relationships, be read and be drawn; it cannot be scanned, and
 * every read that would have needed a scan says so in those words rather than answering empty. A
 * `root` that is set and is not a directory stops a rebuild with a refusal naming the value — it is
 * never treated as NULL, because falling back would index the wrong tree and report every
 * relationship in the right one as stale.
 */
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

    /** LOCAL wall clock, per the practical rule in CLAUDE.md. */
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
    /** `${actor.type}:${actor.id}`, the spelling every other table uses. */
    createdBy: text('created_by').notNull(),
  },
  (t) => [uniqueIndex('repositories_name_idx').on(t.workspaceId, t.name)],
), existingArchive)
