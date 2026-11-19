// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHERE A READER GOT TO: ONE READER'S ANCHOR, MOVING IT, EVERY ANCHOR IN A PROJECT, AND WHAT HAS CHANGED SINCE ONE.
 * It was moved whole out of src/server/lib/records.ts, with no change of behaviour.
 *
 * NO CALLER CHANGED. records.ts hands on everything here with `export *`, and every caller still imports these names
 * from records.ts. `countChanges` is declared in src/server/db/count-changes.ts and `toSharedChange` in
 * src/shared/to-shared-change.ts; records.ts hands both on. `whoFiled` moved to records/change-log.ts.
 *
 * THIS FILE TAKES ONLY THE `Actor` TYPE FROM records.ts, so nothing of records.ts is read while this file is
 * evaluated. `countChanges` and `now` are imported from their own files, and records/change-log.ts does not import
 * this file.
 */
import { and, desc, eq, inArray, sql } from 'drizzle-orm'
import type { Change } from '@shared/types.ts'
import { db } from '../../db/client.ts'
import { readInPieces } from '../../db/in-pieces.ts'
import { changes, readerAnchors } from '../../db/schema.ts'
import { PanelError } from '../panel-error.ts'
import { type Actor } from '../records.ts'
import { countChanges } from '../../db/count-changes.ts'
import { toSharedChange } from '@shared/to-shared-change.ts'
import { now } from '@shared/now.ts'
import { aChangeNamingNoneOf } from '../../db/a-change-naming-none-of.ts'
import { changeOrigins } from '../../db/change-origins.ts'

// ============================================================ where a reader got to
//
// THE SECOND QUESTION THE PRODUCT EXISTS TO ANSWER is "what happened while I was away", and
// answering it needs one fact that is nowhere in `changes`: the moment this reader last looked.
// That moment used to live in one browser's localStorage, which meant the phone — the device the
// brief says is used to check on agents while away from the desk — could never answer it, because
// the phone is always the second browser and starts with an empty mark. Stored here it belongs to
// the PERSON, so the desk and the phone read the same bookmark and move it for each other.
//
// NOTHING HERE WRITES TO `changes`, DELIBERATELY. An anchor moves every time a page is opened, and
// `changes` IS the daily view — there are no stored daily pages, a day is a filter on that table.
// Logging the act of reading the day would bury the day. db/schema.ts says the same at more length.

// THE ANCHOR IS PER READER PER PROJECT, and until the boundary work it was per reader per
// INSTALLATION: a module constant `ANCHOR_WORKSPACE = 'default'` stood where every one of the
// `workspaceId` parameters below now is, so reading the Mole Office day marked the Greenhouse day read
// and the next Greenhouse reading answered "nothing since you last looked" about work nobody had seen.
// The table's own primary key has been (workspace_id, reader) since the first migration; only the
// constant stood in the way.

/**
 * Who is looking, written the way every other attributed column in this database writes an actor.
 *
 * One function rather than `${actor.type}:${actor.id}` at each call site, because this string is a
 * PRIMARY KEY here: two spellings of one person would be two anchors, and the reader would appear
 * to have read nothing on whichever of them lost.
 */
export function readerOf(actor: Actor): string {
  return `${actor.type}:${actor.id}`
}

export interface ReaderAnchor {
  reader: string
  /** The wall-clock moment they last looked, in the stored local form. */
  lastSeenAt: string
  /**
   * The newest change row they had seen, or null.
   *
   * NULL IS A REAL ANSWER AND IS NOT THE SAME AS HAVING NO ANCHOR AT ALL. Null means they looked
   * and there was nothing to see; no anchor means they have never looked. `getAnchor` returns null
   * for the second, and the two are never collapsed.
   */
  lastChangeId: string | null
}

