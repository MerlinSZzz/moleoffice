// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * `countChanges` was moved byte for byte out of src/server/lib/records.ts, with no change of behaviour.
 * That file imports it back where it still uses it and re-exports it, so its export surface is unchanged.
 */

import { sql, type SQL } from 'drizzle-orm'
import { db } from './client.ts'
import { changes } from './schema.ts'

/** How many rows the change log holds, all of them or the ones a condition selects. */
export function countChanges(where?: SQL): number {
  const row = db
    .select({ n: sql<number>`count(*)` })
    .from(changes)
    .where(where)
    .get()
  // A count query always returns a row. If it did not, reporting zero would be a lie that reads
  // as an empty log, which is the one answer this whole feature exists to stop being given wrongly.
  if (!row) throw new Error('the change count query returned nothing; the database is not usable')
  return Number(row.n)
}
