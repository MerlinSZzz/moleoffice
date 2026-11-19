// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
// @ts-check
/**
 * WHAT `says` TAKES UNDER A RUN'S SAVED ROUND CHAPTERS, in the words the check's prompt and the check tool's questions use
 * (round BL, item 2ao).
 *
 * A run that saved its round chapters (data.extra.roundChapters) bounds what a verdict may cite. The verdict door holds the
 * verdict to checkSavedChapterClaims (src/shared/round-chapters/manifest.ts), which refuses any precedent and any chapter
 * this check was not given. The prompt offered `says` from whatSaysTakes(), which names a precedent, so a check that took
 * the offer had its verdict refused at the door. Under saved chapters, `says` is offered a chapter this check was given or
 * an invariant, and a decision or a precedent is named in the text of `check`.
 *
 * The phrase is built from WHAT_SAYS_NAMES in src/config/verdict-keys.mjs, so it names each key as the door's list does.
 * The prompt (src/server/lib/inspection.ts) and the check tool (tools/the-inspector.mjs) both read it from here.
 */
import { WHAT_SAYS_NAMES } from './verdict-keys.mjs'

/**
 * What `says` takes under saved round chapters, in one phrase: "`chapter` (…, one this check was given) or `invariant` (…)".
 * @returns {string}
 */
export function whatSaysTakesUnderSavedChapters() {
  return `\`chapter\` (${WHAT_SAYS_NAMES.chapter}, one this check was given) or \`invariant\` (${WHAT_SAYS_NAMES.invariant})`
}

/** Where a decision or a precedent goes when the saved round chapters gave the check none. */
export const NO_DECISION_WAS_GIVEN = 'No decision or precedent was given to this check. To name one, write its record id in the text of `check`.'
