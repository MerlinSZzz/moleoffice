// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE `created_by` STAMP FOR A SET OF WINDOWS OR ALLOCATIONS, AND NOTHING ELSE.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS IS A FILE OF ITS OWN
 * ---------------------------------------------------------------------------------------
 *
 * `toWindow` in ./windows.ts and `toAllocation` in ./planning.ts turn a stored row into the shape
 * every reader in the product draws, and neither shape carries `created_by`: a window answers WHEN
 * and an allocation answers HOW MUCH, and the person's week already has an owner. Criterion P5
 * needs one more fact from the same rows — whose window or line it is, so the Schedule can draw an
 * agent's window in a second colour and the planning page can name whose a window or a dropped line
 * is. Both doors read exactly one column and return it; the MEANING of `${type}:${id}` lives in
 * `src/shared/windowowner.ts`, which is the one reader of it and is called by the surfaces. This
 * file returns the bytes, that file decides what they say.
 */

import { inArray } from 'drizzle-orm'
import { db } from '../db/client.ts'
import { readInPieces } from '../db/in-pieces.ts'
import { allocations, workWindows } from '../db/schema.ts'

/** The stamp on each of these windows, keyed by window id. An id with no row is absent. */
export function windowStamps(ids: readonly string[]): Map<string, string> {
  const wanted = [...new Set(ids.filter((id) => id !== ''))]
  const out = new Map<string, string>()
  if (wanted.length === 0) return out
  // IN PIECES (src/server/db/in-pieces.ts): the windows are every one in the span asked for, and
  // nothing caps how long a span is. The rows go into a map by id, so the order of the pieces does
  // not matter.
  const rows = readInPieces(wanted, (piece) =>
    db
      .select({ id: workWindows.id, createdBy: workWindows.createdBy })
      .from(workWindows)
      .where(inArray(workWindows.id, piece))
      .all(),
  )
  for (const row of rows) out.set(row.id, row.createdBy)
  return out
}

/** The stamp on each of these allocations, keyed by allocation id. An id with no row is absent. */
export function allocationStamps(ids: readonly string[]): Map<string, string> {
  const wanted = [...new Set(ids.filter((id) => id !== ''))]
  const out = new Map<string, string>()
  if (wanted.length === 0) return out
  // IN PIECES (src/server/db/in-pieces.ts): the allocations are every dropped one in the span asked
  // for, and nothing caps how long a span is. The rows go into a map by id, so the order of the
  // pieces does not matter.
  const rows = readInPieces(wanted, (piece) =>
    db
      .select({ id: allocations.id, createdBy: allocations.createdBy })
      .from(allocations)
      .where(inArray(allocations.id, piece))
      .all(),
  )
  for (const row of rows) out.set(row.id, row.createdBy)
  return out
}
