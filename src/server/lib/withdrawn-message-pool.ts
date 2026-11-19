// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * `withdrawnMessagePool` was moved byte for byte out of src/server/lib/messages.ts, with no change of behaviour.
 * `withdrawnEntriesOf` was moved byte for byte out of src/server/lib/messages.ts, with no change of behaviour.
 * That file imports it back where it still uses it and re-exports it, so its export surface is unchanged.
 */

import { and, eq, isNotNull, sql } from 'drizzle-orm'
import { db } from '../db/client.ts'
import { records } from '../db/schema.ts'
import { justThisProject } from '@shared/which-projects.ts'
import { messagesInTheViewOf } from './message-centre.ts'
import { TALK_COLUMNS, talkEntriesOf } from './message-pool-at-or-after.ts'
import type { AWithdrawnMessage, TalkRow } from './messages.ts'
import { readOrigin } from '@shared/types.ts'

/**
 * EVERY MESSAGE IN ONE PROJECT'S VIEW THAT IS WITHDRAWN NOW, each read as the talk reads a live one, and placed by
 * the delete that withdrew it. Wave 13x round 17, gap G9: the plugin talk view names a withdrawn message by id
 * (src/server/lib/plugin-read.ts).
 *
 * A message is withdrawn by deleteRecord, which writes its `deletedAt` and a `delete` change row in one transaction. So
 * the place of a withdrawal is that row's append order, which a higher number says was appended later (migration 0194).
 * A message deleted, restored and deleted again is placed by its newest delete. A restore clears `deletedAt`, so a
 * message restored is not here. A withdrawn message with no `delete` change row has no place, and is not here.
 */
export function withdrawnMessagePool(workspaceId: string): AWithdrawnMessage[] {
  // THE TABLES ARE NAMED IN THE WORDS, because drizzle writes a column inside a select without its table, and there "id"
  // would be the change row's own id. changes_record_idx finds a message's change rows.
  const order = sql<number | null>`(SELECT MAX(c.append_order) FROM changes c WHERE c.record_id = records.id AND c.op = 'delete')`
  const rows = db
    .select({ ...TALK_COLUMNS, order })
    .from(records)
    .where(and(messagesInTheViewOf(justThisProject(workspaceId)), eq(records.kind, 'message'), isNotNull(records.deletedAt)))
    .all()
    .filter((row): row is typeof row & { order: number } => row.order !== null)
  return withdrawnEntriesOf(rows)
}
/** Live and withdrawn reads of the talk share `talkEntriesOf`. */
export function withdrawnEntriesOf(rows: readonly (TalkRow & { origin: unknown; order: number })[]): AWithdrawnMessage[] {
  const entries = talkEntriesOf(rows)
  return rows.map((row, n) => ({ entry: entries[n]!, authored: readOrigin(row.origin) === 'authored', order: row.order }))
}
