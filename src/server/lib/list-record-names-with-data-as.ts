// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * `listRecordNamesWithDataAs` was moved byte for byte out of src/server/lib/records/reading.ts, with no change of behaviour.
 * `theRecordsListed` was moved byte for byte out of src/server/lib/records/reading.ts, with no change of behaviour.
 * `filedInOrInTheViewOf` was moved byte for byte out of src/server/lib/records/reading.ts, with no change of behaviour.
 * `THE_LISTED_ORDER` was moved byte for byte out of src/server/lib/records/reading.ts, with no change of behaviour.
 * `inTheViewOf` was moved byte for byte out of src/server/lib/records/reading.ts, with no change of behaviour.
 * `readTheRecordsListed` was moved byte for byte out of src/server/lib/records/reading.ts, with no change of behaviour.
 * That file imports it back where it still uses it and re-exports it, so its export surface is unchanged.
 */

import { type SQL, and, eq, inArray, isNull, or, sql, asc, desc } from 'drizzle-orm'
import type { RecordKind } from '@shared/types.ts'
import { db } from '../db/client.ts'
import { records, theKindOfARowFoundById, theProjectOfARowFoundById } from '../db/schema.ts'
import type { WhichRecords, ARecordByName } from './records/reading.ts'
import { MESSAGE_CENTRE } from '@shared/workspaces.ts'
import { messagesInTheViewOf, theViewReadOneWayAtATime } from './message-centre.ts'
import { justThisProject } from '@shared/which-projects.ts'
import { ACROSS_WORKSPACES } from '@shared/across-workspaces.ts'
import { readInPieces } from '../db/in-pieces.ts'
import { inTheListedOrder } from '@shared/in-the-listed-order.ts'

/**
 * THE ID, KIND AND TITLE OF EACH RECORD `listRecords` GIVES, IN ITS ORDER, with its `data` replaced by what an SQL
 * expression works out from it, and nothing else of the record.
 *
 * For a reader that names every record of a project and reads stored fields of only a few. The session placement read
 * every column of every record through `listRecordsWithDataAs` to use these four: 157 to 178 ms on the office copy of
 * 5 October, and 30 to 50 percent less read this way, on three copies (wave 13y round 32).
 */
export function listRecordNamesWithDataAs(opts: WhichRecords, data: SQL<string>): ARecordByName[] {
  return readTheRecordsListed(opts, (which) =>
    db
      .select({ id: records.id, kind: records.kind, title: records.title, updatedAt: records.updatedAt, data })
      .from(records)
      .where(theRecordsListed(which))
      .orderBy(...THE_LISTED_ORDER)
      .all(),
  ).map((row) => ({ id: row.id, kind: row.kind as RecordKind, title: row.title, data: JSON.parse(row.data) as Record<string, unknown> }))
}
/** The condition `listRecords` reads by. Written once, so a narrower read of the same records cannot pick others. */
export function theRecordsListed(opts: WhichRecords): SQL | undefined {
  // GIVEN IDS, THE OTHER COLUMNS ARE WRITTEN WITH A `+`, so SQLite finds the rows by their primary key. With no
  // statistics it chose the kind index, or the project's, and read every row there to keep a few ids: about 12 ms for
  // panelx's running sessions, every minute, on a copy at the live counts (wave 13y round 17). The conditions are the same.
  const byIds = opts.ids !== undefined
  // WITH NO IDS, A PROJECT'S MESSAGES ARE FOUND ONE WAY INTO ITS VIEW AT A TIME, as the attention rule finds them
  // (`filedInOrInTheViewOf`), and the other columns are written with a `+` so that SQLite does not walk the kind's index
  // instead. Asked as the view's rule, SQLite tested every message of the office for each listing of a project: GET
  // /api/search listed eleven projects so for a common word, 1,427 to 1,498 ms in all, and 633 to 672 ms this way, on
  // the made-up office at the 22 October scale (wave 13y round 107). The message centre's view is every message filed in
  // it, so its messages are read as they were.
  const byTheWays =
    !byIds &&
    opts.workspaceId !== ACROSS_WORKSPACES &&
    opts.kinds === undefined &&
    (opts.kind === undefined || (opts.kind === 'message' && opts.workspaceId !== MESSAGE_CENTRE))
  const offTheirIndexes = byIds || byTheWays
  const where = [opts.includeDeleted ? undefined : offTheirIndexes ? sql`+${records.deletedAt} IS NULL` : isNull(records.deletedAt)]
  if (opts.kind) where.push(offTheirIndexes ? theKindOfARowFoundById(opts.kind) : eq(records.kind, opts.kind))
  if (opts.kinds !== undefined) {
    if (opts.kinds.includes('message')) throw new Error('listRecords reads no message by `kinds`; a project sees messages through its view of the message centre.')
    where.push(opts.kinds.length === 0 ? sql`0` : inArray(records.kind, [...opts.kinds]))
  }
  if (opts.ids !== undefined) where.push(opts.ids.length === 0 ? sql`0` : inArray(records.id, [...opts.ids]))
  if (byTheWays) where.push(opts.kind === 'message' ? inTheViewOf(opts.workspaceId) : filedInOrInTheViewOf(opts.workspaceId))
  else if (opts.workspaceId !== ACROSS_WORKSPACES) {
    // A PROJECT'S MESSAGES ARE ITS VIEW OF THE MESSAGE CENTRE: every message is kept there, and a
    // project holds the ones written in it, about it, or commenting on one of its records (`messagesInTheViewOf`).
    // GIVEN IDS, THE VIEW AND THE PROJECT'S OR ARE ASKED OFF THEIR INDEXES TOO. SQLite answered the OR from the project's
    // index and the kind's, and so read every message of the office for each piece of ids: 455 ms for 46 ids in eleven
    // projects, on the made-up office at the 22 October scale (wave 13y round 64). The conditions are the same.
    const view = messagesInTheViewOf(justThisProject(opts.workspaceId), byIds)
    const inTheProject = byIds ? theProjectOfARowFoundById(opts.workspaceId) : eq(records.workspaceId, opts.workspaceId)
    if (opts.kind === 'message') where.push(view)
    else if (opts.kind === undefined && opts.kinds === undefined) where.push(or(inTheProject, and(byIds ? theKindOfARowFoundById('message') : eq(records.kind, 'message'), view)))
    else where.push(inTheProject)
  }
  // THE NARROWING COMES AFTER THE PROJECT, because SQLite tests the terms its index does not answer in the order they are
  // written. A JSON condition written first parsed every session of every project to keep one project's rows: about 21 ms
  // a project, every minute, on a copy at the live counts (wave 13y round 17). The order changes no answer.
  if (opts.alsoWhere !== undefined) where.push(opts.alsoWhere)
  return and(...where.filter(Boolean))
}
/**
 * A RECORD FILED IN THIS PROJECT, OR A MESSAGE IN ITS VIEW, deleted ones included: the same records as
 * `or(eq(records.workspaceId, workspaceId), and(eq(records.kind, 'message'), messagesInTheViewOf(...)))`.
 * They are found by rowid, through the project's index and through the index of each way into the
 * view (`theViewReadOneWayAtATime`), so a read that asks only this reads no other record. The two
 * readers below ask it, and so do `listRecords` for every kind of a project and the counts of GET /api/project/bootstrap.
 */
