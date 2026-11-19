// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE REVISION WRITER EVERY WRITE CALLS: `saveRevision` re-reads the record and stores what it finds as its next
 * revision. It was moved out of src/server/lib/records.ts with no change of behaviour.
 *
 * NO CALLER CHANGED. records.ts hands it on with `export *`. This file does not import records.ts.
 */
import { and, eq, getTableColumns, sql } from 'drizzle-orm'
import { now } from '@shared/now.ts'
import type { ProvedHolder, RevisionOp } from '@shared/types.ts'
import { db, sqlite } from '../../db/client.ts'
import { revisionDataToStore, storesOnce } from '../../db/revision-stored-once.ts'
import { records, revisions } from '../../db/schema.ts'
import { anOfficeId } from '../ids.ts'
import { attributionFor, elevationWritten, provedByWritten, provedHolderWritten, signedItemWritten, warrantWritten } from '../log-change.ts'
import { PanelError } from '../panel-error.ts'
import { aRecordChanged } from '../record-changes.ts'
import { toRecord } from '../to-record.ts'
import { versionOf } from '../version.ts'
import type { Actor } from './actor.ts'

/**
 * KEEP WHAT THE RECORD NOW HOLDS. One row of `revisions`, written beside the change rows.
 *
 * ---------------------------------------------------------------------------------------
 * IT RE-READS THE RECORD AND STORES WHAT IT FINDS. THAT IS THE WHOLE DESIGN.
 * ---------------------------------------------------------------------------------------
 *
 * It takes no content. There is no parameter for the title, the data or anything else, and there
 * must never be one. A caller cannot pass content that disagrees with what was actually stored,
 * because it never passes any — so "the ledger says the record held X" and "the record held X"
 * cannot come apart. That is the same argument `logChange` makes for deriving a change row's
 * project rather than accepting one, applied to the whole content.
 *
 * The row is read back through `toRecord`, the one mapping every route answers through, and
 * `versionOf` is computed on THAT. Hashing the raw row would hash a different object from the one
 * a caller was handed — `toRecord` turns an absent `data` into `{}` — and the revision could then
 * never match the `version` the API served for the same moment.
 *
 * ---------------------------------------------------------------------------------------
 * CALL IT AFTER THE WRITE AND INSIDE THE SAME TRANSACTION
 * ---------------------------------------------------------------------------------------
 *
 * After, because it stores what the record NOW holds. Inside, because a write that throws must
 * leave no revision: a revision of content that was rolled back is a claim about a state the
 * database never had. Every one of the eight places that writes the `records` table does both, and
 * each of them either already had a transaction or was given one for this.
 *
 * ---------------------------------------------------------------------------------------
 * IF THE RECORD CANNOT BE RE-READ, IT THROWS
 * ---------------------------------------------------------------------------------------
 *
 * It does not write a revision with missing content and it does not skip one quietly. Both would be
 * invariant 4 of USER.md broken — a caught exception that carries on is a decision to hide
 * something — and both produce a ledger that is silently incomplete, which is worse than one that
 * failed loudly at the moment it went wrong. The only way to reach it is a write that did not take
 * effect, and that is exactly the thing nobody should find out about later.
 *
 * `seq` IS TAKEN INSIDE THE TRANSACTION, as `max(seq) + 1` for this record. The unique index on
 * (record_id, seq) is what makes two writers unable to agree on the same number: the second one
 * fails rather than producing two revision fours.
 *
 * IT ANSWERS WITH THE NUMBER IT WROTE, so a caller that reports "this write is revision N" reports
 * the number that went into the row rather than working it out again from the table.
 *
 * Exported because src/server/lib/records/run-writes.ts reads it too.
 */
