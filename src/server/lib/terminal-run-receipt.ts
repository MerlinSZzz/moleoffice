// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE USAGE RECEIPT A RUN IN ONE OF THE OFFICE'S TERMINALS GETS WHEN ITS TERMINAL ENDS. A
 * decision, wave 13s
 * round 40; the agreement, message ZbUh96UhT6YQ, to build item 1 of message gcF1KMJaSBD4.
 *
 * A run the office opens in a terminal (lib/terminal-agents.ts) is started by no launcher, so no launcher writes its
 * receipt when its program exits. `endTheRunOf` writes this one in the same patch that ends the run, and before the
 * end revokes the run's key.
 *
 *   claude-code  nothing here. Its session hook writes the receipt while the run's key is good, and this leaves it.
 *   codex        the rollout of the thread the record names as its providerSession, which only a run brought back by
 *                its way back records (`codex resume <thread>`). It is read as a run's own seal reads it
 *                (src/config/a-runs-own-log.mjs), and the run's part is what was counted after its record was filed.
 *                A fresh Codex run records no thread, because Codex picks its own id, so its receipt says so in words.
 *   anything else  a receipt in words: the office has no reader of that runtime's log.
 *
 * The receipt says the office read it, which is true: it is not self-reported. Which login paid is "not reported",
 * because nothing here can tell. The run ran on this computer, since the holder is here.
 */

import type { UsageReceipt } from '@shared/usage-receipts.ts'
import { nowStamp, parseStoredStamp } from '@shared/time.ts'
import { AN_ID, shownInAReceipt, theEndOf, theOwnLogOfARunOn, theRolloutOfTheCodexThread, withAModelOfItsShape } from '../../config/a-runs-own-log.mjs'
import { codexRolloutUsage, keepingTheOutsideSpend, RAN_ON_THE_HOST, RECEIPT_NOT_REPORTED } from '../../config/usage.mjs'

/** Where an office-read receipt says it came from, before the file. */
const READ_BY_THE_OFFICE = "read by the office when the run's terminal ended"

/**
 * THE RECEIPT FOR A TERMINAL RUN THAT HAS JUST ENDED, or null for a Claude Code run. `env` is the environment the run's
 * terminal was given (theEnvironmentATerminalGets), so Codex's folder is the one its program used.
 */
export function theReceiptAtATerminalsEnd(
  record: { createdAt: string; data: Record<string, unknown> },
  env: Record<string, string | undefined>,
): UsageReceipt | null {
  const data = record.data
  const runtime = typeof data['runtime'] === 'string' ? data['runtime'] : null
  if (runtime === 'claude-code') return null
  const beside = { paidBy: RECEIPT_NOT_REPORTED, ranIn: RAN_ON_THE_HOST, readAt: nowStamp() }
  const inWords = (why: string): UsageReceipt =>
    keepingTheOutsideSpend(data['usageReceipt'], {
      ...(runtime === null ? {} : { runtime }),
      source: READ_BY_THE_OFFICE,
      says: `No numbers were read when its terminal ended: ${why}`,
      ...beside,
    })
  if (runtime === null) return inWords("the run's record names no runtime, so which log is its own is unknown.")
  if (runtime !== 'codex') return inWords(`the office has no reader of ${theOwnLogOfARunOn(runtime)}.`)
  const thread = data['providerSession']
  if (typeof thread !== 'string' || !AN_ID.test(thread)) {
    return inWords("Codex picks its own thread id when the office opens it in a terminal, and nothing recorded which thread this run had, so no rollout is this run's own.")
  }
  const sinceMs = parseStoredStamp(record.createdAt)
  if (sinceMs === null) return inWords("the run's filing time is not a stamp, so where its own part of the rollout begins is unknown.")
  const found = theRolloutOfTheCodexThread(thread, env)
  if (!found.ok) return inWords(found.why)
  const end = theEndOf(found.path)
  if (!end.ok) return inWords(`${end.why}.`)
  const read = codexRolloutUsage(end.text, sinceMs, end.whole)
  return keepingTheOutsideSpend(data['usageReceipt'], {
    ...withAModelOfItsShape(read),
    source: `${READ_BY_THE_OFFICE}, from ${shownInAReceipt(found.path, env)}: ${String(read.source)}`,
    ...beside,
  })
}
