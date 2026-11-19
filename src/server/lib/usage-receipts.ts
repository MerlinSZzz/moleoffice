// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * ONE ARITHMETIC FOR WHAT RUNS SPENT, over whatever set of runs the caller hands in.
 *
 * Criterion U3 built this for the window `GET /api/usage/agents` reads. Criterion P91 needs the same
 * sums over one agent's runs, and the ninth invariant says one fact is worked out in one place: a
 * second summation on the citizen's page would drift from this one the first time either changed. So
 * the loop below is the one summation, `receiptsFromRuns`, and the window reader is a thin reader
 * that selects the rows and hands them over.
 *
 * A missing count is not zero. A field the runtime did not supply is left out of the total and the
 * count of runs that supplied it does not move. `inputTokens` is only added when the receipt says
 * whether cache reads are already inside it, because adding two counts without that fact is how a
 * total becomes a number nobody can defend.
 *
 * THE MEASURED COST AND THE ESTIMATED COST ARE TWO DIFFERENT NUMBERS. `values.costUsd` is what the
 * runtime itself reported. Each row also carries `estimate`, worked out from the supplied token
 * counts and the price table the person sets. They are never added and the estimate never fills in
 * for an absent `costUsd`. Where a run carried no receipt it is counted as missing and nothing is
 * estimated over it; where the table prices no model the estimate is absent and says so.
 */
import { sqlite } from '../db/client.ts'
import { readInPieces } from '../db/in-pieces.ts'
import { isAgentRuntime } from '../../shared/participants.ts'
import { localStamp, parseLocalStamp } from '../../shared/time.ts'
import { USAGE_NUMBERS, type ReceiptEstimate, type ReceiptTotal, type ReceiptUsage, type UsageReceipt } from '../../shared/usage-receipts.ts'
import {
  estimatedCostOf,
  theNoPriceTableSentence,
  theNotEnoughNumbersSentence,
  theNothingToPriceSentence,
  theUnpricedModelSentence,
  theUnpricedRowSentence,
  type PriceTableReading,
} from '../../shared/price-table.ts'
import { priceTableInForce } from './price-table.ts'
import { saying, type DevSaying } from '../../shared/dev-sayings.ts'

/** One run, as this arithmetic needs it: its id, and the record's own `data` bag. */
export interface ReceiptRun {
  id: string
  data: Record<string, unknown>
}

const blankEstimate = (): ReceiptEstimate => ({ total: null, currency: null, pricedRuns: 0, unpricedRuns: 0, incompleteRuns: 0, says: null, said: null })

/**
 * THE TOTALS OVER ONE SET OF RUNS. The only place any token is ever added up.
 *
 * `byAgent` reads `servingAgent` and `byRecord` reads `deliveringMessage`, which are the two
 * bindings the runs the office starts carry. A run bound only by `ranAs` has neither, and appears
 * under the null row of each: that is "nobody recorded which agent answered this under", not
 * "this run had no agent".
 *
 * The second argument is the price table in force. It defaults to the one reader in
 * `src/server/lib/price-table.ts`, which is the seam U2 wires to the Settings store. A caller that
 * already holds a reading (a test, or a future settings-aware caller) hands it in rather than
 * reading it a second time.
 */