export function saveRevision(
  recordId: string,
  op: RevisionOp,
  actor: Actor,
  note?: string,
  /**
   * WHICH EARLIER REVISION OF THIS RECORD THIS ONE TAKES BACK, when it is a revocation.
   *
   * Set only by `revokeAnActOnTheirWords`. Everything else leaves it out, which is what NULL means in
   * the column: this write took nothing back.
   */
  revokesSeq?: number,
  originalRunMintAt?: string,
  /** The starter's own key, given only to the create and the mint of a run a starter files by hand. See `provedHolderWritten`. */
  startersKey?: ProvedHolder,
): number {
  const row = db.select().from(records).where(eq(records.id, recordId)).get()
  if (row === undefined) {
    throw new PanelError(
      `The revision ledger was asked to keep what record ${recordId} holds, and no record answers to that id. ` +
        `A revision stores content, so there is nothing honest to write here: an empty one would claim the ` +
        `record held nothing, and skipping it would leave a write with no revision and nothing saying so. ` +
        `This is raised inside the same transaction as the write it belongs to, so that write has been rolled ` +
        `back and NOTHING has been stored.`,
      500,
    )
  }
  const record = toRecord(row)
  const filed = attributionFor(recordId, actor)
  const highest = db
    .select({ seq: sql<number | null>`max(${revisions.seq})` })
    .from(revisions)
    .where(eq(revisions.recordId, recordId))
    .get()
  const seq = (highest?.seq ?? 0) + 1
  // A caller can deliberately run with a migration folder ending before stored parts existed. In that schema a
  // revision must contain the whole data and its INSERT must not name the missing column. Ask each time: the same
  // connection can be upgraded later, including inside a transaction that may roll back.
  const hasParts = sqlite.prepare("SELECT 1 FROM pragma_table_info('revisions') WHERE name = 'parts'").get() !== undefined
  // A VALUE THE REVISION BEFORE HOLDS TOO IS STORED THERE ONCE (src/server/db/revision-stored-once.ts). Only a revision
  // filed in the same project is asked, so a project's revisions never name one filed in another. The hash below is
  // still of the whole record.
  const before =
    hasParts && storesOnce(record.kind) && highest?.seq != null
      ? db
          .select({ seq: revisions.seq, workspaceId: revisions.workspaceId, data: revisions.data, parts: revisions.parts })
          .from(revisions)
          .where(and(eq(revisions.recordId, recordId), eq(revisions.seq, highest.seq)))
          .get()
      : undefined
  const stored = revisionDataToStore(record.kind, record.data, before?.workspaceId === filed.workspaceId ? before : undefined)
  const values = {
    id: anOfficeId(),
    recordId,
    workspaceId: filed.workspaceId,
    seq,
    contentHash: versionOf(record),
    kind: record.kind,
    title: record.title,
    summary: record.summary,
    data: stored.data,
    parts: stored.parts,
    deletedAt: record.deletedAt,
    op,
    actorType: actor.type,
    actorId: actor.id,
    sessionId: filed.sessionId,
    at: originalRunMintAt ?? now(),
    note: note ?? null,
    // The same two lines the change log gets, from the same actor, in the same transaction.
    warrant: warrantWritten(actor),
    elevation: elevationWritten(actor),
    signed_item: signedItemWritten(actor),
    // AND THE SAME THIRD, for the reason the two above are the same two: a fact on one ledger and
    // not the other is the drift invariant 9 warns about, and these two are written together.
    provedHolder: provedHolderWritten(actor, startersKey),
    provedBy: provedByWritten(actor),
    revokesSeq: revokesSeq ?? null,
  }
  if (hasParts) {
    db.insert(revisions).values(values).run()
  } else {
    // Derive both the column names and driver conversions from the same schema as the normal insert. Only `parts`
    // is omitted: a different missing column is still an error rather than an excuse to discard history fields.
    const columns = Object.entries(getTableColumns(revisions)).filter(([key]) => key !== 'parts')
    const names = columns.map(([, column]) => `"${column.name.replaceAll('"', '""')}"`).join(', ')
    const params = columns.map(([key, column]) => {
      const value = values[key as keyof typeof values]
      return value === null || value === undefined ? null : column.mapToDriverValue(value as never)
    })
    sqlite.prepare(`INSERT INTO revisions (${names}) VALUES (${columns.map(() => '?').join(', ')})`).run(...params)
  }
  aRecordChanged(record, 'revision')
  return seq
}
