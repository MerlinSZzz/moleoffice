// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * `newestMessagePoolFirst` was moved byte for byte out of src/server/lib/messages.ts, with no change of behaviour.
 * That file imports it back where it still uses it and re-exports it, so its export surface is unchanged.
 */

import { and, desc, sql, type SQL } from 'drizzle-orm'
import { db } from '../db/client.ts'
import { records } from '../db/schema.ts'
import { theViewFromAMoment } from './message-centre.ts'
import { readOrigin } from '@shared/types.ts'
import { TALK_COLUMNS, talkEntriesOf } from './message-pool-at-or-after.ts'
import { onlyTheirs } from './newest-withdrawn-message-pool-first.ts'
import type { ATalkEntry, TheirOwnMessages } from './messages.ts'

/**
 * Newest pool rows of every project of the list in batches of 4, 8, 16 and so on, each read as the talk reads a message
 * (`talkEntriesOf`) only as the caller asks for another batch. A caller who may read little can need the whole history, in about log2(N) reads for N
 * rows. No batch cap is needed: the walk reads at most about twice the rows it must. The rowid is a seek place within
 * one moment, not the talk's id order. The talk reader finishes the whole permitted boundary moment separately.
 *
 * EACH BATCH STARTS WHERE THE LAST ONE ENDED, through the index of every message's moment (round 66,
 * `theViewFromAMoment`). The bound says "at or before the last moment" first, so SQLite can seek to it, and then leaves
 * out what the last batch held at that moment.
 *
 * ONE WALK FOR EVERY PROJECT OF THE LIST (round 78), and a message in the views of two of them comes once. Until then
 * each project had a walk of its own, and the talk door walked every project in turn.
 *
 * WITH `theirs`, EACH BATCH HOLDS ONLY THE MESSAGES THAT PARTICIPANT SENT OR WAS HANDED, as in `theTalksPool` (round
 * 76). A caller who may read only their own then walks past no message of anybody else's.
 */
export function* newestMessagePoolFirst(projects: readonly string[], theirs?: TheirOwnMessages): Generator<ATalkEntry[]> {
  let before: { at: string; row: number } | undefined
  let limit = 4
  for (;;) {
    const earlier: SQL | undefined = before === undefined ? undefined : sql`${records.createdAt} <= ${before.at} AND (${records.createdAt} < ${before.at} OR ${records}.rowid < ${before.row})`
    const rows = db.select({ ...TALK_COLUMNS, place: sql<number>`rowid` }).from(records)
      .where(theViewFromAMoment(projects, and(earlier, onlyTheirs(theirs)), limit))
      .orderBy(desc(records.createdAt), sql`rowid DESC`).all()
    if (rows.length === 0) return
    yield talkEntriesOf(rows.filter(row => readOrigin(row.origin) === 'authored'))
    const end = rows.at(-1)!
    before = { at: end.createdAt, row: end.place }
    if (rows.length < limit) return
    limit *= 2
  }
}