export function getAnchor(reader: string, workspaceId: string): ReaderAnchor | null {
  const row = db
    .select()
    .from(readerAnchors)
    .where(and(eq(readerAnchors.workspaceId, workspaceId), eq(readerAnchors.reader, reader)))
    .get()
  if (!row) return null
  return { reader: row.reader, lastSeenAt: row.lastSeenAt, lastChangeId: row.lastChangeId }
}

/**
 * The last row APPENDED to the change log, or null when nothing has ever been written.
 *
 * By append order and not by stamp, because that is the high-water mark an anchor needs: a row
 * back-dated on the way in — scripts/seed.ts writes some — has an old stamp and is still the
 * newest thing anybody could have read. `readingSinceAnchor` compares the same way.
 *
 * The order is the `append_order` column, not SQLite's rowid. An archive carries the column and a
 * restore writes it back; a restore gives every row a new rowid.
 */
function newestChange(workspaceId: string): { id: string } | null {
  const row = db
    .select({ id: changes.id })
    .from(changes)
    .where(eq(changes.workspaceId, workspaceId))
    .orderBy(desc(changes.appendOrder))
    .get()
  return row ?? null
}

export interface AnchorMove {
  reader: string
  anchor: ReaderAnchor
  /** Where the anchor was before this call. Null when this reader had never looked. */
  previous: ReaderAnchor | null
  note: string
}

/**
 * Mark the point this reader has read to.
 *
 * `lastSeenAt` is always the server's clock, through `now()`, and never a value the caller sends:
 * an anchor an hour out is an anchor that hides an hour of agent work, silently, which is exactly
 * what the shared time rule exists to end. `lastChangeId` may be sent — a reader that has read as
 * far as a particular row can say so — and defaults to the newest row in the log at this moment.
 *
 * An id that names no change row is REFUSED here with a sentence. The column is a foreign key, so
 * the database would refuse it anyway, and its answer would be "the database rejected this write".
 */
export function moveAnchor(
  reader: string,
  workspaceId: string,
  opts: { lastChangeId?: string } = {},
): AnchorMove {
  const trimmed = (opts.lastChangeId ?? '').trim()
  const previous = getAnchor(reader, workspaceId)

  let lastChangeId: string | null
  if (trimmed !== '') {
    // The named row must be in THIS project's log. An anchor set on another project's change row
    // would be a bookmark in a book the reader is not holding: every later comparison is against a
    // place in another project's log, and the reading it produces is about neither project.
    const row = db
      .select({ id: changes.id, workspaceId: changes.workspaceId })
      .from(changes)
      .where(eq(changes.id, trimmed))
      .get()
    if (!row) {
      throw new PanelError(
        `There is no change row with the id "${trimmed}", so the anchor was not moved. Leave lastChangeId ` +
          `out and the newest row in the log is used, which is what a reader who has just read the page ` +
          `wants; GET /api/changes lists the rows with their ids.`,
        404,
      )
    }
    if (row.workspaceId !== workspaceId) {
      throw new PanelError(
        `The change row "${trimmed}" happened in the workspace ` +
          `${row.workspaceId === null ? 'nothing can name' : `"${row.workspaceId}"`}, and this anchor is for ` +
          `"${workspaceId}". Nothing was moved: an anchor marks how far a reader has got through ONE project's ` +
          `log, and one set on another project's row would answer about neither. GET /api/changes lists this ` +
          `workspace's rows with their ids.`,
      )
    }
    lastChangeId = row.id
  } else {
    lastChangeId = newestChange(workspaceId)?.id ?? null
  }

  const anchor: ReaderAnchor = { reader, lastSeenAt: now(), lastChangeId }
  db.insert(readerAnchors)
    .values({
      workspaceId,
      reader,
      lastSeenAt: anchor.lastSeenAt,
      lastChangeId: anchor.lastChangeId,
    })
    .onConflictDoUpdate({
      target: [readerAnchors.workspaceId, readerAnchors.reader],
      set: { lastSeenAt: anchor.lastSeenAt, lastChangeId: anchor.lastChangeId },
    })
    .run()

  // What the anchor now covers, said exactly. A caller that named a row may have named an OLD one
  // — "I have only read as far as here" is a real thing to say — and then everything appended
  // after that row is unread, whatever the clock says. Claiming the log is read would be a lie
  // this function cannot know it is telling unless it looks at which branch it took.
  const covers =
    trimmed === ''
      ? 'Everything in the log at this moment is now read.'
      : `It is set on the change row ${trimmed}, so anything appended after that row is still unread.`

  return {
    reader,
    anchor,
    previous,
    note:
      (previous === null
        ? `${reader} had no anchor, and now has one at ${anchor.lastSeenAt}. From here on "what has changed ` +
          `since I last looked" has an answer, on this device and on any other. `
        : `${reader}'s anchor moved from ${previous.lastSeenAt} to ${anchor.lastSeenAt}. `) + covers,
  }
}

