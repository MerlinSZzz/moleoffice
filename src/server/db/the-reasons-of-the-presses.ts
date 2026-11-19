// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * `theReasonsOfThePresses` was moved byte for byte out of src/server/lib/records.ts, with no change of behaviour.
 * That file imports it back where it still uses it and re-exports it, so its export surface is unchanged.
 */

import { inArray } from 'drizzle-orm'
import { db } from './client.ts'
import { pressesForThePerson } from './schema.ts'

/** THE REASON EACH PRESS GAVE, by id, as its row holds it. A press with no row is not in the answer. */
export function theReasonsOfThePresses(ids: readonly string[]): Map<string, string | null> {
  if (ids.length === 0) return new Map()
  const rows = db
    .select({ id: pressesForThePerson.id, reason: pressesForThePerson.reason })
    .from(pressesForThePerson)
    .where(inArray(pressesForThePerson.id, [...ids]))
    .all()
  return new Map(rows.map((row) => [row.id, row.reason]))
}
