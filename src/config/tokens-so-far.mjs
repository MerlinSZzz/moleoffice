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

import { closeSync, fstatSync, openSync, readSync, statSync } from 'node:fs'
import { claudeAnswersFoldedIn, claudeAnswersSince, claudeTranscriptUsage, openCodeUsage, theReceiptOfClaudeAnswers } from './usage.mjs'

/** @typedef {import('../shared/usage-receipts.ts').UsageReceipt} UsageReceipt */
/** @typedef {{ tokens: number, read: string } | { tokens: null, why: string }} TokensSoFar */
/**
 * WHAT ONE READ OF A CONVERSATION FILE KEEPS FOR THE NEXT: the file it read (device and inode), its size and time then,
 * where the next read starts (`offset`, just after the last newline read), the answers folded in before that, and the
 * receipt and count at that read.
 * @typedef {{ dev: number, ino: number, size: number, mtimeMs: number, offset: number, answers: import('./usage.mjs').ClaudeAnswers, receipt: UsageReceipt, tokens: TokensSoFar }} AConversationRead
 */

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
  return theClaudeCodeTokensOf(claudeTranscriptUsage([text], sinceMs))
}

/** @param {UsageReceipt} receipt @returns {TokensSoFar} */
function theClaudeCodeTokensOf(receipt) {
  return theTokensCounted(receipt, 'the conversation file', 'each answer once')
}

/**
 * A CLAUDE CODE RUN'S TOKENS SO FAR, READ ON FROM THE LAST READ OF ITS CONVERSATION FILE, for the step reminder
 * (theTokensOf in src/server/lib/step-reminders.ts), which keeps what each read answers and hands it to the next.
 *
 * A file whose size and time have not changed since `last` is not read, and `last` is the answer. Otherwise only the
 * bytes after `last.offset` are read, because a working run's file grows by a few lines at a time and the whole of it
 * can be large. The whole file is read when there is no `last`, when the file is no longer the one read then (another
 * device or inode, or shorter than it was), or when the run's start changed. The count is a whole read's
 * (claudeCodeTokensSoFar) at every read:
 *   - the complete lines read are folded into the answers kept, by the one fold of ./usage.mjs, in file order;
 *   - the bytes after the last newline are a line still being written, or a complete last line with no newline yet. A
 *     whole read counts it when it parses, so it is counted too, on a copy of the answers, and the next read starts at
 *     it, so it is never kept as read.
 * @param {string} file
 * @param {number} sinceMs when the run began
 * @param {AConversationRead | undefined} last what the last read of this file answered, or undefined
 * @returns {AConversationRead}
 */
export function claudeCodeTokensSoFarReadOn(file, sinceMs, last) {
  const seen = statSync(file)
  if (last !== undefined && last.dev === seen.dev && last.ino === seen.ino && last.size === seen.size && last.mtimeMs === seen.mtimeMs && last.answers.sinceMs === sinceMs) return last
  const { now, from, read, onto } = theBytesToReadOn(file, sinceMs, last)
  const end = read.lastIndexOf(0x0a) + 1
  const answers = claudeAnswersFoldedIn(onto ?? claudeAnswersSince(sinceMs), read.subarray(0, end).toString('utf8'))
  const rest = read.subarray(end)
  const atThisRead = rest.length === 0 ? answers : claudeAnswersFoldedIn({ ...answers, byId: new Map(answers.byId) }, rest.toString('utf8'))
  const receipt = theReceiptOfClaudeAnswers(atThisRead)
  return { dev: now.dev, ino: now.ino, size: from + read.length, mtimeMs: now.mtimeMs, offset: from + end, answers, receipt, tokens: theClaudeCodeTokensOf(receipt) }
}

/**
 * THE BYTES A READ ON FROM `last` READS, through one open descriptor, so the file whose device, inode and size are
 * compared is the file read: from `last.offset` when the file is still the one `last` read, or else whole, and then
 * there are no answers to fold them onto. Fewer bytes come back when the file was cut short while they were read. The
 * file is closed before anything is folded, so the answers `last` kept change only when the read has ended.
 * @param {string} file
 * @param {number} sinceMs
 * @param {AConversationRead | undefined} last
 * @returns {{ now: import('node:fs').Stats, from: number, read: Buffer, onto: import('./usage.mjs').ClaudeAnswers | null }}
 */
function theBytesToReadOn(file, sinceMs, last) {
  const fd = openSync(file, 'r')
  try {
    const now = fstatSync(fd)
    const goesOn = last !== undefined && last.dev === now.dev && last.ino === now.ino && now.size >= last.size && last.answers.sinceMs === sinceMs
    const from = goesOn ? last.offset : 0
    const bytes = Buffer.allocUnsafe(now.size - from)
    let got = 0
    while (got < bytes.length) {
      const n = readSync(fd, bytes, got, bytes.length - got, from + got)
      if (n === 0) break
      got += n
    }
    return { now, from, read: bytes.subarray(0, got), onto: goesOn ? last.answers : null }
  } finally {
    closeSync(fd)
  }
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
