// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
// @ts-check
/**
 * Write a moment in the stored form: local wall clock, no timezone.
 *
 * Takes the moment rather than reading the clock, so that a file's modification time or a
 * process's start time is written in the same format as a change row.
 * @param {Date} when
 * @returns {string}
 */
export function localStamp(when) {
  const pad = (/** @type {number} */ n) => String(n).padStart(2, '0')
  return (
    `${when.getFullYear()}-${pad(when.getMonth() + 1)}-${pad(when.getDate())} ` +
    `${pad(when.getHours())}:${pad(when.getMinutes())}:${pad(when.getSeconds())}`
  )
}

/**
 * A DATE AND A TIME A PERSON TYPED, in the stored form `YYYY-MM-DD HH:MM:SS`, or null when it does not read as one.
 *
 * It takes a date with a time: a space or a `T` between them, an hour of one or two digits, and seconds or none. So
 * `2026-09-30 7:00`, `2026-09-30 07:00` and `2026-09-30T07:00:00` all read as `2026-09-30 07:00:00`. The hour of one
 * digit is there because a raise stored before this reader existed holds `2026-09-30 7:00`.
 *
 * Anything else is null: a time with no date (`07:00`), words (`tomorrow 7am`), a bare date, trailing text, or a day or
 * hour the calendar does not have (`2026-02-30 07:00`, `2026-09-30 24:00`). The caller refuses it or says it cannot
 * read it. Nothing here guesses which day a bare time meant.
 * @param {string} typed
 * @returns {string | null}
 */
export function readATypedTime(typed) {
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(typed.trim())
  if (m === null) return null
  const [year, month, day, hour, minute, second] = /** @type {[number, number, number, number, number, number]} */ ( [m[1], m[2], m[3], m[4], m[5], m[6] ?? '0'].map(Number))
  if (hour > 23 || minute > 59 || second > 59) return null
  // THE CALENDAR, checked on UTC so that no timezone's missing hour can move the day.
  const onTheCalendar = new Date(Date.UTC(year, month - 1, day))
  if (onTheCalendar.getUTCFullYear() !== year || onTheCalendar.getUTCMonth() !== month - 1 || onTheCalendar.getUTCDate() !== day) return null
  const pad = (/** @type {number} */ n) => String(n).padStart(2, '0')
  return `${String(year)}-${pad(month)}-${pad(day)} ${pad(hour)}:${pad(minute)}:${pad(second)}`
}

/** A normalized typed time already has six checked fields. Read those fields on the local clock.
 * @param {string} normalized
 */
function typedMoment(normalized) {
  const [year, month, day, hour, minute, second] = /** @type {[number, number, number, number, number, number]} */ (normalized.split(/[- :]/).map(Number))
  return new Date(year, month - 1, day, hour, minute, second).getTime()
}

/** An unreadable end holds nothing. Both readable times are compared as local moments, never as text.
 * @param {string} until
 * @param {string} now
 */
export function aTimeHasCome(until, now) {
  const ends = readATypedTime(until)
  const at = readATypedTime(now)
  if (ends === null || at === null) return true
  const endsMs = typedMoment(ends)
  const atMs = typedMoment(at)
  if (Number.isNaN(endsMs) || Number.isNaN(atMs)) return true
  return atMs >= endsMs
}
