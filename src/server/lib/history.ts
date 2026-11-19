// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHAT HAPPENED TO THIS RECORD, AND TO THE WORK IT CARRIES. ONE READ, ASSEMBLED FROM ROWS THAT
 * ALREADY EXIST.
 *
 * ---------------------------------------------------------------------------------------
 * IN ONE SENTENCE
 * ---------------------------------------------------------------------------------------
 *
 * History is the union of stored rows that already exist, gathered at read time, newest first, with
 * the subject set deciding the scope. Nothing here writes anything, and nothing here is stored.
 *
 * The brief's line 813 is why there is one function rather than three: *do not duplicate the same
 * event into several independent histories*. A module's history and a block's history are the same
 * rows read with a different subject set, so a change can never appear in one and be missing from
 * the other.
 *
 * ---------------------------------------------------------------------------------------
 * THE SUBJECT SET
 * ---------------------------------------------------------------------------------------
 *
 *   a block B      {B}
 *   a module M     {M} and every block M has ever carried
 *   a pipeline P   {P} — a pipeline's structural diff is a different question and
 *                  `compositionBetween` in shared/composition.ts already answers it
 *   anything else  {X} — its own rows and nothing else
 *
 * THE FOURTH ROW IS NOT A FALLBACK. 485 of the 611 live records in the owner's corpus are none of
 * the three kinds above (measured 21 August 2026). A read that refused them would be a History
 * control that is absent from four records in five, and the honest answer for a note or a problem
 * is its own rows, which is exactly what this gives.
 *
 * ---------------------------------------------------------------------------------------
 * WHY `carried(M)` READS TWO SOURCES
 * ---------------------------------------------------------------------------------------
 *
 * Neither source is a superset of the other, and the asymmetry runs both ways:
 *
 *   - The `links` table holds only what is true NOW. A link that was made and then unmade leaves no
 *     row at all.
 *   - The change log misses links nobody logged. The importer writes rows straight into `links` and
 *     never calls `logChange` — 21 `logChange` call sites and none in import.ts.
 *
 * So both are read. Measured on the corpus copy on 25 August 2026: 91 `implements` links, 0 of them
 * without a `link` change row, so today the two agree. Nothing enforces that they will.
 *
 * A LINK ROW SUPPLIES AN EVENT ONLY WHEN NO CHANGE ROW NAMES THAT LINK, so the two sources can
 * never both produce one and the dedupe below is not asked to repair an overlap that was avoidable.
 * The event then says `source.table = 'links'`, so a reader can see which source answered.
 *
 * WHAT IS GENUINELY ABSENT is an unmaking nobody logged: the link row is gone and no change row was
 * written, so nothing anywhere holds it. That is not invented and not reported as a date.
 *
 * ---------------------------------------------------------------------------------------
 * THE REASONS A ROW BELONGS, AND WHY THAT IS NOT ONE LIST FOR EACH
 * ---------------------------------------------------------------------------------------
 *
 *   E1  revisions whose record is a subject               what each subject held over time
 *   E2  change rows whose record is a subject             each subject's field changes, and the
 *                                                         links it filed on its OWN end
 *   E3  link/unlink change rows where a subject is the     links somebody else filed AT a subject
 *       OTHER end
 *   E4  pipeline revisions where the stored order gained   when one of these blocks appeared in a
 *       or lost a subject                                  pipeline, or left one
 *   E5  implementation map rows whose record is a subject  what was said about each subject's code
 *
 * AN EVENT IS ONE STORED ROW, AND A ROW APPEARS ONCE. The identity of an event is `source` — the
 * table it came from and its row id — and the first reason that matches wins, tried E1, E2, E3,
 * E4, E5.
 *
 * THIS HAS TO BE WRITTEN DOWN BECAUSE THE ORDINARY CASE MATCHES TWICE. `logChange` files one row
 * per link act, on the FROM end. For an `implements` link the from end is the module and the to end
 * is a block that module carries, so both ends are subjects of that module and E2 and E3 catch the
 * same row. Measured on the corpus copy: module `Cp5s3fdToSb3` has 10 `implements` links to blocks
 * and 10 matching `link` change rows — every one of the ten matched twice. Without the dedupe its
 * History repeats one *took in* line twice, ten times over.
 *
 * E4 COUNTS MEMBERSHIP CHANGES ONLY. A pipeline revision that merely happens to list one of these
 * blocks — a title edit, a different block moved — is not an event in this module's history, and
 * calling it *appeared in* would be a false statement about the row. The campaign pipeline lists 18
 * blocks, so without the comparison a module carrying one of them would inherit every revision of
 * it.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS FILE MUST NEVER DO
 * ---------------------------------------------------------------------------------------
 *
 * WRITE. Not a cache, not a materialised table, not a "history_events" row. Two tests hold that:
 * one below the route, where there is no request to log, and one through the route, which asserts
 * the exact set of tables whose count moved rather than excluding the ones it expects. An exclusion
 * list goes quiet the day something new appears; an assertion cannot.
 */

