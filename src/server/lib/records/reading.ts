// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * HOW A RECORD IS READ: ONE BY ITS ID, MANY BY THEIR IDS, AND A PROJECT'S RECORDS AS A LIST. These are 13y's read
 * paths. They were moved whole out of src/server/lib/records.ts in wave 13s round 105, with no change of behaviour,
 * so that a change to one of them no longer meets another line's change in that file. The line that owns them is 13y.
 *
 * NO CALLER CHANGED. records.ts hands on everything here with `export *`, and every caller still imports these
 * names from records.ts. A test deleted on 13 November 2026 held that.
 *
 * THIS FILE AND records.ts IMPORT EACH OTHER: this one takes `toRecord` from it. That is safe in the same way as
 * the other modules that import records.ts in a cycle: every reference this file makes to records.ts is inside a
 * function body, so nothing of records.ts is read while it is still being evaluated.
 */
import { and, asc, desc, eq, getTableColumns, inArray, isNull, ne, or, sql, type SQL } from 'drizzle-orm'
import type { PanelRecord, RecordKind } from '@shared/types.ts'
import { MESSAGE_CENTRE } from '@shared/workspaces.ts'
import { db, sqlite } from '../../db/client.ts'
import { readInPieces } from '../../db/in-pieces.ts'
import { records, theKindOfARowFoundById, theProjectOfARowFoundById } from '../../db/schema.ts'
import { messagesInTheViewOf } from '../message-centre.ts'
import { theViewReadOneWayAtATime } from '../message-centre.ts'
import { justThisProject } from '@shared/which-projects.ts'
import { toRecord } from '../to-record.ts'
import { ACROSS_WORKSPACES } from '@shared/across-workspaces.ts'
import { theRecordsListed } from '../list-record-names-with-data-as.ts'
import { filedInOrInTheViewOf } from '../list-record-names-with-data-as.ts'
import { THE_LISTED_ORDER } from '../list-record-names-with-data-as.ts'
import { readTheRecordsListed } from '../list-record-names-with-data-as.ts'
import { onlyTheseFieldsOf } from '../../db/only-these-fields-of.ts'

export function getRecord(id: string): PanelRecord | null {
  const r = theRecordByIdQuery().get({ id })
  return r ? toRecord(r) : null
}

/**
 * WHAT `getRecord` ANSWERS FOR EACH OF MANY IDS, in one statement for every 500 (src/server/db/in-pieces.ts). An id no
 * record has is absent from the map. The same drizzle select, so each row is mapped as `getRecord` maps it. The list of
 * resources asks it for the session of every row, where it asked `getRecord` once per row (wave 13y round 50).
 */
export function getRecordsWithIds(ids: Iterable<string>): Map<string, PanelRecord> {
  const rows = readInPieces(ids, (piece) => db.select().from(records).where(inArray(records.id, piece)).all())
  return new Map(rows.map((row) => [row.id, toRecord(row)]))
}

/**
 * ONE PREPARED STATEMENT PER DATABASE HANDLE, NOT ONE PER READ, as `agentByHandle` in lib/participants.ts keeps its own.
 *
 * MEASURED, 13 October 2026, on the made copy of the office at scale: one reading of GET /api/waiting read a record by
 * its id 2,033 times, most of them to ask who settles a fork. Built and prepared again for each read, that is about
 * 40 µs a read; prepared once, about 3.5 µs, and a warm reading of the door went from about 430 ms to about 360 ms.
 * It is the same drizzle select as before with the id as a placeholder, so the row comes back mapped the same way.
 * The query is kept beside the handle it was prepared on, so a test that opens a fresh database gets a fresh one.
 */
type TheRecordByIdQuery = { get: (values: { id: string }) => typeof records.$inferSelect | undefined }
const RECORD_BY_ID = new WeakMap<object, TheRecordByIdQuery>()

function theRecordByIdQuery(): TheRecordByIdQuery {
  const kept = RECORD_BY_ID.get(sqlite)
  if (kept !== undefined) return kept
  const made = db.select().from(records).where(eq(records.id, sql.placeholder('id'))).prepare()
  RECORD_BY_ID.set(sqlite, made)
  return made
}

