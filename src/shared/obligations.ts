// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * AN OBLIGATION THAT REPEATS: HOW IT MAY REPEAT, AND WHEN THE NEXT DAY'S IS DUE. KIND_SPECS.obligation in ./kinds.ts
 * holds the fields; src/server/lib/daily-obligations.ts writes the next day's obligation.
 *
 * Item 38 of wave 13s's requirements: a report owed every day at 06:30 was
 * a new obligation filed by hand each day.
 *
 * NOTHING HERE TOUCHES THE DATABASE, because the browser imports it.
 */

import { STAMP_GRAMMAR } from './time.ts'

/**
 * HOW AN OBLIGATION MAY REPEAT: every day at the time it is due. Each day is its own obligation, as each day of a daily
 * booking is its own booking, so each day's is fulfilled, late or cancelled on its own.
 */
export const OBLIGATION_REPEATS = ['daily'] as const
export type ObligationRepeat = (typeof OBLIGATION_REPEATS)[number]

const A_DUE_DATE = new RegExp(`^${STAMP_GRAMMAR}$`)

/**
 * THE NEXT DAY'S DUE: the same time, written the same way, on the day after this one's due. "2026-10-29 06:30" gives
 * "2026-10-30 06:30" and "2026-10-31" gives "2026-11-01". Null when the due is not a date.
 *
 * IT COUNTS FROM THE DUE AND NOT FROM NOW. A day fulfilled late still owes the day after it, so a report sent a day
 * late leaves the next one already late rather than skipping a day nobody said was not owed.
 */
export function theNextDaysDue(due: string): string | null {
  const m = A_DUE_DATE.exec(due.trim())
  if (!m) return null
  const [, y, mo, d] = m
  const next = new Date(Date.UTC(Number(y), Number(mo) - 1, Number(d) + 1))
  const day = [next.getUTCFullYear(), next.getUTCMonth() + 1, next.getUTCDate()].map((n, i) => String(n).padStart(i === 0 ? 4 : 2, '0')).join('-')
  return day + due.trim().slice(10)
}