import { and, eq, getTableColumns, inArray, or, sql } from 'drizzle-orm'
import { db } from '../db/client.ts'
import { readInPieces } from '../db/in-pieces.ts'
import { MESSAGE_CENTRE } from '@shared/workspaces.ts'
import {
  changes,
  implementationMap,
  links as linksTable,
  records as recordsTable,
  revisions as revisionsTable,
} from '../db/schema.ts'

/** The kinds whose subject set is more than themselves, or whose rows mean something extra. */
const BLOCK_KIND = 'block'
const MODULE_KIND = 'module'
const PIPELINE_KIND = 'pipeline'

/** The link type that says a module carries a block. One place, so nobody types the word twice. */
const CARRIES_TYPE = 'implements'

/** Why a row is in this history. */
export type HistoryBecause = 'itself' | 'carries' | 'appearedIn'

/** One stored row, classified. Nothing here is text taken from the row; words are fetched later. */
export interface HistoryEvent {
  /** The stored local wall-clock stamp, exactly as the row holds it. */
  at: string
  /** The table the row is in and its id there. THIS IS THE EVENT'S IDENTITY. */
  source: { table: 'revisions' | 'changes' | 'links' | 'implementation_map'; id: string; seq?: number }
  /** The record the row is about. */
  subject: { id: string; kind: string; title: string }
  /** create, update, delete, restore, baseline, link, unlink — whatever the row stores. */
  op: string
  /** The field a change row names, or the link type for a link row. Null when the row has none. */
  field: string | null
  because: HistoryBecause
  who: { actorType: string; actorId: string; sessionId: string | null }
}

/** The scope of one history read: which records' rows count, and why each one is in. */
export interface HistorySubjects {
  /** The record the reader asked about. */
  askedAbout: { id: string; kind: string; title: string; workspaceId: string }
  /** Every record id whose own rows are in this history. */
  subjects: Set<string>
  /** For each subject, whether it is the record asked about or a block it carries. */
  because: Map<string, 'itself' | 'carries'>
}

interface RecordFacts {
  id: string
  kind: string
  title: string
  workspaceId: string
}

/**
 * One link/unlink row of the change log, with both ends rebuilt from the columns that hold them.
 *
 * `logChange` writes ONE row per link act, on the from end: `record_id` is the from end, `field` is
 * the link type, and the to end is in `new_value` for a link and `old_value` for an unlink. Nothing
 * else in the corpus reconstructs a link's two ends, so this shape is declared once and read twice
 * — here and by `src/server/api/composition.ts`, which used to hold its own copy of the walk.
 */
export interface LinkChangeRow {
  id: string
  at: string
  op: 'link' | 'unlink'
  /** The link type, as the change row's `field` column holds it. */
  type: string
  fromId: string
  toId: string
  actorType: string
  actorId: string
  sessionId: string | null
}

/** Where one row sits in its table: the hidden `rowid`, and a change row's `append_order`. */
interface StoredPlace {
  rowid: number
  appendOrder: number | null
}

