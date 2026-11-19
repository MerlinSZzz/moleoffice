// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHAT A REVIEW WROTE DOWN WHEN COLLECTING FINISHED, AND THE ONE PLACE IT IS READ BACK.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS IN HERE
 * ---------------------------------------------------------------------------------------
 *
 * The `reviews.frozen` column holds one string, and this file is the only thing that writes it or
 * reads it. It holds three lists:
 *
 *   · the comments the review CONTAINED, which is what "this review contained these" means,
 *   · why each comment outside it was LEFT OUT, in the words of the rule as it stood at that moment, and
 *   · the comments the person TOOK OUT of what the review waits for, by a press on the review pane.
 *
 * The third list is written after collecting finished, by `takeOutOfTheReview` in lib/reviews.ts, and it
 * changes nothing in the first: a comment taken out is still a comment the review contained.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THE SECOND LIST EXISTS
 * ---------------------------------------------------------------------------------------
 *
 * Measured on 20 August 2026: while a review was collecting, two comments were listed as not in it
 * with the reason `Earlier`; after `Finish collecting` the same two read `Not known`. Mole Office knew
 * why and then stopped knowing.
 *
 * Working the reason out again afterwards is not the fix and would be a worse fault. A comment is
 * outside a review's scope because of where its record sat at the time, and records move. Running
 * the collecting rule over today's world and calling the answer a fact about last Tuesday is the
 * silent substitution invariant 2 of USER.md forbids. So the reason is written down at the one moment
 * it is still true, and read back afterwards.
 *
 * ---------------------------------------------------------------------------------------
 * TWO STORED SHAPES, AND WHY BOTH ARE READ
 * ---------------------------------------------------------------------------------------
 *
 * A review frozen before this was built stored a bare array of members. It is read as members with
 * `leftOut` NULL, which means nobody wrote down why anybody was left out — and that is exactly what
 * happened. NULL is not an empty list: an empty list says the review was frozen with nothing
 * outside it. Those older rows go on drawing `Not known`, which is the true answer for them, and no
 * migration rewrites them into a reason nobody recorded.
 *
 * A ROW WITH NO `takenOut` IS READ AS AN EMPTY LIST, and that one is not a guess. Nothing takes a
 * comment out except the press, the press writes the list, and a row written before the press
 * existed is a review nobody took anything out of.
 *
 * ---------------------------------------------------------------------------------------
 * ONE PARSER, BECAUSE THERE USED TO BE TWO
 * ---------------------------------------------------------------------------------------
 *
 * lib/reviews.ts parsed this column, and lib/records.ts parsed it again to refuse a rewrite of a
 * comment inside a frozen review. Two readers of one stored shape is the defect CLAUDE.md names as
 * this repository's own, and lib/records.ts says so in its own comment: the second reader treats
 * anything that is not an array as holding nothing, so changing the shape would have turned that
 * refusal off with nothing failing. Both now call `readFrozen` here. This file imports neither of
 * them, so there is no import cycle.
 *
 * IT ANSWERS `unreadable` RATHER THAN THROWING. The two callers say different true things about a
 * membership they cannot read, and each says its own.
 */

/** Where one comment's words are stored. Two stores, one shape — see `membersOf` in reviews.ts. */
export type MemberSource = 'annotation' | 'conversation'

/**
 * WHICH CLAUSE OF THE MEMBERSHIP RULE LEFT A COMMENT OUT. One name per mechanism, closed.
 *
 * These are the branches of `membersOf` in lib/reviews.ts, in the order that function applies them,
 * plus the two a frozen review needs. They are the MECHANISM, not the word a person reads:
 * `reasonToDraw` turns a clause into one of the seven words, and it is the only place that decision
 * is made.
 *
 * WHY THE MECHANISM IS SERVED AS WELL AS THE WORD. Two clauses draw the same word — nobody recorded
 * who wrote it, and it does not read as a comment both draw `Not known` — and they are different
 * findings. Serving only the word would throw the difference away at the one place that can still
 * tell them apart.
 *
 * THEY LIVE HERE BECAUSE A FROZEN REVIEW STORES THEM. A clause is written into the column below and
 * read back out of it, so the list of clauses and the shape of the column are one thing.
 */
export const NOT_IN_IT_CLAUSES = [
  'written-before-it-started',
  'does-not-read-as-a-comment',
  'outside-the-scope',
  'nobody-recorded-who-wrote-it',
  'somebody-else-wrote-it',
  // SENT ON ITS OWN: its writer pressed Send and it went to a contact at once. Such a comment does not
  // enter a review (the owner's first detail, record 9BZZVKQxWV9Z).
  'sent-on-its-own',
  'written-after-collecting-finished',
  'not-in-the-frozen-membership',
] as const

export type NotInItClause = (typeof NOT_IN_IT_CLAUSES)[number]

/** One comment a frozen review was written down as holding. */
export interface FrozenMember {
  source: MemberSource
  id: string
}

/** One comment a frozen review was written down as NOT holding, with the clause that left it out. */
export interface FrozenExclusion {
  /** The comment's own record id. */
  id: string
  clause: NotInItClause
}

