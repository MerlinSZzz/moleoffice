// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * "A DAY" IN A RAISE'S END IS A CALENDAR DAY. In the end-time choice (RaiseEndChoice.tsx), "a day"
 * ends at the same clock time on the next calendar day, across a clock change too, not after
 * 24 hours.
 *
 * THE ONE PLACE: `endOf` in src/web/components/RaiseEndChoice.tsx works out the end of every choice, and reads "a day"
 * from `theSameTimeTheNextDay` in src/shared/time.ts. Every moment here is built from UTC, and every end names its zone,
 * so the cases hold on any machine, on any day and at any hour.
 *
 * MUTATIONS: "a day" as 24 hours from now again; the next day counted on UTC's calendar instead of the zone's. Each is
 * red.
 */
import { describe, expect, it } from 'vitest'
import { stampInZone } from '../src/shared/time.ts'
import { endOf } from '../src/web/components/RaiseEndChoice.tsx'

const LONDON = 'Europe/London'
const NEW_YORK = 'America/New_York'
const SHANGHAI = 'Asia/Shanghai'
const HOUR = 60 * 60_000
/** A moment from its UTC wall clock. */
const utc = (y: number, m: number, d: number, h = 0, min = 0, s = 0): number => Date.UTC(y, m - 1, d, h, min, s)

/** "A day" from `now`, on the clock of `zone`. Another time is not asked for here, so it is handed in unreadable. */
const aDayFrom = (now: number, zone: string): number => endOf('day', now, Number.NaN, zone)

describe('"a day" ends at the same clock time on the next calendar day', () => {
  it('on a day with no clock change: 24 hours on', () => {
    // 09:00 on 13 October 2026 in Shanghai (UTC+8), which has no clock change.
    const now = utc(2026, 10, 13, 1, 0)
    expect(stampInZone(aDayFrom(now, SHANGHAI), SHANGHAI)).toBe('2026-10-14 09:00:00')
    expect(aDayFrom(now, SHANGHAI) - now).toBe(24 * HOUR)
  })

  it('across the autumn change: 25 hours on', () => {
    // 09:00 BST on 24 October 2026 in London. The clocks go back an hour at 02:00 on 25 October.
    const morning = utc(2026, 10, 24, 8, 0)
    expect(stampInZone(aDayFrom(morning, LONDON), LONDON)).toBe('2026-10-25 09:00:00')
    expect(aDayFrom(morning, LONDON) - morning).toBe(25 * HOUR)
    // 18:30 EDT on 31 October 2026 in New York. The clocks go back an hour at 02:00 on 1 November.
    const evening = utc(2026, 10, 31, 22, 30)
    expect(stampInZone(aDayFrom(evening, NEW_YORK), NEW_YORK)).toBe('2026-11-01 18:30:00')
    expect(aDayFrom(evening, NEW_YORK) - evening).toBe(25 * HOUR)
  })

  it('across the spring change: 23 hours on', () => {
    // 09:00 GMT on 27 March 2027 in London. The clocks go forward an hour at 01:00 on 28 March.
    const now = utc(2027, 3, 27, 9, 0)
    expect(stampInZone(aDayFrom(now, LONDON), LONDON)).toBe('2027-03-28 09:00:00')
    expect(aDayFrom(now, LONDON) - now).toBe(23 * HOUR)
  })

  it('on the calendar of the zone, early in the morning while UTC is still on the day before', () => {
    // 07:00 on 14 October 2026 in Shanghai is 23:00 on 13 October in UTC.
    const now = utc(2026, 10, 13, 23, 0)
    expect(stampInZone(aDayFrom(now, SHANGHAI), SHANGHAI)).toBe('2026-10-15 07:00:00')
  })

  it('over the end of a month and of a year', () => {
    // 22:15 on 31 December 2026 in Shanghai.
    const now = utc(2026, 12, 31, 14, 15)
    expect(stampInZone(aDayFrom(now, SHANGHAI), SHANGHAI)).toBe('2027-01-01 22:15:00')
  })

  it('to the nearest minute, as every other length is', () => {
    // 09:00:40 on 13 October 2026 in Shanghai.
    const now = utc(2026, 10, 13, 1, 0, 40)
    expect(stampInZone(aDayFrom(now, SHANGHAI), SHANGHAI)).toBe('2026-10-14 09:01:00')
  })

  it('at a time the next day does not have, read as every stamp on the office clock is read', () => {
    // 01:30 GMT on 27 March 2027 in London. On 28 March the clock goes from 01:00 straight to 02:00, so that day has no
    // 01:30. `momentOfStampInZone` reads a time a zone skips as the moment an hour on, 02:30 BST, and the line under
    // the choice says that time.
    const now = utc(2027, 3, 27, 1, 30)
    expect(stampInZone(aDayFrom(now, LONDON), LONDON)).toBe('2027-03-28 02:30:00')
  })
})