/**
 * Every link and unlink row in one workspace, both ends rebuilt, earliest first: by `at`, then by
 * `append_order`, which is the order the change log was written in. SQL orders them, so the order is
 * the same on every read. A row with no `append_order` comes first in its second, because SQLite puts
 * NULL first, and such rows go by rowid. No program writes such a row: the trigger of migration 0194
 * numbers every insert that names none.
 *
 * EXTRACTED FROM `src/server/api/composition.ts`, which had the only copy of this walk. Two files
 * rebuilding a link's ends from `record_id` and `old_value`/`new_value` is the defect this
 * repository keeps producing: the two would have been free to disagree about which column holds the
 * other end of an unlink, and nothing would have failed.
 *
 * `touching`, WHEN IT IS GIVEN, keeps only the rows with an end at one of those records, and SQLite
 * keeps them, with the far end read from the same column as below. The records are bound once as a
 * JSON list, because nothing caps how many blocks a module has carried. On the made-up office
 * shaped to the live counts of 31 October 2026, a history read all 43,252 link rows of the largest
 * project to keep a few (wave 13y round 114). No index has `op`, so SQLite still goes through the
 * project's change rows, but it hands back only the few.
 */
export function linkEventsIn(workspaceId: string, touching?: ReadonlySet<string>): LinkChangeRow[] {
  return linkActsIn(workspaceId, touching).map((act) => act.row)
}

/** The rows of `linkEventsIn`, in its order, each with its place in the change log for `newestFirst`. */
function linkActsIn(workspaceId: string, touching?: ReadonlySet<string>): { row: LinkChangeRow; place: StoredPlace }[] {
  const theLinkActs = or(eq(changes.op, 'link'), eq(changes.op, 'unlink'))
  const ids = touching === undefined ? null : JSON.stringify([...touching])
  return db
    .select({ ...getTableColumns(changes), rowid: sql<number>`rowid` })
    .from(changes)
    .where(
      ids === null
        ? and(eq(changes.workspaceId, workspaceId), theLinkActs)
        : and(
            eq(changes.workspaceId, workspaceId),
            theLinkActs,
            sql`(${changes.recordId} IN (SELECT value FROM json_each(${ids})) OR (CASE WHEN ${changes.op} = 'unlink' THEN ${changes.oldValue} ELSE ${changes.newValue} END) IN (SELECT value FROM json_each(${ids})))`,
          ),
    )
    .orderBy(changes.at, changes.appendOrder, sql`rowid`)
    .all()
    .map((row) => ({
      row: {
        id: row.id,
        at: row.at,
        op: row.op === 'unlink' ? ('unlink' as const) : ('link' as const),
        type: row.field ?? '',
        fromId: row.recordId,
        toId: (row.op === 'unlink' ? row.oldValue : row.newValue) ?? '',
        actorType: row.actorType,
        actorId: row.actorId,
        sessionId: row.sessionId,
      },
      place: { rowid: row.rowid, appendOrder: row.appendOrder },
    }))
    .filter((act) => act.row.toId !== '')
}

/**
 * Which end of a link row a subject set is standing at, or null when it is at neither.
 *
 * Declared rather than written inline at each use, because "is the subject the from end or the to
 * end" is asked three times in this file and getting it backwards for an `unlink` is exactly the
 * mistake `linkEventsIn` above exists to make impossible.
 */
export function atThisEnd(row: LinkChangeRow, subjects: ReadonlySet<string>): 'from' | 'to' | null {
  if (subjects.has(row.fromId)) return 'from'
  if (subjects.has(row.toId)) return 'to'
  return null
}

function recordFacts(id: string): RecordFacts | null {
  const row = db.select().from(recordsTable).where(eq(recordsTable.id, id)).get()
  if (row === undefined) return null
  return { id: row.id, kind: row.kind, title: row.title, workspaceId: row.workspaceId }
}

/**
 * Every block this module has ever carried, from the change log and from the links table.
 *
 * The kind of the other end is checked against the records table, so a module that `implements` an
 * idea — the corpus holds one task→idea `implements` link — never drags a non-block into a module's
 * subject set.
 */
