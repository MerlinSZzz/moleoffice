// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE CODED CLAUSES OF AN ATTENTION ROW'S REASON. Plan 7FEOshq3mBGG and two
 * decisions.
 *
 * The server writes `reason.because` as one English sentence, for agents, and it stays English. A
 * page cannot translate that sentence, so each clause a page draws is also sent as a code with the
 * values it needs, the way src/shared/refusal-codes.ts sends a refusal. The page draws the code in
 * its own language from the word lists (`homeWords.reason.<code>`).
 *
 * WHICH CLAUSES ARE CODED. The clauses a page draws from this list: the state word that stopped
 * short, the pause whose date passed, and the record that says both "done" and "stopped short".
 * The clauses about who is waiting and about the recorded consequence are NOT coded here, because
 * a page already draws those from the row's own `owed` and `consequence` facts, in its own words.
 * The last-resort sentence for a row with no reason at all is not coded either: nothing reaches it.
 */
export const ATTENTION_REASON_CODES = {
  /** The stored state word says the work stopped short of finishing. */
  stoppedShort: { state: 'string' },
  /** A pause ran past the date it was set until. Both dates exactly as stored. */
  pauseElapsed: { since: 'string', until: 'string' },
  /** `done` says the record was discharged and the state word says it stopped short. */
  doneDisagrees: {},
} as const

export type AttentionReasonCode = keyof typeof ATTENTION_REASON_CODES

/** One coded clause, with exactly the values its code declares. */
export type CodedReason = {
  [C in AttentionReasonCode]: {
    code: C
    values: { readonly [K in keyof (typeof ATTENTION_REASON_CODES)[C]]: string }
  }
}[AttentionReasonCode]
