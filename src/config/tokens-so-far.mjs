// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A RUN'S TOKENS SO FAR, READ WHILE IT RUNS, FROM WHAT ITS RUNTIME WRITES AS IT GOES (wave 14d). The count is the
 * office's own reading. No agent is ever asked to count or summarise its own session, because an agent's account of
 * itself is not a measurement.
 *
 * THE ONE RULE FOR WHICH TOKENS ARE COUNTED is `theTokensCounted` below, and its words are THE_TOKENS_COUNTED. The
 * step reminder (src/server/lib/step-reminders.ts) compares this count with its setting, and every place that shows the
 * count names the rule with those words. Each runtime's reader turns what that runtime writes into a usage receipt
 * with the receipt readers of ./usage.mjs, which the usage receipt at a run's end is read with, and then counts the
 * receipt here. So the tokens counted while a run runs and its receipt at the end come from the same readings.
 *
 * WHICH RUNTIMES GIVE A COUNT WHILE THEY RUN:
 *   - Claude Code writes its conversation file as it goes, one line for each part of an answer. Each answer is counted
 *     once (claudeTranscriptUsage).
 *   - Codex prints its usage only in a `turn.completed` event, at the end of a turn, so until a turn completes there
 *     is no count. A resumed run's own part is the thread's total less the total of the run it continues, as its
 *     receipt is read (theRoundsOwnCodexUsage).
 *   - OpenCode prints a `step_finish` part after each step, with that step's tokens (openCodeUsage).
 *   - Kimi's output gives no usage at all, so its adapter has no reader and its runs are reminded by time only.
 * Each reader answers a count, or no count with the reason. No count is never a zero.
 */

import { claudeTranscriptUsage, openCodeUsage } from './usage.mjs'

/** @typedef {import('../shared/usage-receipts.ts').UsageReceipt} UsageReceipt */
/** @typedef {{ tokens: number, read: string } | { tokens: null, why: string }} TokensSoFar */

/** THE RULE IN WORDS, said wherever the count is shown. */
export const THE_TOKENS_COUNTED = 'input not read from the cache, plus cache writes, plus output; cache reads are left out'

/**
 * THE TOKENS A RECEIPT COUNTS UNDER THE ONE RULE, or no count with the reason.
 *
 * A receipt says whether its input count holds the input read from the cache. Codex's does, and its cache writes are
 * part of its input too, so its count is its input less its cache reads, plus its output. Claude Code's and OpenCode's
 * input holds neither, so their count is their input, plus their cache writes, plus their output. A number the receipt
 * does not give is not taken as zero: the answer is then no count, and it names the number that is missing.
 * @param {UsageReceipt} receipt
 * @param {string} source what was read, in words: "the conversation file"
 * @param {string} how how it was read, in words: "each answer once"
 * @returns {TokensSoFar}
 */
export function theTokensCounted(receipt, source, how) {
  const missing = (what) => ({ tokens: null, why: `Read from ${source}, ${how}: it gives no ${what}.${receipt.says === undefined ? '' : ` ${receipt.says}`}` })
  const counted = (tokens) => ({ tokens, read: `Read from ${source}, ${how}. Counted: ${THE_TOKENS_COUNTED}.` })
  const { inputTokens: input, outputTokens: output } = receipt
  if (input === undefined) return missing('input count')
  if (output === undefined) return missing('output count')
  if (receipt.inputIncludesCached === true) {
    const cacheReads = receipt.cachedInputTokens
    if (cacheReads === undefined) return missing('count of the input read from the cache')
    return counted(input - cacheReads + output)
  }
  if (receipt.inputIncludesCached === false) {
    const cacheWrites = receipt.cacheCreationInputTokens
    if (cacheWrites === undefined) return missing('count of cache writes')
    return counted(input + cacheWrites + output)
  }
  return missing('word on whether its input holds what was read from the cache')
}

/**
 * A CLAUDE CODE RUN'S TOKENS SO FAR, from its conversation file: each answer once, from the lines stamped since the run
 * began, because a run that continues a conversation shares its file with the runs before it.
 * @param {string} text the conversation file
 * @param {number} sinceMs when the run began
 * @returns {TokensSoFar}
 */
export function claudeCodeTokensSoFar(text, sinceMs) {
  return theTokensCounted(claudeTranscriptUsage([text], sinceMs), 'the conversation file', 'each answer once')
}

/**
 * A CODEX RUN'S TOKENS SO FAR, from the receipt its adapter reads from its output (readResult in
 * src/worker/runtimes/codex.ts), which already holds a resumed run's own part only.
 * @param {UsageReceipt | undefined} receipt
 * @returns {TokensSoFar}
 */
export function codexTokensSoFar(receipt) {
  if (receipt === undefined) return { tokens: null, why: 'Codex\'s adapter read no usage receipt from the output.' }
  return theTokensCounted(receipt, 'the output', 'at its last completed turn')
}

/**
 * AN OPENCODE RUN'S TOKENS SO FAR, from the step_finish parts of its output, each part once.
 * @param {string} said its output
 * @returns {TokensSoFar}
 */
export function openCodeTokensSoFar(said) {
  return theTokensCounted(openCodeUsage(said), 'the output', 'each finished step once')
}
