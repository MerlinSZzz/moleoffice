// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * `theRunsWritesCameFrom` was moved byte for byte out of src/server/lib/elevation.ts, with no change of behaviour.
 * That file imports it back where it still uses it and re-exports it, so its export surface is unchanged.
 */

import { sqlite } from './client.ts'
import { readInPieces } from './in-pieces.ts'
import { WHICH_RUN_A_SESSION_IS, A_LIVE_SESSION_RECORD, theRunTheRowSays } from './the-run-a-write-came-from.ts'
import type { SessionRunRow } from './types/elevation.ts'

/**
 * WHAT `theRunAWriteCameFrom` ANSWERS FOR EACH OF MANY SESSIONS, in one statement for every 500. A session that is not
 * a run the office started is absent from the map. The people view asks this for every waiting slot and every hold at
 * once, where it asked once per agent (wave 13y round 50). The decision is the one `theRunTheRowSays` makes for both.
 */
export function theRunsWritesCameFrom(sessions: Iterable<string>): Map<string, { run: string; servingAgent: string }> {
  const out = new Map<string, { run: string; servingAgent: string }>()
  const named = [...sessions].filter((session) => session !== '')
  const rows = readInPieces(named, (piece) =>
    sqlite
      .prepare(`${WHICH_RUN_A_SESSION_IS} WHERE id IN (${piece.map(() => '?').join(',')}) AND ${A_LIVE_SESSION_RECORD}`)
      .all(...piece) as SessionRunRow[],
  )
  for (const row of rows) {
    const run = theRunTheRowSays(row)
    if (run !== null) out.set(run.run, run)
  }
  return out
}