export { ACROSS_WORKSPACES } from '@shared/across-workspaces.ts'

/** Which records `listRecords` answers with: one project or every one, one kind or all, live unless asked. */
export interface WhichRecords {
  /** Which project. Required: see ACROSS_WORKSPACES for the deliberate way to ask for all of them. */
  workspaceId: string
  kind?: RecordKind
  includeDeleted?: boolean
  /**
   * ONLY THESE RECORDS, of the ones this reading would give. A review's scope walks down from one record and reads
   * the records it reaches by id, rather than every record of the project (wave 13r round 15). An empty list reads none.
   */
  ids?: readonly string[]
  /**
   * ONLY THESE KINDS, NONE OF THEM A MESSAGE: what `kind` asks for one kind, for several. A family page asks for its
   * family's kinds, and reading the whole project for them parsed 142 MB on the live office to keep a few (round 15).
   */
  kinds?: readonly RecordKind[]
  /**
   * ONLY THE RECORDS THIS CONDITION ALSO HOLDS FOR, of the ones this reading would give. It can only narrow. A timer that
   * runs every minute asks the database for the few rows it acts on, by title or by stored state, rather than parsing
   * every session record of the project to throw most away: three such reads were 270 ms of every minute on a copy of
   * the office at the live counts (wave 13y round 16).
   */
  alsoWhere?: SQL
}

export { theRecordsListed } from '../list-record-names-with-data-as.ts'

export { THE_LISTED_ORDER } from '../list-record-names-with-data-as.ts'

export { inTheListedOrder } from '@shared/in-the-listed-order.ts'

export { readTheRecordsListed } from '../list-record-names-with-data-as.ts'

/** Every record in one workspace, or in all of them when asked with `ACROSS_WORKSPACES`. */
export function listRecords(opts: WhichRecords): PanelRecord[] {
  return readTheRecordsListed(opts, (which) =>
    db.select().from(records).where(theRecordsListed(which)).orderBy(...THE_LISTED_ORDER).all(),
  ).map(toRecord)
}

/**
 * THE RECORDS `listRecords` GIVES, IN ITS ORDER, with each record's `data` replaced by what an SQL
 * expression works out from it. The expression must give a JSON object as text; `onlyTheseFieldsOf`
 * gives one.
 *
 * A reader that needs a few fields of many records reads them this way, so SQLite hands back those
 * fields and not the rest of each record. Round 35 of wave 13n measured GET /api/sessions reading the
 * whole of every record of a project, to use the id, kind and title of most of them.
 */
export function listRecordsWithDataAs(opts: WhichRecords, data: SQL<string>): PanelRecord[] {
  return readTheRecordsListed(opts, (which) =>
    db
      .select({ ...getTableColumns(records), data })
      .from(records)
      .where(theRecordsListed(which))
      .orderBy(...THE_LISTED_ORDER)
      .all(),
  ).map((row): PanelRecord => toRecord({ ...row, data: JSON.parse(row.data) as Record<string, unknown> } as typeof records.$inferSelect))
}

/** A record by its id, kind and title, with the `data` an SQL expression worked out from it: what `listRecordNamesWithDataAs` gives. */
export interface ARecordByName {
  id: string
  kind: RecordKind
  title: string
  data: Record<string, unknown>
}

export { listRecordNamesWithDataAs } from '../list-record-names-with-data-as.ts'

/**
 * THE ID, KIND AND PROJECT OF EACH RECORD `listRecords` GIVES, and nothing else of it, in no order promised. For a reader
 * that only counts the records a reader may see: which records those are depends on these three and on nothing else.
 */
export function listRecordIdsKindsAndProjects(opts: WhichRecords): { id: string; kind: string; workspaceId: string }[] {
  const read = (which: WhichRecords): { id: string; kind: string; workspaceId: string }[] =>
    db.select({ id: records.id, kind: records.kind, workspaceId: records.workspaceId }).from(records).where(theRecordsListed(which)).all()
  return opts.ids === undefined || opts.ids.length === 0 ? read(opts) : readInPieces(opts.ids, (ids) => read({ ...opts, ids }))
}

