// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * `theTalksPool` was moved byte for byte out of src/server/lib/messages.ts, with no change of behaviour.
 * That file imports it back where it still uses it and re-exports it, so its export surface is unchanged.
 */

import { and, isNull, sql } from 'drizzle-orm'
import { db } from '../db/client.ts'
import { ONE_KIND_WRITTEN_OUT, theKindOfARowFoundById, records } from '../db/schema.ts'
import { justThisProject } from '@shared/which-projects.ts'
import { messagesInTheViewOf, theViewReadOneWayAtATime } from './message-centre.ts'
import { readOrigin } from '@shared/types.ts'
import { TALK_COLUMNS, talkEntriesOf } from './message-pool-at-or-after.ts'
import { onlyTheirs } from './newest-withdrawn-message-pool-first.ts'
import type { ATalkEntry, TheirOwnMessages } from './messages.ts'

/**
 * ONE PROJECT'S AUTHORED MESSAGES FOR THE TALK AND THE SCENE (wave 13y round 75): the messages `messagePool(workspaceId,
 * { origin: 'authored' })` hands back, each read as the talk reads it (`talkEntriesOf`, round 76), in no order, because
 * both readers put them in their own. Each way into the project's view is read through its own index
 * (`theViewReadOneWayAtATime`). Asked of every message of the office through the index of every record of a kind, one
 * project took about 106 ms on a made-up office of 55,725 messages, and the talk asks every project.
 *
 * WITH `theirs`, ONLY THE MESSAGES ONE PARTICIPANT SENT OR WAS HANDED (`theirOwnMessages`), for a caller who may not
 * read anybody else's. These are every message whose stored sender has their id, whatever kind of participant it says,
 * and every message with a delivery row that `theRecipientOf` reads as theirs. So every message the talk's rule could
 * keep for them is here (`aCallerSeesIt` in src/server/lib/pixel-office.ts), and that rule still decides. Since round 110
 * the talk reads them for every project at once (`theirTalksPool`), and this is the person's read.
 */
export function theTalksPool(workspaceId: string, theirs?: TheirOwnMessages): ATalkEntry[] {
  const ways = theViewReadOneWayAtATime(workspaceId)
  const inTheView =
    theirs !== undefined
      ? and(onlyTheirs(theirs), messagesInTheViewOf(justThisProject(workspaceId), true), theKindOfARowFoundById('message'))
      : ways.length > 0
        ? sql`${records}.rowid IN (${sql.join(ways, sql` UNION `)})`
        : and(ONE_KIND_WRITTEN_OUT.message, messagesInTheViewOf(justThisProject(workspaceId)))
  const rows = db
    .select(TALK_COLUMNS)
    .from(records)
    .where(and(inTheView, isNull(records.deletedAt)))
    .all()
    .filter((row) => readOrigin(row.origin) === 'authored')
  return talkEntriesOf(rows)
}
