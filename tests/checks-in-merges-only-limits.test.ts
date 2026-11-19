// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE LIMITS ON CHECKS A MERGES-ONLY WORKER STARTS. Wave 13j round loop-1, from the round's brief: a further check only
 * while the one-minute load is under 16 and at least 24 GiB is free; the first check always starts. The rule is
 * `whyNoFurtherCheckNow` in src/shared/checks-in-merges-only.ts, which the worker calls with the reading the office gives
 * it. How many run at once is the office's setting since the round after X4FMBW2bGWp-, with 2 when nobody set it
 * (tests/checks-at-once-is-an-office-setting.test.ts); here the rule is handed the number.
 *
 * MUTATION, RUN ON 11 OCTOBER 2026. A control run first: all green. Then the first line of `whyNoFurtherCheckNow` (the
 * first check always starts) was removed. "starts the first check whatever the machine says" went red. Restored, and the
 * control run again: green.
 */
import { describe, expect, it } from 'vitest'

import { CHECKS_AT_ONCE_BY_DEFAULT, FREE_GIB_AT_LEAST, LOAD_UNDER, theFreeBytesIn, whyNoFurtherCheckNow } from '../src/shared/checks-in-merges-only.ts'

const GIB = 1024 ** 3
const quiet = { loadOneMinute: 2, freeBytes: 64 * GIB }

describe('the limits on checks in merges-only mode', () => {
  it('are the numbers the brief set', () => {
    expect([CHECKS_AT_ONCE_BY_DEFAULT, LOAD_UNDER, FREE_GIB_AT_LEAST]).toEqual([2, 16, 24])
  })

  it('starts the first check whatever the machine says, even when nothing could be read', () => {
    expect(whyNoFurtherCheckNow({ checksRunning: 0, loadOneMinute: 99, freeBytes: 0 }, 2)).toBeNull()
    expect(whyNoFurtherCheckNow({ checksRunning: 0, loadOneMinute: null, freeBytes: null }, 2)).toBeNull()
  })

  it('starts up to the number it is handed on a quiet machine, and never one more', () => {
    expect(whyNoFurtherCheckNow({ checksRunning: 1, ...quiet }, 2)).toBeNull()
    expect(whyNoFurtherCheckNow({ checksRunning: 2, ...quiet }, 2)).toBe('2 checks are running, and at most 2 run at once.')
    expect(whyNoFurtherCheckNow({ checksRunning: 2, ...quiet }, 3)).toBeNull()
    expect(whyNoFurtherCheckNow({ checksRunning: 3, ...quiet }, 3)).toBe('3 checks are running, and at most 3 run at once.')
  })

  it('holds a further check at a load of 16 and with less than 24 GiB free, and starts one just inside both', () => {
    expect(whyNoFurtherCheckNow({ checksRunning: 1, loadOneMinute: 16, freeBytes: 64 * GIB }, 3)).toBe(
      'The one-minute load is 16.00, and a further check starts only under 16.',
    )
    expect(whyNoFurtherCheckNow({ checksRunning: 1, loadOneMinute: 2, freeBytes: 24 * GIB - 1 }, 3)).toBe(
      '24.0 GiB of memory is free, and a further check starts only with at least 24 GiB free.',
    )
    expect(whyNoFurtherCheckNow({ checksRunning: 1, loadOneMinute: 15.99, freeBytes: 24 * GIB }, 3)).toBeNull()
  })

  it('holds a further check when the load or the free memory could not be read', () => {
    expect(whyNoFurtherCheckNow({ checksRunning: 1, loadOneMinute: null, freeBytes: 64 * GIB }, 3)).toBe('The one-minute load could not be read, so no further check starts.')
    expect(whyNoFurtherCheckNow({ checksRunning: 1, loadOneMinute: 2, freeBytes: null }, 3)).toBe('The free memory could not be read, so no further check starts.')
  })

  it('reads the free memory from the MemAvailable line, and nothing from a text without one', () => {
    expect(theFreeBytesIn('MemTotal:       65536000 kB\nMemFree:  1000 kB\nMemAvailable:   30000000 kB\n')).toBe(30000000 * 1024)
    expect(theFreeBytesIn('MemTotal:       65536000 kB\nMemFree:  1000 kB\n')).toBeNull()
  })
})