export { onlyTheseFieldsOf } from '../../db/only-these-fields-of.ts'

/**
 * THE LIVE RECORDS OF SOME KINDS IN ONE PROJECT, NONE OF THEM A MESSAGE, in `listRecords`' order:
 * what `listRecords({ workspaceId })` gives, with the records of every other kind left out.
 *
 * The open-loops reading wants six kinds and modules. Reading every record of the project for them
 * parsed every message, run and report as well: about 250 ms on an office of the live shape (round 34
 * of wave 13n), for records it then threw away. Records changed in the same second come out as
 * `listRecords` gives them, by `THE_LISTED_ORDER`. Until wave 13y round 35 this asked for the newest
 * stored first, while `listRecords` gave the oldest stored first.
 */
export function liveRecordsOfKinds(workspaceId: string, kinds: readonly RecordKind[]): PanelRecord[] {
  if (kinds.includes('message')) throw new Error('liveRecordsOfKinds reads no message; a project sees messages through its view of the message centre.')
  if (kinds.length === 0) return []
  return db
    .select()
    .from(records)
    .where(and(eq(records.workspaceId, workspaceId), inArray(records.kind, [...kinds]), isNull(records.deletedAt)))
    .orderBy(...THE_LISTED_ORDER)
    .all()
    .map(toRecord)
}

/**
 * EVERY STORED FIELD THE ATTENTION RULE READS, at the top of a record's `data`.
 *
 * `computeAttention` in src/shared/attention.ts, and the readers it calls in src/shared/work.ts and
 * src/shared/types.ts, read these and no other field of a record's `data`. The list was taken from
 * every field name those three files read, so it holds some that the rule only reads inside another
 * field, which costs nothing. tests/the-brief-reads-only-what-it-needs.test.ts checks that the rule
 * gives the same answer from these fields as from the whole record.
 *
 * `mainSuiteFix` IS ONE OF THEM. A problem filed for a red main suite may store no `state`, and then
 * `readWorkState` works its state out from `mainSuiteFix`. Until the list named it, the rule read such
 * a problem as one with no state word, so the attention page left it off the list.
 * tests/a-main-suite-fix-problem-keeps-its-state-on-the-attention-page.test.ts holds that.
 */
export const THE_FIELDS_THE_ATTENTION_RULE_READS = [
  'agent', 'bearer', 'blocks', 'condition', 'consequence', 'date', 'depth', 'done', 'due', 'for', 'fulfilledAt',
  'fulfilledNote', 'id', 'items', 'mainSuiteFix', 'name', 'owedTo', 'owed_to', 'parts', 'paused', 'read', 'recordId', 'runtime',
  'selectedBy', 'shape', 'short', 'since', 'state', 'text', 'title', 'until', 'what', 'whose_move', 'why',
] as const

/**
 * EVERY RECORD OF ONE PROJECT AS `listRecords` GIVES IT, with only the fields the attention rule reads
 * kept in each record's `data`.
 *
 * The attention rule reads every record of a project, and a project's records are mostly runs,
 * reports and messages whose text the rule never reads. Parsing all of it was most of what the rule
 * cost: about 150 ms of 300 on an office of the live shape (round 34 of wave 13n). SQLite keeps the
 * fields named above, and each keeps its value as stored: an object or a list stays one, true and
 * false stay true and false. The one exception is a report's `blocks`, kept as a list of the same
 * length, which is all the rule reads of it. A `data` that is not an object is kept whole.
 *
 * THE PROJECT'S MESSAGES ARE FOUND ONE WAY INTO ITS VIEW AT A TIME (`filedInOrInTheViewOf`). Asked
 * as the view's rule, SQLite tested every message of the office: 112 ms on a made-up office at the
 * scale of 22 October 2026, and 40 ms this way, each the median of 8 warm reads with the rows made into
 * records, for the same records in the same order (wave 13y round 65). Deleted records are read too,
 * as they were.
 */
export function listRecordsForTheAttentionRule(workspaceId: string): PanelRecord[] {
  return theAttentionRuleRecordsOf(filedInOrInTheViewOf(workspaceId), 'in the listed order')
}

