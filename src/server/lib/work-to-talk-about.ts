// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE CONVERSATIONS PAGE'S LIST OF WORK, FOR ONE PROJECT AND ONE READER: what `GET /api/records/work-to-talk-about`
 * answers.
 *
 * TWO PATHS WORK OUT ONE ANSWER, and tests/the-work-to-talk-about-is-counted-without-reading-every-record.test.ts holds
 * them together. The answer is `workToTalkAbout` (src/shared/talksources.ts) over the records `listRecords` lists for the
 * project, as this reader is shown them.
 *   - A search, or a reader who may not read every message, is answered that way: every record is read whole, and the
 *     list is worked out over all of them.
 *   - A reader of every message is shown every record listed, and with no search only the five newest pieces of work
 *     are drawn. So the same answer is counted in SQLite: the project's live records by kind, the live messages of its
 *     view, and the newest rows of each, of which only those are read whole.
 *
 * Wave 13y round 167: on a made-up office of the live shape, with 66,560 records in the project and 106,199 messages in
 * its view, the person's list with no search took 3.17 to 3.48 s read the first way, and 255 to 267 ms counted, three
 * takes each. The Agents page waits for this list before it draws its first view.
 */
import { and, asc, count, desc, eq, inArray, isNull, notInArray, sql } from 'drizzle-orm'

import { NON_WORK_RECORD_KINDS, TALK_SOURCES_SHOWN, workToTalkAbout, type NonWorkKind, type WorkToTalkAbout } from '@shared/talksources.ts'
import type { PanelRecord } from '@shared/types.ts'
import { db, sqlite } from '../db/client.ts'
import { records } from '../db/schema.ts'
import { theViewReadOneWayAtATime } from './message-centre.ts'
import type { AMessageReader } from './messages.ts'
import { listRecords } from './records.ts'

const NON_WORK: readonly string[] = NON_WORK_RECORD_KINDS

/**
 * The list of work for `reader` in `workspaceId`, with `search` as a person typed it. `shown` is what the door does to
 * the rows it lists for this reader, given every row the answer can hold.
 */
export function theWorkToTalkAboutIn(
  workspaceId: string,
  reader: AMessageReader,
  search: string,
  shown: (rows: PanelRecord[]) => PanelRecord[],
): WorkToTalkAbout<PanelRecord> {
  // THE SEARCH AS THE LIST READS IT, and what it counts in a project of no records, from the shared function itself.
  const none = workToTalkAbout<PanelRecord>([], search)
  if (none.query !== '' || !reader.readsEveryMessage) return workToTalkAbout(shown(listRecords({ workspaceId })), search)
  // IN ONE TRANSACTION, so the counts and the rows are read from one moment of the database, as one statement reads them.
  return sqlite.transaction(() => theListCounted(workspaceId, none, shown))()
}

/**
 * THE LIST WITH NO SEARCH, COUNTED IN SQLITE, for a reader shown every record listed. `listRecords` lists the project's
 * live records and the live messages of its view, newest first (`THE_LISTED_ORDER` in src/server/lib/records/reading.ts,
 * which each read of the newest rows below follows). The two sets are apart: a message of the view is filed in the
 * message centre, and the message centre itself has no view to read.
 */
function theListCounted(
  workspaceId: string,
  none: WorkToTalkAbout<PanelRecord>,
  shown: (rows: PanelRecord[]) => PanelRecord[],
): WorkToTalkAbout<PanelRecord> {
  const leftOut = { ...none.leftOut }
  let matched = 0
  const filed = and(eq(records.workspaceId, workspaceId), isNull(records.deletedAt))
  for (const { kind, n } of db.select({ kind: records.kind, n: count() }).from(records).where(filed).groupBy(records.kind).all()) {
    if (NON_WORK.includes(kind)) leftOut[kind as NonWorkKind] = n
    else matched += n
  }
  const ways = theViewReadOneWayAtATime(workspaceId, { live: true })
  if (ways.length > 0) matched += db.get<{ n: number }>(sql`SELECT count(*) AS n FROM (${sql.join(ways, sql` UNION `)})`)!.n
  // THE NEWEST PIECES OF WORK FILED IN THE PROJECT, AND THE NEWEST MESSAGES OF EACH WAY INTO ITS VIEW: the rows the
  // answer is chosen from, since every row newer than one of them is among them.
  const newestFiled = db
    .select({ rowid: sql<number>`${records}.rowid` })
    .from(records)
    .where(and(filed, notInArray(records.kind, [...NON_WORK_RECORD_KINDS])))
    .orderBy(desc(records.updatedAt), asc(records.id))
    .limit(TALK_SOURCES_SHOWN)
    .all()
  const newestInTheView = ways.flatMap((way) =>
    db.all<{ rowid: number }>(sql`SELECT rowid FROM (${way} ORDER BY ${records.updatedAt} DESC, ${records.id} ASC LIMIT ${TALK_SOURCES_SHOWN})`),
  )
  const rowids = [...new Set([...newestFiled, ...newestInTheView].map((one) => one.rowid))]
  const ids = rowids.length === 0 ? [] : db.select({ id: records.id }).from(records).where(inArray(sql`${records}.rowid`, rowids)).all().map((one) => one.id)
  const chosenFrom = listRecords({ workspaceId, ids })
  const seen = shown(chosenFrom)
  if (seen.length !== chosenFrom.length) {
    throw new Error(`The list of work was counted for a reader shown every record, and this reader was shown ${String(seen.length)} of ${String(chosenFrom.length)} rows.`)
  }
  return { query: none.query, rows: workToTalkAbout(seen, '').rows, matched, leftOut }
}