function carriedBy(moduleId: string, workspaceId: string): Set<string> {
  const carried = new Set<string>()
  const candidates = new Set<string>()
  // ONLY THE ROWS WITH AN END AT THIS MODULE, from both sources. A candidate is the far end of a link
  // at the module, so no other row can add one.
  for (const row of linkEventsIn(workspaceId, new Set([moduleId]))) {
    if (row.type !== CARRIES_TYPE) continue
    if (row.fromId === moduleId) candidates.add(row.toId)
    else if (row.toId === moduleId) candidates.add(row.fromId)
  }
  for (const row of db
    .select()
    .from(linksTable)
    .where(and(eq(linksTable.workspaceId, workspaceId), or(eq(linksTable.fromId, moduleId), eq(linksTable.toId, moduleId))))
    .all()) {
    if (row.type !== CARRIES_TYPE) continue
    if (row.fromId === moduleId) candidates.add(row.toId)
    else if (row.toId === moduleId) candidates.add(row.fromId)
  }
  if (candidates.size === 0) return carried
  // IN PIECES (src/server/db/in-pieces.ts): every record ever linked to this module by `implements` is a
  // candidate, and nothing caps that.
  const rows = readInPieces(candidates, (piece) =>
    db.select({ id: recordsTable.id, kind: recordsTable.kind }).from(recordsTable).where(inArray(recordsTable.id, piece)).all(),
  )
  for (const row of rows) if (row.kind === BLOCK_KIND) carried.add(row.id)
  return carried
}

/**
 * The scope of a history read: the record asked about, and every record whose rows count.
 *
 * Returns null when no record in this workspace has that id. The caller decides what a missing
 * record means — a route answers 404 and says so.
 */
export function historySubjects(id: string, workspaceId: string): HistorySubjects | null {
  const asked = recordFacts(id)
  // A MESSAGE BELONGS TO NO PROJECT: its history is read from any. Its rows are read by id below.
  if (asked === null || (asked.workspaceId !== workspaceId && asked.workspaceId !== MESSAGE_CENTRE)) return null
  const subjects = new Set<string>([asked.id])
  const because = new Map<string, 'itself' | 'carries'>([[asked.id, 'itself']])
  if (asked.kind === MODULE_KIND) {
    for (const blockId of carriedBy(asked.id, workspaceId)) {
      if (subjects.has(blockId)) continue
      subjects.add(blockId)
      because.set(blockId, 'carries')
    }
  }
  return { askedAbout: asked, subjects, because }
}

/**
 * The three facts that say "this same link", for comparing a stored link row against a change row.
 *
 * A change row does not carry a link id — `logChange` writes the from end, the type and the to end
 * and nothing else — so this is the only join there is between the two tables. The separator is a
 * space and not a NUL byte: a NUL in a source file makes `grep` match nothing in that whole file,
 * which a test deleted on 13 November 2026 refused for exactly that reason.
 */
function linkKey(row: { fromId: string; type: string; toId: string }): string {
  return `${row.fromId} ${row.type} ${row.toId}`
}

/** The stored `blockIds` of one revision's data, as a set. Anything unusable is left out. */
function orderIn(data: unknown): Set<string> {
  const held = new Set<string>()
  if (typeof data !== 'object' || data === null || Array.isArray(data)) return held
  const raw = (data as Record<string, unknown>)['blockIds']
  if (!Array.isArray(raw)) return held
  for (const entry of raw) if (typeof entry === 'string' && entry.trim() !== '') held.add(entry.trim())
  return held
}

/**
 * THE ORDER OF ONE SECOND, in the words the history door's note gives it in
 * `src/server/api/composition.ts`. They are written here, beside the order they describe.
 */
export const THE_ORDER_IN_ONE_SECOND =
  'Within one table, the rows of one second are listed in the order the database stored them. ' +
  'Change rows go by `append_order`, the higher above. ' +
  'Revisions of one record go by `seq`, the higher above. ' +
  'Revisions of two records go by their rowid, the higher above, which is the order this database holds them in; ' +
  'an import, or a copy of the office, may have changed that order. ' +
  'Where the rowid and `seq` disagree, each record keeps the places its revisions hold, and its revisions fill them by `seq`. ' +
  'Rows of two tables have no stored order between them, so they follow a fixed choice and not a stored fact: ' +
  'a revision above a change row, a change row above a row of the links table, and that above a row of the implementation map.'

/**
 * THE TABLES OF ONE SECOND, TOP TO BOTTOM. THIS IS A CHOICE AND NOT A STORED FACT. A stamp holds
 * the second only, and no column orders a row of one table against a row of another. The choice is
 * fixed, so every read gives the same order. Where the ordinary writes make an order, it follows
 * them: an edit files its change row and then its revision, and a link or a row of the
 * implementation map is written before the change row that logs it.
 *
 * EVERY TABLE HAS A PLACE. `newestFirst` lists only the tables named here, so a table with no place
 * would drop its events out of every history with nothing failing. The places are a record over
 * every table an event can come from, so the type checker refuses a table that has none.
 */