/** How many change rows one reading hands back before it says how many more there are. */
export const ANCHOR_ROWS = 200

export interface AnchorReading {
  reader: string
  /** The stored anchor, or null when this reader has never looked. */
  anchor: ReaderAnchor | null
  /**
   * The rows written since the anchor, newest first.
   *
   * NULL, NOT AN EMPTY ARRAY, when there is no anchor. A reader who has never looked has no
   * "since" — and an empty list beside a cheerful 200 reads as "nothing happened", which is the
   * one answer that must never be given by mistake. `note` says which of the two it is in words.
   */
  changes: Change[] | null
  counts: {
    /** Rows written since the anchor. Null when there is no anchor to count from. */
    sinceAnchor: number | null
    returned: number
    /** Rows in the whole log, so an empty "since" can be told from an empty database. */
    everything: number
  }
  /** True when more rows are new than were returned. The count above is still the true one. */
  truncated: boolean
  /**
   * EVERY reading point in this project, not only the caller's own.
   *
   * ---------------------------------------------------------------------------------------
   * WHY AN ARRIVING AGENT NEEDS THIS AND COULD NOT GET IT
   * ---------------------------------------------------------------------------------------
   *
   * The anchor is keyed to the actor headers, so an agent asking this endpoint learns only about
   * ITSELF — and an agent has never looked, so it is always told nothing. Three cold agents tried
   * "what changed since I last looked" in two projects on 2026-08-11: 0 of 3 could answer it, and
   * all three fell back to hand-bucketing the change log, 422 and 529 rows, about seven minutes
   * each. One of them wrote: *"There is no way for an arriving agent to help without either lying
   * about who it is or leaving the feature unused."*
   *
   * That is still true of MOVING somebody else's anchor, and it stays true — an agent stamping the
   * human's reading point files one actor's reading as another's, in a log nothing rewrites. What
   * was missing is only the READ. An agent that can see whether the owner has a reading point, and
   * where it is, can answer the question on the owner's behalf with `GET /api/changes?since=` and
   * without claiming to be them.
   *
   * Ordered by reader so two requests give the same answer. Empty means nobody in this project has
   * ever marked one, which is what the whole corpus looked like until today.
   */
  readers: {
    reader: string
    lastSeenAt: string
    lastChangeId: string | null
    /**
     * THE STAMP OF THE ROW THE ANCHOR SITS ON — which is what a delta must be taken from, and is
     * NOT `lastSeenAt`.
     *
     * `lastSeenAt` is the moment the reader pressed the button; `lastChangeId` is the row they said
     * they had read to, and those come apart the moment somebody anchors on an older row, which the
     * route exists to allow. Measured by an agent asked to break this, hours after it shipped:
     * anchoring on a row from two days earlier stored `lastSeenAt` as the server clock, so the
     * arriving agent following the published recipe read `?since=<lastSeenAt>` and was told **0**
     * rows while the owner's own reading said **400** unread. Two places that must agree, with
     * nothing making them agree — and the sentence beside it was the thing making the reader wrong.
     *
     * Null when the anchor names no row: the reader looked when the log was empty, so everything in
     * it now is new and the delta starts from the beginning rather than from a time.
     */
    since: string | null
  }[]
  note: string
}

