// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * LATE IS THE CALENDAR DAYS SINCE THE DUE DATE (wave 13q's round 31; the brief, invariant 9).
 *
 * One rule for every place that says how late something is: the work page's chip, Home's late alarm and the record
 * page's deadline all read `dueCount` in src/shared/deadlines.ts. Due yesterday is 1 day late at any hour today, for a
 * bare date and for a moment alike, and a due date five days back is 5 days late. Until round 31 a bare date counted
 * only the dates strictly between it and today, so due yesterday read "under a day late" and five days back read 4.
 *
 * The clock is London's, in autumn (BST, UTC+1). The dates are made up.
 */
import { afterEach, expect, it } from 'vitest'
import { setWordLanguage } from '../src/shared/i18n.ts'
import { dueCount } from '../src/shared/deadlines.ts'
import { parseLocalStamp } from '../src/shared/time.ts'
import { latePhrase } from '../src/web/components/ui.tsx'
import { alarmLateWords } from '../src/web/components/home/HomeSections.tsx'

const LONDON = 'Europe/London'
const utc = (y: number, m: number, d: number, h = 0, min = 0, s = 0): number => Date.UTC(y, m - 1, d, h, min, s)

/** Due by the end of 14 September 2026 in London: 23:59:59 BST. */
const endOf14September = utc(2026, 9, 14, 22, 59, 59)
/** 00:05, 12:00 and 23:55 London time on a September day. */
const hoursOf = (day: number) => [utc(2026, 9, day - 1, 23, 5), utc(2026, 9, day, 11, 0), utc(2026, 9, day, 22, 55)]

afterEach(() => setWordLanguage('en'))

it('counts a bare date due yesterday as 1 day late at any hour today, and five dates back as 5', () => {
  for (const now of hoursOf(15)) expect(dueCount(endOf14September, now, LONDON, 'a date'), new Date(now).toISOString()).toEqual({ kind: 'late', days: 1 })
  for (const now of hoursOf(19)) expect(dueCount(endOf14September, now, LONDON, 'a date')).toEqual({ kind: 'late', days: 5 })
  // The due date itself is not late: it is due today.
  for (const now of hoursOf(14)) expect(dueCount(endOf14September, now, LONDON, 'a date')).toEqual({ kind: 'due-today', days: 0 })
})

it('counts a moment the same way: due yesterday at 17:00 is 1 day late, and past the time today is under a day', () => {
  const yesterdayAt17 = utc(2026, 9, 14, 16, 0)
  for (const now of hoursOf(15)) expect(dueCount(yesterdayAt17, now, LONDON, 'a moment')).toEqual({ kind: 'late', days: 1 })
  expect(dueCount(yesterdayAt17, utc(2026, 9, 14, 20, 0), LONDON, 'a moment')).toEqual({ kind: 'late', days: 0 })
})

it('says it in the words the chip, Home and the record page share, in English and Chinese', () => {
  const noonOn15 = utc(2026, 9, 15, 11, 0)
  const noonOn19 = utc(2026, 9, 19, 11, 0)
  expect(latePhrase(endOf14September, noonOn15, LONDON, 'a date')?.text).toBe('1 day late')
  expect(alarmLateWords(endOf14September, 'a date', noonOn15, LONDON)).toBe('1 day late')
  expect(latePhrase(endOf14September, noonOn19, LONDON, 'a date')?.text).toBe('5 days late')
  expect(alarmLateWords(endOf14September, 'a date', noonOn19, LONDON)).toBe('5 days late')
  setWordLanguage('zh')
  expect(latePhrase(endOf14September, noonOn15, LONDON, 'a date')?.text).toBe('逾期 1 天')
  expect(alarmLateWords(endOf14September, 'a date', noonOn19, LONDON)).toBe('逾期 5 天')
})

it('reads a stored stamp the way the pages do', () => {
  // The end of a stored date, as readDueStamp gives it, is the last second of that date in this process's zone.
  const end = parseLocalStamp('2026-09-14 23:59:59')
  expect(end).not.toBeNull()
  expect(dueCount(end!, end! + 1000, undefined, 'a date')).toEqual({ kind: 'late', days: 1 })
})
