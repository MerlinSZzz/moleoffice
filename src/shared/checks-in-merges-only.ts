// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE LIMITS ON CHECKS THE MESSAGE WORKER STARTS IN MERGES-ONLY MODE. Wave 13j round loop-1, from the round's brief: a
 * further check only while the one-minute load is under 16 and at least 24 GiB of memory is free; the first check always
 * starts. Here, with no Node import, so the worker and the office's door read one set of numbers.
 *
 * HOW MANY RUN AT ONCE IS AN OFFICE SETTING (wave 13j round 14), read and written in
 * src/server/lib/checks-in-merges-only.ts. The worker is handed it in the switch's reading. When nobody has set it, it is
 * 2: engineering pacing under the owner's "stay close to the 5-hour line and don't stop", not a number the owner set.
 *
 * WHEN A CHECK'S LOGIN ANSWERS THAT ITS 5-HOUR LIMIT IS HIT, new checks on that login wait until the reset its words name
 * (wave 13j). The reset is read here; the hold is read in src/server/lib/checks-in-merges-only.ts.
 */
import { parseCastingReset } from './casting-roll.ts'

export const CHECKS_AT_ONCE_BY_DEFAULT = 2
/**
 * THE BOUNDS ON HOW MANY RUN AT ONCE (wave 13q item 17: a small whole number with bounds). This machine has 93 GiB of
 * memory, and a further check needs 24 GiB free, so about 4 can run at once here. The top bound is 8, so that a typing
 * slip such as 30 is refused rather than taken.
 */
export const CHECKS_AT_ONCE_BOUNDS = Object.freeze({ fewest: 1, most: 8 })
export const LOAD_UNDER = 16
export const FREE_GIB_AT_LEAST = 24
const GIB = 1024 ** 3

/** What the worker reads before it starts a check. `freeBytes` is null when it could not read the free memory. */
export interface TheMachineNow {
  checksRunning: number
  loadOneMinute: number | null
  freeBytes: number | null
}

/**
 * WHY A FURTHER CHECK MAY NOT START NOW, or null when it may. The first check always starts. A further one needs every
 * number read: a load or a free memory the worker could not read refuses it, because a guess would start a check on a
 * machine nobody measured.
 */
export function whyNoFurtherCheckNow(now: TheMachineNow, checksAtOnce: number): string | null {
  if (now.checksRunning === 0) return null
  if (now.checksRunning >= checksAtOnce) return `${String(now.checksRunning)} checks are running, and at most ${String(checksAtOnce)} run at once.`
  if (now.loadOneMinute === null) return 'The one-minute load could not be read, so no further check starts.'
  if (now.loadOneMinute >= LOAD_UNDER) return `The one-minute load is ${now.loadOneMinute.toFixed(2)}, and a further check starts only under ${String(LOAD_UNDER)}.`
  if (now.freeBytes === null) return 'The free memory could not be read, so no further check starts.'
  if (now.freeBytes < FREE_GIB_AT_LEAST * GIB) {
    return `${(now.freeBytes / GIB).toFixed(1)} GiB of memory is free, and a further check starts only with at least ${String(FREE_GIB_AT_LEAST)} GiB free.`
  }
  return null
}

/** The free memory in bytes from the text of /proc/meminfo (its MemAvailable line), or null when the line is not there. */
export function theFreeBytesIn(meminfo: string): number | null {
  const line = /^MemAvailable:\s+(\d+)\s+kB$/mu.exec(meminfo)
  return line === null ? null : Number(line[1]) * 1024
}

/** What the control says, in English, for its door and its switch, with the number of checks at once in force. */
export function whatOnMeans(checksAtOnce: number): string {
  return (
    `in merges-only mode the message worker also starts the checks the office asks for, and no other run for a message: at most ${String(checksAtOnce)} at once, ` +
    `a further one only while the one-minute load is under ${String(LOAD_UNDER)} and at least ${String(FREE_GIB_AT_LEAST)} GiB of memory is free, and the first one always`
  )
}

/** A 5-hour limit resets at most five hours after it is hit, and a minute more for the minute Claude's words round to. */
export const A_FIVE_HOUR_LIMIT_RESETS_WITHIN_MS = (5 * 60 + 1) * 60_000

/**
 * WHEN A 5-HOUR LIMIT RESETS, from the reset its words name and the moment it was hit, or why that cannot be told.
 *
 * Claude Code names a clock time and its zone, `7:10pm (Europe/London)`, and no date. The reset is the next time that
 * clock time comes after the limit was hit. A 5-hour limit resets within five hours, so a next coming further off than
 * that means the words are not about the day this reading would pick: which day the reset falls on cannot be told, and
 * no time is given. Nor is one when the words name none, or one that cannot be read, or the limit's moment is unknown.
 */
export function theResetOfAFiveHourLimit(
  resetsAt: string | null,
  atMs: number | null,
  officeZone: string,
): { until: number; zone: string } | { cannot: string } {
  if (resetsAt === null || resetsAt.trim() === '') return { cannot: 'its words named no reset time' }
  if (atMs === null || !Number.isFinite(atMs)) return { cannot: 'nothing recorded when the limit was hit, so the day of its reset cannot be told' }
  const read = parseCastingReset(resetsAt, atMs, officeZone)
  if (read === null) return { cannot: `its reset time "${resetsAt}" could not be read` }
  if (read.until - atMs > A_FIVE_HOUR_LIMIT_RESETS_WITHIN_MS) {
    return {
      cannot:
        `its reset time "${resetsAt}" names no date, and the next time it comes is more than five hours after the limit was hit, ` +
        'longer than a 5-hour limit lasts, so which day the reset falls on cannot be told',
    }
  }
  return { until: read.until, zone: read.zone }
}
