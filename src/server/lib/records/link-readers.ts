// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE LINK READERS: `resolveLinks`, `linkOf`, `readCreatedByType`, `allLinks`, `WorkspaceLink` and
 * `allGatedLinks`. They were moved whole out of src/server/lib/records.ts, with no change of
 * behaviour; `linkOf` stays unexported.
 *
 * NO CALLER CHANGED. records.ts hands these names on with `export *`, and every caller still
 * imports them from records.ts.
 *
 * THIS FILE TAKES `ACROSS_WORKSPACES` FROM records/reading.ts, AND reading.ts IMPORTS records.ts,
 * so this file sits in a cycle through reading.ts. It is safe because `ACROSS_WORKSPACES` is read
 * only inside the body of `allLinks`, so nothing here is read while the module is still being
 * evaluated. This file imports nothing from records.ts.
 */
import { eq, inArray, or } from 'drizzle-orm'
import {
  ACTOR_TYPES,
  LINK_TYPES,
  readOrigin,
  type ActorType,
  type GatedLink,
  type Link,
  type LinkGate,
  type LinkType,
  type RecordKind,
} from '@shared/types.ts'
import { db, sqlite } from '../../db/client.ts'
import { readInPieces } from '../../db/in-pieces.ts'
import { links, records } from '../../db/schema.ts'
import { ACROSS_WORKSPACES } from '@shared/across-workspaces.ts'
import { readLinkGate } from './stored-link-gates.ts'

/**
 * Every link touching a record, in both directions, already labelled from this record's
 * point of view. A link to a deleted record comes back marked `broken` rather than omitted.
 *
 * THE GATE COMES BACK ON BOTH ENDS, from the one stored row. That is the whole point of it being
 * served here: the record that is BLOCKED is the one that needs to say what it is waiting for and
 * how much, and it is the end that does not store the link. On that end `isBacklink` is true, the
 * label reads "blocked by", and `gateLabel` says whether that means "must finish first" or "only
 * as far as <stage> until this finishes".
 */
export function resolveLinks(recordId: string): GatedLink[] {
  const rows = db
    .select()
    .from(links)
    .where(or(eq(links.fromId, recordId), eq(links.toId, recordId)))
    .all()
  if (rows.length === 0) return []

  const otherIds = rows.map((l) => (l.fromId === recordId ? l.toId : l.fromId))
  // IN PIECES (src/server/db/in-pieces.ts): `otherIds` is the far end of every link on this record, which grows with the
  // office; the rows go into a map by id, so the order of the pieces and the repeated ids do not matter.
  const others = new Map(
    readInPieces(otherIds, (piece) => db.select().from(records).where(inArray(records.id, piece)).all()).map((r) => [r.id, r]),
  )

  return rows
    .map((l): GatedLink | null => {
      const isBacklink = l.toId === recordId
      const other = others.get(isBacklink ? l.fromId : l.toId)
      if (!other) return null
      const def = LINK_TYPES[l.type as LinkType]
      return {
        linkId: l.id,
        type: l.type as LinkType,
        label: isBacklink ? def.reverse : def.forward,
        isBacklink,
        inferred: l.inferred,
        // THE LINK'S OWN WRITER AND MOMENT, from the row already read. `createdByType` is null on a
        // row written before that column existed, and null must reach the page as not recorded:
        // `readCreatedByType` is the one reader of the stored word, and it refuses an unknown one.
        createdAt: l.createdAt,
        createdBy: l.createdBy,
        createdByType: readCreatedByType(l.createdByType),
        // `origin` COMES OFF THE ROW HERE, and the type would not have caught its absence: it is
        // optional on `PanelRecord`, so a builder that forgets produces no error. That is exactly
        // how 290 fixture stamps were stored and served nowhere for a whole wave. The pin is
        // tests/provenance-derived.test.ts, which walks the served JSON rather than the types.
        other: {
          id: other.id,
          kind: other.kind as RecordKind,
          title: other.title,
          summary: other.summary,
          origin: readOrigin(other.origin),
        },
        broken: other.deletedAt !== null,
        ...readLinkGate(l),
      }
    })
    .filter((x): x is GatedLink => x !== null)
}

/** One stored link row as the shared `Link` shape. The one mapping; both readers below use it. */
function linkOf(row: typeof links.$inferSelect): Link {
  return {
    id: row.id,
    fromId: row.fromId,
    toId: row.toId,
    type: row.type as LinkType,
    inferred: row.inferred,
    createdAt: row.createdAt,
    createdBy: row.createdBy,
    createdByType: readCreatedByType(row.createdByType),
  }
}

/**
 * The stored `links.created_by_type`, or null when it was never recorded. A word outside ACTOR_TYPES
 * is read as not recorded too, because it does not say which of the three the maker was.
 */
export function readCreatedByType(stored: string | null): ActorType | null {
  return stored !== null && (ACTOR_TYPES as readonly string[]).includes(stored) ? (stored as ActorType) : null
}

