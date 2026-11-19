// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE PROJECT'S PROGRESS, READ FROM ITS POINTS AND ITS BRIEFS. Wave 13s round 235, from the design report of round 234.
 *
 * NOTHING HERE IS STORED. A point is a `backlog_item` record and its state is in that record's own `data.state`; a
 * brief is a task whose `package` names a parent, so its state is read from the package's append-only lists by
 * `packageStateOf` in ./delegation.ts. This file declares the answer the server counts and the page draws, once, so
 * the two cannot describe one reading differently.
 *
 * A POINT WITH NO STATE IS A GAP AND NOT `todo`. The four states are the ones ./backlog.ts declares; a point whose
 * stored state is missing, or is a word none of the four, is counted in `noState` and in no other bucket. Counting it
 * as `todo` would put work into the queue that nobody placed there.
 *
 * THE BRIEF IS THE INSIDE DELEGATION: a task packaged with a parent, its lines and its points. A package for outside
 * work is not a brief and is not counted here, and the card says so in words.
 */

import { BACKLOG_ITEM_STATES } from './backlog.ts'

/** The four words a point's state may be. Re-exported here so a page imports one list and not two. */
export const PROGRESS_POINT_STATES = BACKLOG_ITEM_STATES

/** How many points stand in each place, plus the two gaps and the one count that asks somebody to act. */
export interface ProjectProgressPointCounts {
  total: number
  todo: number
  doing: number
  done: number
  dropped: number
  /** A point whose stored state is missing or is not one of the four: a gap, never `todo`. */
  noState: number
  /** Points that name no brief: no `briefId` that is a non-empty string. */
  inNoBrief: number
  /** Points carried through three or more briefs while neither done nor dropped. */
  carriedThreeBriefs: number
}

/** How many briefs stand in each place, read from the inside packages' append-only lists. */
export interface ProjectProgressBriefCounts {
  total: number
  /** Packaged inside and not yet taken: what is waiting for a supervisor. */
  waiting: number
  taken: number
  aligned: number
  handedBack: number
  /** The maker sent points back to the taker, who must hand them back again. */
  returned: number
  /** Every point of the package was accepted by its maker or the person. */
  done: number
  /** The latest check on the brief refused its hand-back: somebody must hand it back again. */
  checkedRefused: number
}

/** The whole answer: one project's points and briefs, counted and never stored. */
export interface ProjectProgress {
  /** The line the answer was narrowed to, or null for every line in the project. */
  line: string | null
  points: ProjectProgressPointCounts
  briefs: ProjectProgressBriefCounts
  /** Briefs whose `package` key is there but cannot be read, named rather than dropped. */
  couldNotRead: { recordId: string; title: string; because: string }[]
  /** One sentence saying what was counted; a reading, never a stored value. */
  says: string
}
