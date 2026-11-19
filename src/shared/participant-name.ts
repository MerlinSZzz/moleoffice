// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHAT A READER CALLS A PARTICIPANT.
 * `theNameOf` was moved byte for byte out of src/server/lib/superiors.ts, with no change of behaviour. That
 * file imports it back and re-exports it.
 */

/**
 * What a reader calls a participant: its registry name where one exists, its id otherwise.
 *
 * EXPORTED SO THE ROUTED LINE AND THE SHORT REASON NAME ONE ADDRESSEE THE SAME WAY. The line is
 * built here and the reason is built in shared/messages.ts from the names the routing loop collects
 * with this reader, so the two cannot drift. Criterion M113a.
 */
export function theNameOf(row: { name?: string; handle?: string } | null, fallback: string): string {
  if (row === null) return fallback
  if (typeof row.name === 'string' && row.name !== '') return row.name
  if (typeof row.handle === 'string' && row.handle !== '') return row.handle
  return fallback
}
