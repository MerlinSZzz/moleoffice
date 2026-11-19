// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import type { DevSaying } from './dev-sayings.ts'

/** Runtime-supplied counts. Absent means not given; zero is a measured value. U3. */
export interface UsageReceipt {
  inputTokens?: number
  cachedInputTokens?: number
  cacheCreationInputTokens?: number
  outputTokens?: number
  reasoningTokens?: number
  /** Whether inputTokens already includes cachedInputTokens. Never add them without this fact. */
  inputIncludesCached?: boolean
  model?: string
  /** The model the run asked its runtime for, in the runtime's own name. Never read as the model that served it. */
  modelRequested?: string
  runtime?: string
  source?: string
  durationMs?: number
  costUsd?: number
  /** What the inspected envelope did not supply, or why it could not be read. */
  says?: string
  /** Which login the run ran under, named by where it came from, or "not reported". Never an account guessed. */
  paidBy?: string
  /** Where the run ran: "in the sandbox <name>", or "on the host". */
  ranIn?: string
  /** When a hook or tool read the usage so far, local wall-clock. A stop leaves a receipt read in the last ten minutes. */
  readAt?: string
  /** Money the run spent on paid services outside the office, each named by its service, as whoever paid wrote it. */
  outsideSpend?: OutsideSpend[]
}

/**
 * THE FIXED FORMS OF `paidBy` AND `ranIn` are declared in src/config/usage.mjs, which the session hook loads under a
 * Node that cannot read TypeScript. They are re-exported here for the receipt on a page.
 */
export { PAID_BY_THE_LOGIN_IN, RAN_IN_THE_SANDBOX, RAN_ON_THE_HOST, RECEIPT_NOT_REPORTED } from '../config/usage.mjs'

/** One amount spent outside the office, in US dollars, written by whoever paid it (tools/outside-spend.mjs). */
export interface OutsideSpend {
  service: string
  usd: number
  says?: string
  at?: string
}

/** The numbers a receipt may carry, declared in src/config/usage.mjs so its readers can sum them. */
export { USAGE_NUMBERS } from '../config/usage.mjs'
import { USAGE_NUMBERS } from '../config/usage.mjs'
export type UsageNumber = typeof USAGE_NUMBERS[number]

export interface ReceiptTotal {
  name: string | null
  runs: string[]
  missingReceipts: number
  /** Input totals include cache reads and creation; raw receipt counts keep their original meaning. */
  values: Partial<Record<UsageNumber, number>>
  supplied: Record<UsageNumber, number>
  /**
   * THE PRICE WORKED OUT FROM THE PERSON'S TABLE, kept apart from the measured `costUsd`.
   *
   * `total` is null when no price could be estimated for this row. `says` then carries the reason,
   * and it is one of the sentences declared in `src/shared/price-table.ts`, never a zero. A row
   * with a number here is estimated; the measured cost stays its own number beside it.
   */
  estimate: ReceiptEstimate
}

/** The estimated cost over one row's runs, and the counts saying what it covered. */
export interface ReceiptEstimate {
  /** The estimated cost in `currency`, or null when nothing could be estimated. Never a zero. */
  total: number | null
  /** The table's currency when a table is set, else null. */
  currency: string | null
  /** How many runs in the row supplied enough numbers and had a model the table prices. */
  pricedRuns: number
  /** How many runs in the row had a model the table does not name. */
  unpricedRuns: number
  /** How many runs in the row had a receipt that did not supply enough numbers to price. */
  incompleteRuns: number
  /** Why there is no number here, or null when there is one. */
  says: string | null
  /** `says` as a code the usage page draws in its own language (src/shared/dev-sayings.ts). */
  said: DevSaying | null
}
export interface ReceiptUsage {
  runs: number
  missingReceipts: number
  /**
   * EVERY RUN IN THE SET ADDED TOGETHER, in one row whose name is null.
   *
   * The four dimensions below each partition the same runs, so a caller wanting one total has no
   * single row to read without adding four numbers it should not be adding. Criterion T2 asks a
   * record for one total over the runs its change log names, so the one summation produces that
   * total here and no second addition exists anywhere.
   */
  overall: ReceiptTotal
  byModel: ReceiptTotal[]
  /**
   * BY THE TOOL EACH RUN DECLARED: its session record's `adaptedTool`, one of the tools Mole Office adapts
   * (problem uh6-H72Zik9H). The row whose name is null holds the runs that declared none, "not declared";
   * the free `runtime` word and the receipt's own runtime are not read.
   */
  byRuntime: ReceiptTotal[]
  byAgent: ReceiptTotal[]
  byRecord: ReceiptTotal[]
}
