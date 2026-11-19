// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * `inTheListedOrder` was moved byte for byte out of src/server/lib/records/reading.ts, with no change of behaviour.
 * That file imports it back where it still uses it and re-exports it, so its export surface is unchanged.
 */

/** Rows put in `THE_LISTED_ORDER`, for rows read in pieces (src/server/db/in-pieces.ts), each of which sorts only its own rows. */
export function inTheListedOrder<Row extends { id: string; updatedAt: string }>(rows: Row[]): Row[] {
  return rows.sort((one, other) =>
    one.updatedAt < other.updatedAt ? 1 : one.updatedAt > other.updatedAt ? -1 : one.id < other.id ? -1 : one.id > other.id ? 1 : 0,
  )
}
