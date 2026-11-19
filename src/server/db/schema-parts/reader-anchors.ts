// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { aPartTable } from '../part-tables.ts'
import { changes } from './changes.ts'

// ---------------------------------------------------------------------------- reader anchors

/**
 * Where each reader got to: when they last looked, and at what.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS IS IN THE DATABASE AND NOT IN THE BROWSER
 * ---------------------------------------------------------------------------------------
 *
 * The brief names two questions the whole product exists to answer, and the second is "what
 * happened while I was away". Answering it needs one fact that is nowhere in `changes`: the moment
 * the reader last looked. Everything else is a filter on `at` once that moment is known.
 *
 * Today that moment is kept in the browser's own localStorage, under `mole-office.home.opened`. That
 * has two consequences and both are bad:
 *
 *  1. THE PHONE CAN NEVER ANSWER THE QUESTION. The brief says the phone case is real — the person reads
 *     what agents did while they are away from the desk. The phone is always the second browser, so
 *     its mark starts empty and everything ever written looks new on it. The device that most
 *     needs the answer is the one device that cannot have it.
 *  2. CLEARING SITE DATA DESTROYS IT on the device that can, and nothing says it is gone. The next
 *     page shows a fortnight of agent work as though it all happened since they last looked, which
 *     is the same exhaustion the product is meant to remove.
 *
 * An anchor stored here is per PERSON, not per browser, so the desk and the phone are reading the
 * same bookmark and moving it for each other.
 *
 * ---------------------------------------------------------------------------------------
 * WHY IT IS NOT A RECORD
 * ---------------------------------------------------------------------------------------
 *
 * The same three reasons panel positions were kept out of `records`, in the same order. That
 * argument used to live in api/layout.ts; that file was deleted with the panel grid on
 * 2026-08-10, so this is now the place it is written down and `panel_layouts` below points here:
 *
 *  1. It would flood the change log. Every write through lib/records.ts appends to `changes`, and
 *     `changes` IS the daily view — there are no stored daily pages, a day is a filter on that
 *     table. An anchor moves every time a page is opened, so the act of reading the day would bury
 *     the day. That destroys the feature this table exists to serve, to save a table.
 *  2. It would appear on the Records page as something researched.
 *  3. Nothing will ever link to "where the person got to" by name, and typing a name is what linking to
 *     a record is. An anchor is a place in a page, not a thing anybody points at.
 */
export const readerAnchors = aPartTable(sqliteTable(
  'reader_anchors',
  {
    /**
     * Which workspace was being read. There is one today and it is always 'default'; the column is
     * here because every other table has it, and because adding it later would be a migration on a
     * table that by then has rows worth keeping.
     */
    workspaceId: text('workspace_id').notNull().default('default'),
    /**
     * Who looked, written the way every other attributed column in this database writes an actor:
     * `${actor.type}:${actor.id}`, so "human:owner".
     *
     * There is no separate `updated_by` beside it, unlike `panel_layouts`. Here the reader IS the
     * writer of its own row — an anchor somebody else moved for you would be a lie about what you
     * have read — so one column carries both facts and they cannot disagree.
     */
    reader: text('reader').notNull(),
    /**
     * The wall-clock moment they last looked, LOCAL, in the form shared/time.ts writes.
     *
     * NO SQL DEFAULT, DELIBERATELY, AND THIS COLUMN IS WHY NOTHING IN THIS FILE HAS ONE NOW.
     * `records`, `links` and `changes` defaulted their stamp columns to `datetime('now')`, which is
     * UTC, and this column was written to refuse to join them: a default that is wrong by the
     * machine's offset waits for the one caller that forgets, and an anchor an hour out is an
     * anchor that hides an hour of agent work, silently, which is the exact bug shared/time.ts was
     * written to end. Those five defaults were dropped on 2026-08-10, so this argument now holds for
     * every stamp column in the database rather than for the newest ones only. The writer passes
     * `nowStamp()`; an INSERT that omits this fails, loudly, which is the answer this product
     * prefers.
     */
    lastSeenAt: text('last_seen_at').notNull(),
    /**
     * The id of the newest row in `changes` they had seen, or NULL.
     *
     * WHY AN ID AS WELL AS A TIME. Two changes can share a stamp — agents write in bursts and the
     * stamp is only to the second — so a filter on time alone either shows the same row twice or
     * skips one, depending on which side of the comparison is inclusive. The id settles it.
     *
     * NULL IS A REAL ANSWER AND IS NOT THE SAME AS HAVING NO ROW. No row means this reader has
     * never looked. NULL means they looked and there was nothing to see. A reader that collapsed
     * the two would tell somebody who has read everything that they have read nothing.
     *
     * IT IS A FOREIGN KEY, and `foreign_keys` is ON in db/client.ts, so an id that names no change
     * is refused at write time. That is on purpose. This project's most damaging open defect is
     * the opposite arrangement — a session reference that is accepted, stored, and can never
     * resolve, behind a 201 that reports success. Nothing ever deletes from `changes`, so the only
     * thing this constraint can catch is a caller pointing at a change that never existed.
     */
    lastChangeId: text('last_change_id').references(() => changes.id),
  },
  (t) => ({
    // One row per reader per workspace. That is what makes the desk and the phone agree: the
    // anchor belongs to the person, and neither device has one of its own to fall behind with.
    pk: primaryKey({ columns: [t.workspaceId, t.reader] }),
  }),
), { existingArchive: true })

export type ReaderAnchorRow = typeof readerAnchors.$inferSelect
export type NewReaderAnchorRow = typeof readerAnchors.$inferInsert
