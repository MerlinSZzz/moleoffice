// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * `theBasisOf` was moved byte for byte out of src/server/lib/flow-reasons.ts, with no change of behaviour.
 * That file imports it back where it still uses it and re-exports it, so its export surface is unchanged.
 */

import { inArray } from 'drizzle-orm'
import { idsIn } from '@shared/flow-steps.ts'
import { db } from './client.ts'
import { readInPieces } from './in-pieces.ts'
import { records } from './schema.ts'
import type { BasisEntry } from './types/flow-reasons.ts'

/** A decision's basis, in its stored order. No limit on how many. */
export function theBasisOf(stored: unknown, workspaceId: string): BasisEntry[] {
  const ids = idsIn(stored)
  if (ids.length === 0) return []
  // IN PIECES (src/server/db/in-pieces.ts): a stored basis has no limit on how many records it names, as
  // a decision says. The rows go into a map by id and the answer follows the
  // stored order, so the order of the pieces does not matter.
  const rows = new Map(
    readInPieces(ids, (piece) =>
      db
        .select({ id: records.id, kind: records.kind, title: records.title, workspaceId: records.workspaceId, deletedAt: records.deletedAt })
        .from(records)
        .where(inArray(records.id, piece))
        .all(),
    ).map((row) => [row.id, row]),
  )
  return ids.map((id) => {
    const row = rows.get(id)
    if (row === undefined || row.deletedAt !== null) return { id, kind: row?.kind ?? null, title: null, untitledBecause: 'not-there' }
    if (row.workspaceId !== workspaceId) return { id, kind: row.kind, title: null, untitledBecause: 'another-project' }
    return { id, kind: row.kind, title: row.title, untitledBecause: null }
  })
}
