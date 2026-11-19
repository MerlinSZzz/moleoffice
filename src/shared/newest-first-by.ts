// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * `newestFirstBy` was moved byte for byte out of src/server/lib/records.ts, with no change of behaviour.
 * That file imports it back where it still uses it and re-exports it, so its export surface is unchanged.
 */

/**
 * ROWS READ IN PIECES, PUT BACK IN THE ORDER ONE STATEMENT'S `ORDER BY <that column> DESC` GAVE THEM. Each piece sorts
 * only its own rows (src/server/db/in-pieces.ts). The sort is stable, so rows of one stamp keep the order SQLite gave
 * them, and a list read in one piece comes back exactly as it was read.
 */
export function newestFirstBy<Row>(rows: Row[], stamp: (row: Row) => string): Row[] {
  return rows.sort((one, other) => (stamp(one) < stamp(other) ? 1 : stamp(one) > stamp(other) ? -1 : 0))
}
