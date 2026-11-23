// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * `whoWroteRecords` was moved byte for byte out of src/server/lib/revisions.ts, with no change of behaviour.
 * `theEndsOfTheLedger` was moved byte for byte out of src/server/lib/revisions.ts, with no change of behaviour.
 * That file imports it back where it still uses it and re-exports it, so its export surface is unchanged.
 */

import { asc, inArray } from 'drizzle-orm'
import { db } from './client.ts'
import { readInPieces } from './in-pieces.ts'
import { revisions } from './schema.ts'
import type { TheEndsOfTheLedger } from './types/revisions.ts'

/**
 * WHO WROTE THESE RECORDS, read off the first revision of each. `${actorType}:${actorId}`.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THE LEDGER AND NOT THE RECORD
 * ---------------------------------------------------------------------------------------
 *
 * A record row has no author column. `ownerId` looks like one and is not: `createRecord` writes the
 * actor's id there only when the actor is a person, and the owner's own name when it is an agent —
 * so every agent's record reads as the owner's. Answering "who wrote this" from it would attribute
 * an agent's work to a person, in the one direction that matters most.
 *
 * The ledger stores the actor per write, which is what it is for. The FIRST revision of a record is
 * the write that made it.
 *
 * AN ID WITH NO REVISION IS ABSENT FROM THE MAP, and callers must read that as "nobody recorded who
 * wrote this" rather than as anybody in particular. It happens on a database that has not been
 * through the backfill, and on nothing a running server has written.
 */
export function whoWroteRecords(recordIds: readonly string[]): Map<string, string> {
  const wrote = new Map<string, string>()
  for (const [recordId, ends] of theEndsOfTheLedger(recordIds)) wrote.set(recordId, ends.writer)
  return wrote
}
/**
 * WHO WROTE EACH RECORD, IN WHICH RUN, AND WHEN IT LAST CHANGED, in one reading of the ledger.
 *
 * `whoWroteRecords` above is this with only the writer kept, so the two cannot name different
 * writers. The drafts read the rest: the run a draft was written in says whether its writer is still
 * working, and the newest revision says which version the reminder is about and when it was made.
 * An id with no revision is absent from the map, for the reason given above.
 */
export function theEndsOfTheLedger(recordIds: readonly string[]): Map<string, TheEndsOfTheLedger> {
  const ends = new Map<string, TheEndsOfTheLedger>()
  if (recordIds.length === 0) return ends
  // IN PIECES (src/server/db/in-pieces.ts): callers pass every comment or draft of a project, and nothing caps
  // that. Every row of one record is in the piece that names it, in seq order, and the rows are folded per record.
  const rows = readInPieces(recordIds, (piece) =>
    db
      .select({
        recordId: revisions.recordId,
        seq: revisions.seq,
        actorType: revisions.actorType,
        actorId: revisions.actorId,
        sessionId: revisions.sessionId,
        at: revisions.at,
      })
      .from(revisions)
      .where(inArray(revisions.recordId, piece))
      .orderBy(asc(revisions.seq))
      .all(),
  )
  // The first row seen for a record is its lowest `seq`, because each piece is in seq order and holds every
  // row of the records it names; every later row moves the newest end on.
  for (const row of rows) {
    const held = ends.get(row.recordId)
    if (held === undefined) {
      ends.set(row.recordId, {
        writer: `${row.actorType}:${row.actorId}`,
        writtenIn: row.sessionId,
        newestSeq: row.seq,
        newestAt: row.at,
      })
    } else {
      held.newestSeq = row.seq
      held.newestAt = row.at
    }
  }
  return ends
}
