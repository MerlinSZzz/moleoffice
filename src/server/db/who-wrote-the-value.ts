// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * `whoWroteTheValue` was moved byte for byte out of src/server/lib/revisions.ts, with no change of behaviour.
 * `theRevisionsNewestFirst` was moved byte for byte out of src/server/lib/revisions.ts, with no change of behaviour.
 * That file imports it back where it still uses it and re-exports it, so its export surface is unchanged.
 */

import type { ActorType } from '@shared/types.ts'
import type { WhoWroteTheValue } from './types/revisions.ts'
import { desc, eq, sql } from 'drizzle-orm'
import { db } from './client.ts'
import { keptStatement } from './kept-statement.ts'
import { revisions } from './schema.ts'

/**
 * WHO PUT THE VALUE A RECORD'S FIELD HOLDS RIGHT NOW THERE — read from the revision ledger.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THE LEDGER AND NOT THE CHANGE LOG, MEASURED
 * ---------------------------------------------------------------------------------------
 *
 * `assertMayRemoveAnAsk` in lib/records/asks-and-commitments.ts has to know whether a person or an agent wrote
 * `whose_move: person` on a record, because an agent may withdraw its own request for a person's
 * attention and may never withdraw the person's. The obvious source is the change log, and for the
 * most common case the change log says nothing at all: a record created with the field already on it
 * gets one row, `op=create`, `field=null`, `newValue=<the title>` — `logChange` on the create path
 * logs the title and nothing else. So every record whose value arrived at creation, which is most of
 * them, has no answer there.
 *
 * The change log also records a field write in three different spellings — `data` for a wholesale
 * replace, `data.<key>` for a merge patch, and nothing for a create — so reading it means handling
 * three shapes and one hole. `lastTouchedItem` fell into exactly that trap, and the note at the top
 * of `logTheChangeRows` in lib/records.ts records it.
 *
 * `saveRevision` stores the WHOLE record, `data` included, with the actor and the time, on every
 * write. One shape, no hole.
 *
 * ---------------------------------------------------------------------------------------
 * WHICH REVISION IS THE ANSWER
 * ---------------------------------------------------------------------------------------
 *
 * The earliest revision that holds the value the record holds now, and from which every later
 * revision holds that same value. In other words: walk back from the newest while the value is
 * unchanged, and stop at the write that put it there. A value set, cleared and set again is answered
 * by the SECOND setting, which is the one that is standing.
 *
 * ---------------------------------------------------------------------------------------
 * NULL IS A REAL ANSWER AND MEANS THE LEDGER CANNOT SAY
 * ---------------------------------------------------------------------------------------
 *
 * It happens when the record has no revisions — one written before the ledger existed and never
 * backfilled, or one restored from an archive that carried only part of its history — and when the
 * newest revision does not hold the value the record holds now, which means the ledger and the
 * record disagree and neither this function nor anything else can say who is right.
 *
 * **A caller must not read null as "an agent wrote it" or as "a person wrote it".** It is neither.
 * `assertMayRemoveAnAsk` treats it as a refusal, and the note there says why refusing is the safe
 * direction and allowing is not.
 */
export function whoWroteTheValue(
  recordId: string,
  /** The key inside `data`, e.g. `whose_move`. */
  key: string,
  /** The value the record holds now. Compared with `===`, so this is for scalars. */
  value: unknown,
): WhoWroteTheValue | null {
  const rows = theRevisionsNewestFirst().all({ recordId })
  let answer: WhoWroteTheValue | null = null
  for (const row of rows) {
    const held = row.data as Record<string, unknown> | null
    if (held === null || held[key] !== value) break
    answer = {
      actorType: row.actorType as ActorType,
      actorId: row.actorId,
      at: row.at,
      seq: row.seq,
      onTheOwnersWords: row.warrant !== null,
    }
  }
  return answer
}
/**
 * ONE RECORD'S REVISIONS, NEWEST FIRST, with the fields `whoWroteTheValue` reads. Kept, because the waiting list asks
 * it twice for each record somebody asked about (src/server/db/kept-statement.ts).
 */
export const theRevisionsNewestFirst = keptStatement(() =>
  db
    .select({
      seq: revisions.seq,
      data: revisions.data,
      actorType: revisions.actorType,
      actorId: revisions.actorId,
      at: revisions.at,
      warrant: revisions.warrant,
    })
    .from(revisions)
    .where(eq(revisions.recordId, sql.placeholder('recordId')))
    .orderBy(desc(revisions.seq))
    .prepare(),
)
