// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * `getRevisionRow` was moved byte for byte out of src/server/lib/revisions.ts, with no change of behaviour.
 * `noSuchRevision` was moved byte for byte out of src/server/lib/revisions.ts, with no change of behaviour.
 * That file imports it back where it still uses it and re-exports it, so its export surface is unchanged.
 */

import { and, eq } from 'drizzle-orm'
import { db } from '../db/client.ts'
import { revisions } from '../db/schema.ts'
import type { Row } from './revisions.ts'
import { PanelError } from './panel-error.ts'
import { numbering } from '../db/numbering.ts'

/** One revision, by its number, or a 404 naming how many there are. */
export function getRevisionRow(recordId: string, seq: number): Row {
  const row = db
    .select()
    .from(revisions)
    .where(and(eq(revisions.recordId, recordId), eq(revisions.seq, seq)))
    .get()
  if (row === undefined) throw noSuchRevision(recordId, seq)
  return row
}
/** The revision refusal, in the one place that words it, so two routes cannot say it differently. */
export function noSuchRevision(recordId: string, seq: number): PanelError {
  const { count, lowest, highest, gapless } = numbering(recordId)
  if (count === 0) {
    return new PanelError(
      `Record ${recordId} has no versions at all, so there is no version ${seq} to read. Either no record ` +
        `answers to that id, or this database has not been through the backfill that gives every existing ` +
        `record its first version. GET /api/records/${recordId}/revisions says which.`,
      404,
    )
  }
  if (gapless) {
    return new PanelError(
      `Record ${recordId} has no version ${seq}. It has ${count} — they are numbered 1 to ${count}, 1 being the ` +
        `oldest. GET /api/records/${recordId}/revisions lists them.`,
      404,
    )
  }
  // A LEDGER THAT IS NOT NUMBERED 1, 2, 3, WHICH IS SAID RATHER THAN SMOOTHED OVER. It can start
  // above 1, it can have holes, and it can do both, so naming only the range would send the reader
  // to numbers that 404. The numbers that DO answer are listed — capped, because a long ledger would
  // otherwise put hundreds of them in a refusal.
  const held = db
    .select({ seq: revisions.seq })
    .from(revisions)
    .where(eq(revisions.recordId, recordId))
    .orderBy(revisions.seq)
    .all()
    .map((row) => row.seq)
  const shown = held.slice(0, 20)
  return new PanelError(
    `Record ${recordId} has no version ${seq}. It has ${count}, numbered ${lowest} to ${highest}, and the ` +
      `numbers that answer are: ${shown.join(', ')}${held.length > shown.length ? ', …' : ''}. A history this ` +
      `server wrote runs 1, 2, 3 with nothing missing, so this record's history reached this database with part ` +
      `of it left out — a project-scoped archive of a record whose earlier versions are filed in another ` +
      `project is the usual cause. GET /api/records/${recordId}/revisions lists what is here.`,
    404,
  )
}
