// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE CREATED-BETWEEN READING: the most records a window listing answers with, the one record it serves, the shape
 * `GET /api/records/created-between` answers, and `recordsCreatedBetween`. It was moved whole out of
 * src/server/lib/records.ts, with no change of behaviour.
 *
 * NO CALLER CHANGED. records.ts hands on everything here with `export *`, and every caller still imports these names
 * from records.ts.
 *
 * THIS FILE DOES NOT IMPORT records.ts AT ALL. Every name it reads is imported from the module that declares it.
 */
import { and, asc, eq, gte, lte, or } from 'drizzle-orm'
import type { ActorType, RecordKind } from '@shared/types.ts'
import { db } from '../../db/client.ts'
import { records, revisions } from '../../db/schema.ts'
import { justThisProject, onlyTheMessagesThisReaderMayRead, type AMessageReader } from '../messages.ts'
import { messagesInTheViewOf } from '../message-centre.ts'

// ------------------------------------------------------- what a project filed between two moments

/** The most records `recordsCreatedBetween` answers with. The route's sentence says when it cuts. */
export const CREATED_BETWEEN_MAX = 500

/**
 * ONE RECORD A WINDOW LISTING SERVES: enough to tell what was written and by whom, and no body.
 *
 * Acceptance finding 44, 23 September 2026: a check's model ran the tree's browser tests, the app
 * wrote 65 records into the live office, and nothing could count them. The tool that starts the model
 * asks this door for the window it ran in, so it can say what the model's run wrote.
 */
export interface ACreatedRecord {
  id: string
  kind: RecordKind
  title: string
  /** When the record row was written, local wall clock. */
  when: string
  /**
   * The actor and the session the revision ledger keeps for the record's FIRST revision — the write
   * that created it — or null because no ledger row answers to this record. A session is null when
   * the ledger kept none; the door says so rather than inventing one.
   */
  createdBy: { actorType: ActorType; actorId: string; sessionId: string | null } | null
  /** `data.workingDirectory`, where the record has one. Absent means it has none. */
  workingDirectory?: string
}

/** What `GET /api/records/created-between` answers. */
export interface CreatedBetween {
  records: ACreatedRecord[]
  /** Every record of this project written inside the window, whether or not all are served. */
  matched: number
  /** How many are in `records`. */
  returned: number
  /** True when `matched` is larger than `returned`, so the reader knows the list was cut. */
  truncated: boolean
  /** The window, as the route read it back into the office's own stamp. */
  from: string
  to: string
  says: string
}

/**
 * THE RECORDS ONE PROJECT FILED BETWEEN TWO MOMENTS, inclusive at both ends.
 *
 * `from` and `to` are the office's own `YYYY-MM-DD HH:MM:SS` stamps: the route reads the caller's
 * words into that form first, so a value with a `T` or a missing second compares on the same clock
 * as `records.created_at` and not as a string that happens to look like a date.
 *
 * The creating actor and session come from the revision ledger's first row for the record, which is
 * the write that created it. The ledger keeps the session, so it is served; where it kept none, the
 * value is null. Nothing here is stored and nothing is written.
 */
export function recordsCreatedBetween(opts: { workspaceId: string; from: string; to: string; reader: AMessageReader }): CreatedBetween {
  // ONLY THE MESSAGES THIS READER MAY READ are listed or counted; every other
  // kind of record is listed as it always was.
  const every = db
    .select()
    .from(records)
    .where(
      and(
        // THE PROJECT'S RECORDS AND ITS VIEW OF THE MESSAGE CENTRE: a message a run wrote in this
        // window was written in this project, and a count of what the run wrote that left it out would be short.
        or(eq(records.workspaceId, opts.workspaceId), and(eq(records.kind, 'message'), messagesInTheViewOf(justThisProject(opts.workspaceId)))),
        gte(records.createdAt, opts.from),
        lte(records.createdAt, opts.to),
      ),
    )
    .orderBy(asc(records.createdAt), asc(records.id))
    .all()
  const rows = onlyTheMessagesThisReaderMayRead(opts.reader, every)
  const listed = rows.slice(0, CREATED_BETWEEN_MAX)
  let anyWithNoLedgerRow = false
  const served: ACreatedRecord[] = listed.map((row) => {
    const first = db
      .select({ actorType: revisions.actorType, actorId: revisions.actorId, sessionId: revisions.sessionId })
      .from(revisions)
      .where(eq(revisions.recordId, row.id))
      .orderBy(asc(revisions.seq))
      .limit(1)
      .get()
    if (first === undefined) anyWithNoLedgerRow = true
    const data = row.data
    const workingDirectory =
      data !== null && typeof data === 'object' && !Array.isArray(data) && typeof (data as Record<string, unknown>)['workingDirectory'] === 'string'
        ? ((data as Record<string, unknown>)['workingDirectory'] as string)
        : undefined
    return {
      id: row.id,
      kind: row.kind as RecordKind,
      title: row.title,
      when: row.createdAt,
      createdBy:
        first === undefined
          ? null
          : { actorType: first.actorType as ActorType, actorId: first.actorId, sessionId: first.sessionId },
      ...(workingDirectory === undefined ? {} : { workingDirectory }),
    }
  })
  const truncated = rows.length > served.length
  return {
    records: served,
    matched: rows.length,
    returned: served.length,
    truncated,
    from: opts.from,
    to: opts.to,
    says:
      rows.length === 0
        ? `No record in this project was created between ${opts.from} and ${opts.to}.`
        : `${String(rows.length)} record${rows.length === 1 ? '' : 's'} in this project ${rows.length === 1 ? 'was' : 'were'} ` +
          `created between ${opts.from} and ${opts.to}, both ends included` +
          `${truncated ? `; the first ${String(served.length)} are listed here and the list was cut` : ''}. ` +
          'The creating actor and the creating session are read from the first revision the ledger keeps for each record' +
          `${anyWithNoLedgerRow ? ', and a record with no ledger row has no creating actor here' : ''}. ` +
          'A session is null where the ledger kept none.',
  }
}
