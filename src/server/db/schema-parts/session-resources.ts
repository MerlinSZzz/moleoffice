// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { sql } from 'drizzle-orm'
import { index, integer, primaryKey, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'
import { aPartTable } from '../part-tables.ts'

const existingArchive = { existingArchive: true } as const

// ---------------------------------------------------------------------------- session resources

/**
 * One row per thing a session started and might have left running.
 *
 * AUTHORED IN PART, AND THAT SPLIT MATTERS TO ANYONE WRITING AN EXPORT. `registered_by`,
 * `released_by` and `release_note` are history: somebody shut a server down, or did not, and said
 * why. `pgid` and `os_started_at` are facts about THIS MACHINE AT THIS MOMENT — a pid is
 * meaningless after a reboot, and restoring one somewhere else would hand a killer a number that
 * now belongs to an innocent process. tests/release.test.ts exists to stop anyone acting on a
 * stale pid, and an export that carried these two columns whole would walk straight past it.
 *
 * `key` is the identity checked later: the pid, the port number, the container name, the absolute
 * path of the lock file. `os_started_at` is the anti-reuse anchor described on `OsProcess` in
 * lib/resources.ts — without it, releasing a resource whose pid has been recycled kills the wrong
 * process.
 *
 * ROWS ARE NEVER DELETED. A released resource keeps its row with who released it and when,
 * because "was that server ever shut down, and by whom" is the question this table exists to
 * answer.
 */
export const sessionResources = aPartTable(sqliteTable(
  'session_resources',
  {
    /**
     * nanoid, assigned by lib/resources.ts.
     *
     * THE PRIMARY KEY IS DECLARED IN THE TABLE CLAUSE BELOW RATHER THAN AS `.primaryKey()` HERE,
     * and the difference is one word of generated SQL. Drizzle writes a column-level primary key as
     * `text PRIMARY KEY NOT NULL`; SQLite's own rule is that a TEXT PRIMARY KEY column stays
     * nullable unless NOT NULL is spelt out, which is how `ensureResourceTable` created it in every
     * database that already exists. Declaring it in the table clause produces the shape those
     * databases already have. The alternative is a stricter table on new machines than on old ones,
     * for a column nothing has ever written null to — one table with two shapes depending on when
     * the database was made, which is the defect this whole change is about wearing a different
     * hat. Making the old databases match instead would mean rebuilding the table, and migrations
     * here never rewrite a row.
     */
    id: text('id'),
    /** Which workspace. One today and it is always 'default'. */
    workspaceId: text('workspace_id').notNull().default('default'),
    /** The `session` record that started this thing. A record id, not a run name. */
    sessionRecordId: text('session_record_id').notNull(),
    /** One of RESOURCE_TYPES in lib/resources.ts: process, port, gpu, container, lock, slot. */
    type: text('type').notNull(),
    /**
     * What identifies it later: the pid, the port, the container name, the lock's absolute path. For a
     * slot, the pool's name while it waits in line and `<pool>#<seat>` once it holds a seat.
     */
    key: text('key').notNull(),
    /**
     * The process GROUP, when this is a process. A release kills the group, because a server
     * started from a shell is usually several processes and signalling the leader alone leaves the
     * children holding the port.
     */
    pgid: integer('pgid'),
    /** When the process started, LOCAL. The anti-reuse anchor; null when the type has no process. */
    osStartedAt: text('os_started_at'),
    /** Free text describing what this is, written when it was registered. */
    detail: text('detail').notNull(),
    /** When it was registered, LOCAL. No SQL default; the writer passes `now()`. */
    registeredAt: text('registered_at').notNull(),
    /** Who registered it: `${actor.type}:${actor.id}`. */
    registeredBy: text('registered_by').notNull(),
    /** When it was released, or NULL for still held. NULL is what makes a row live. */
    releasedAt: text('released_at'),
    /** Who released it, or NULL. */
    releasedBy: text('released_by'),
    /** What they said about releasing it, or NULL. History, and the reason the row is kept. */
    releaseNote: text('release_note'),
    /**
     * The world this resource serves, as JSON: repository, database, port, HEAD, and whether it was
     * scratch or canonical with the reasons. The shape is `World` in src/shared/runtime.ts.
     *
     * Read once, when the row is written. It is what the world WAS at registration, which is the
     * fact a later reader needs — not what it is now, which the process itself can be asked.
     * NULL on every row written before 3 September 2026: nobody recorded this.
     */
    world: text('world'),

    /**
     * Whether Mole Office itself started this process, written when the row is written.
     *
     * The owner's F1 answer of 3 September 2026: the product names what it did not start and never
     * stops it. NULL means nobody recorded this, which is not "no" — but the release door treats it
     * the same way, because the weakest evidence there is is not permission to signal a process.
     */
    startedByTheProduct: integer('started_by_the_product'),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.id] }),
    sessionIdx: index('session_resources_session_idx').on(t.sessionRecordId),
    /**
     * One LIVE row per resource. Registering the same port for the same session twice is the same
     * registration, not a second one — but once a row is released the same port may honestly be
     * taken again, so the uniqueness is PARTIAL and applies only while `released_at` is null.
     * A plain unique index here would make releasing a port mean never being able to record taking
     * it again.
     */
    liveIdx: uniqueIndex('session_resources_live_idx')
      .on(t.workspaceId, t.sessionRecordId, t.type, t.key)
      .where(sql`released_at IS NULL`),
  }),
), existingArchive)

export type SessionResourceRow = typeof sessionResources.$inferSelect