export function receiptsFromRuns(runs: readonly ReceiptRun[], price: PriceTableReading = priceTableInForce()): ReceiptUsage {
  const groups = { byModel: new Map<string | null, ReceiptTotal>(), byRuntime: new Map<string | null, ReceiptTotal>(), byAgent: new Map<string | null, ReceiptTotal>(), byRecord: new Map<string | null, ReceiptTotal>() }
  let count = 0
  let missingReceipts = 0
  const word = (value: unknown) => typeof value === 'string' && value !== '' ? value : null
  const blank = (name: string | null): ReceiptTotal => ({ name, runs: [], missingReceipts: 0, values: {}, supplied: Object.fromEntries(USAGE_NUMBERS.map(key => [key, 0])) as ReceiptTotal['supplied'], estimate: blankEstimate() })
  // THE SAME RUNS AGAIN, AS ONE ROW. Criterion T2 asks a record for one total over the runs its
  // change log names, and this is that total. It is added in the one loop below, not by a caller
  // adding the four dimension rows afterwards, so the cache-overlap rule is stated once.
  const overall = blank(null)
  /**
   * ONE VALUE, READ THE ONE WAY, by the group rows and the overall row alike.
   *
   * This was the body of the group loop only, which was fine while the group rows were the only
   * output. The overall row would have needed a second copy of the cache-overlap rule, and two
   * copies of that rule is how one total comes to disagree with another. One function, two callers.
   */
  const valueOf = (receipt: UsageReceipt | undefined, key: (typeof USAGE_NUMBERS)[number]): number | undefined => {
    let value = receipt?.[key]
    if (key === 'inputTokens') {
      if (receipt?.inputIncludesCached === false) {
        value = value !== undefined && receipt.cachedInputTokens !== undefined && receipt.cacheCreationInputTokens !== undefined ? value + receipt.cachedInputTokens + receipt.cacheCreationInputTokens : undefined
      } else if (receipt?.inputIncludesCached !== true) value = undefined
    }
    return value
  }
  /**
   * THE ESTIMATE FOR ONE ROW, ADDED IN THE SAME LOOP.
   *
   * A run with no receipt adds nothing and is never priced: the missing count is the answer for it.
   * A run whose model the table does not name adds no money and moves the unpriced count. A run
   * whose receipt did not supply enough numbers moves the incomplete count. Only a run the table
   * can price adds to `total`.
   */
  const addEstimate = (row: ReceiptTotal, receipt: UsageReceipt | undefined): void => {
    if (!receipt) return
    const answer = estimatedCostOf(receipt, price)
    if (answer.state === 'estimated') {
      row.estimate.total = (row.estimate.total ?? 0) + answer.total
      row.estimate.currency = answer.currency
      row.estimate.pricedRuns += 1
    } else if (answer.state === 'not-priced') row.estimate.unpricedRuns += 1
    else if (answer.state === 'not-enough-numbers') row.estimate.incompleteRuns += 1
  }
  for (const row of runs) {
    const data = row.data
    const receipt = data['usageReceipt'] as UsageReceipt | undefined
    count += 1
    if (!receipt) { missingReceipts += 1; overall.missingReceipts += 1 }
    overall.runs.push(row.id)
    addEstimate(overall, receipt)
    for (const key of USAGE_NUMBERS) {
      const value = valueOf(receipt, key)
      if (value !== undefined) { overall.values[key] = (overall.values[key] ?? 0) + value; overall.supplied[key] += 1 }
    }
    // THE RUNTIME ROW IS THE TOOL THE RUN DECLARED, `adaptedTool` on its own record, one of the tools Mole
    // Office adapts, as a decision says; problem uh6-H72Zik9H: the same field the
    // calls split of GET /api/usage/agents counts, so the two per-tool answers on one page cannot
    // disagree. A run that declared none is in the null row, "not declared". Neither the free `runtime`
    // word nor the receipt's runtime is read: a check's receipt says claude-code because the check ran
    // Claude, and the model row already says that (vFGUngaLB98_).
    const declared = data['adaptedTool']
    const names = { byModel: word(receipt?.model), byRuntime: isAgentRuntime(declared) ? declared : null, byAgent: word(data['servingAgent']), byRecord: word(data['deliveringMessage']) }
    for (const dimension of Object.keys(groups) as (keyof typeof groups)[]) {
      const name = names[dimension]
      const group = groups[dimension].get(name) ?? blank(name)
      group.runs.push(row.id)
      if (!receipt) group.missingReceipts += 1
      addEstimate(group, receipt)
      for (const key of USAGE_NUMBERS) {
        const value = valueOf(receipt, key)
        if (value !== undefined) { group.values[key] = (group.values[key] ?? 0) + value; group.supplied[key] += 1 }
      }
      groups[dimension].set(name, group)
    }
  }
  /**
   * WHY A ROW SHOWS NO NUMBER, IN WORDS DECLARED ONCE. A row with a number says nothing here; the
   * counts beside it say how many runs were priced. An unpriced model is named where the row IS a
   * model, and otherwise the row says the table names none of its models.
   */
  const finalize = (row: ReceiptTotal, modelRow: boolean): void => {
    const estimate = row.estimate
    /** The sentence, and the same sentence as a code the page draws in its own language. */
    const say = (says: string, said: DevSaying): void => { estimate.says = says; estimate.said = said }
    if (price.state === 'none') { say(theNoPriceTableSentence(), saying('priceNoTable', {})); return }
    if (estimate.pricedRuns > 0) { estimate.says = null; estimate.said = null; return }
    if (estimate.unpricedRuns > 0) {
      if (modelRow && row.name !== null) say(theUnpricedModelSentence(row.name), saying('priceUnpricedModel', { model: row.name }))
      else say(theUnpricedRowSentence(), saying('priceUnpricedRow', {}))
      return
    }
    if (estimate.incompleteRuns > 0) say(theNotEnoughNumbersSentence(), saying('priceNotEnoughNumbers', {}))
    else say(theNothingToPriceSentence(), saying('priceNothingToPrice', {}))
  }
  finalize(overall, false)
  for (const dimension of Object.keys(groups) as (keyof typeof groups)[]) {
    for (const row of groups[dimension].values()) finalize(row, dimension === 'byModel')
  }
  return { runs: count, missingReceipts, overall, ...Object.fromEntries(Object.entries(groups).map(([key, map]) => [key, [...map.values()]])) } as ReceiptUsage
}

