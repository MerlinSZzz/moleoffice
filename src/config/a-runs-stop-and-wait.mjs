// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A RUN'S STOP CAUSE AND ITS MARK OF WAITING ON A LIMIT, WHEREVER THE RUN KEEPS THEM (round 49).
 *
 * Both are session fields, `stopCause` and `waitingOnALimit`, and the writers write only the fields. A run filed before
 * round 49 holds them at `extra.stopCause` and `extra.waitingOnALimit`, and nothing rewrites it. So every reader takes
 * the field, and the old copy only when the run has no field, through the functions and the SQL below. The SQL reads
 * the table's own `data` column.
 *
 * WHY THIS IS A FILE OF ITS OWN (round 50). The run's page draws both fields in words, so the browser reads them too.
 * src/config/stopped-run-cause.mjs reads transcripts from disk and imports node:fs, which the browser cannot load. So
 * the readers are here, where the server, the tools and the page can all import them, and stopped-run-cause.mjs hands
 * them on to its own importers unchanged.
 */
export const STOP_CAUSE_KIND_IN_SQL =
  "coalesce(json_extract(data, '$.stopCause.kind'), json_extract(data, '$.extra.stopCause.kind'))"

/** Whether a run holds a mark of waiting on a limit, in the field or in the old copy, as SQL. */
export const WAITS_ON_A_LIMIT_IN_SQL =
  "(json_type(data, '$.waitingOnALimit') = 'object' OR json_type(data, '$.extra.waitingOnALimit') = 'object')"

/**
 * The run's stop cause, or null because it holds none.
 *
 * @param {Record<string, unknown>} data
 * @returns {Record<string, unknown> | null}
 */
export function theStopCauseOf(data) {
  return theFieldOrItsOldCopy(data, 'stopCause')
}

/**
 * The run's mark of waiting on a limit, or null because it holds none.
 *
 * @param {Record<string, unknown>} data
 * @returns {Record<string, unknown> | null}
 */
export function theWaitOnALimitOf(data) {
  return theFieldOrItsOldCopy(data, 'waitingOnALimit')
}

/**
 * @param {Record<string, unknown>} data
 * @param {'stopCause' | 'waitingOnALimit'} key
 * @returns {Record<string, unknown> | null}
 */
function theFieldOrItsOldCopy(data, key) {
  const anObject = (value) => (value !== null && typeof value === 'object' && !Array.isArray(value) ? value : null)
  return anObject(data[key]) ?? anObject(anObject(data['extra'])?.[key]) ?? null
}
