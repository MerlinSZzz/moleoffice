// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * `newestWithdrawnMessagePoolFirst` was moved byte for byte out of src/server/lib/messages.ts, with no change of behaviour.
 * `withdrawnPoolBetween` was moved byte for byte out of src/server/lib/messages.ts, with no change of behaviour.
 * `onlyTheirs` was moved byte for byte out of src/server/lib/messages.ts, with no change of behaviour.
 * That file imports it back where it still uses it and re-exports it, so its export surface is unchanged.
 */

import type { TheirOwnMessages, AWithdrawnMessage } from './messages.ts'
import { and, desc, eq, isNotNull, sql, type SQL } from 'drizzle-orm'
import { db } from '../db/client.ts'
import { records } from '../db/schema.ts'
import { messagesInTheViewOfAnyOf } from './message-centre.ts'
import { TALK_COLUMNS } from './message-pool-at-or-after.ts'
import { withdrawnEntriesOf } from './withdrawn-message-pool.ts'

/**
 * Newest withdrawals of every project of the list first, read in batches of 1, 2, 4 and so on, and yielded one at a time
 * in the same order.
 * A caller who may read little can need the whole history, in about log2(N) reads for N withdrawals. No batch cap is
 * needed: the walk reads at most about twice the rows it must. The seek place remains the newest delete's append order.
 * With `theirs`, only the messages that participant sent or was handed, as in `theTalksPool` (round 76).
 */
export function* newestWithdrawnMessagePoolFirst(projects: readonly string[], theirs?: TheirOwnMessages): Generator<AWithdrawnMessage> {
  let before: number | undefined
  let limit = 1
  for (;;) {
    const batch = withdrawnPoolBetween(projects, { before, limit }, theirs)
    if (batch.length === 0) return
    yield* batch
    before = batch.at(-1)!.order
    if (batch.length < limit) return
    limit *= 2
  }
}
/**
 * The withdrawal place remains the newest delete, even after a restore and a second delete. Every project of the list in
 * one statement (round 78), so a message in the views of two of them comes once.
 */
export function withdrawnPoolBetween(projects: readonly string[], window: { after?: number; before?: number | undefined; limit?: number }, theirs?: TheirOwnMessages): AWithdrawnMessage[] {
  const order = sql<number | null>`(SELECT MAX(c.append_order) FROM changes c WHERE c.record_id = records.id AND c.op = 'delete')`
  const query = db.select({ ...TALK_COLUMNS, order }).from(records)
    .where(and(
      messagesInTheViewOfAnyOf(projects), eq(records.kind, 'message'), isNotNull(records.deletedAt), isNotNull(order),
      window.after === undefined ? undefined : sql`${order} > ${window.after}`,
      window.before === undefined ? undefined : sql`${order} < ${window.before}`,
      onlyTheirs(theirs),
    )).orderBy(desc(order))
  const rows = (window.limit === undefined ? query : query.limit(window.limit)).all()
    .filter((row): row is typeof row & { order: number } => row.order !== null)
  return withdrawnEntriesOf(rows)
}
/** Only the records of one participant's list (`theirOwnMessages`), or no narrowing when nobody is named. */
export function onlyTheirs(theirs: TheirOwnMessages | undefined): SQL | undefined {
  return theirs === undefined ? undefined : sql`${records}.rowid IN (SELECT value FROM json_each(${theirs.rowids}))`
}
