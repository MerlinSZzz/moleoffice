// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE FAR ENDS OF LINKS: `theOtherEndsOf`, the ids at the other end of every link that touches one of these records.
 * It was moved whole out of src/server/lib/records.ts, with no change of behaviour.
 *
 * NO CALLER CHANGED. records.ts hands on everything here with `export *`, and every caller still imports this name from
 * records.ts.
 *
 * THIS FILE IMPORTS NOTHING FROM records.ts. It reads the links table directly, so there is no cycle between the two.
 */
import { inArray, or } from 'drizzle-orm'
import { db } from '../../db/client.ts'
import { readInPieces } from '../../db/in-pieces.ts'
import { links } from '../../db/schema.ts'

/**
 * THE IDS AT THE OTHER END OF EVERY LINK THAT TOUCHES ONE OF THESE RECORDS, less the records themselves, in no order.
 *
 * What `?farEnds=` on GET /api/records reads: a drawing of one family draws a chip for each record a link reaches,
 * and asking for the whole project to find those was 142 MB on the live office. A link whose far record is
 * deleted or gone still gives its id here; the reader of the records finds it missing, which is the true answer.
 */
export function theOtherEndsOf(ids: readonly string[]): string[] {
  if (ids.length === 0) return []
  const near = new Set(ids)
  // IN PIECES (src/server/db/in-pieces.ts): `ids` can be every record of a listing, which grows with the office. Each
  // statement names the same piece at both ends. A link whose two ends fall in two pieces comes back twice, which changes
  // nothing, because the far ids are kept in a set and tested against every near id, not against the piece.
  const rows = readInPieces(near, (piece) =>
    db
      .select({ fromId: links.fromId, toId: links.toId })
      .from(links)
      .where(or(inArray(links.fromId, piece), inArray(links.toId, piece)))
      .all(),
  )
  const far = new Set<string>()
  for (const row of rows) for (const id of [row.fromId, row.toId]) if (!near.has(id)) far.add(id)
  return [...far]
}
