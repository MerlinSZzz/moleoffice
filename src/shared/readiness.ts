// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHETHER A REVIEW CAN BE SENT, AND IT IS NEVER STORED.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS IS ITS OWN FILE IN `src/shared` AND NOT A FUNCTION IN `lib/reviews.ts`
 * ---------------------------------------------------------------------------------------
 *
 * It was one, for about an hour. Importing it into a test pulled `lib/reviews.ts` in, which reaches
 * `src/server/db/client.ts`, which refuses to open an unnamed database under a test runner — the
 * guard that stops a test writing to the owner's real corpus. The repository's own instruction for
 * that case is the first of the two it prints: *if the test needs no database, import the constant
 * from somewhere that opens none — most of them are re-exported from src/shared*.
 *
 * AND IT NEEDS NO DATABASE. Every one of the four facts it reads is already on what it is handed.
 * It asks nothing, writes nothing and throws nothing, which is what makes it a pure reading of a
 * reply rather than a second query — so the browser can compute exactly what the server computed,
 * from the reply it already has, and the two cannot disagree.
 *
 * ---------------------------------------------------------------------------------------
 * ITS INPUTS ARE STRUCTURAL, ON PURPOSE
 * ---------------------------------------------------------------------------------------
 *
 * `ReviewLikeThis` and `MemberLikeThis` name the fields this reads and nothing else. They are not
 * `ReviewView` and `ReviewMember` — those live in `lib/reviews.ts` and importing them here would
 * put the cycle back. A caller passes its own richer objects and TypeScript checks them against
 * these, so the fields are still checked; what is not imported is the file that opens a database.
 */

/** The five answers to "can this review be sent". A total list, so a sixth cannot fall through. */
export const READINESS = ['collecting', 'nowhereToSend', 'readyToSend', 'alreadyGone', 'ended'] as const
export type Readiness = (typeof READINESS)[number]

/**
 * WHETHER A REVIEW CAN BE SENT, COMPUTED AT READ FROM FOUR STORED FACTS.
 *
 * ---------------------------------------------------------------------------------------
 * WHY IT IS COMPUTED AND NOT STORED, WHICH IS THE WHOLE POINT OF THE SHAPE
 * ---------------------------------------------------------------------------------------
 *
 * A stored "ready" flag is a sixth place where the same thing is written down, and this repository
 * has now measured that defect four times: `annotation.data.state` said a comment had gone out
 * while `agent_messages` said it had not; `reviews.state` said `sent` while a comment was still
 * held back. A word about several other words is only ever right by accident, because each of
 * those words moves on its own.
 *
 * SO IT IS DERIVED, AND THE FOUR FACTS IT WAS DERIVED FROM COME BACK WITH IT. A screen drawing the
 * answer can say which of the four is in the way, and a person who disagrees with the answer can
 * see the inputs rather than argue with a word.
 *
 *   1. `reviews.state`     — collecting, collected, organised, sent or abandoned.
 *   2. `reviews.frozen`    — whether the membership has been written down. NULL and `[]` differ.
 *   3. `annotation.chosenRecipient` on each member — where each comment is to go, or nothing.
 *   4. `agent_messages.state` on each member — where each comment has already got to.
 *
 * ---------------------------------------------------------------------------------------
 * THE FIVE ANSWERS
 * ---------------------------------------------------------------------------------------
 *
 *   collecting     — it is still collecting. Finish collecting first; nothing is sent by accident.
 *   nowhereToSend  — collecting has finished and some comment has no recipient. Naming HOW MANY is
 *                    the difference between a person knowing what to do and a person guessing.
 *   readyToSend    — collecting has finished, every comment has somewhere to go, and something in
 *                    it has not gone yet.
 *   alreadyGone    — every comment in it has gone to somebody. A second send would say it twice.
 *   ended          — it was abandoned. Nothing more goes from it, and the comments are untouched.
 */
/** As much of a review as this reads. See the header for why it is not `ReviewView`. */
export interface ReviewLikeThis {
  state: string
  membershipFrozen: boolean
}

/** As much of one member as this reads. A member that is not there reads `found: false` and no more. */
export interface MemberLikeThis {
  found: boolean
  /** Where this comment has got to, when it is there to ask. */
  state?: string
  /** Where somebody chose it to go, and whether a send could act on that. */
  chosen?: { canSend: boolean } | null
}

export interface ReviewReadiness {
  word: Readiness
  /** One sentence a person reads, naming the number that is in the way where one is. */
  says: string
  /** The four stored facts, so a screen can say which one is in the way. */
  from: {
    state: string
    membershipFrozen: boolean
    /** Members with no recipient chosen and nothing routable — the ones that stop a send. */
    withNowhereToGo: number
    /** Members whose words have already gone to somebody. */
    alreadyGone: number
    /** How many members there are at all. */
    members: number
  }
}

/**
 * The answer, from a review and its members. Never throws, and never asks the database again: every
 * one of the four facts is already on what it is handed.
 */
export function readinessOf(
  review: ReviewLikeThis,
  members: readonly MemberLikeThis[],
): ReviewReadiness {
  const found = members.filter((one) => one.found)
  // FACT 4. `queued` is the only one of the six that means nobody has been given it, and every
  // reader of a member's state asks that rather than whether the word is exactly `sent`.
  const alreadyGone = found.filter((one) => one.state !== 'queued').length
  // FACT 3. A comment with no chosen recipient AND nothing routable from its words has nowhere to
  // go. `chosen.canSend` is `readDelivery`'s own answer, the one the send obeys, so this cannot
  // come to disagree with what a send would do.
  const withNowhereToGo = found.filter((one) => one.chosen === null || one.chosen === undefined || !one.chosen.canSend).length
  const from = {
    state: review.state,
    membershipFrozen: review.membershipFrozen,
    withNowhereToGo,
    alreadyGone,
    members: members.length,
  }

  if (review.state === 'abandoned') {
    return {
      word: 'ended',
      says: 'This review was ended. Nothing more goes from it, and every comment in it is exactly as it was.',
      from,
    }
  }
  if (review.state === 'collecting') {
    return {
      word: 'collecting',
      says:
        `Still collecting. ${String(members.length)} comment${members.length === 1 ? '' : 's'} so far. Finish ` +
        `collecting to write down what is in it; nothing is sent by that.`,
      from,
    }
  }
  if (found.length > 0 && alreadyGone === found.length) {
    return {
      word: 'alreadyGone',
      says: `Every comment in this review has gone to somebody. Sending it again would say the same thing twice.`,
      from,
    }
  }
  if (withNowhereToGo > 0) {
    return {
      word: 'nowhereToSend',
      says:
        `${String(withNowhereToGo)} comment${withNowhereToGo === 1 ? ' has' : 's have'} nowhere to go, so nothing ` +
        `can be sent yet. Choose an agent for ${withNowhereToGo === 1 ? 'it' : 'each of them'}.`,
      from,
    }
  }
  return {
    word: 'readyToSend',
    says:
      `${String(found.length - alreadyGone)} comment${found.length - alreadyGone === 1 ? '' : 's'} ready to go, ` +
      `each to the agent chosen for it. Nothing has been sent.`,
    from,
  }
}
