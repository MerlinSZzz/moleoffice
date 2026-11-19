// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHAT A RECORD SPENT — the shape and the words, read by the server and the browser from one file.
 *
 * Criterion T2. A problem, a module, a pipeline, a step: each answers how many tokens and how much
 * time the runs that worked on it spent, and says which runs it counted. The method is the
 * secretary's decision of 13 September 2026: T2 by method C. A record sums the runs its own change
 * log names, and it says how many changes on the record name no run. Nothing is written at a run's
 * finish for it.
 *
 * WHY THIS FILE EXISTS. The reader returns a shape the page draws and a test reads, and both ends
 * have to agree on the field names and on the words. `src/shared/profile.ts` is the same arrangement
 * for the citizen's page, and it is why the screen words can be asserted by a test without a second
 * copy of them.
 *
 * A MISSING RECEIPT IS NEVER ZERO. `runsWithoutReceipt` is the number of counted runs whose record
 * carried no usage receipt. Their tokens and time are unknown, and the words below say so.
 */
import type { ReceiptUsage } from './usage-receipts.ts'
import { readStoredWord } from './i18n.ts'

/** One run the record's change log names, as the panel lists it. */
export interface OneRunCounted {
  /** The run's own record id. */
  id: string
  /** The run's title, or null where the resolved session record has none. */
  title: string | null
  /** True when the run's record carried a usage receipt. False is not zero tokens. */
  hasReceipt: boolean
}

/**
 * THE RUNS A RECORD'S CHANGE LOG NAMES, AND THE ONE SUMMATION OVER THEM.
 *
 * `totals` is the product's single token summation, `receiptsFromRuns` in
 * `src/server/lib/usage-receipts.ts`, handed exactly the runs below. Its `overall` row is every
 * counted run added together, which is the number the criterion asks for.
 */
export interface SpentOnThis {
  /** The runs counted, in the reader's order. Empty means the change log names no run. */
  runs: OneRunCounted[]
  /** The one summation over exactly these runs. Tokens and wall time are its `overall` row. */
  totals: ReceiptUsage
  /** How many of the counted runs carried no receipt. Never counted as zero tokens. */
  runsWithoutReceipt: number
  /** How many change rows this record has in all. */
  changesOnRecord: number
  /** How many of those rows name no run at all — a person, an office part, or a value that is not a run. */
  changesNamingNoRun: number
  /** One sentence saying what was counted, for a reader of the reply. */
  says: string
}

/** A whole number of milliseconds as a person would say it. Undefined stays undefined. */
export function wallTime(ms: number | undefined): string | undefined {
  if (ms === undefined) return undefined
  const whole = Math.max(0, Math.round(ms))
  if (whole < 1000) return `${String(whole)} ms`
  const seconds = whole / 1000
  if (seconds < 60) return `${seconds.toFixed(1)} s`
  const minutes = Math.floor(seconds / 60)
  const rest = Math.round(seconds - minutes * 60)
  return rest === 0 ? `${String(minutes)} min` : `${String(minutes)} min ${String(rest)} s`
}

/** A token count as a person would say it, or null because nobody measured one. */
export function tokenCount(value: number | undefined): string | null {
  return value === undefined ? null : value.toLocaleString('en-GB')
}

/** How many runs, in words that agree with the number. */
export function runCount(runs: number): string {
  return readStoredWord('g2b.spent.runCount', { n: runs })
}

/**
 * EVERY WORD THIS PANEL DRAWS.
 *
 * They are the reader's words, not the store's: "run" for a session record that did the work, and
 * "change" for a row of the change log. The last sentence of every absence names the limit, so a
 * person is never left to read a gap as a zero.
 *
 * EACH SENTENCE THE RECORD PAGE ALSO DRAWS IS WRITTEN ONCE, in src/shared/words/en.ts under
 * `g2b.spent.*`, and read here with `readStoredWord`: English on the server, the page's language in
 * a browser. A sentence with a number is the word list's entry filled in by that one reader, which
 * picks the plural form with `Intl.PluralRules`; where English says "One" rather than "1",
 * the list holds a second entry ending in `One`, and the choice between the two is made here the
 * way the page makes it. `says` is the server's alone and is written here.
 */
export const SPENT_WORDS = {
  /** The fold's label. */
  title: 'What this cost',
  /** The fold's label where the change log names no run. */
  get summaryNoRuns(): string {
    return readStoredWord('g2b.spent.summaryNoRuns')
  },
  /**
   * The fold's label where runs were counted. It states the total, because the whole point of a
   * folded number is that it can be read without opening the fold.
   */
  summaryRuns: (
    runs: number,
    tokensIn: number | undefined,
    tokensOut: number | undefined,
    durationMs: number | undefined,
  ): string => {
    if (tokensIn === undefined && tokensOut === undefined) {
      return readStoredWord('g2b.spent.summaryNoTokens', { n: runs })
    }
    const inTokens = tokenCount(tokensIn)
    const outTokens = tokenCount(tokensOut)
    const time = wallTime(durationMs)
    return readStoredWord('g2b.spent.summaryRuns', {
      n: runs,
      inPart: inTokens === null ? readStoredWord('g2b.spent.noTokensIn') : readStoredWord('g2b.spent.tokensIn', { tokens: inTokens }),
      outPart: outTokens === null ? readStoredWord('g2b.spent.noTokensOut') : readStoredWord('g2b.spent.tokensOut', { tokens: outTokens }),
      timePart: time === undefined ? readStoredWord('g2b.spent.noTime') : readStoredWord('g2b.spent.over', { time }),
    })
  },
  /** What the whole panel counts, and what it does not. */
  get countsWhat(): string {
    return readStoredWord('g2b.spent.countsWhat')
  },
  /** Where the change log names no run at all. */
  get nobodyChangedIt(): string {
    return readStoredWord('g2b.spent.nobodyChangedIt')
  },
  /** The heading over the runs that were counted. */
  get whichRuns(): string {
    return readStoredWord('g2b.spent.whichRuns')
  },
  /** Said beside one counted run whose record carried no receipt. */
  get thisOneNoReceipt(): string {
    return readStoredWord('g2b.spent.thisOneNoReceipt')
  },
  /** How many counted runs carried no receipt, and why that is not zero. */
  withoutReceipt: (without: number, counted: number): string =>
    readStoredWord(without === 1 ? 'g2b.spent.withoutReceiptOne' : 'g2b.spent.withoutReceipt', {
      n: without,
      counted: runCount(counted),
    }),
  /** How many changes on this record name no run, and what that means for the total. */
  namesNoRun: (changes: number): string =>
    readStoredWord(changes === 1 ? 'g2b.spent.namesNoRunOne' : 'g2b.spent.namesNoRun', { n: changes }),
  /** The one sentence the reader hands the door. */
  says: (runs: number, without: number, namingNoRun: number): string => {
    if (runs === 0) {
      return namingNoRun === 0
        ? 'This record has no changes, so no run is counted.'
        : `This record has ${String(namingNoRun)} change${namingNoRun === 1 ? '' : 's'} and none names a run, so no run is counted.`
    }
    return (
      `${runCount(runs)} changed this record and ${runs === 1 ? 'is' : 'are'} counted here` +
      (without === 0 ? '' : `; ${String(without)} carried no usage receipt`) +
      (namingNoRun === 0 ? '.' : `; ${String(namingNoRun)} change${namingNoRun === 1 ? ' names' : 's name'} no run.`)
    )
  },
} as const
