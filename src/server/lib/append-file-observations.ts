// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * `appendFileObservations` was moved byte for byte out of src/server/lib/workdomain.ts, with no change of behaviour.
 * That file imports it back where it still uses it and re-exports it, so its export surface is unchanged.
 */

import { anOfficeId } from './ids.ts'
import { sqlite } from '../db/client.ts'
import type { ReindexReport } from '@shared/types.ts'

/**
 * WHAT ONE REBUILD SAW ABOUT EACH FILE, APPENDED TO A LEDGER NOTHING REBUILDS.
 *
 * ---------------------------------------------------------------------------------------
 * THE PROBLEM IT SOLVES, WHICH IS NOT OBVIOUS FROM THE TABLE
 * ---------------------------------------------------------------------------------------
 *
 * `source_files`, `source_index` and `source_file_hashes` are DERIVED: every row is replaced
 * wholesale on every rebuild. A rebuild computes the comparison against the index it is replacing —
 * added, removed, changed, with the content hash making *changed* exact — hands it to whoever asked,
 * and then that comparison is unrecoverable. A work domain accepted on Tuesday cannot ask on Friday
 * what changed, because four scans have run in between and each threw its predecessor away.
 *
 * So this appends what each scan saw. It is AUTHORED: nothing can rebuild a dated observation, the
 * same reason a measurement is authored, and it is exported and restored with the rest.
 *
 * ---------------------------------------------------------------------------------------
 * IT IS CALLED FROM INSIDE THE REBUILD'S OWN TRANSACTION, AND FROM EVERY REBUILD THERE IS
 * ---------------------------------------------------------------------------------------
 *
 * A hole in a ledger that answers *what changed since* is worse than no ledger, because a hole
 * reads as *nothing changed*. So the append happens in the same transaction that replaces the
 * index, in both functions that replace one — the repository rebuild the Implementation Map owns,
 * and the older whole-workspace rebuild that still serves `POST /api/source/reindex`. A scan run
 * through either door fills the ledger.
 *
 * ---------------------------------------------------------------------------------------
 * `repositoryId` IS AN ID OR NOTHING, AND NOTHING HAS ONE STATED MEANING
 * ---------------------------------------------------------------------------------------
 *
 * The map's rebuild knows which repository it scanned and passes the id. The older rebuild scans
 * one root for a whole workspace and cannot name one, so it passes null, and null means exactly
 * this: *this row was written by a process that scans one root and mints no repository id*. It is
 * not a stand-in for a repository and nothing reads it as one. A drift read reports such a row as
 * one whose repository could not be established rather than matching it into somebody's window as
 * though it had been.
 *
 * ---------------------------------------------------------------------------------------
 * A FIRST SCAN IS NOT EVIDENCE OF CHANGE, AND THAT IS WHY `first_scan` IS A COLUMN
 * ---------------------------------------------------------------------------------------
 *
 * With no previous index, a rebuild reports one `added` row for every file in the repository —
 * 1,155 of them on this checkout. That is a correct report of *what the index now holds* and a
 * FALSE report of *what changed*. And it recurs: this table is authored and is restored, while the
 * three index tables are derived and are not, so after any restore the next rebuild writes the
 * whole repository into this ledger as `added`. Without the column, every open domain's drift read
 * would then report the entire repository as outside its accepted domain and nothing would fail.
 *
 * The rows are still written, because they are true observations of a real scan. What the flag buys
 * is that the read can say *the index was rebuilt from nothing here, so Mole Office cannot say what
 * changed* — a could-not-say, not an empty result and not a wave.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IT STORES, AND THE TEST THAT KEEPS IT THAT WAY
 * ---------------------------------------------------------------------------------------
 *
 * Path, change, content hash, stamp. NO FILE CONTENT, NO DIFF, NO AUTHOR, NO PARENT, NO BRANCH AND
 * NO MESSAGE. You cannot reconstruct one line of any file from it, you cannot ask who changed
 * something, and you cannot ask what it looked like before. The owner's first named failure mode is
 * *build a second Git*, and `tests/file-observations.test.ts` reads the column list out of
 * `sqlite_master` and fails when an eleventh appears — a real check rather than a promise, because
 * the failure mode is somebody adding `author` in a follow-up commit because it would be convenient.
 */
export function appendFileObservations(opts: {
  workspaceId: string
  /** The repository this scan was of, or null when the scanning process cannot name one. */
  repositoryId: string | null
  /** The stamp of the scan that saw these, which is the index's own `built_at`. */
  seenAt: string
  report: ReindexReport
  /** The content hash of each file AFTER the scan. A `removed` path has none and stores none. */
  hashes: ReadonlyMap<string, string>
}): { scanId: string; rows: number } {
  const scanId = anOfficeId()
  const insert = sqlite.prepare(
    'INSERT INTO file_observations (id, workspace_id, scan_id, repository_id, path, change, hash, seen_at, since, ' +
      'first_scan) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
  )
  const firstScan = opts.report.firstScan ? 1 : 0
  let rows = 0
  const write = (path: string, change: 'added' | 'changed' | 'removed'): void => {
    insert.run(
      anOfficeId(),
      opts.workspaceId,
      scanId,
      opts.repositoryId,
      path,
      change,
      change === 'removed' ? null : (opts.hashes.get(path) ?? null),
      opts.seenAt,
      opts.report.previousBuiltAt,
      firstScan,
    )
    rows += 1
  }
  for (const path of opts.report.added) write(path, 'added')
  for (const change of opts.report.changed) write(change.path, 'changed')
  for (const path of opts.report.removed) write(path, 'removed')
  return { scanId, rows }
}
