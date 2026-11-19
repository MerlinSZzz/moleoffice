// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * `theStaleForkBases` was moved byte for byte out of src/server/lib/checks-in-merges-only.ts, with no change of behaviour.
 * `theStored` was moved byte for byte out of src/server/lib/checks-in-merges-only.ts, with no change of behaviour.
 * `A_FULL_COMMIT` was moved byte for byte out of src/server/lib/checks-in-merges-only.ts, with no change of behaviour.
 * That file imports it back where it still uses it and re-exports it, so its export surface is unchanged.
 */

import { PanelError } from './panel-error.ts'
import { sqlite } from '../db/client.ts'

/** The fork bases a seal is refused on: full commit ids. Empty when nobody listed any. */
export function theStaleForkBases(): string[] {
  const stored = theStored('stale_fork_bases')
  if (stored === null) return []
  let read: unknown
  try {
    read = typeof stored === 'string' ? JSON.parse(stored) : null
  } catch {
    read = null
  }
  if (!Array.isArray(read) || !read.every((one) => typeof one === 'string' && A_FULL_COMMIT.test(one))) {
    throw new PanelError(
      `The stale fork bases are stored as ${JSON.stringify(stored)} in installation.stale_fork_bases, and this office reads only ` +
        'nothing or a JSON list of full commit ids there. Nothing was guessed and nothing was changed.',
      500,
    )
  }
  return read as string[]
}
export function theStored(column: 'checks_in_merges_only' | 'stale_fork_bases'): unknown {
  const row = sqlite.prepare(`SELECT ${column} AS value FROM installation WHERE only_row = 1`).get() as { value: unknown } | undefined
  return row?.value ?? null
}
export const A_FULL_COMMIT = /^[0-9a-f]{40}$/u
