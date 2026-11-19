// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A FLOW THAT IS RETIRED, NOT REPLACED. Wave 13p round 40b. Some old flows were not replaced by another flow: what they
 * did became something else, such as a line in a brief. A supersedes link cannot say that, because it needs a flow at
 * its other end. So a flow may carry `retired`, and the Flows page folds it with the replaced flows.
 *
 * A flow's `retired` holds:
 *   - `why`: why the flow is no longer followed, in words;
 *   - `at`: the day it was retired, YYYY-MM-DD;
 *   - `by`: who retired it, in words;
 *   - what took its place: either `record`, the id of a record the office has, or `file` and `line`.
 *
 * The office checks that a record named is there. It does not check that a file named is there, because the file may
 * be outside the office's checkout.
 *
 * The server checks it on every write with `whyTheRetiredMarkIsUnreadable`.
 */

export interface FlowRetired {
  why: string
  at: string
  by: string
  record?: string
  file?: string
  line?: number
}

/** The keys `retired` holds. Any other is refused, so a misspelt one is not read as left out. */
const KEYS = ['why', 'at', 'by', 'record', 'file', 'line']

/** The longest `why` the office stores; the page draws it whole in the folded row. */
export const RETIRED_WHY_MOST = 300

const A_DAY = /^\d{4}-\d{2}-\d{2}$/

const words = (value: unknown): value is string => typeof value === 'string' && value.trim() !== ''

/** Whether a YYYY-MM-DD names a real day, so 2026-02-30 is refused. */
function aRealDay(value: string): boolean {
  if (!A_DAY.test(value)) return false
  const [year, month, day] = value.split('-').map(Number) as [number, number, number]
  const date = new Date(Date.UTC(year, month - 1, day))
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
}

/**
 * THE SENTENCE A WRITE OF `retired` IS REFUSED WITH, or null when the office can store it. `undefined` is a flow that
 * is not retired, which is not refused.
 */
export function whyTheRetiredMarkIsUnreadable(value: unknown, office: { recordIsThere: (id: string) => boolean }): string | null {
  if (value === undefined) return null
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return 'retired must be an object: {why, at, by, and record, or file and line}.'
  const held = value as Record<string, unknown>
  const strange = Object.keys(held).filter((key) => !KEYS.includes(key))
  if (strange.length > 0) return `retired holds only ${KEYS.join(', ')}; it does not hold ${strange.join(', ')}.`
  if (!words(held['why'])) return 'retired.why says in words why the flow is no longer followed.'
  if ((held['why'] as string).length > RETIRED_WHY_MOST) return `retired.why is at most ${RETIRED_WHY_MOST} characters.`
  if (typeof held['at'] !== 'string' || !aRealDay(held['at'])) return 'retired.at is the day it was retired, as YYYY-MM-DD.'
  if (!words(held['by'])) return 'retired.by says who retired it.'
  const record = held['record']
  const file = held['file']
  const line = held['line']
  if (record !== undefined && (file !== undefined || line !== undefined)) return 'retired names what took its place once: a record, or a file and a line, not both.'
  if (record !== undefined) {
    if (typeof record !== 'string' || !office.recordIsThere(record)) return `retired.record names a record the office has; "${String(record)}" is not one.`
    return null
  }
  if (!words(file) || line === undefined) return 'retired names what took its place: a record id in record, or a file in file and a line in line.'
  if (typeof line !== 'number' || !Number.isInteger(line) || line < 1) return 'retired.line is a line number, 1 or more.'
  return null
}