export function filedInOrInTheViewOf(workspaceId: string): SQL {
  const filed = sql`SELECT ${records}.rowid FROM ${records} INDEXED BY records_live_idx WHERE ${eq(records.workspaceId, workspaceId)}`
  return sql`${records}.rowid IN (${sql.join([filed, ...theViewReadOneWayAtATime(workspaceId)], sql` UNION `)})`
}
/**
 * THE ORDER `listRecords` GIVES: newest change first, and the records changed in the same second by their id, A to Z.
 *
 * `updated_at` is kept to the second, and an office writes many records in one second. Ordered by `updated_at` alone,
 * the records of one second came in whatever order SQLite's sort left them in, which it does not promise: on the seeds
 * measured in wave 13y round 35 that was the order they were stored in, while `liveRecordsOfKinds` asked for the
 * opposite. The id ends the tie as GET /api/records?sort= already ends it (`sortCatalogue` in src/shared/catalogue.ts),
 * so the list with no `sort` is the list sorted by `updated`, newest first. Every reader below that says it gives
 * `listRecords`' order orders by this, and `inTheListedOrder` is the same order for rows read in pieces.
 */
export const THE_LISTED_ORDER = [desc(records.updatedAt), asc(records.id)] as const
/**
 * A MESSAGE IN THIS PROJECT'S VIEW, deleted ones included: the same records as `messagesInTheViewOf` gives for one
 * project, found by rowid through the index of each way into the view. Never asked for the message centre, whose view
 * has no way into it to read (`theViewReadOneWayAtATime`).
 */
export function inTheViewOf(workspaceId: string): SQL {
  return sql`${records}.rowid IN (${sql.join(theViewReadOneWayAtATime(workspaceId), sql` UNION `)})`
}
/** The rows `read` gives for `theRecordsListed(opts)`, in `THE_LISTED_ORDER`. The three readers below read through here. */
export function readTheRecordsListed<Row extends { id: string; updatedAt: string }>(opts: WhichRecords, read: (which: WhichRecords) => Row[]): Row[] {
  // An empty list is still asked as one statement, so a refusal `theRecordsListed` makes is still made.
  if (opts.ids === undefined || opts.ids.length === 0) return read(opts)
  // IN PIECES (src/server/db/in-pieces.ts): the ids a caller gives grow with the office (a review's walk, the far ends of
  // a whole listing, every running session), so each piece is read under the same conditions and the joined rows are
  // put in the listed order again.
  return inTheListedOrder(readInPieces(opts.ids, (ids) => read({ ...opts, ids })))
}
