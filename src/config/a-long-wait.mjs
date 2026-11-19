// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
// @ts-check
/**
 * WHEN A RUN'S WAIT ON A USAGE LIMIT IS LONG, worked out here once for the launcher and for the lists.
 *
 * The launcher marks every retry OpenCode reports as a wait on a limit, from a retry of seconds to a wait of days, and
 * the mark keeps OpenCode's next try as `nextTryAt`. A wait is long when its next try is more than an hour after the
 * retry was seen. On a long wait the launcher tells the run's starter once (src/config/launcher-notices.mjs). The lists
 * that draw a run's state draw such a run as waiting on a usage limit until its next try, and the stored state stays
 * `running`. A retry of seconds is drawn as running, as before.
 *
 * THE RESET IS NOT READ HERE. A retry that names no reset has one assumed five hours away, and `resetFrom` says so, so
 * by its reset a retry of seconds would look long. A mark written before it kept `nextTryAt` is not a long wait here,
 * because nothing on it says when the next try is.
 *
 * WHY THIS IS A FILE OF ITS OWN. The browser reads it too. src/config/launcher-notices.mjs imports
 * src/config/stopped-run-cause.mjs, which imports node:fs, and the browser cannot load that.
 */

import { theWaitOnALimitOf } from './a-runs-stop-and-wait.mjs'

const HOUR_MS = 60 * 60 * 1000

/**
 * A LONG WAIT ON A USAGE LIMIT (after five runs slept 12 hours on a next try days away while the office listed
 * them as running). A next try more than an hour away tells the run's starter and the usage-notice secretary once. The
 * office refuses a next try an hour away or less, or in the past. A next try more than 32 days away is told without its
 * time: no limit Go names lasts longer than a month, so such a time is no reset.
 */
export const A_LONG_WAIT = Object.freeze({ moreThanMs: HOUR_MS, atMostMs: 32 * 24 * HOUR_MS, atMostDays: 32 })

/**
 * Whether a wait whose retry was seen at `seenAtMs` and whose next try is at `nextTryAtMs` is long.
 *
 * @param {number} seenAtMs
 * @param {number | null} nextTryAtMs null when the retry named no next try
 */
export function aWaitIsLong(seenAtMs, nextTryAtMs) {
  return nextTryAtMs !== null && nextTryAtMs - seenAtMs > A_LONG_WAIT.moreThanMs
}

/**
 * The next try of the long wait a run holds now, as its mark stores it, or null because the run holds none: it is not
 * `running`, it holds no mark, its mark names no next try or no time it was seen, or its next try is soon.
 *
 * @param {Record<string, unknown>} data the run's `data`
 * @returns {string | null}
 */
export function theNextTryOfALongWait(data) {
  if (data['state'] !== 'running') return null
  const mark = theWaitOnALimitOf(data)
  if (mark === null) return null
  const nextTryAt = mark['nextTryAt']
  const seenAt = mark['seenAt']
  if (typeof nextTryAt !== 'string' || typeof seenAt !== 'string') return null
  const nextTryAtMs = Date.parse(nextTryAt)
  const seenAtMs = Date.parse(seenAt)
  if (Number.isNaN(nextTryAtMs) || Number.isNaN(seenAtMs)) return null
  return aWaitIsLong(seenAtMs, nextTryAtMs) ? nextTryAt : null
}
