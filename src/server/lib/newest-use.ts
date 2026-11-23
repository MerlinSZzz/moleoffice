// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHEN A RUN LAST USED A TOOL, as one of the clocks of its last activity. Wave 13s round 33b, on the answer in
 * message IatdjoGLajNS: a use is activity, so a run that only uses tools must not read as idle or stuck.
 *
 * Since round 33 a use is one row of `tool_uses` and moves nothing on the run's record: not `updated_at`, not
 * `lastOutputAt`, and no change row. So every reader that measures a run's last activity asks here as well, and this is
 * the one place the newest use is worked out.
 *
 * THE NEWEST USE IS THE ONE WITH THE HIGHEST PLACE ON ITS RUN, read through `tool_uses_run_seq_idx`: one indexed lookup
 * per run, never a scan of the table. The use door gives each use the next place with the office's clock inside one
 * transaction, so the highest place is the latest use. Its `at` is a local stamp, as every other clock of a run is, so
 * across a clock change it carries the same hour of doubt they do. A use written since migration 0358 keeps the moment
 * of that stamp beside it (`at_instant`), from the same reading of the clock, and a reader that measures time from the
 * use reads the stamp with that moment by the rule of `momentOfAStampAndItsInstant` in src/shared/time.ts: the moment
 * only when it names the stamp beside it.
 */

import { sqlite } from '../db/client.ts'

const THE_NEWEST_USE = 'SELECT at, at_instant AS atInstant FROM tool_uses WHERE run_id = ? ORDER BY seq DESC LIMIT 1'

/** The newest use of a tool on a run: its stamp, and the moment of that stamp, empty on a use written before it was kept. */
export interface TheNewestUse {
  at: string
  atInstant: string | null
}

/** The newest use of a tool on each run that has one, with the moment of its stamp. A run with no use is not in the map. */
export function theNewestUsesWithTheirMomentsOf(runs: Iterable<string>): Map<string, TheNewestUse> {
  const newest = sqlite.prepare(THE_NEWEST_USE)
  const out = new Map<string, TheNewestUse>()
  for (const run of runs) {
    if (out.has(run)) continue
    const row = newest.get(run) as TheNewestUse | undefined
    if (row !== undefined) out.set(run, { at: row.at, atInstant: row.atInstant })
  }
  return out
}

/** The stamp of the newest use of a tool on each run that has one. A run with no use is not in the map. */
export function theNewestUsesOf(runs: Iterable<string>): Map<string, string> {
  const out = new Map<string, string>()
  for (const [run, use] of theNewestUsesWithTheirMomentsOf(runs)) out.set(run, use.at)
  return out
}
