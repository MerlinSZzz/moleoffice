// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A DEADLINE COUNTS CALENDAR DAYS, DATE TO DATE, IN THE PERSON'S TIME ZONE. Problem R74WVeH6LZPU.
 *
 * The work page said "due in 24 days" for an obligation due 23 days from 3 October 2026, because the span crossed the
 * clock change of 25 October and the page divided elapsed time by 24 hours: one day in that span has 25 hours. A
 * deadline names a date, so its count is the number of dates between today and that date (message tHpVPIWZTyr2:
 * deadlines count calendar days; ages stay elapsed time).
 *
 * THE ONE PLACE: `calendarDaysBetween` and `calendarDaysBetweenDayKeys` in src/shared/time.ts count; `dueCount` in
 * src/shared/deadlines.ts says late, due today or due in N days; `latePhrase` in src/web/components/ui.tsx and every
 * other deadline count read them. Every moment here is built from UTC, and every count names its zone, so the cases
 * hold on any machine, on any day and at any hour.
 *
 * A DUE MOMENT WITH A TIME OF DAY is held by its own section at the end of this file.
 *
 * MUTATIONS: `calendarDaysBetween` dividing elapsed milliseconds by 24 hours again; `dueCount` counting late days
 * without taking off the due day; `parseDueStamp` putting a bare date's end 24 hours after its start. Each is red.
 */
import { afterEach, describe, expect, it } from 'vitest'
import { setWordLanguage } from '../src/shared/i18n.ts'
import { calendarDaysBetween, calendarDaysBetweenDayKeys, parseLocalStamp } from '../src/shared/time.ts'
import { dueCount } from '../src/shared/deadlines.ts'
import { parseDueStamp, readDueStamp } from '../src/web/lib/attention.ts'
import { latePhrase } from '../src/web/components/ui.tsx'
import { alarmLateWords } from '../src/web/components/home/HomeSections.tsx'

const LONDON = 'Europe/London'
const NEW_YORK = 'America/New_York'
/** A moment from its UTC wall clock. */
const utc = (y: number, m: number, d: number, h = 0, min = 0, s = 0): number => Date.UTC(y, m - 1, d, h, min, s)

afterEach(() => setWordLanguage('en'))

describe('calendar days, date to date', () => {
  // THE END OF 26 OCTOBER 2026 IN LONDON, after the autumn change: 23:59:59 GMT.
  const endOf26October = utc(2026, 10, 26, 23, 59, 59)

  it('counts 23 days from 3 October to 26 October across the autumn change, early, by day and late in the evening', () => {
    for (const now of [utc(2026, 10, 2, 23, 5), utc(2026, 10, 3, 8, 0), utc(2026, 10, 3, 22, 55)]) {
      // 00:05, 09:00 and 23:55 on 3 October in London (BST, UTC+1).
      expect(calendarDaysBetween(now, endOf26October, LONDON), new Date(now).toISOString()).toBe(23)
      expect(dueCount(endOf26October, now, LONDON)).toEqual({ kind: 'due', days: 23 })
    }
  })

  it('counts one day to 26 October just before and just after the autumn change, in both of the repeated hours', () => {
    // 00:59 BST, 01:30 BST (the first 01:30) and 01:30 GMT (the second), all on 25 October.
    for (const now of [utc(2026, 10, 24, 23, 59), utc(2026, 10, 25, 0, 30), utc(2026, 10, 25, 1, 30)]) {
      expect(calendarDaysBetween(now, endOf26October, LONDON), new Date(now).toISOString()).toBe(1)
    }
    // Late in the evening before the change, and early in the morning after it.
    expect(calendarDaysBetween(utc(2026, 10, 24, 22, 30), endOf26October, LONDON)).toBe(2)
    expect(calendarDaysBetween(utc(2026, 10, 26, 0, 10), endOf26October, LONDON)).toBe(0)
  })

  it('counts across the spring change of 28 March 2027 the same way', () => {
    // The end of 29 March 2027 in London is 23:59:59 BST, 22:59:59 UTC.
    const endOf29March = utc(2027, 3, 29, 22, 59, 59)
    // 00:59 GMT just before the change, 02:01 BST just after it.
    for (const now of [utc(2027, 3, 28, 0, 59), utc(2027, 3, 28, 1, 1)]) {
      expect(calendarDaysBetween(now, endOf29March, LONDON), new Date(now).toISOString()).toBe(1)
      expect(dueCount(endOf29March, now, LONDON)).toEqual({ kind: 'due', days: 1 })
    }
    // Late on 27 March (23:50 GMT) to the end of 29 March: two dates on.
    expect(calendarDaysBetween(utc(2027, 3, 27, 23, 50), endOf29March, LONDON)).toBe(2)
  })

  it('says late by whole days counted from the due date, across the spring change', () => {
    // Due by the end of 27 March 2027 (23:59:59 GMT).
    const endOf27March = utc(2027, 3, 27, 23, 59, 59)
    // LATE IS THE CALENDAR DAYS SINCE THE DUE DATE (round 31): 02:01 BST on the 28th is 1 day late, the day after the
    // due date. 00:30 BST on the 29th, under 24 hours after the due moment because the 28th has 23 hours, is 2.
    expect(dueCount(endOf27March, utc(2027, 3, 28, 1, 1), LONDON)).toEqual({ kind: 'late', days: 1 })
    expect(dueCount(endOf27March, utc(2027, 3, 28, 23, 30), LONDON)).toEqual({ kind: 'late', days: 2 })
    // Due today, early and late in the day.
    expect(dueCount(endOf27March, utc(2027, 3, 27, 0, 5), LONDON)).toEqual({ kind: 'due-today', days: 0 })
    expect(dueCount(endOf27March, utc(2027, 3, 27, 23, 55), LONDON)).toEqual({ kind: 'due-today', days: 0 })
  })

  it('reads the zone it is given: New York changes on 1 November 2026, London a week earlier', () => {
    // 20:00 EDT on 31 October to the end of 2 November EST (05:00 UTC on the 3rd, less a second).
    expect(calendarDaysBetween(utc(2026, 11, 1, 0, 0), utc(2026, 11, 3, 4, 59, 59), NEW_YORK)).toBe(2)
    // The same two moments in London are 1 November 00:00 and 3 November 04:59: two dates as well, and the zone
    // decides which dates they are.
    expect(calendarDaysBetween(utc(2026, 11, 1, 0, 0), utc(2026, 11, 3, 4, 59, 59), LONDON)).toBe(2)
    // 01:00 EDT and 01:00 EST on 1 November, the hour New York has twice: the same date.
    expect(calendarDaysBetween(utc(2026, 11, 1, 5, 0), utc(2026, 11, 1, 6, 0), NEW_YORK)).toBe(0)
  })

  it('counts between two date keys, across both changes', () => {
    expect(calendarDaysBetweenDayKeys('2026-10-03', '2026-10-26')).toBe(23)
    expect(calendarDaysBetweenDayKeys('2027-03-27', '2027-03-29')).toBe(2)
    expect(calendarDaysBetweenDayKeys('2026-10-26', '2026-10-03')).toBe(-23)
    expect(calendarDaysBetweenDayKeys('2026-02-30', '2026-03-01')).toBeNull()
  })
})

