// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE SESSIONS BLOCK ON HOME, REDUCED TO ONE LINE — and the counting that line is drawn from.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT WAS THERE, MEASURED
 * ---------------------------------------------------------------------------------------
 *
 * At 1440 on 2026-08-13 the sessions block on Home was 928 pixels tall. It held transcript
 * excerpts, a `NOT FILED` mark on each unfiled run, a six-way state tally, a five-line breakdown of
 * where the server had looked, the moment of its own reading and a "Read again" button. Every one
 * of those is right — on `#/sessions`, which is the page whose question is "what are the agents
 * doing". Home's question is "what needs me now", and it had a compressed copy of another page
 * taking a third of its height to answer it.
 *
 * So Home keeps the counts and nothing else: how many are running, how many crashed, how many were
 * orphaned, and how many processes are still held. Each links into `#/sessions`, where every one of
 * those numbers opens into the rows behind it.
 *
 * ---------------------------------------------------------------------------------------
 * THE THREE THINGS THIS COUNTING MAY NOT DO
 * ---------------------------------------------------------------------------------------
 *
 * 1. NEVER DRAW A ZERO IT DID NOT COUNT. `unclaimed` is null when the reply carried no sweep at
 *    all, and null is not "nothing unclaimed" — see `UnclaimedRead` in SessionPanel.tsx. It is
 *    reported as "not swept", which is a different sentence and a different fact.
 * 2. NEVER LET A STATE VANISH. Any state with a non-zero count is named, including `unknown`, which
 *    is the honest answer for a run Mole Office cannot classify.
 * 3. NEVER IMPLY A CLEAN MACHINE FROM AN EMPTY LIST. Zero of everything says so in words, with the
 *    total that was read beside it, so "nothing is wrong" is told apart from "nothing was read".
 */

import { SESSION_STATES, type SessionState } from '@shared/types.ts'

/** One count in the line: the number, the word, and nothing else. */
export interface SessionCount {
  state: SessionState
  count: number
}

export interface SessionsLineRead {
  /** How many session rows the reading held, in total. The anchor every other count is part of. */
  total: number
  /**
   * The states worth naming on Home, in reading order, with their exact counts. Non-zero only.
   *
   * FOUR OF THE SIX, and the cut is what makes this a line rather than the six-way tally it
   * replaced: a crashed run, an orphaned one and one Mole Office cannot classify are things to go and
   * look at, and a running one is the answer to "what is alive". `idle` and `finished` are not
   * things to do — they are counted in `quiet` below and named there, so nothing vanishes.
   */
  counts: SessionCount[]
  /**
   * The runs in a state this line does not name, and how many of each. Never dropped: the line
   * says "and 20 more, idle or finished" rather than letting the total stop adding up.
   */
  quiet: SessionCount[]
  /**
   * Processes the resource ledger still holds — an orphan is a ledger row whose session has ended.
   * Always a number: the orphan list is served whenever the sessions page data is.
   */
  held: number
  /**
   * What is running that no session claims, or NULL when the reply carried no sweep.
   *
   * Null is NOT zero. It means this reading does not answer that question, and the line says so
   * rather than printing a clean bill nobody established.
   */
  unclaimed: number | null
}

/**
 * The states this line NAMES, in the order it names them: what wants a person, then what is alive.
 *
 * Written down rather than taken from `SESSION_STATES`, because that list is the schema's order and
 * this is a reading order — a line that opened with "18 finished" would put the answer nobody needs
 * first, which is what the six-way tally on the old block did.
 */
export const SESSION_LINE_ORDER: readonly SessionState[] = ['crashed', 'orphaned', 'paused', 'unknown', 'running']

/**
 * The states this line counts but does not name individually. There is nothing to DO about either.
 *
 * They are still reported — as "and N more, idle or finished" — because a total that does not add
 * up to the counts beside it is a number a reader cannot check, and this product's whole argument
 * is that a reader can check every number on the screen.
 */
export const SESSION_QUIET_ORDER: readonly SessionState[] = ['idle', 'finished']

/**
 * Count one reading of the machine. Pure: same lines in, same numbers out, every time.
 *
 * A state the reading holds that is not in `SESSION_READING_ORDER` would be dropped silently, which
 * is exactly the kind of quiet loss this product is against — so the order is checked against the
 * schema's own list at module load, below, and a mismatch throws rather than shortening the line.
 */
export function readSessionsLine(
  lines: readonly { state: SessionState }[],
  held: number,
  unclaimed: number | null,
): SessionsLineRead {
  const tally = new Map<SessionState, number>()
  for (const line of lines) tally.set(line.state, (tally.get(line.state) ?? 0) + 1)
  const pick = (order: readonly SessionState[]): SessionCount[] =>
    order.filter((state) => (tally.get(state) ?? 0) > 0).map((state) => ({ state, count: tally.get(state) ?? 0 }))
  return { total: lines.length, counts: pick(SESSION_LINE_ORDER), quiet: pick(SESSION_QUIET_ORDER), held, unclaimed }
}

/**
 * THE GUARD AGAINST THIS FILE AND THE SCHEMA DRIFTING APART.
 *
 * The two orders above must between them name every word in `SESSION_STATES`. If a new state is
 * ever added to the schema (`paused` was the seventh, for criterion W6), a line that has never heard of it would count every run in that state
 * into neither list and drop it out of Home with nothing failing — this repository's recurring
 * defect, in the one place where the symptom would be a smaller number rather than an error.
 *
 * So it fails at import, loudly, rather than at a glance six months later.
 */
const named: readonly SessionState[] = [...SESSION_LINE_ORDER, ...SESSION_QUIET_ORDER]
const missing = SESSION_STATES.filter((state) => !named.includes(state))
if (missing.length > 0) {
  throw new Error(
    `src/web/components/home/sessions-line.ts names neither ${missing.join(', ')} on Home's session line nor in ` +
      'the quiet group, so runs in those states would be counted and then dropped. Add them to one of the two orders.',
  )
}
