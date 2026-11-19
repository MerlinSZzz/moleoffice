// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHETHER A RUN IS EXPENSIVE TO PICK UP, AND THE ONE SENTENCE THAT SAYS SO. Criterion T6, amended
 * 13 September 2026.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THE WARNING MEASURES, AND WHAT IT DELIBERATELY DOES NOT
 * ---------------------------------------------------------------------------------------
 *
 * The office knows two things about a run and says those two things rather than guessing a third:
 * the tokens the run's usage receipt reports for its input side, and how many whole minutes it has
 * been idle. A run whose receipt reports a large last turn and which has been idle past the window
 * the installation names is expensive to pick up, and the warning names both numbers.
 *
 * IT NEVER NAMES A CONTEXT SIZE. The session kind holds no context-size field and no runtime in
 * this build reports a compaction, so a context size would be an invention. The comparison the old
 * wording asked for — against the provider's cache window — is not made anywhere either: the
 * window is a declared setting, named and arguable, in src/config/settings.mjs.
 *
 * ABSENCE IS NOT SMALLNESS. A run with no receipt, or a receipt whose runtime gave no input
 * count, is not a run with zero tokens: it is a run nobody measured, and it carries no warning.
 */
import type { UsageReceipt } from './usage-receipts.ts'

/** The two measured numbers, and the warning a person reads. */
export interface PickUpCost {
  /**
   * The input tokens the run's own usage receipt reports. Absent counts never reach here: a receipt
   * with no number is said as absent and carries no warning, rather than being read as zero.
   */
  lastTurnTokens: number
  /** How many whole minutes the run has been idle, from the presence reading's own clock. */
  idleMinutes: number
  /** The warning a person reads. It names both measured numbers and no context size. */
  warning: string
}

/**
 * The whole input side of a run's last turn, or null because the runtime gave none.
 *
 * `inputIncludesCached` DECIDES WHETHER THE COUNTS ARE ADDED, and it is the only thing that may.
 * The receipt's own field note says it: "Never add them without this fact."
 *
 *   false   — the counts are separate, so the turn is inputTokens + cachedInputTokens +
 *             cacheCreationInputTokens. This is every Claude Code run: `claudeUsage` sets the flag
 *             false and its own comment says "input excludes cache reads and cache creation".
 *   true    — the count already holds the cache reads, so inputTokens alone IS the turn. This is a
 *             Codex run: `codexUsage`'s comment says turn.completed usage includes cached input.
 *             Adding there would count the same tokens twice.
 *   absent  — nobody said the counts do not overlap, so inputTokens alone, because a sum nobody
 *             vouched for is a guess.
 *
 * MEASURED, AND WHY THIS CHANGED. Until 13 September 2026 this read `inputTokens` alone, on
 * Supervisor SD's brief, and that made the warning unreachable: on the owner's office the four runs
 * that carry a receipt report inputTokens of 28, 20, 14 and 12, while their whole turns are
 * 2,631,475, 2,105,972, 574,038 and 439,492. Every threshold above twenty-eight tokens drew nothing
 * for anybody. A worker built the field it was given, wrote down that it was not
 * adding the others, and reported that nothing in the corpus crossed the default; the defect is
 * problem Rn-hi48NaLnV and the brief that caused it was the supervisor's.
 *
 * ABSENCE IS STILL NOT SMALLNESS. A missing count contributes nothing, and a receipt with no input
 * count at all is null here rather than zero.
 */
export function lastTurnTokensOf(receipt: UsageReceipt | null | undefined): number | null {
  const input = receipt?.inputTokens
  if (typeof input !== 'number' || !Number.isFinite(input)) return null
  if (receipt?.inputIncludesCached !== false) return input
  const alsoRead = typeof receipt.cachedInputTokens === 'number' && Number.isFinite(receipt.cachedInputTokens)
    ? receipt.cachedInputTokens
    : 0
  const alsoWritten = typeof receipt.cacheCreationInputTokens === 'number' && Number.isFinite(receipt.cacheCreationInputTokens)
    ? receipt.cacheCreationInputTokens
    : 0
  return input + alsoRead + alsoWritten
}

/**
 * THE ONE WARNING. Written once, so the Embassy row, the run's page and the sentence a starter is
 * shown before sending cannot come to say different things about one run.
 *
 * It names the tokens AND the minutes, because a reader has to be able to argue with both. It
 * names no context size, no price and no model. It ends with the rule the criterion carries:
 * a small fix goes to a fresh agent.
 */
export function thePickUpCostWarning(lastTurnTokens: number, idleMinutes: number): string {
  return (
    `The last turn this run recorded spent ${lastTurnTokens.toLocaleString('en-GB')} input tokens, and the run ` +
    `has been idle ${String(idleMinutes)} minutes. Picking it up again carries that run's conversation, so for ` +
    'a small fix start a fresh agent with a tight brief.'
  )
}

/**
 * The warning when both measured numbers cross the thresholds, or null.
 *
 * ALL FOUR `null` REASONS ARE DIFFERENT and each one is why the warning does not appear: no token
 * number was recorded, no idle reading could be taken, the last turn was not large, or the run was
 * not idle long enough. None of them is reported as "small" or "recent" and none is a guess. The
 * caller decides only where to draw the returned sentence.
 */
export function pickUpCostSaid(
  lastTurnTokens: number | null,
  idleMinutes: number | null,
  largeAtLeastTokens: number,
  idleAtLeastMinutes: number,
): PickUpCost | null {
  if (lastTurnTokens === null || idleMinutes === null) return null
  if (lastTurnTokens < largeAtLeastTokens) return null
  if (idleMinutes < idleAtLeastMinutes) return null
  return { lastTurnTokens, idleMinutes, warning: thePickUpCostWarning(lastTurnTokens, idleMinutes) }
}
