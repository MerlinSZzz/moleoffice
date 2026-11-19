// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHAT A RECORD'S OWN CHANGE LOG SAYS WAS SPENT ON IT — criterion T2, by method C.
 *
 * ---------------------------------------------------------------------------------------
 * THE METHOD, AND WHY IT IS THIS ONE
 * ---------------------------------------------------------------------------------------
 *
 * The criterion's original wording summed the runs "through the links a run wrote (its report, its
 * problem, its branch)". Supervisor sd measured on 13 September 2026 that a run writes no links at
 * all: a session record carrying a usage receipt has an empty links array, and what a run records
 * about what it worked on is a data field (`servingAgent`, `deliveringMessage`, `ranAs`). So that
 * method does not exist.
 *
 * What does exist is that the change log names the run that made every change: the `changes` table
 * carries `session_id`, and `sessionsIn` resolves each stored value to a session record. The
 * secretary's decision of 13 September 2026 is binding: T2 by method C. A record sums the runs its
 * own change log names, the panel says which runs it counted and how many changes on the record
 * name no run, and nothing is written at the finish for it.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS READER ANSWERS
 * ---------------------------------------------------------------------------------------
 *
 *   · the runs the record's change log names, by id, and the one summation over their receipts;
 *   · how many of those runs carried no receipt, so a missing receipt is never drawn as zero;
 *   · how many changes on the record name no run at all, so a record whose changes all predate the
 *     session header says so instead of answering a confident zero.
 *
 * THE SUMMATION IS NOT HERE. `receiptsFromRuns` in ./usage-receipts.ts is the product's one place
 * where tokens and wall time are added, and this reader hands it the runs and nothing else. The
 * ninth invariant is why: a second sum would drift from the first the day either changed.
 */
import { sqlite } from '../db/client.ts'
import { SPENT_WORDS, type OneRunCounted, type SpentOnThis } from '../../shared/spent.ts'
import { countChangesMatching, listChanges } from './records.ts'
import { sessionsIn } from './sessions-in.ts'
import { receiptsFromRuns, type ReceiptRun } from './usage-receipts.ts'

/**
 * Every run this record's change log names, summed over their receipts.
 *
 * The read is uncapped on purpose. The change log the door serves is a page of at most the caller's
 * limit, and a total taken over a page is the size of a window published as a fact — the fault
 * `countChangesMatching` exists against. So this reads exactly as many rows as the record has, which
 * is one record's own history and not the project's.
 */
export function spentOnRecord(
  recordId: string,
  workspaceId: string,
  // THE MESSAGES THE READER MAY NOT READ. No change row naming one is counted, so
  // a record that is such a message is read as one with no change rows, as an id naming nothing is.
  hidden?: readonly string[],
): SpentOnThis {
  const changesOnRecord = countChangesMatching({ workspaceId, recordId, hidden })
  const rows = changesOnRecord === 0 ? [] : listChanges({ workspaceId, recordId, limit: changesOnRecord, hidden })
  // THE ONE RESOLVER for the change log's session column, used at lines 449 and 499 of
  // src/server/api/queries.ts. A stored value that is not a session record stays unresolved here,
  // and its rows are counted as naming no run rather than dropped.
  const named = sessionsIn(rows, workspaceId)
  const counted = named.filter((one) => one.recordId !== null)
  const changesNamingNoRun = changesOnRecord - counted.reduce((sum, one) => sum + one.rows, 0)

  // THE RUNS' OWN RECORDS, one query for all of them. A counted run's record is read here for the
  // receipt the summation needs and for whether that receipt exists at all.
  const ids = counted.map((one) => one.recordId as string)
  const held = new Map<string, string>()
  if (ids.length > 0) {
    const found = sqlite
      .prepare(`select id, data from records where id in (${ids.map(() => '?').join(', ')})`)
      .all(...ids) as { id: string; data: string }[]
    for (const row of found) held.set(row.id, row.data)
  }

  const forTotals: ReceiptRun[] = []
  const runs: OneRunCounted[] = []
  for (const one of counted) {
    const id = one.recordId as string
    const data = held.get(id)
    // A session the resolver found but the second read did not is not silently counted. It cannot
    // happen in one request, and if it ever does the row is left out of both the list and the sum.
    if (data === undefined) continue
    const bag = JSON.parse(data) as Record<string, unknown>
    const receipt = bag['usageReceipt']
    runs.push({ id, title: one.title, hasReceipt: receipt !== undefined && receipt !== null })
    forTotals.push({ id, data: bag })
  }
  const totals = receiptsFromRuns(forTotals)
  return {
    runs,
    totals,
    runsWithoutReceipt: totals.missingReceipts,
    changesOnRecord,
    changesNamingNoRun,
    says: SPENT_WORDS.says(runs.length, totals.missingReceipts, changesNamingNoRun),
  }
}