/** Every reading point recorded in one project. See `AnchorReading.readers`. */
export function anchorsIn(workspaceId: string): AnchorReading['readers'] {
  const rows = db
    .select()
    .from(readerAnchors)
    .where(eq(readerAnchors.workspaceId, workspaceId))
    .all()
  if (rows.length === 0) return []

  // The stamp of each anchored row, read together by id. This is the value a reader-neutral delta has to
  // start from — see `since` on the type for what happens when somebody uses `lastSeenAt` instead.
  const ids = rows.map((r) => r.lastChangeId).filter((id): id is string => id !== null)
  // IN PIECES (src/server/db/in-pieces.ts): a project keeps one reading point for each reader who ever marked one, which
  // grows with the office; the stamps go into a map by id, so the order of the pieces does not matter.
  const stamps = new Map(
    readInPieces(ids, (piece) =>
      db.select({ id: changes.id, at: changes.at }).from(changes).where(inArray(changes.id, piece)).all(),
    ).map((r) => [r.id, r.at]),
  )
  return rows
    .map((row) => ({
      reader: row.reader,
      lastSeenAt: row.lastSeenAt,
      lastChangeId: row.lastChangeId,
      since: row.lastChangeId === null ? null : (stamps.get(row.lastChangeId) ?? null),
    }))
    .sort((a, b) => a.reader.localeCompare(b.reader))
}

/**
 * What has changed since this reader last looked.
 *
 * THE COMPARISON, and why a stamp alone will not do it. Two changes can share a stamp — agents
 * write in bursts and the stamp is only to the second — so `at > lastSeenAt` drops every row
 * written in the same second the reader marked, and `at >= lastSeenAt` shows rows they had already
 * read. Neither is acceptable: one hides agent work and the other reports work as new every time
 * the page is opened.
 *
 * So the primary test is the ORDER THE ROWS WERE APPENDED IN, which the `append_order` column holds
 * and which is exact to the row rather than to the second. Every new row is numbered one past the
 * highest (migration 0194), so the numbers only ever grow, and the row the anchor names is a real
 * row because the column is a foreign key. It is the column and not SQLite's rowid because an
 * archive carries the column and a restore writes it back, while a restore gives every row a new
 * rowid.
 *
 * The stamp comparison is kept BESIDE it, as an or. A row whose stamp is later than the moment the
 * reader looked is new whatever order it landed in — which covers a row back-dated on insert, as
 * scripts/seed.ts does, and covers a rebuilt table if one ever renumbers. Two conditions that can
 * only ever ADD rows: between showing something twice and hiding it, this product shows it twice.
 */
