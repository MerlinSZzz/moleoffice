// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * `changeOrigins` was moved byte for byte out of src/server/lib/records/change-log.ts, with no change of behaviour.
 * That file imports it back where it still uses it and re-exports it, so its export surface is unchanged.
 */

import { inArray } from 'drizzle-orm'
import { readOrigin, type RecordOrigin } from '@shared/types.ts'
import { db } from './client.ts'
import { records } from './schema.ts'

/**
 * A page of change rows as they are SERVED, with the provenance of the record each is about.
 *
 * ONE QUERY FOR THE ORIGINS, not one per row. The rows a page shows mention far fewer records than
 * there are rows — 200 rows over 56 records was the measurement on the live corpus — so this reads
 * the distinct ids once, the same shape `allGatedLinks` uses for the ends of its links.
 *
 * A row about a record that is no longer there gets null, which is the honest answer: there is
 * nothing left to ask. That is the same null as "nobody stamped it", and it is acceptable here in a
 * way it was not on a session row, because a change row always names a record — `recordId` is not
 * nullable — so there is no second meaning for a reader to confuse it with.
 */
export function changeOrigins(rows: readonly { recordId: string }[]): Map<string, RecordOrigin | null> {
  if (rows.length === 0) return new Map()
  const ids = [...new Set(rows.map((r) => r.recordId))]
  return new Map(
    db
      .select({ id: records.id, origin: records.origin })
      .from(records)
      .where(inArray(records.id, ids))
      .all()
      .map((r) => [r.id, readOrigin(r.origin)]),
  )
}
