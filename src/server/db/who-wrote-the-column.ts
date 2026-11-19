// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * `whoWroteTheColumn` was moved byte for byte out of src/server/lib/revisions.ts, with no change of behaviour.
 * That file imports it back where it still uses it and re-exports it, so its export surface is unchanged.
 */

import { desc, eq } from 'drizzle-orm'
import { db } from './client.ts'
import { revisions } from './schema.ts'
import type { ActorType } from '@shared/types.ts'
import type { WhoWroteTheColumn } from '../lib/revisions.ts'

/**
 * WHO PUT THE VALUE ONE OF A RECORD'S OWN COLUMNS HOLDS THERE, AND IN WHICH RUN.
 *
 * ---------------------------------------------------------------------------------------
 * WHY IT IS NOT `whoWroteTheValue` ABOVE
 * ---------------------------------------------------------------------------------------
 *
 * That one reads a key inside `data`. A record's `title` and `summary` are not in `data` at all:
 * they are columns of the row, and a revision stores them as columns too. So the walk is the same
 * walk and the field it compares is a different one, which is a second reader of one table rather
 * than a second answer about one fact.
 *
 * IT ALSO HANDS BACK THE RUN, WHICH THAT ONE DOES NOT. The composer links a form to the session
 * record that wrote it, because a summary should link straight to the agent session that made it,
 * and levels 2 and 3 are these two columns, so the link has to come
 * from here. `sessionId` on a revision row is already resolved to a session record's id by
 * `logChange`, so nothing is resolved a second time.
 *
 * ---------------------------------------------------------------------------------------
 * WHICH REVISION IS THE ANSWER, AND WHEN THERE IS NONE
 * ---------------------------------------------------------------------------------------
 *
 * The earliest revision holding the value the record holds now, from which every later revision
 * holds the same value: walk back from the newest while the value is unchanged and stop at the
 * write that put it there. That is `whoWroteTheValue`'s rule and it is deliberately the same one.
 *
 * NULL MEANS THE LEDGER CANNOT SAY, and it is an ordinary answer on a record whose history was
 * backfilled or restored from a partial archive. **A caller must write nothing where this is
 * null** — not "nobody recorded who wrote this", which reads oddly there; writing nothing is better.
 * Criterion A9a.
 */
export function whoWroteTheColumn(
  recordId: string,
  /** Which column: the record's `title` or its `summary`. */
  column: 'title' | 'summary',
  /** The value the record holds now. Compared with `===`. */
  value: string | null,
): WhoWroteTheColumn | null {
  const rows = db
    .select({
      seq: revisions.seq,
      title: revisions.title,
      summary: revisions.summary,
      actorType: revisions.actorType,
      actorId: revisions.actorId,
      sessionId: revisions.sessionId,
      at: revisions.at,
    })
    .from(revisions)
    .where(eq(revisions.recordId, recordId))
    .orderBy(desc(revisions.seq))
    .all()
  let answer: WhoWroteTheColumn | null = null
  for (const row of rows) {
    const held = column === 'title' ? row.title : row.summary
    if (held !== value) break
    answer = {
      actorType: row.actorType as ActorType,
      actorId: row.actorId,
      sessionId: row.sessionId,
      at: row.at,
      seq: row.seq,
    }
  }
  return answer
}
