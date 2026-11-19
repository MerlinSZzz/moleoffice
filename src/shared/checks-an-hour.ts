// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * AT MOST SIX CHECKS AN HOUR IN ONE LANE, by the second part of a decision. A further check
 * waits its turn, says why, and is never refused. The answer on the decision record: the cap counts per lane (one
 * repository row per project), is a setting, and only paces, with one sentence to the secretary.
 *
 * The office reads the pace of each check on the worker's queue (src/server/lib/checks-an-hour.ts), and the worker adds the
 * checks it has started in the same pass. Both say the one sentence below, so the held row and the secretary's message
 * cannot say different things. Here, with no Node import, so the worker and the server read one function.
 */

/** The setting that holds the number, named in every sentence that comes from it. */
export const CHECKS_AN_HOUR_SETTING = 'MOLE_OFFICE_CHECKS_AN_HOUR'

/**
 * THE PACE OF ONE CHECK, as the office read it for the worker's queue row:
 * - `lane`, `started` and `most`: the checks started in the lane in the last hour, and the most that may start there;
 * - `notPaced`: why no lane can be told for the check's run, so the cap does not hold it;
 * - `cannotPace`: why the setting cannot be used, so the check is held until it can.
 */
export type ThePaceOfACheck =
  | { readonly lane: string; readonly started: number; readonly most: number }
  | { readonly notPaced: string }
  | { readonly cannotPace: string }

/**
 * WHY A CHECK WAITS ITS TURN, or null because it may start. `startedThisPass` is how many checks the worker has started in
 * the same lane since it read the queue, which the office's count could not hold yet.
 */
export function whyACheckWaitsItsTurn(pace: ThePaceOfACheck, startedThisPass: number): string | null {
  if ('cannotPace' in pace) return pace.cannotPace
  if ('notPaced' in pace) return null
  const started = pace.started + startedThisPass
  if (started < pace.most) return null
  return (
    `The check waits its turn: ${String(started)} ${started === 1 ? 'check has' : 'checks have'} started in the lane ${pace.lane} in the last hour, ` +
    `and at most ${String(pace.most)} ${pace.most === 1 ? 'starts' : 'start'} in one lane in an hour (setting ${CHECKS_AN_HOUR_SETTING}). ` +
    `It is not refused, and it starts by itself once fewer than ${String(pace.most)} have started there in the hour before.`
  )
}
