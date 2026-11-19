// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHAT ONE RECORD PAGE DRAWS BESIDE THE RECORD: the records and links around it, and the rows a record picker offers.
 * They were moved whole out of src/server/lib/records.ts, with no change of behaviour.
 *
 * NO CALLER CHANGED. records.ts hands on everything here with `export *`, and every caller still imports these names
 * from records.ts.
 *
 * THIS FILE AND records.ts IMPORT EACH OTHER: this one takes `allGatedLinks`, `pipelinesHolding` and `toRecord` from
 * it. That is safe for the same reason as records/reading.ts: every reference this file makes to records.ts is inside a
 * function body, so nothing of records.ts is read while it is still being evaluated. `WorkspaceLink` is a type, so its
 * import is erased.
 */
import { and, eq, inArray, isNull, sql } from 'drizzle-orm'
import { titleOptions, type TitleOption } from '@shared/blocks.ts'
import type { PanelRecord } from '@shared/types.ts'
import { db } from '../../db/client.ts'
import { readInPieces } from '../../db/in-pieces.ts'
import { changes, records } from '../../db/schema.ts'
import { isAChapterRow } from '../chapter-rows.ts'
import { onlyTheMessagesThisReaderMayRead, type AMessageReader } from '../messages.ts'
import { allGatedLinks, pipelinesHolding, type WorkspaceLink } from '../records.ts'
import { toRecord } from '../to-record.ts'
import { inTheListedOrder } from '@shared/in-the-listed-order.ts'
import { listRecordNamesWithDataAs } from '../list-record-names-with-data-as.ts'
import { onlyTheseFieldsOf } from '../../db/only-these-fields-of.ts'

// ---------------------------------------------------------------------------- what one record page draws

/**
 * WHAT A RECORD PAGE DRAWS BESIDE THE RECORD ITSELF: the other records and the links it reads.
 *
 * The page used to read every live record in the project (38 MB on the owner's office) and every
 * link, to draw one record. A page asks only for what it
 * draws. This provides that narrower answer for a record page.
 */
export interface RecordAround {
  /**
   * Every live record of this project the page reads, the record itself included when it is live.
   *
   * THE SAME ROWS AND THE SAME ORDER AS `GET /api/records`, only fewer: newest change first, deleted
   * records left out, each row as `toRecord` builds it. A page that looks a record up in this list
   * finds what it would have found in the whole listing, and a record that is not in it is one the
   * whole listing would not have had either, or one this page never looks up.
   */
  records: PanelRecord[]
  /** The links the page reads, as `GET /api/links` answers them and in its order. */
  links: WorkspaceLink[]
}

/** Every string anywhere inside a stored value, for the ids a record's data names. */
function stringsIn(value: unknown, into: Set<string>): void {
  if (typeof value === 'string') into.add(value)
  else if (Array.isArray(value)) for (const one of value) stringsIn(one, into)
  else if (typeof value === 'object' && value !== null) for (const one of Object.values(value)) stringsIn(one, into)
}

/**
 * THE RECORDS AND LINKS ONE RECORD PAGE READS, and nothing else.
 *
 * Each rule below is here because a part of the page looks records up, and it names that part.
 * A rule may bring in a record the page then does not use; it may never leave out one the page
 * would have found in the whole listing.
 *
 *   1. The links touching this record, and the record at the other end of each. The links panel
 *      draws each linked record's missing-field count, a decision finds the proposal it answers,
 *      a proposal finds the decision that settled it, and the containment reader follows `part_of`.
 *   2. Every record whose id is written anywhere in this record's data. An obligation owed on
 *      another record names it, and a field that holds record ids draws their titles.
 *   3. Every record a `link` or `unlink` row of this record's change log names. The change log
 *      draws their titles, and a record that is not there reads as deleted.
 *   4. Every live pipeline whose stored order lists this record. The containment reader asks it
 *      what this record is a step of.
 *   5. On a module: every live direction in the project, every link touching one, and the record at
 *      the other end of each. The module's evolution drawing walks directions and counts them all.
 *   6. On a role card: every record that says which chapter of the regulations it is. The card
 *      names each chapter it asks to be read by that record's title.
 */