const PLACE_IN_ONE_SECOND: Record<HistoryEvent['source']['table'], number> = {
  revisions: 1,
  changes: 2,
  links: 3,
  implementation_map: 4,
}
const TABLES_IN_ONE_SECOND = (Object.keys(PLACE_IN_ONE_SECOND) as HistoryEvent['source']['table'][]).sort(
  (a, b) => PLACE_IN_ONE_SECOND[a] - PLACE_IN_ONE_SECOND[b],
)

/**
 * WHICH ROWS THE READ TAKES FROM EACH TABLE, in the words the history door gives in `read.sources`.
 * Each entry names the table as `source.table` names it, and says what `historyEvents` below takes
 * from it: E1 and E4 from `revisions`, E2 and E3 from `changes`, the membership nobody logged from
 * `links`, and E5 from `implementation_map`.
 *
 * EVERY TABLE HAS WORDS. The words are a record over every table an event can come from, as the
 * places are, so the type checker refuses a table that has none. They are not joined to the places:
 * an order and a description can each change without the other.
 */
const WHAT_IS_READ_FROM_EACH_TABLE: Record<HistoryEvent['source']['table'], string> = {
  revisions:
    'From `revisions`: every revision of a subject, and every pipeline revision of this project whose list of ' +
    'blocks gained or lost a subject.',
  changes:
    'From `changes`: every change row of a subject, and every link or unlink row of this project filed at a ' +
    'subject from the other end.',
  links:
    'From `links`: every link of this project with an end at a subject that no link or unlink row of this ' +
    'project names. Its event is dated from the link row itself.',
  implementation_map:
    'From `implementation_map`: every row whose record is a subject, except a row whose `deleted_at` is set.',
}

/**
 * WHAT A HISTORY READS, the sentence the history door answers in `read.sources`
 * (`src/server/api/composition.ts`). It is composed from the words of each table, in the order of
 * one second. The sentences before and after them are about no single table.
 */
export const WHAT_A_HISTORY_READS = [
  'Stored rows, gathered at read time. Each event names the table it came from in `source.table`.',
  ...TABLES_IN_ONE_SECOND.map((table) => WHAT_IS_READ_FROM_EACH_TABLE[table]),
  'An unmaking nobody logged is held nowhere and is not invented.',
  'Writes nothing.',
].join(' ')

/**
 * NEWEST FIRST BY `at`, AND WITHIN ONE SECOND IN THE ORDER THE DATABASE STORED THE ROWS IN.
 *
 * A stamp holds the second only, and an agent writes several rows in one. This order used to fall
 * back to the row ids there, and an id is a random string. Each table of a second is now ordered by
 * what it stores, and the tables follow `TABLES_IN_ONE_SECOND`:
 *
 *   change rows                `append_order`, the higher above. The trigger of migration 0194
 *                              writes it at every insert, and the import carries it.
 *   revisions of one record    `seq`, the higher above.
 *   revisions of two records   rowid, the higher above. Nothing else orders them. An import writes
 *                              revisions in the order of their ids, and a copy of the office may
 *                              renumber rowids, so this is the order this database holds them in.
 *   links, implementation map  rowid, the higher above.
 *
 * A CHANGE ROW WITH NO `append_order` goes below the change rows of its second that have one, and
 * such rows go by rowid among themselves, the higher above. That is a fixed choice. No program
 * writes such a row: the trigger numbers every insert that names none, and the data step in
 * `src/server/db/append-order-migration.ts` numbered the rows from before the column existed.
 *
 * ONE ORDER, WITH NO CYCLE. Rowid and `seq` can disagree after an import. A sort that compared pairs,
 * by `seq` for one record and by rowid for two, could then go round in a circle, and its answer
 * would depend on the order the rows came in. So the revisions of a second are put in rowid order
 * first, and then each record's revisions are put back into the places that record holds, by `seq`.
 */
