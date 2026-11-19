// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * `numbering` was moved byte for byte out of src/server/lib/revisions.ts, with no change of behaviour.
 * That file imports it back where it still uses it and re-exports it, so its export surface is unchanged.
 */

import { eq, sql } from 'drizzle-orm'
import { db } from './client.ts'
import { revisions } from './schema.ts'

/**
 * WHAT NUMBERS THIS RECORD'S REVISIONS ACTUALLY CARRY, asked rather than worked out from the count.
 *
 * `saveRevision` takes max(seq) + 1 under a UNIQUE index, so a ledger this server wrote is 1, 2, 3
 * with nothing missing, and every sentence below used to be built from `count` on that basis. It is
 * a rule about how rows are WRITTEN, and it says nothing about which rows are HERE. A project-scoped
 * archive carries only the revisions filed in that project, so a record restored from one can have a
 * ledger that starts at 3 — and the refusal then said "it has 2, they are numbered 1 to 2", pointing
 * the reader at two numbers that answer nothing and hiding the two that answer.
 *
 * So the numbers are read. One query, and every sentence that mentions numbering is built from it.
 */
export function numbering(recordId: string): {
  count: number
  lowest: number
  highest: number
  /** Nothing missing BETWEEN the lowest and the highest. Says nothing about where it starts. */
  contiguous: boolean
  /** The oldest revision here is number 1, so nothing earlier is missing. */
  startsAtOne: boolean
  /** Both of the above: this is the record's whole history and it is addressable by number. */
  gapless: boolean
} {
  const row = db
    .select({
      n: sql<number>`count(*)`,
      lowest: sql<number | null>`min(${revisions.seq})`,
      highest: sql<number | null>`max(${revisions.seq})`,
    })
    .from(revisions)
    .where(eq(revisions.recordId, recordId))
    .get()
  const count = row?.n ?? 0
  const lowest = row?.lowest ?? 0
  const highest = row?.highest ?? 0
  // TWO FACTS, NOT ONE. `gapless` used to mean both "starts at 1" and "nothing missing inside", and
  // a ledger holding only revisions 3 and 4 — the shape a project-scoped archive produces — is the
  // second and not the first. It was therefore described as having a hole in it, which is a false
  // sentence about a run of numbers with nothing missing between them. They are separated here so
  // that each can be said on its own.
  const contiguous = count > 0 && highest - lowest + 1 === count
  return { count, lowest, highest, contiguous, startsAtOne: lowest === 1, gapless: contiguous && lowest === 1 }
}