export function readingSinceAnchor(
  reader: string,
  workspaceId: string,
  // `hidden`: the messages this reader may not read. No row naming one is counted
  // or listed, in any of the three reads below.
  opts: { limit?: number; hidden?: readonly string[] } = {},
): AnchorReading {
  const limit = opts.limit ?? ANCHOR_ROWS
  // THIS PROJECT'S LOG, on every one of the three reads below: the total, the count since the
  // anchor, and the rows themselves. All three used to read the whole table, so "nothing has been
  // written since you last looked" was a claim about an installation and was answered to somebody
  // asking about a project.
  const noneHidden = aChangeNamingNoneOf(opts.hidden)
  const mine = noneHidden === undefined ? eq(changes.workspaceId, workspaceId) : and(eq(changes.workspaceId, workspaceId), noneHidden)!
  const everything = countChanges(mine)
  const anchor = getAnchor(reader, workspaceId)
  const readers = anchorsIn(workspaceId)
  const others = readers.filter((r) => r.reader !== reader)

  if (anchor === null) {
    return {
      reader,
      anchor: null,
      changes: null,
      counts: { sinceAnchor: null, returned: 0, everything },
      truncated: false,
      readers,
      note:
        `No anchor is recorded for ${reader}, so Mole Office cannot say what has changed since you last looked — ` +
        `not "nothing has changed". The log holds ${everything} change row${everything === 1 ? '' : 's'} in ` +
        `total. PUT /api/anchor marks the point you have read to, and from then on this answers with the ` +
        `rows written after it, on this device and on any other, because the anchor belongs to you and not ` +
        `to a browser.` +
        // WHAT AN ARRIVING AGENT SHOULD DO INSTEAD OF NOTHING. Its own anchor is always absent and
        // always will be, so this sentence used to be the end of the road: three cold agents read
        // it and hand-bucketed hundreds of rows. Naming the reader who HAS looked, and the request
        // that answers from their reading point, is the whole difference — and it asks nobody to
        // claim to be somebody else.
        (others.length === 0
          ? ` Nobody in this project has ever marked one, so there is no reading point to answer from — ` +
            `not even somebody else's.`
          : ` ${others.length === 1 ? 'One other reader has' : `${others.length} other readers have`} marked ` +
            `one: ${others
              .map((r) => `${r.reader}, whose reading point is the row written at ${r.since ?? 'the very beginning of the log'}`)
              .join('; ')}. If you are answering on their behalf, read ` +
            `GET /api/changes?since=<the \`since\` on their row above> — it needs no anchor and claims to be ` +
            `nobody. USE \`since\` AND NOT \`lastSeenAt\`: lastSeenAt is when they pressed the button, and a ` +
            `reader who anchored on an older row has the two hours or days apart, so asking from lastSeenAt ` +
            `answers "nothing has happened" about four hundred rows they have not read. A stamp is coarser ` +
            `than a row and both ends of ?since= are inclusive, so that read may hand you the anchored row ` +
            `again and anything written in the same second: it can show a row twice and cannot hide one. ` +
            `DO NOT send their ` +
            `actor headers to move it: that files one reader's reading as another's, in a log nothing ` +
            `rewrites.`),
    }
  }

  const since =
    anchor.lastChangeId === null
      ? // They looked and the log was empty, so every row it holds now was written since. Not
        // `at >= lastSeenAt`, which would drop a row somebody back-dated on the way in.
        mine
      : and(
          mine,
          sql`(${changes.appendOrder} > (select append_order from changes where id = ${anchor.lastChangeId}) or ${changes.at} > ${anchor.lastSeenAt})`,
        )

  const sinceAnchor = countChanges(since)
  const rows = db
    .select()
    .from(changes)
    .where(since)
    .orderBy(desc(changes.at), desc(changes.id))
    .limit(limit)
    .all()
  // ONE QUERY FOR THE ORIGINS OF THE ROWS BEING SHOWN, bounded by `limit` — 200 by default and 8 on
  // Home — so it is a handful of ids, not the log.
  const shownOrigins = changeOrigins(rows)

  return {
    reader,
    anchor,
    changes: rows.map((row) => toSharedChange(row, shownOrigins.get(row.recordId) ?? null)),
    counts: { sinceAnchor, returned: rows.length, everything },
    truncated: sinceAnchor > rows.length,
    readers,
    note:
      sinceAnchor === 0
        ? `${reader} last looked at ${anchor.lastSeenAt}, and nothing has been written since. The log holds ` +
          `${everything} row${everything === 1 ? '' : 's'} in total.`
        : `${sinceAnchor} change row${sinceAnchor === 1 ? '' : 's'} ${sinceAnchor === 1 ? 'has' : 'have'} ` +
          `been written since ${reader} last looked at ${anchor.lastSeenAt}` +
          (sinceAnchor > rows.length
            ? `; the newest ${rows.length} are here, and the count is the whole of it. Ask again with a ` +
              `larger limit, or read them by day with GET /api/changes?since=.`
            : // "1 change row has been written … and all of them are here" is the plural slip this
              // project keeps finding in its own prose. One row is "it".
              sinceAnchor === 1
              ? `, and it is here.`
              : `, and all of them are here.`),
  }
}