export function recordsAround(record: PanelRecord): RecordAround {
  const workspaceId = record.workspaceId
  const wanted = new Set<string>([record.id])

  // Rule 5 first, because the directions decide which links rule 1 keeps.
  const directions =
    record.kind === 'module'
      ? db
          .select({ id: records.id })
          .from(records)
          .where(and(eq(records.workspaceId, workspaceId), eq(records.kind, 'direction'), isNull(records.deletedAt)))
          .all()
          .map((row) => row.id)
      : []
  const touching = new Set<string>([record.id, ...directions])
  for (const id of directions) wanted.add(id)

  // Rules 1 and 5: the links, read by the one reader `GET /api/links` answers from, so the rows and
  // their order are the same.
  const around = allGatedLinks(workspaceId).filter((link) => touching.has(link.fromId) || touching.has(link.toId))
  for (const link of around) {
    wanted.add(link.fromId)
    wanted.add(link.toId)
  }

  // Rule 2.
  stringsIn(record.data, wanted)

  // Rule 3. Every such row, not the newest 200 the change log shows by default, so no row the page
  // draws can name a record this answer left out.
  const logged = db
    .select({ oldValue: changes.oldValue, newValue: changes.newValue })
    .from(changes)
    .where(and(eq(changes.recordId, record.id), inArray(changes.op, ['link', 'unlink'])))
    .all()
  for (const row of logged) {
    if (row.oldValue !== null) wanted.add(row.oldValue)
    if (row.newValue !== null) wanted.add(row.newValue)
  }

  // Rule 4, by the one scan that says which pipelines list a block.
  for (const pipeline of pipelinesHolding(record.id)) wanted.add(pipeline.id)

  // Rule 6: the chapters of the regulations, as the one definition of a chapter says (isAChapterRow in
  // src/server/lib/chapter-rows.ts, read from A_CHAPTER), so a record of another kind that only carries
  // a number at extra.chapter is not one, and RoleCard.tsx finds the same chapters by chapterNumberOf.
  if (record.kind === 'role_card') {
    const chapters = db
      .select({ id: records.id })
      .from(records)
      .where(and(eq(records.workspaceId, workspaceId), isNull(records.deletedAt), isAChapterRow()))
      .all()
    for (const row of chapters) wanted.add(row.id)
  }

  // IN PIECES (src/server/db/in-pieces.ts): rule 5 alone reaches every link of every direction in the project, so the
  // list grows with the office; the joined rows are put in `listRecords`' order just below.
  const rows = readInPieces(wanted, (piece) =>
    db
      .select()
      .from(records)
      .where(and(inArray(records.id, piece), eq(records.workspaceId, workspaceId), isNull(records.deletedAt)))
      .all(),
  )
  // In the order `listRecords` gives the whole listing.
  return { records: inTheListedOrder(rows).map(toRecord), links: around }
}

/**
 * THE ROWS A RECORD PICKER OFFERS: every live record of this project, by title, with the note that
 * tells two records of one title apart.
 *
 * `titleOptions` in src/shared/blocks.ts builds them, over the same listing `GET /api/records`
 * answers, so the picker offers what it offered when the page read the whole listing itself.
 */
export function recordTitleOptions(workspaceId: string, reader: AMessageReader): TitleOption[] {
  // ONLY A PIPELINE'S `blockIds` IS READ OF ANY RECORD'S DATA, because `titleOptions` reads no other stored field. Read
  // through `listRecords`, every record of the project was parsed whole for its id, kind and title: 2.4 to 2.7 s, the
  // median of three reads in each of five runs, on the made-up office of 4 November with each kind's data at the live
  // average size, for an answer of 8 MB (wave 13y round 143).
  const aPipeline = eq(records.kind, 'pipeline')
  const pipelineOrders = sql<string>`(CASE WHEN ${aPipeline} THEN ${onlyTheseFieldsOf(['blockIds'])} ELSE '{}' END)`
  // A MESSAGE'S TITLE IS OFFERED ONLY TO A READER WHO MAY READ IT.
  return titleOptions(onlyTheMessagesThisReaderMayRead(reader, listRecordNamesWithDataAs({ workspaceId }, pipelineOrders)))
}
