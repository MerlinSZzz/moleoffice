// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
// @ts-check
/**
 * AN ATTRIBUTION LINE IN A COMMIT MESSAGE: a co-author line, a session line, a "generated with" line or a line with the
 * one emoji the pattern names.
 * No commit that reaches main may carry one.
 *
 * ONE PATTERN: the merge tool refuses to push a landed commit that carries one
 * (tools/merge-tool/push.mjs), the merge queue refuses an entry whose commits carry one when it is submitted
 * (src/server/lib/merge-queue.ts), and the reminder before the seal names each one (src/server/lib/before-the-seal-rules.ts).
 * The landing title reader also uses it before copying a run's title into a new main commit.
 * Proved by tests/an-attribution-line-is-refused-at-submission.test.ts. The merge tool imports this file, so it is the
 * queue's own code (tools/merge-tool/the-queues-own-code.mjs).
 */
export const AN_ATTRIBUTION_LINE = /^co-authored-by:|generated with \[claude|🤖|^claude-session:/imu

/**
 * The arguments of the `git log` that prints every commit of `range` for `theMessagesIn`: a NUL after each commit, its
 * hash on the first line and its whole message after.
 * @param {string} range
 * @returns {string[]}
 */
export function theMessagesOfARange(range) {
  return ['log', '-z', '--format=%H%n%B', range]
}

/**
 * Each commit that `theMessagesOfARange` printed, newest first as git prints them, with its whole message.
 * @param {string} printed
 * @returns {{ commit: string, message: string }[]}
 */
export function theMessagesIn(printed) {
  return printed
    .split('\0')
    .filter((one) => one.trim() !== '')
    .map((one) => {
      const end = one.indexOf('\n')
      return end === -1 ? { commit: one.trim(), message: '' } : { commit: one.slice(0, end).trim(), message: one.slice(end + 1) }
    })
}

/**
 * Each line of one commit message that is an attribution line, in order. Empty when it has none.
 * @param {string} message
 * @returns {string[]}
 */
export function theAttributionLinesOf(message) {
  return message.split('\n').filter((line) => AN_ATTRIBUTION_LINE.test(line))
}
