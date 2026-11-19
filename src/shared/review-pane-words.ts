// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * TWO THINGS THE REVIEW COLUMN SAYS, WHOSE WORDS LIVE IN THE WORD LISTS SO A PAGE DRAWS THEM IN ITS OWN LANGUAGE.
 *
 * The server writes both in English for a caller reading JSON, with the English reader, and the review column draws
 * the same word-list keys with `t` (the re-review of wave 13n round 32: both were English on a Chinese page).
 * One key, two readers, so the English an agent reads and the words a page draws cannot drift apart (invariant 9).
 */

import type { WordKey } from './i18n.ts'

/**
 * WHAT THE READING OF THE COMMENTS NOT IN A REVIEW DOES NOT READ, one sentence each, in this order. `commentsNotIn`
 * in src/server/lib/reviews.ts sends them as its first `limits`; developer mode draws them under "Not in it".
 */
export const WHAT_THE_NOT_IN_READING_LEAVES_OUT = [
  'review.notIn.limit.ownRecordsOnly',
  'review.notIn.limit.writtenDownOnly',
  'review.notIn.limit.abandoned',
] as const satisfies readonly WordKey[]

/** The line under a comment saved without sending that nobody has been chosen for, in "Where each comment would go". */
export const A_SAVED_COMMENT_WITH_NOBODY_CHOSEN: WordKey = 'review.send.savedWithNobody'

/** A short reason for an undeliverable recipient, selected from the send plan's own code. */
export function deliveryReasonKey(key: import('./send-plan-words.ts').SendPlanLineKey): WordKey | null {
  switch (key) {
    case 'nobodyChosen': case 'savedWithNobody': case 'unresolvedNothingKept': case 'agentNotSaid': case 'runNotSaid':
      return 'review.delivery.noRecipient'
    case 'unresolvedWhy': return 'review.delivery.unresolved'
    case 'unresolvedSaid': return 'review.delivery.unresolvedSaid'
    case 'unresolvedSaidWhy': return 'review.delivery.unresolvedSaidWhy'
    case 'agentGone': return 'review.delivery.missingAgent'
    case 'agentNotAnAgent': return 'review.delivery.wrongAgent'
    case 'agentElsewhere': case 'agentInAnotherProject': return 'review.delivery.otherProject'
    case 'cannotReach': return 'review.delivery.retired'
    case 'runGone': return 'review.delivery.missingRun'
    case 'runNotARun': return 'review.delivery.wrongRun'
    case 'runElsewhere': case 'runInAnotherProject': return 'review.delivery.otherRun'
    case 'runCannotBePickedUp': return 'review.delivery.noPickup'
    default: return null
  }
}
