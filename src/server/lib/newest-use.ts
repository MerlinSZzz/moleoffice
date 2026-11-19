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
 * across a clock change it carries the same hour of doubt they do.
 */

import { sqlite } from '../db/client.ts'

const THE_NEWEST_USE = 'SELECT at FROM tool_uses WHERE run_id = ? ORDER BY seq DESC LIMIT 1'

/** The stamp of the newest use of a tool on each run that has one. A run with no use is not in the map. */
export function theNewestUsesOf(runs: Iterable<string>): Map<string, string> {
  const newest = sqlite.prepare(THE_NEWEST_USE)
  const out = new Map<string, string>()
  for (const run of runs) {
    if (out.has(run)) continue
    const row = newest.get(run) as { at: string } | undefined
    if (row !== undefined) out.set(run, row.at)
  }
  return out
}
