// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A GOAL: WHAT WOULD BE TRUE WHEN IT IS MET, AT ONE OF FOUR HORIZONS.
 *
 * ---------------------------------------------------------------------------------------
 * THE CRITERION
 * ---------------------------------------------------------------------------------------
 *
 * Criterion P1 of design/planning/ACCEPTANCE.md: the planning module has a short, a medium and a long
 * goal. Decision JN_pkWYtQhd3: the spans are settings, long is within a year, and a fourth horizon,
 * distant, has no time limit and holds aims too broad for a date; a distant goal may be changed and
 * every change is kept as a revision the person can read.
 *
 * A goal is not a `planned_state` and not a `trajectory`. A trajectory is one intended future for
 * one pipeline, module or block, in order, and every part of it is written by hand. A goal is the
 * thing that future is FOR: one sentence saying what would be true when the goal is met, at a
 * horizon, with who owns it and whether it has been met or dropped. Work serves a goal; a goal
 * does not contain the work.
 *
 * ---------------------------------------------------------------------------------------
 * THE FOUR HORIZONS, AND WHY `horizon` IS ALSO THE NAME OF THE TIME GRAIN'S FIELD
 * ---------------------------------------------------------------------------------------
 *
 * A goal's `horizon` is one of short, medium, long and distant. The planning module's stored
 * `horizon` is the time grain a plan is written at — month, week and day. Since 15 September 2026
 * the TypeScript name of the time grain is `Grain` (decided that day), so the code no longer uses
 * one type to mean the two. The stored field names could not move: a goal's data crosses the wire
 * in `data.horizon`, and an allocation's grain crosses it in `horizon`, and both are read by the
 * doors exactly as they were. This file is where the two values live apart.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THE SPANS ARE NOT NUMBERS HERE
 * ---------------------------------------------------------------------------------------
 *
 * The span of short, medium and long is a SETTING the person may change — short within two weeks,
 * medium within two months, long within a year — and distant has no limit at all. The numbers are
 * read from `@shared/goal-spans.ts`, which is the one reader of them, so this file names the four
 * horizons and nothing here restates a default.
 */

/** The kind word, in one place, the way `NOTEBOOK_KIND` and `WORK_DOMAIN_KIND` are. */
export const GOAL_KIND = 'goal'

/**
 * The four horizons, coarse to fine. Short, medium and long have a span in days; distant is the
 * fourth and has none by criterion P1, so nothing here gives it a number.
 */
export const GOAL_HORIZONS = ['short', 'medium', 'long', 'distant'] as const
export type GoalHorizon = (typeof GOAL_HORIZONS)[number]

/** Whether a goal is still open, was met, or was dropped. Each end carries a date and a reason. */
export const GOAL_STATES = ['open', 'met', 'dropped'] as const
export type GoalState = (typeof GOAL_STATES)[number]

/** Whether a goal has reached one of its two ends. */
export function isAGoalEnd(state: GoalState): boolean {
  return state === 'met' || state === 'dropped'
}