function newestFirst(events: HistoryEvent[], placeOf: (event: HistoryEvent) => StoredPlace): HistoryEvent[] {
  const bySecond = new Map<string, HistoryEvent[]>()
  for (const event of events) {
    const second = bySecond.get(event.at)
    if (second === undefined) bySecond.set(event.at, [event])
    else second.push(event)
  }
  const listed: HistoryEvent[] = []
  for (const at of [...bySecond.keys()].sort().reverse()) {
    const second = bySecond.get(at)!
    for (const table of TABLES_IN_ONE_SECOND) {
      const rows = second.filter((event) => event.source.table === table).sort((a, b) => placeOf(b).rowid - placeOf(a).rowid)
      const ordered = table === 'changes' ? rows.sort(byAppendOrder(placeOf)) : table === 'revisions' ? eachRecordBySeq(rows) : rows
      for (const event of ordered) listed.push(event)
    }
  }
  return listed
}

/** `append_order`, the higher above, and a row with none below every row that has one. The sort is stable, so rows with none keep their rowid order. */
function byAppendOrder(placeOf: (event: HistoryEvent) => StoredPlace): (a: HistoryEvent, b: HistoryEvent) => number {
  return (a, b) => {
    const above = placeOf(a).appendOrder
    const below = placeOf(b).appendOrder
    if (above === null || below === null) return above === below ? 0 : above === null ? 1 : -1
    return below - above
  }
}

/** Revisions already in rowid order, with each record's revisions put back into that record's places by `seq`, the higher above. */
function eachRecordBySeq(rows: HistoryEvent[]): HistoryEvent[] {
  const ofRecord = new Map<string, HistoryEvent[]>()
  for (const row of rows) {
    const held = ofRecord.get(row.subject.id)
    if (held === undefined) ofRecord.set(row.subject.id, [row])
    else held.push(row)
  }
  // Every revision event carries its `seq`.
  for (const held of ofRecord.values()) held.sort((a, b) => b.source.seq! - a.source.seq!)
  const filled = new Map<string, number>()
  return rows.map((row) => {
    const next = filled.get(row.subject.id) ?? 0
    filled.set(row.subject.id, next + 1)
    return ofRecord.get(row.subject.id)![next]!
  })
}

/**
 * Every event in one history, newest first, and within one second in the order `newestFirst` gives.
 *
 * READS ONLY. It reads the subjects' titles, their revisions, their change rows, the link change
 * rows with an end at a subject, one pass over this project's pipeline revisions, the links with an
 * end at a subject, and the rows of the implementation map whose record is a subject. Each is one
 * query, except that a read by the subjects' ids goes in pieces, one query a piece
 * (src/server/db/in-pieces.ts). Measured on the corpus copy: 775 revisions and 2,085 change rows in
 * total, of which 744 are link or unlink rows. This is a small read today;
 * `design/round-ten/design/ontology.md` §11.6 names what would falsify that.
 *
 * THE PASS OVER PIPELINE REVISIONS SEARCHES `revisions_kind_workspace_seq_idx` by the kind and the
 * project (migration 0326, wave 13y round 144). Before that index, no index held a revision's
 * `kind`, so the pass went through every revision of the project: on the made-up office of 4
 * November 2026, 385,431 revisions to find 335, in 8.9 s with the database's pages not in memory
 * and 259 ms with them. It cannot be read through the records' kind instead: a pipeline with no
 * steps may become another kind, and its revisions stay pipeline revisions.
 */
