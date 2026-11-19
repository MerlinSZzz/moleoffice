// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * `theirTalksPool` was moved byte for byte out of src/server/lib/messages.ts, with no change of behaviour.
 * That file imports it back where it still uses it and re-exports it, so its export surface is unchanged.
 */

import { and, isNull } from 'drizzle-orm'
import { db } from '../db/client.ts'
import { theKindOfARowFoundById, theProjectOfARowFoundById, records } from '../db/schema.ts'
import { MESSAGE_CENTRE } from '@shared/workspaces.ts'
import { theViewsHoldingIt } from './message-centre.ts'
import { readOrigin } from '@shared/types.ts'
import { TALK_COLUMNS, talkEntriesOf } from './message-pool-at-or-after.ts'
import { onlyTheirs } from './newest-withdrawn-message-pool-first.ts'
import type { TheirOwnMessages, ATalkEntryInViews } from './messages.ts'

/**
 * THE MESSAGES ONE PARTICIPANT SENT OR WAS HANDED, IN THE VIEWS OF EVERY PROJECT OF THE LIST, IN ONE STATEMENT (round 110
 * of wave 13y): what `theTalksPool(project, theirs)` hands back for each project, each message once with the projects
 * whose views hold it (`theViewsHoldingIt`), as `messagePoolAtOrAfter` reads them. Read for each project, their whole list
 * was looked up again each time: on a made-up office shaped to the live counts, 11 projects and about 40,000 messages of
 * one agent took about 751 ms. A message in no project's view is not built, as no project's read handed it back.
 */
export function theirTalksPool(projects: readonly string[], theirs: TheirOwnMessages): ATalkEntryInViews[] {
  const rows = db
    .select({ ...TALK_COLUMNS, views: theViewsHoldingIt(projects) })
    .from(records)
    .where(and(onlyTheirs(theirs), theProjectOfARowFoundById(MESSAGE_CENTRE), theKindOfARowFoundById('message'), isNull(records.deletedAt)))
    .all()
    .filter((row) => readOrigin(row.origin) === 'authored' && row.views !== '[]')
  const entries = talkEntriesOf(rows)
  return rows.map((row, n) => ({
    entry: entries[n]!,
    projects: (JSON.parse(row.views) as number[]).sort((a, b) => a - b).map((place) => projects[place]!),
  }))
}
