// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A STAMP IN A ZONE TWELVE OR MORE HOURS AHEAD OF UTC READS AS ITS FIRST REAL MOMENT.
 *
 * Problem A-L2E_Q1DmsW. `momentOfStampInZone` samples the zone's offset half a day either side of
 * the stamp read as UTC. In a zone twelve or more hours ahead, the moment lies twelve to fourteen
 * hours before that sample, so near a clock change one sample sits on the wrong side and the reader
 * returns a moment an hour off. Auckland on 4 April 2027 read 60 minutes late and Chatham on
 * 27 September 2026 45 minutes early.
 *
 * The expected moment is not copied from a table. It is found by asking `stampInZone`, the reverse
 * reader, for the first moment in a four-day window whose wall clock is the stamp. That is the
 * definition of the moment a stamp names. London and New York are the control: they read right
 * before the change and after it.
 */
import { describe, expect, it } from 'vitest'

import { momentOfStampInZone, stampInZone } from '../src/shared/time.ts'

const A_MINUTE_MS = 60_000
const TWO_DAYS_MS = 2 * 24 * 60 * 60_000

function firstMomentOf(stamp: string, zone: string): number {
  const asIfUtc = Date.parse(`${stamp.replace(' ', 'T')}Z`)
  for (let ms = asIfUtc - TWO_DAYS_MS; ms <= asIfUtc + TWO_DAYS_MS; ms += A_MINUTE_MS) {
    if (stampInZone(ms, zone) === stamp) return ms
  }
  throw new Error(`${stamp} never happens on ${zone}`)
}

const CASES = [
  ['2027-04-04 02:00:00', 'Pacific/Auckland'],
  ['2027-04-04 02:30:00', 'Pacific/Auckland'],
  ['2026-09-27 02:00:00', 'Pacific/Chatham'],
  ['2027-04-04 02:30:00', 'Pacific/Chatham'],
  ['2026-10-25 01:30:00', 'Europe/London'],
  ['2026-11-01 01:30:00', 'America/New_York'],
] as const

describe('a stamp in a zone twelve or more hours ahead of UTC', () => {
  for (const [stamp, zone] of CASES) {
    it(`${zone} reads ${stamp} as its first real moment`, () => {
      expect(momentOfStampInZone(stamp, zone)).toBe(firstMomentOf(stamp, zone))
    })
  }

  it('half- and three-quarter-hour zones read their stamps back', () => {
    for (const zone of ['Asia/Kolkata', 'Asia/Kathmandu', 'Australia/Lord_Howe']) {
      const stamp = '2026-12-24 23:59:00'
      expect(momentOfStampInZone(stamp, zone), zone).toBe(firstMomentOf(stamp, zone))
    }
  })
})