export function historyEvents(scope: HistorySubjects, workspaceId: string): HistoryEvent[] {
  const subjectIds = [...scope.subjects]
  const titles = new Map<string, { kind: string; title: string }>()
  // IN PIECES (src/server/db/in-pieces.ts): a module's subjects are itself and every block it has carried,
  // and nothing caps those. The rows go into a map by id, so their order is not used.
  for (const row of readInPieces(subjectIds, (piece) =>
    db
      .select({ id: recordsTable.id, kind: recordsTable.kind, title: recordsTable.title })
      .from(recordsTable)
      .where(inArray(recordsTable.id, piece))
      .all(),
  )) {
    titles.set(row.id, { kind: row.kind, title: row.title })
  }
  const subjectOf = (id: string): HistoryEvent['subject'] => ({
    id,
    kind: titles.get(id)?.kind ?? 'unknown',
    title: titles.get(id)?.title ?? '',
  })

  const events: HistoryEvent[] = []
  // THE DEDUPE. One row, one event: the first reason that matches keeps it, and every later match
  // on the same `source.id` is dropped. E2 and E3 catch the same row for every link a module filed
  // on one of its own blocks, which is the ordinary case and not an edge case. Each kept row keeps its
  // place in its table, for `newestFirst`.
  const seen = new Map<string, StoredPlace>()
  const sourceOf = (event: HistoryEvent): string => `${event.source.table}:${event.source.id}`
  const keep = (event: HistoryEvent, place: StoredPlace): void => {
    const key = sourceOf(event)
    if (seen.has(key)) return
    seen.set(key, place)
    events.push(event)
  }

  // E1 — what each subject held over time.
  // IN PIECES (src/server/db/in-pieces.ts): the subjects grow with what a module carries. Each row names one
  // subject, so it is in one piece only, and `newestFirst` puts the events in order at the end.
  for (const row of readInPieces(subjectIds, (piece) =>
    db
      .select({ ...getTableColumns(revisionsTable), rowid: sql<number>`rowid` })
      .from(revisionsTable)
      .where(inArray(revisionsTable.recordId, piece))
      .all(),
  )) {
    keep(
      {
        at: row.at,
        source: { table: 'revisions', id: row.id, seq: row.seq },
        subject: subjectOf(row.recordId),
        op: row.op,
        field: null,
        because: scope.because.get(row.recordId) ?? 'itself',
        who: { actorType: row.actorType, actorId: row.actorId, sessionId: row.sessionId },
      },
      { rowid: row.rowid, appendOrder: null },
    )
  }

  // E2 — each subject's own change rows, links it filed on its own end included.
  // IN PIECES (src/server/db/in-pieces.ts): the subjects grow with what a module carries. Each row names one
  // subject, so it is in one piece only, and `newestFirst` puts the events in order at the end.
  for (const row of readInPieces(subjectIds, (piece) =>
    db
      .select({ ...getTableColumns(changes), rowid: sql<number>`rowid` })
      .from(changes)
      .where(inArray(changes.recordId, piece))
      .all(),
  )) {
    keep(
      {
        at: row.at,
        source: { table: 'changes', id: row.id },
        subject: subjectOf(row.recordId),
        op: row.op,
        field: row.field,
        because: scope.because.get(row.recordId) ?? 'itself',
        who: { actorType: row.actorType, actorId: row.actorId, sessionId: row.sessionId },
      },
      { rowid: row.rowid, appendOrder: row.appendOrder },
    )
  }

  // E3 — links somebody else filed AT a subject. Without this, an edge wired into a module's block
  // by a record outside the module never appears in that module's history at all.
  const linkActs = linkActsIn(workspaceId, scope.subjects)
  for (const { row, place } of linkActs) {
    const end = atThisEnd(row, scope.subjects)
    if (end === null) continue
    const subjectId = end === 'from' ? row.fromId : row.toId
    keep(
      {
        at: row.at,
        source: { table: 'changes', id: row.id },
        subject: subjectOf(subjectId),
        op: row.op,
        field: row.type,
        because: scope.because.get(subjectId) ?? 'itself',
        who: { actorType: row.actorType, actorId: row.actorId, sessionId: row.sessionId },
      },
      place,
    )
  }

  // E4 — a pipeline revision where the stored order GAINED OR LOST a subject.
  const orderChanges = db
    .select({ ...getTableColumns(revisionsTable), rowid: sql<number>`rowid` })
    .from(revisionsTable)
    .where(and(eq(revisionsTable.workspaceId, workspaceId), eq(revisionsTable.kind, PIPELINE_KIND)))
    .all()
    .sort((a, b) => (a.recordId === b.recordId ? a.seq - b.seq : a.recordId < b.recordId ? -1 : 1))
  let previous: { recordId: string; held: Set<string> } | null = null
  for (const row of orderChanges) {
    const held = orderIn(row.data)
    const before = previous !== null && previous.recordId === row.recordId ? previous.held : new Set<string>()
    previous = { recordId: row.recordId, held }
    let moved = false
    for (const id of scope.subjects) {
      if (held.has(id) !== before.has(id)) {
        moved = true
        break
      }
    }
    if (!moved) continue
    keep(
      {
        at: row.at,
        source: { table: 'revisions', id: row.id, seq: row.seq },
        subject: { id: row.recordId, kind: PIPELINE_KIND, title: row.title },
        op: row.op,
        field: 'blockIds',
        because: 'appearedIn',
        who: { actorType: row.actorType, actorId: row.actorId, sessionId: row.sessionId },
      },
      { rowid: row.rowid, appendOrder: null },
    )
  }

  // A MEMBERSHIP NOBODY LOGGED, dated from the link row's own stamp. The importer writes straight
  // into `links` and never calls `logChange`, so a link with no change row naming it is a real
  // state this corpus can reach. It supplies an event ONLY when no change row names it, so this and
  // E2/E3 can never both produce one.
  //
  // ONLY THE LINKS WITH AN END AT A SUBJECT, through the index on each end. A link at neither end is
  // never told. A change row naming a link at a subject has an end at that subject as well, so
  // `logged` holds every change row this can be asked about.
  const logged = new Set(linkActs.map((act) => linkKey(act.row)))
  const subjectList = JSON.stringify(subjectIds)
  for (const row of db
    .select({ ...getTableColumns(linksTable), rowid: sql<number>`rowid` })
    .from(linksTable)
    .where(
      and(
        eq(linksTable.workspaceId, workspaceId),
        sql`(${linksTable.fromId} IN (SELECT value FROM json_each(${subjectList})) OR ${linksTable.toId} IN (SELECT value FROM json_each(${subjectList})))`,
      ),
    )
    .all()) {
    const end = scope.subjects.has(row.fromId) ? 'from' : scope.subjects.has(row.toId) ? 'to' : null
    if (end === null) continue
    if (logged.has(linkKey(row))) continue
    const subjectId = end === 'from' ? row.fromId : row.toId
    keep(
      {
        at: row.createdAt,
        source: { table: 'links', id: row.id },
        subject: subjectOf(subjectId),
        op: 'link',
        field: row.type,
        because: scope.because.get(subjectId) ?? 'itself',
        who: { actorType: 'unknown', actorId: row.createdBy, sessionId: null },
      },
      { rowid: row.rowid, appendOrder: null },
    )
  }

  // E5 — WHAT WAS SAID ABOUT THIS RECORD'S CODE, and the reason it is here is a measured hole.
  //
  // MEASURED 26 AUGUST 2026 on a copy of the owner's corpus with `tools/measure-the-history.mjs`:
  // window B moved `data.claims` off FIFTEEN modules into 152 `implementation_map` rows, and wrote
  // NO change row and NO revision on any of the fifteen. Module `EPfgPfb_pmBJ` has one revision — a
  // baseline from 18 August — and change rows from July. So a person opening it and asking *what
  // happened to my module's claims?* got nothing at all: the key was gone from the record and the
  // record's own history did not say so.
  //
  // The rows themselves are real, dated and attributed, and each one carries a note saying what was
  // carried over verbatim and what was deliberately not guessed. Nothing is invented here — the
  // stamp, the author and the words all come off the stored row. What changes is that they are
  // findable from the page the person is looking at.
  //
  // EVERY ROW, not only the migration's. A rule that surfaced migration rows alone would be a
  // special case that goes stale the day somebody states a pattern by hand, and an agent's stated
  // pattern is exactly as much a dated statement about this record as the migration's is.
  //
  // IN PIECES (src/server/db/in-pieces.ts): the subjects grow with what a module carries. Each row names one
  // subject, so it is in one piece only, and `newestFirst` puts the events in order at the end.
  for (const row of readInPieces(subjectIds, (piece) =>
    db
      .select({ ...getTableColumns(implementationMap), rowid: sql<number>`rowid` })
      .from(implementationMap)
      .where(inArray(implementationMap.recordId, piece))
      .all(),
  )) {
    if (row.deletedAt !== null) continue
    keep(
      {
        at: row.statedAt,
        source: { table: 'implementation_map', id: row.id },
        subject: subjectOf(row.recordId),
        op: row.relation,
        field: row.pattern,
        because: scope.because.get(row.recordId) ?? 'itself',
        // THE STORED AUTHOR, whoever it is. `system:module-claims-migration` is a true answer to who
        // said it and a better one than a guessed person: the corpus does not record who wrote the
        // original string, and the row's own note says so.
        who: { actorType: row.provenance, actorId: row.statedBy, sessionId: null },
      },
      { rowid: row.rowid, appendOrder: null },
    )
  }

  return newestFirst(events, (event) => seen.get(sourceOf(event))!)
}