/**
 * THE RUNS FILED SINCE A MOMENT, in one project or in every project when `workspaceId` is null. Read from the session
 * records directly: a run with no API calls still spent its recorded tokens. The usage window below and each login's
 * week (lib/logins-week.ts) both select their runs here.
 */
export function theRunsFiledSince(fromMs: number, workspaceId: string | null): ReceiptRun[] {
  // ONLY THE RUNS CHANGED SINCE A DAY BEFORE THE MOMENT ARE READ, through `records_updated_idx`, and the time each was
  // filed still decides below. A run filed since then was changed since then, because every write sets `updated_at` to
  // the local stamp; the day is for a clock change. `+` keeps SQLite off the kind and project indexes. Every session row
  // was read and parsed before, every minute for the week-use notice (wave 13y round 17).
  const changedSince = localStamp(new Date(fromMs - 24 * 3_600_000))
  const rows = sqlite
    .prepare("select id, data, created_at as createdAt from records where updated_at >= ? and +kind = 'session' and deleted_at is null" + (workspaceId === null ? '' : ' and +workspace_id = ?'))
    .all(changedSince, ...(workspaceId === null ? [] : [workspaceId])) as { id: string; data: string; createdAt: string }[]
  const kept: ReceiptRun[] = []
  for (const row of rows) {
    const at = parseLocalStamp(row.createdAt)
    if (at === null || at < fromMs) continue
    kept.push({ id: row.id, data: JSON.parse(row.data) as Record<string, unknown> })
  }
  return kept
}

/**
 * THE RUNS FILED BEFORE A MOMENT THAT NAME ONE OF THESE CONVERSATIONS in `providerSession`, in every project. Each
 * login's week reads them to subtract what a resumed session's receipt already counted before the window
 * (lib/logins-week.ts, `theCostInTheReceipts`).
 */
export function theRunsOfSessionsFiledBefore(sessions: readonly string[], beforeMs: number): ReceiptRun[] {
  if (sessions.length === 0) return []
  // IN PIECES (src/server/db/in-pieces.ts): every conversation a login's runs named in seven days is asked about, and
  // nothing caps how many. A run names one conversation, so it comes from one piece, and the one caller keeps the
  // highest figure of each conversation, which does not depend on the order of the rows.
  const rows = readInPieces(
    sessions,
    (piece) =>
      sqlite
        .prepare(`select id, data, created_at as createdAt from records where kind = 'session' and deleted_at is null and json_extract(data, '$.providerSession') in (${piece.map(() => '?').join(', ')})`)
        .all(...piece) as { id: string; data: string; createdAt: string }[],
  )
  const kept: ReceiptRun[] = []
  for (const row of rows) {
    const at = parseLocalStamp(row.createdAt)
    if (at === null || at >= beforeMs) continue
    kept.push({ id: row.id, data: JSON.parse(row.data) as Record<string, unknown> })
  }
  return kept
}

/** The totals over the runs filed since a moment. */
export function receiptUsage(fromMs: number, workspaceId: string | null): ReceiptUsage {
  return receiptsFromRuns(theRunsFiledSince(fromMs, workspaceId))
}