describe('a bare due date ends where the next date begins', () => {
  it('is due one second before the next day starts, on the days of both changes and either side', () => {
    for (const [day, next] of [
      ['2026-10-24', '2026-10-25'],
      ['2026-10-25', '2026-10-26'],
      ['2026-10-26', '2026-10-27'],
      ['2027-03-27', '2027-03-28'],
      ['2027-03-28', '2027-03-29'],
    ] as const) {
      expect(parseDueStamp(day), day).toBe((parseLocalStamp(next) ?? Number.NaN) - 1000)
    }
  })
})

describe('the work page chip says the calendar count', () => {
  it('says "due in 23 days" from any hour of 3 October to the end of 26 October', () => {
    const endOf26October = utc(2026, 10, 26, 23, 59, 59)
    for (const now of [utc(2026, 10, 2, 23, 5), utc(2026, 10, 3, 12, 0), utc(2026, 10, 3, 22, 55)]) {
      expect(latePhrase(endOf26October, now, LONDON)).toEqual({ kind: 'due', text: 'due in 23 days' })
    }
  })

  it('says due today, then 1 day late from the next date on, by the date', () => {
    const endOf27March = utc(2027, 3, 27, 23, 59, 59)
    expect(latePhrase(endOf27March, utc(2027, 3, 27, 9, 0), LONDON)).toEqual({ kind: 'late', text: 'due today' })
    expect(latePhrase(endOf27March, utc(2027, 3, 28, 1, 1), LONDON)).toEqual({ kind: 'late', text: '1 day late' })
    // 00:30 BST on the 29th: two dates after the due date.
    expect(latePhrase(endOf27March, utc(2027, 3, 28, 23, 30), LONDON)).toEqual({ kind: 'late', text: '2 days late' })
    expect(latePhrase(null, utc(2027, 3, 28, 23, 30), LONDON)).toBeNull()
  })
})

// ================================================================================================
// A DUE MOMENT WITH A TIME OF DAY (round 27b; the refusal of check wrPNt8ul5bqF, accepted in group
// gngJq5Ad8Bh8). A stored due like "2026-09-14 17:00" names a moment, not the end of a day. Late counts the calendar
// days from that moment's date to today, in the person's zone: due yesterday at 17:00 reads "1 day late" today at any
// hour, and past the time on the due date itself reads "under a day late". A due date with no time keeps its count:
// whole days gone since the end of its day. Home's late alarm reads the same count (invariant 9).
//
// MUTATIONS: dueCount taking a day off a moment as it does for a date; readDueStamp calling every stamp a date; Home
// counting with its old 24-hour ceiling. Each is red.
// ================================================================================================