/**
 * WHY A COMMENT WAS TAKEN OUT OF WHAT A REVIEW WAITS FOR, one for each press on the review pane:
 * "I answer this myself" on a comment only the person may answer, and "Remove from this review" on a
 * comment that can no longer be found.
 */
export const TAKEN_OUT_BECAUSE = ['the-person-answers-it', 'it-cannot-be-found'] as const

export type TakenOutBecause = (typeof TAKEN_OUT_BECAUSE)[number]

/** One comment taken out of what a review waits for: which, why, who pressed, and when. */
export interface TakenOut {
  /** The comment's own record id. */
  id: string
  because: TakenOutBecause
  /** Who pressed, as `<type>:<id>`, the form a review's `startedBy` is stored in. */
  by: string
  /** When, on the local wall clock. */
  at: string
}

/** What one review wrote down at the moment collecting finished, and what was taken out of it since. */
export interface FrozenMembership {
  members: FrozenMember[]
  /**
   * Why each comment outside it was left out, or NULL because nobody wrote that down.
   *
   * NULL and `[]` are different answers, and the difference is on the screen. NULL is a review
   * frozen before this was built: its excluded rows draw `Not known`. `[]` is a review frozen with
   * nothing outside it at all.
   */
  leftOut: FrozenExclusion[] | null
  /** The comments taken out of what the review waits for, in the order they were taken out. */
  takenOut: TakenOut[]
}

/** A membership that is stored and cannot be read. The two callers say their own sentence about it. */
export const UNREADABLE = 'unreadable'

/**
 * READ WHAT A REVIEW ROW WROTE DOWN.
 *
 * `null` when the review has not been frozen, which is not the same as a review frozen holding
 * nothing. `UNREADABLE` when something is stored and it is not either of the two shapes.
 */
export function readFrozen(stored: string | null): FrozenMembership | null | typeof UNREADABLE {
  if (stored === null) return null
  let parsed: unknown
  try {
    parsed = JSON.parse(stored)
  } catch {
    return UNREADABLE
  }
  // THE SHAPE BEFORE THIS FILE EXISTED: a bare list of members, and nothing about who was left out.
  if (Array.isArray(parsed)) {
    const members = readMembers(parsed)
    return members === UNREADABLE ? UNREADABLE : { members, leftOut: null, takenOut: [] }
  }
  if (typeof parsed !== 'object' || parsed === null) return UNREADABLE
  const held = parsed as Record<string, unknown>
  if (!Array.isArray(held['members'])) return UNREADABLE
  const members = readMembers(held['members'])
  if (members === UNREADABLE) return UNREADABLE
  const takenOut = readTakenOut(held['takenOut'])
  if (takenOut === UNREADABLE) return UNREADABLE
  const written = held['leftOut']
  if (written === null || written === undefined) return { members, leftOut: null, takenOut }
  if (!Array.isArray(written)) return UNREADABLE
  const leftOut: FrozenExclusion[] = []
  for (const one of written) {
    if (typeof one !== 'object' || one === null) return UNREADABLE
    const row = one as Record<string, unknown>
    const id = row['id']
    const clause = row['clause']
    if (typeof id !== 'string' || id === '') return UNREADABLE
    if (typeof clause !== 'string' || !isAClause(clause)) return UNREADABLE
    leftOut.push({ id, clause })
  }
  return { members, leftOut, takenOut }
}

function readTakenOut(written: unknown): TakenOut[] | typeof UNREADABLE {
  if (written === undefined) return []
  if (!Array.isArray(written)) return UNREADABLE
  const takenOut: TakenOut[] = []
  for (const one of written) {
    if (typeof one !== 'object' || one === null) return UNREADABLE
    const row = one as Record<string, unknown>
    const id = row['id']
    const because = row['because']
    const by = row['by']
    const at = row['at']
    if (typeof id !== 'string' || id === '') return UNREADABLE
    if (typeof because !== 'string' || !(TAKEN_OUT_BECAUSE as readonly string[]).includes(because)) return UNREADABLE
    if (typeof by !== 'string' || by === '' || typeof at !== 'string' || at === '') return UNREADABLE
    takenOut.push({ id, because: because as TakenOutBecause, by, at })
  }
  return takenOut
}

function isAClause(word: string): word is NotInItClause {
  return (NOT_IN_IT_CLAUSES as readonly string[]).includes(word)
}

function readMembers(written: readonly unknown[]): FrozenMember[] | typeof UNREADABLE {
  const members: FrozenMember[] = []
  for (const one of written) {
    if (typeof one !== 'object' || one === null) return UNREADABLE
    const row = one as Record<string, unknown>
    const source = row['source']
    const id = row['id']
    if (source !== 'annotation' && source !== 'conversation') return UNREADABLE
    if (typeof id !== 'string' || id === '') return UNREADABLE
    members.push({ source, id })
  }
  return members
}

/** Write one down. The only place the column's text is made. */
export function writeFrozen(membership: FrozenMembership): string {
  return JSON.stringify({ members: membership.members, leftOut: membership.leftOut, takenOut: membership.takenOut })
}