/** The columns `linkOf` reads, in the order `allLinks` reads them. */
const THE_COLUMNS_A_LINK_IS_MADE_OF = {
  id: links.id, fromId: links.fromId, toId: links.toId, type: links.type, inferred: links.inferred,
  createdAt: links.createdAt, createdBy: links.createdBy, createdByType: links.createdByType,
}

/**
 * Every link in the workspace, as the shared `Link` shape.
 *
 * For the attention rule, which walks `blocks` and `consumes` over the whole graph rather than
 * around one record. It does not carry the gate: the rule asks WHETHER something blocks a promise,
 * and how hard is a question for the page that draws the edge.
 *
 * THE ROWS COME STRAIGHT FROM SQLITE, only the columns `linkOf` reads, each row a list in the order of
 * `THE_COLUMNS_A_LINK_IS_MADE_OF`, and drizzle does not map them. Drizzle's mapping of every column of
 * every row was more than half of this read: on a made-up office of 67,282 links it took 119 to 141 ms,
 * and this 47 to 54 ms, for the same links (wave 13y round 167). `inferred` is read as drizzle reads a
 * boolean column. tests/attention-records-read-raw.test.ts checks this gives what drizzle's own read gives.
 */
export function allLinks(workspaceId: string): Link[] {
  const where = workspaceId === ACROSS_WORKSPACES ? undefined : eq(links.workspaceId, workspaceId)
  const query = db.select(THE_COLUMNS_A_LINK_IS_MADE_OF).from(links).where(where).toSQL()
  return (sqlite.prepare(query.sql).raw(true).all(...query.params) as (string | number | null)[][]).map((cells) =>
    linkOf({
      id: cells[0], fromId: cells[1], toId: cells[2], type: cells[3], inferred: Number(cells[4]) === 1,
      createdAt: cells[5], createdBy: cells[6], createdByType: cells[7],
    } as typeof links.$inferSelect),
  )
}

/** A link as a drawing gets it in bulk: the stored row, the gate, and whether an end is gone. */
export type WorkspaceLink = Link &
  LinkGate & {
    /**
     * True when the record at EITHER end is not there to draw — deleted, or gone altogether.
     *
     * `resolveLinks` says the same thing from one record's point of view — "the record at the
     * OTHER end is deleted" — because there it is always asked about a record you are looking at.
     * Read from nowhere, as here, there is no near end to exclude, and the two readings agree
     * wherever the record doing the looking is itself live, which is every case a page draws.
     *
     * MISSING COUNTS AS BROKEN, and it is the same word for both because it is the same fact to a
     * reader: this line has one end. `resolveLinks` drops a link whose far record cannot be read
     * at all, so it never has to name that case; a bulk read has no near end to report it against
     * and dropping it would be the same silence one layer out.
     */
    broken: boolean
    /**
     * WHAT MOVES ALONG THIS LINK, as the JSON text stored in `links.carries`, or NULL when nobody
     * said. A feeds link may carry it; every other type leaves it NULL, which is not an empty list.
     */
    carries?: string | null
  }

/**
 * Every link in the workspace with its gate: one query for the links, and one for each 500 of their ends.
 *
 * WHY THIS EXISTS BESIDE `allLinks`. That one is the attention rule's, and deliberately carries no
 * gate. This one is the drawing's: a page that draws the structure needs the type, both ends, how
 * hard each dependency is, and whether an end has been deleted. Until this existed the only way to
 * read a link was `GET /api/records/:id`, so every page that wanted the graph asked for one record
 * at a time — 27 requests today, one per structural record, and a browser-side cliff at about
 * 1,356 of them. The field mapping is not written twice: both readers go through `linkOf`.
 *
 * A LINK WITH A DELETED END IS RETURNED, marked. Dropping it here would make a deleted record look
 * like a record that was never connected, and the difference between those two is the whole of
 * rule 5. What to draw for a broken link is the drawing's decision, made where the drawing is.
 */
export function allGatedLinks(workspaceId: string): WorkspaceLink[] {
  const rows = db.select().from(links).where(eq(links.workspaceId, workspaceId)).all()
  if (rows.length === 0) return []

  // The ends read by id together, not one query per link. `inArray` over the ids both columns mention: the
  // set is at most twice the number of links and usually far smaller.
  const endIds = [...new Set(rows.flatMap((row) => [row.fromId, row.toId]))]
  // IN PIECES (src/server/db/in-pieces.ts): `endIds` is every end of every link in the project, which grows with the
  // office; the answer is a set of ids, so the order of the pieces does not matter.
  const live = new Set(
    readInPieces(endIds, (piece) =>
      db.select({ id: records.id, deletedAt: records.deletedAt }).from(records).where(inArray(records.id, piece)).all(),
    )
      .filter((r) => r.deletedAt === null)
      .map((r) => r.id),
  )

  return rows.map((row) => ({
    ...linkOf(row),
    ...readLinkGate(row),
    broken: !live.has(row.fromId) || !live.has(row.toId),
    carries: row.carries,
  }))
}