describe('a due moment with a time of day', () => {
  // 17:00 BST on 14 September 2026 is 16:00 UTC.
  const at17On14September = utc(2026, 9, 14, 16, 0)

  it('is "1 day late" 30 hours after 17:00 on 14 September, the case the check found', () => {
    const thirtyHoursOn = at17On14September + 30 * 60 * 60 * 1000
    expect(dueCount(at17On14September, thirtyHoursOn, LONDON, 'a moment')).toEqual({ kind: 'late', days: 1 })
    expect(latePhrase(at17On14September, thirtyHoursOn, LONDON, 'a moment')).toEqual({ kind: 'late', text: '1 day late' })
  })

  it('is "1 day late" at any hour of the next day: just after midnight, by day and late in the evening', () => {
    for (const now of [utc(2026, 9, 14, 23, 5), utc(2026, 9, 15, 8, 0), utc(2026, 9, 15, 22, 55)]) {
      // 00:05, 09:00 and 23:55 BST on 15 September.
      expect(dueCount(at17On14September, now, LONDON, 'a moment'), new Date(now).toISOString()).toEqual({ kind: 'late', days: 1 })
    }
  })

  it('is late in words, not "0 days", once its time has passed on its own date, and due today before it', () => {
    expect(dueCount(at17On14September, utc(2026, 9, 14, 18, 0), LONDON, 'a moment')).toEqual({ kind: 'late', days: 0 })
    expect(latePhrase(at17On14September, utc(2026, 9, 14, 18, 0), LONDON, 'a moment')).toEqual({ kind: 'late', text: 'under a day late' })
    expect(latePhrase(at17On14September, utc(2026, 9, 14, 8, 0), LONDON, 'a moment')).toEqual({ kind: 'late', text: 'due today' })
    // Due tomorrow at 08:00, seen at 22:00 tonight: a date away.
    expect(dueCount(utc(2026, 9, 16, 7, 0), utc(2026, 9, 15, 21, 0), LONDON, 'a moment')).toEqual({ kind: 'due', days: 1 })
  })

  it('counts dates across the autumn change, in either of the repeated hours', () => {
    // Due 23:30 BST on 24 October; at 00:30 GMT on 26 October, 26 hours on: two dates.
    expect(dueCount(utc(2026, 10, 24, 22, 30), utc(2026, 10, 26, 0, 30), LONDON, 'a moment')).toEqual({ kind: 'late', days: 2 })
    // Due at the second 01:30 of 25 October (GMT); at 01:00 GMT on the 26th, 23 and a half hours on: one date.
    expect(dueCount(utc(2026, 10, 25, 1, 30), utc(2026, 10, 26, 1, 0), LONDON, 'a moment')).toEqual({ kind: 'late', days: 1 })
  })

  it('counts dates across the spring change', () => {
    // Due 23:00 GMT on 27 March 2027; at 00:30 BST on the 29th, 24 and a half hours on: two dates.
    expect(dueCount(utc(2027, 3, 27, 23, 0), utc(2027, 3, 28, 23, 30), LONDON, 'a moment')).toEqual({ kind: 'late', days: 2 })
    // Due 01:30 GMT on the 28th, just before the change; at 02:30 BST, just after it: the same date.
    expect(dueCount(utc(2027, 3, 28, 0, 30), utc(2027, 3, 28, 1, 30), LONDON, 'a moment')).toEqual({ kind: 'late', days: 0 })
  })

  it('reads a stored stamp as a moment when it has a time, and as a date when it has none', () => {
    expect(readDueStamp('2026-09-14 17:00')).toEqual({ ms: parseLocalStamp('2026-09-14 17:00'), due: 'a moment' })
    expect(readDueStamp('2026-09-14T17:00:00')).toEqual({ ms: parseLocalStamp('2026-09-14T17:00:00'), due: 'a moment' })
    expect(readDueStamp('2026-09-14')).toEqual({ ms: parseDueStamp('2026-09-14'), due: 'a date' })
    expect(readDueStamp('not a date')).toBeNull()
  })
})

describe("Home's late alarm and the work page chip read one count", () => {
  // Due by the end of 10 September 2026 (23:59:59 BST), seen at noon BST.
  const endOf10September = utc(2026, 9, 10, 22, 59, 59)
  const noonOn = (day: number) => utc(2026, 9, day, 11, 0)

  it('says the same number of days late as the chip, for a date and for a moment', () => {
    expect(latePhrase(endOf10September, noonOn(15), LONDON)?.text).toBe('5 days late')
    expect(alarmLateWords(endOf10September, 'a date', noonOn(15), LONDON)).toBe('5 days late')
    expect(alarmLateWords(endOf10September, 'a date', noonOn(11), LONDON)).toBe('1 day late')
    expect(alarmLateWords(utc(2026, 9, 14, 16, 0), 'a moment', utc(2026, 9, 15, 22, 0), LONDON)).toBe('1 day late')
  })

  it('says it in Chinese with its own words', () => {
    setWordLanguage('zh')
    expect(alarmLateWords(endOf10September, 'a date', noonOn(15), LONDON)).toBe('逾期 5 天')
    expect(alarmLateWords(endOf10September, 'a date', noonOn(11), LONDON)).toBe('逾期 1 天')
  })
})
