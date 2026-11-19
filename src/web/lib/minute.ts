// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A MOMENT, TO THE MINUTE, AS HOME SAYS IT. One function, so the foot line and every other time on
 * Home cannot say one moment two ways (problem ejarlQfb3Caz: the panel of agents in no registry
 * printed its times to the second while the rest of Home said them to the minute).
 *
 * Today's moment is the clock alone, "10:51", because the page already says which day it is. A
 * moment on another day carries that day in front, "28 Sept 10:00", because the clock alone would
 * say the wrong day. Seconds are developer mode's, and a caller that wants them shows the stored
 * stamp as it came.
 *
 * The day is written by `dayInThePageLanguage`, so in the test language it is marked as a word is.
 */
import { dayInThePageLanguage } from '@shared/i18n.ts'
import { parseAnyStamp } from '@shared/time.ts'

const two = (n: number) => String(n).padStart(2, '0')

/** A moment on this computer, to the minute: the clock today, and the day and the clock on any other day. */
export function toTheMinute(at: number, now: number = Date.now()): string {
  const when = new Date(at)
  const clock = `${two(when.getHours())}:${two(when.getMinutes())}`
  const today = new Date(now)
  const sameYear = when.getFullYear() === today.getFullYear()
  if (sameYear && when.getMonth() === today.getMonth() && when.getDate() === today.getDate()) return clock
  return `${dayInThePageLanguage(when, !sameYear)} ${clock}`
}

/**
 * A stored stamp, to the minute: the office's own local form ("2026-09-28 10:00:37"), or one that
 * states its own zone ("2026-09-30T10:00:00.000Z", which a check's assembly stores), read as the
 * moment it states. A stamp that cannot be read is returned exactly as it came, so the reader sees
 * what the server sent rather than a guess.
 */
export function stampToTheMinute(stamp: string, now: number = Date.now()): string {
  const at = parseAnyStamp(stamp)
  return at === null ? stamp : toTheMinute(at.getTime(), now)
}