/**
 * THE IDS OF THE RECORDS `listRecordsForTheAttentionRule` READS, in the same order, with no record read. The attention
 * thread reads these on every ask and the records only where they changed (src/server/lib/attention-kept-records.ts).
 */
export function idsForTheAttentionRule(workspaceId: string): string[] {
  const query = db.select({ id: records.id }).from(records).where(filedInOrInTheViewOf(workspaceId)).orderBy(...THE_LISTED_ORDER).toSQL()
  return sqlite.prepare(query.sql).pluck().all(...query.params) as string[]
}

/**
 * THE RECORDS THIS CONDITION NAMES, read and made as `listRecordsForTheAttentionRule` makes them, in the listed order or
 * in the order SQLite reads them. The whole read and the attention thread's read of the records that changed both read
 * through here, so a record is made the same way in both.
 */
export function theAttentionRuleRecordsOf(where: SQL, order: 'in the listed order' | 'in any order'): PanelRecord[] {
  // A REPORT'S `blocks` ARE KEPT AS A LIST OF THE SAME LENGTH, each block replaced by null, because the
  // rule reads only how many there are (`reportReading`), and the blocks hold a report's whole text.
  const kept = onlyTheseFieldsOf(THE_FIELDS_THE_ATTENTION_RULE_READS, ['blocks'])
  const columns = { ...getTableColumns(records), data: kept }
  const read = db.select(columns).from(records).where(where)
  const query = (order === 'in the listed order' ? read.orderBy(...THE_LISTED_ORDER) : read).toSQL()
  // THE ROWS COME STRAIGHT FROM SQLITE, each a list in the order of `columns`, and drizzle does not map
  // them. Every column of `records` is text that drizzle hands on unchanged, and `data` is cut to text
  // above, so its mapping changed no value. It cost about a fifth of the attention reading, in its
  // checks of each cell and the garbage they left (round 26 of wave 13w). The query is still drizzle's.
  // tests/attention-records-read-raw.test.ts checks this gives what drizzle's own read gives.
  const names = Object.keys(columns) as (keyof typeof columns)[]
  return (sqlite.prepare(query.sql).raw(true).all(...query.params) as (string | null)[][]).map((cells): PanelRecord => {
    const row: Record<string, unknown> = {}
    for (let i = 0; i < names.length; i++) row[names[i]!] = cells[i]
    row['data'] = JSON.parse(row['data'] as string) as Record<string, unknown>
    return toRecord(row as typeof records.$inferSelect)
  })
}

export { filedInOrInTheViewOf } from '../list-record-names-with-data-as.ts'

export { inTheViewOf } from '../list-record-names-with-data-as.ts'

/**
 * HOW MANY LIVE RECORDS ONE PROJECT HOLDS THAT ARE NOT MESSAGES, and the ids of the live messages in
 * its view: together, every record `listRecords({ workspaceId })` gives, without reading one whole.
 *
 * The messages are found as the attention rule finds them, with the kind asked so that SQLite does not
 * walk the kind's index instead. Asked as the view's rule, this read took 85 ms on a made-up office at
 * the scale of 22 October 2026, and 20 ms this way, each the median of 8 warm reads (wave 13y round 65).
 */
export function aProjectCounted(workspaceId: string): { notMessages: number; messageIds: string[] } {
  const notMessages = db
    .select({ n: sql<number>`count(*)` })
    .from(records)
    .where(and(eq(records.workspaceId, workspaceId), ne(records.kind, 'message'), isNull(records.deletedAt)))
    .get()
  const messageIds = db
    .select({ id: records.id })
    .from(records)
    .where(and(filedInOrInTheViewOf(workspaceId), theKindOfARowFoundById('message'), isNull(records.deletedAt)))
    .all()
    .map((row) => row.id)
  return { notMessages: notMessages?.n ?? 0, messageIds }
}

/** Count the live project and view records without returning IDs to a reader allowed every message. */
export function aProjectCountedWithoutMessageIds(workspaceId: string): number {
  return db.select({ n: sql<number>`count(*)` }).from(records)
    .where(and(filedInOrInTheViewOf(workspaceId), isNull(records.deletedAt))).get()?.n ?? 0
}
