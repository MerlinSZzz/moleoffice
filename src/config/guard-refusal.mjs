// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
// @ts-check
/**
 * THE WORDS THE START GUARD REFUSES IN, IN ONE PLACE FOR BOTH SIDES.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS FILE EXISTS, MEASURED
 * ---------------------------------------------------------------------------------------
 *
 * Problem `7-lQDWANdVAn`, 12 September 2026. The start guard in src/server/index.ts refused to
 * serve the database — a migration step had written silently — and the process exited 1. The dev
 * supervisor in tools/serve-dev.mjs did not recognise the refusal, so it started the server again
 * every fifteen seconds for fourteen minutes, and the in-a-row counter read "1 in a row" every
 * time so the thirty-second back-off never came. Nothing outside the log said the office was down.
 *
 * The guard's refusal is one fact. It is written in `src/server/db/migrate.ts` and it is read by
 * the supervisor out of the child's own stderr. If the two spell it separately they can drift: the
 * guard could refuse in new words while the supervisor went on looking for the old ones and
 * restarting for ever, and nothing would fail. This module is that one spelling.
 *
 * THE FACT THEY SHARE IS THE OPENING WORDS, not an exit code. Every refusal the guard makes begins
 * with `REFUSING TO ` today: `REFUSING TO SERVE` for a database that is not up to date and
 * `REFUSING TO USE` for one that is damaged or is not Mole Office's, and `REFUSING TO WRITE` for a
 * data folder inside a git worktree. Comparing the opening words
 * follows the guard when it grows a third refusal, which an exit code would not without a second
 * change in the server.
 *
 * IT IS JAVASCRIPT FOR THE REASON settings.mjs IS: `tools/serve-dev.mjs` is run by the bare word
 * `node` and must keep working when the TypeScript in the checkout does not.
 */

/**
 * EVERY REFUSAL THE START GUARD MAKES BEGINS WITH THESE WORDS.
 *
 * The supervisor looks for these; `migrate.ts` builds the refusals from them. One string, two
 * readers, and no way for one to move without the other.
 */
export const THE_GUARD_REFUSALS_BEGIN = 'REFUSING TO '

/** The guard refuses to SERVE a database a migration would write to. */
export const REFUSING_TO_SERVE = `${THE_GUARD_REFUSALS_BEGIN}SERVE`

/** The guard refuses to USE a database that is damaged or is somebody else's. */
export const REFUSING_TO_USE = `${THE_GUARD_REFUSALS_BEGIN}USE`

/**
 * The guard refuses to WRITE an office's data into a folder inside a git worktree (problem
 * nd7jOk5LCU4s): src/server/lib/git-checkout.ts.
 */
export const REFUSING_TO_WRITE = `${THE_GUARD_REFUSALS_BEGIN}WRITE`

/**
 * THE FIRST LINE OF THE GUARD'S REFUSAL IN THESE LINES OF OUTPUT, OR NULL WHEN THERE IS NONE.
 *
 * The guard's refusal reaches the supervisor as the first line of an uncaught error on the child's
 * stderr — `Error: REFUSING TO SERVE …` — and the words after the marker are the guard's own. The
 * `Error: ` and any stack the child printed are dropped, because the supervisor's sentence is
 * about what the guard said, not about how Node reported it.
 *
 * The caller passes the lines of one chunk as well as a rolling window of them, so a refusal whose
 * body is longer than the window is still found: the first line is matched when it arrives.
 *
 * @param {readonly string[]} lines lines the child printed
 * @returns {string | null} the refusal's first line from the marker onward
 */
export function theGuardsRefusalIn(lines) {
  for (const line of lines) {
    const at = line.indexOf(THE_GUARD_REFUSALS_BEGIN)
    if (at !== -1) return line.slice(at)
  }
  return null
}
