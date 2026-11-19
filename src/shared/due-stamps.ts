// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHEN A DUE STAMP RUNS OUT, in a module both the server and the screens can import.
 *
 * `parseDueStamp` lived in src/web/lib/attention.ts and the server imported it from there, which
 * made src/server/lib depend on src/web. It is a pure reading of a stamp, it is used by both, and
 * moving it here removes that direction of the import cycle without changing what it answers.
 */
import { isBareDateStamp, parseLocalStamp } from './time.ts'

/**
 * The same, for a due date: a bare "2026-08-03" is due at the END of the 3rd.
 *
 * `readDueStamp` below says whether the stamp was a date or a moment, for the sentence a screen
 * writes. This function answers only the millisecond, because the server asks only that.
 */
export function parseDueStamp(stamp: string): number | null {
  const ms = parseLocalStamp(stamp)
  if (ms === null || !isBareDateStamp(stamp)) return ms
  // ONE SECOND BEFORE THE NEXT DATE BEGINS, worked out on the calendar and not by adding 24 hours: the day of a clock
  // change has 23 or 25 hours, and 24 hours on from its start is not its end (problem R74WVeH6LZPU).
  const start = new Date(ms)
  return new Date(start.getFullYear(), start.getMonth(), start.getDate() + 1).getTime() - 1000
}
