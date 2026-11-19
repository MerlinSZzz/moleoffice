// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * The stored-timestamp contract, checked in timezones that are not UTC.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS FILE EXISTS, AND WHY IT SETS THE TIMEZONE
 * ---------------------------------------------------------------------------------------
 *
 * Mole Office writes timestamps as LOCAL wall-clock time with no zone marker, so that "a day" means the
 * operator's day. For two months the browser read them back as UTC: `parseStamp` in
 * web/components/ui.tsx appended a `Z`. Every age was out by the machine's offset, and anything
 * under an hour old reported "just now" — including a session that had been idle for fifty minutes
 * waiting for an answer, which is the single thing the product most needs to be able to show.
 *
 * It failed no test. There were 1,129 of them. It failed none of them because **every one of them
 * ran in the machine's own timezone, and on a machine set to UTC the bug does not exist.** A test
 * that writes a stamp and reads it back agrees with itself perfectly at offset zero.
 *
 * So the coverage that was missing is not "test the parser". It is "test the parser somewhere that
 * is not Greenwich". Every test below runs in several real timezones, chosen to include the cases
 * that break naive arithmetic:
 *
 *   Europe/London        +01:00 in August. The machine this was found on.
 *   America/New_York     -04:00. A NEGATIVE offset, which fails differently: ages come out too
 *                        large rather than negative, so nothing collapses to "just now" and the
 *                        bug hides even better.
 *   Asia/Kolkata         +05:30. NOT a whole number of hours. Catches anything that fixes the
 *                        problem by rounding to hours.
 *   Australia/Eucla      +08:45. Three quarters of an hour. The same trap, further from the axis.
 *   Pacific/Kiritimati   +14:00. The largest offset in use. A stamp written here and read as UTC
 *                        lands on the previous DAY, not merely an earlier hour.
 *   UTC                  +00:00. The control. If a test passes here and fails everywhere else,
 *                        the test is measuring the machine and not the code.
 *
 * Node applies a change to `process.env.TZ` to Date operations that follow it, and vitest is
 * configured with `pool: 'forks'`, so this file gets its own process and cannot disturb the
 * timezone any other test file is running in.
 *
 * ONE RULE FOR ANYONE ADDING TO THIS FILE: never compare against a hard-coded epoch number. A
 * literal like 1786012205000 is only correct in one zone, which puts the test back where the old
 * ones were. Compare a round trip against the wall-clock fields it came from.
 */

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { buildSync } from 'esbuild'
import { chromium } from 'playwright'

import {
  STAMP_GRAMMAR,
  clockStamp,
  elapsedSeconds,
  fileNameStamp,
  localStamp,
  nowStamp,
  parseAnyStamp,
  parseLocalStamp,
  parseStoredStamp,
  stampWrittenIn,
} from '../src/shared/time.ts'
import { parseLocalStamp as parseFromAttention, parseDueStamp } from '../src/web/lib/attention.ts'

/**
 * `parseStamp` and `relativeTime` live in the component library, which is imported dynamically
 * behind a `window` stand-in -- the same arrangement tests/ui.test.ts uses and for the same
 * reason. src/web/api.ts reads `window.localStorage` at module scope to restore who you are
 * acting as, the component library imports it for one error helper, and the runner's environment
 * is `node` with no DOM. Nothing about the stand-in is under test here.
 */
let parseStamp: (stamp: string) => Date | null
let relativeTime: (stamp: string) => string

beforeAll(async () => {
  const store = new Map<string, string>()
  ;(globalThis as unknown as { window: unknown }).window = {
    localStorage: {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    },
  }
  const ui = await import('../src/web/components/ui.tsx')
  parseStamp = ui.parseStamp
  relativeTime = ui.relativeTime
})

/**
 * The zones every test runs in. The reason for each is in the header comment; the short version is
 * that a positive offset, a negative one, two fractional ones and one big enough to cross a date
 * boundary all fail in different ways.
 */
const ZONES = [
  'UTC',
  'Europe/London',
  'America/New_York',
  'Asia/Kolkata',
  'Australia/Eucla',
  'Pacific/Kiritimati',
]

const originalTZ = process.env.TZ
afterAll(() => {
  if (originalTZ === undefined) delete process.env.TZ
  else process.env.TZ = originalTZ
})

/**
 * THE MIDDLE OF THE HOUR THAT COMES TWICE, on its second pass, in each zone above that puts its clocks back: 01:30 GMT
 * on 25 October 2026 in London and 01:30 EST on 1 November 2026 in New York. tests/migration.test.ts stands its clock
 * at the same two moments.
 */
const IN_THE_REPEATED_HOUR = [
  ['Europe/London', '2026-10-25T01:30:00Z'],
  ['America/New_York', '2026-11-01T06:30:00Z'],
] as const

/**
 * A SUMMER MOMENT, when every zone in ZONES but UTC is away from offset zero and none is within a day of a clock
 * change. A check that reads the clock stands here through `atTheMoment`, so the hour it runs at does not matter.
 */
const IN_SUMMER = '2026-08-09T12:00:00.250Z'
const atTheMoment = (moment: string, check: (when: Date) => void) => {
  vi.useFakeTimers({ toFake: ['Date'] })
  try {
    vi.setSystemTime(new Date(moment))
    check(new Date())
  } finally {
    vi.useRealTimers()
  }
}

/** Run one check in every zone, so a failure names the zone it happened in. */
function inEveryZone(what: string, check: (zone: string) => void) {
  it(what, () => {
    for (const zone of ZONES) {
      process.env.TZ = zone
      try {
        check(zone)
      } catch (err) {
        throw new Error(`in ${zone}: ${err instanceof Error ? err.message : String(err)}`)
      }
    }
  })
}

/** Wall-clock fields, which are what a stored stamp actually means. */
const WALL = { y: 2026, mo: 8, d: 9, h: 0, mi: 30, s: 5 }
const WALL_STAMP = '2026-08-09 00:30:05'

describe('an instant beside the legacy wall stamp', () => {
  it('writes the same complete observation in a real browser', async () => {
    const browser = await chromium.launch({ headless: true })
    try {
      const page = await browser.newPage({ timezoneId: 'Europe/London' })
      const bundle = buildSync({ entryPoints: ['src/shared/time.ts'], bundle: true, write: false, format: 'iife', globalName: 'clockCode' })
      await page.addScriptTag({ content: bundle.outputFiles[0]!.text })
      const written = await page.evaluate(() => {
        const clock = (globalThis as unknown as { clockCode: typeof import('../src/shared/time.ts') }).clockCode
        return clock.clockStamp(() => new Date('2026-08-09T00:30:05.123Z'))
      })
      expect(written).toEqual({ stamp: '2026-08-09 01:30:05', instant: '2026-08-09T01:30:05.123+01:00', offset: '+01:00', timeZone: 'Europe/London' })
    } finally {
      await browser.close()
    }
  })

  inEveryZone('one injected observation keeps the local stamp, offset, zone and milliseconds', () => {
    const instant = new Date('2026-08-09T00:30:05.123Z')
    let reads = 0
    const written = clockStamp(() => { reads += 1; return instant })
    expect(reads).toBe(1)
    expect(written.stamp).toBe(localStamp(instant))
    expect(Date.parse(written.instant)).toBe(instant.getTime())
    expect(written.instant).toMatch(/\.123[+-]\d{2}:\d{2}$/)
    expect(written.instant.endsWith(written.offset)).toBe(true)
    expect(written.timeZone).toBe(Intl.DateTimeFormat().resolvedOptions().timeZone)
    expect(parseStoredStamp(written.instant)).toBeNull()
    expect(new RegExp(`^${STAMP_GRAMMAR}$`).test(written.instant)).toBe(false)
  })

  it('refuses a missing offset and invalid instants without changing the old reader', () => {
    process.env.TZ = 'Europe/London'
    expect(() => clockStamp(() => '2026-03-29 01:30:00')).toThrow(/explicit timezone offset/)
    expect(() => clockStamp(() => '2026-02-30T12:00:00+00:00')).toThrow(/valid calendar/)
    expect(() => clockStamp(() => new Date(NaN))).toThrow(/valid instant/)
    expect(localStamp(new Date(parseLocalStamp('2026-03-29 01:30:00')!))).toBe('2026-03-29 02:30:00')
  })
})

describe('clock boundaries retain their evidence', () => {
  it('distinguishes both London autumn 01:30 occurrences without rereading old stamps differently', () => {
    process.env.TZ = 'Europe/London'
    const first = clockStamp(() => '2026-10-25T00:30:00Z')
    const second = clockStamp(() => '2026-10-25T01:30:00Z')
    expect(first).toEqual({ stamp: '2026-10-25 01:30:00', instant: '2026-10-25T01:30:00.000+01:00', offset: '+01:00', timeZone: 'Europe/London' })
    expect(second).toEqual({ ...first, instant: '2026-10-25T01:30:00.000+00:00', offset: '+00:00' })
    expect(elapsedSeconds(first.instant, second.instant)).toBe(3600)
    expect(parseStoredStamp(first.stamp)).toBe(parseStoredStamp(second.stamp))
  })

  it('refuses the spring gap and crosses the real spring boundary in one second', () => {
    process.env.TZ = 'Europe/London'
    for (const gap of ['2026-03-29 01:30:00', '2026-03-29T01:30:00']) {
      expect(() => clockStamp(() => gap)).toThrow(/explicit timezone offset/)
    }
    const before = clockStamp(() => '2026-03-29T00:59:59Z')
    const after = clockStamp(() => '2026-03-29T01:00:00Z')
    expect(before.stamp).toBe('2026-03-29 00:59:59')
    expect(after.stamp).toBe('2026-03-29 02:00:00')
    expect(before.offset).toBe('+00:00')
    expect(after.offset).toBe('+01:00')
    expect(elapsedSeconds(before.instant, after.instant)).toBe(1)
  })

  it('keeps a backward adjustment visible and refuses to turn it into a duration', () => {
    process.env.TZ = 'Europe/London'
    const ticks = ['2026-10-25T02:30:00Z', '2026-10-25T02:28:00Z']
    const clock = () => ticks.shift()!
    const first = clockStamp(clock)
    const second = clockStamp(clock)
    expect(Date.parse(second.instant) - Date.parse(first.instant)).toBe(-120_000)
    expect(second.stamp).toBe('2026-10-25 02:28:00')
    expect(() => elapsedSeconds(first.instant, second.instant)).toThrow(/clock moved backward/)
  })

  it('preserves London instants in a New York browser and leaves the legacy zone difference visible', async () => {
    process.env.TZ = 'Europe/London'
    const first = clockStamp(() => '2026-10-25T00:30:00Z')
    const second = clockStamp(() => '2026-10-25T01:30:00Z')
    const browser = await chromium.launch({ headless: true })
    try {
      const page = await browser.newPage({ timezoneId: 'America/New_York' })
      const bundle = buildSync({ entryPoints: ['src/shared/time.ts'], bundle: true, write: false, format: 'iife', globalName: 'clockCode' })
      await page.addScriptTag({ content: bundle.outputFiles[0]!.text })
      const read = await page.evaluate(({ first, second }) => {
        const clock = (globalThis as unknown as { clockCode: typeof import('../src/shared/time.ts') }).clockCode
        return { elapsed: clock.elapsedSeconds(first.instant, second.instant), old: clock.parseStoredStamp(first.stamp), instant: clock.parseAnyStamp(first.instant)!.getTime(), zone: Intl.DateTimeFormat().resolvedOptions().timeZone }
      }, { first, second })
      expect(read.zone).toBe('America/New_York')
      expect(read.elapsed).toBe(3600)
      expect(read.instant).toBe(Date.parse('2026-10-25T00:30:00Z'))
      expect(read.old).not.toBe(read.instant)
    } finally { await browser.close() }
  })
})

// ============================================================================ the round trip

describe('a stored stamp is local wall-clock time, in any timezone', () => {
  inEveryZone('writing a moment and reading it back gives the same moment', () => {
    // Several times of day, including the two that used to break: just after midnight, where a
    // UTC misreading moves the DATE, and late evening, where it moves the date the other way.
    for (const [h, mi] of [
      [0, 0],
      [0, 30],
      [9, 15],
      [13, 45],
      [23, 59],
    ]) {
      const moment = new Date(2026, 7, 9, h as number, mi as number, 5)
      const written = localStamp(moment)
      const readBack = parseLocalStamp(written)
      expect(readBack).not.toBeNull()
      // To the second. localStamp does not store milliseconds, so the moment is compared with
      // its own milliseconds removed rather than to the raw input.
      expect(readBack).toBe(new Date(2026, 7, 9, h as number, mi as number, 5).getTime())
    }
  })

  inEveryZone('a stamp reads back as the same wall clock it names', () => {
    const ms = parseLocalStamp(WALL_STAMP)
    expect(ms).not.toBeNull()
    const d = new Date(ms as number)
    // THE HEART OF IT. These are the LOCAL getters, so this asserts that the string "00:30:05"
    // means half past midnight where the operator is standing -- in every zone, not just at
    // offset zero. Under the old `+ "Z"` reading this line failed in five of the six zones.
    expect(d.getFullYear()).toBe(WALL.y)
    expect(d.getMonth() + 1).toBe(WALL.mo)
    expect(d.getDate()).toBe(WALL.d)
    expect(d.getHours()).toBe(WALL.h)
    expect(d.getMinutes()).toBe(WALL.mi)
    expect(d.getSeconds()).toBe(WALL.s)
  })

  inEveryZone('the date does not shift, even at +14:00 where a UTC misreading changes the day', () => {
    // Written at 00:30 local. Read as UTC in Kiritimati this becomes 14:30 on the SAME date going
    // one way and the previous date going the other -- a whole day wrong, not an hour.
    const d = new Date(parseLocalStamp('2026-08-09 00:30:05') as number)
    expect(`${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`).toBe('2026-8-9')
  })

  inEveryZone('nowStamp round-trips to within a second of the clock', () => {
    // THE CLOCK IS SET, NOT READ. Read from the real clock this went red for one hour a year in each
    // zone that puts its clocks back: at 01:30 GMT on 25 October 2026 in Europe/London, at 01:30 EST on
    // 1 November 2026 in America/New_York. A stored stamp has no offset, so the second 01:30 reads back
    // as the first, an hour early; that is the cost of local stamps, and `clockStamp` is what names an
    // instant. So the clock stands at moments whose local stamp names one moment only, or reads back
    // as the earlier of two: summer, a winter midnight, the first of London's two 01:30s, the minute
    // after its repeated hour, and the minute after its gap.
    vi.useFakeTimers({ toFake: ['Date'] })
    try {
      for (const moment of ['2026-08-09T12:00:00.250Z', '2027-01-15T23:59:59.999Z', '2026-10-25T00:30:00Z', '2026-10-25T02:00:00Z', '2027-03-28T01:00:00Z']) {
        vi.setSystemTime(new Date(moment))
        const before = Date.now()
        const ms = parseLocalStamp(nowStamp()) as number
        const after = Date.now()
        // Allow the second that localStamp truncates, and nothing more. Under the old reading this
        // was out by the whole offset -- up to fourteen hours.
        expect(ms, `at ${moment}`).toBeGreaterThanOrEqual(before - 1000)
        expect(ms, `at ${moment}`).toBeLessThanOrEqual(after + 1000)
      }
    } finally {
      vi.useRealTimers()
    }
  })
})

// ============================================================================ ages

describe('a moment in a file name is local wall-clock time too (acceptance finding 63)', () => {
  // MUTATION PROOF, 24 September 2026, alone in src/shared/time.ts: the name built from toISOString, as the tools built
  // theirs, and this goes red in every zone that is not UTC.
  inEveryZone('names the local wall clock with its milliseconds, in characters a file system takes, sorting as time does', () => {
    const moment = new Date(2026, 8, 24, 0, 30, 5, 7)
    expect(fileNameStamp(moment)).toBe('2026-09-24T00-30-05-007')
    expect(fileNameStamp(new Date(2026, 8, 24, 0, 30, 5, 8)) > fileNameStamp(moment)).toBe(true)
    expect(fileNameStamp(moment)).toMatch(/^[0-9T-]+$/u)
  })
})

describe('relative time, which is where the bug showed', () => {
  // THE CLOCK IS SET, NOT READ. Read from the real clock, these went red in America/New_York from 06:00 UTC on
  // 1 November 2026, the night its clocks went back, for as long after as each age reaches back into the hour that
  // came twice. So each check stands at the summer moment, whatever the clock read when it began.
  const inSummer = (check: () => void) => () => atTheMoment(IN_SUMMER, check)

  /** The age checks by name. Each runs in every zone, and again with the clock in an hour that comes twice. */
  const AGE_CHECKS: [string, () => void][] = [
    ['something written 20 minutes ago is not called "just now"', inSummer(() => {
      const written = localStamp(new Date(Date.now() - 20 * 60_000))
      // The exact symptom that was shipped: on a machine one hour ahead, everything under an hour
      // old came out with a NEGATIVE age and fell through the "just now" branch.
      expect(relativeTime(written)).toBe('20m ago')
    })],

    ['ages are right across the thresholds', inSummer(() => {
      const ago = (minutes: number) => relativeTime(localStamp(new Date(Date.now() - minutes * 60_000)))
      expect(ago(0)).toBe('just now')
      expect(ago(20)).toBe('20m ago')
      expect(ago(59)).toBe('59m ago')
      expect(ago(90)).toBe('2h ago') // 1.5h rounds to 2, not to 1, and certainly not to 30m
      expect(ago(150)).toBe('3h ago')
      expect(ago(60 * 24)).toBe('1d ago')
    })],

    ['an age is never negative', inSummer(() => {
      // A negative age is what made this invisible: it did not look wrong, it looked new.
      for (const minutes of [1, 5, 20, 45, 59, 61, 200]) {
        const written = localStamp(new Date(Date.now() - minutes * 60_000))
        const parsed = parseStamp(written)
        expect(parsed).not.toBeNull()
        expect(Date.now() - (parsed as Date).getTime()).toBeGreaterThanOrEqual(0)
      }
    })],

    ['a session idle for fifty minutes does not look like one that just spoke', inSummer(() => {
      // Stated as the product rule rather than as arithmetic, because this is the reason the bug
      // mattered: the brief keeps `idle` and `running` apart precisely so that a session waiting
      // for an answer cannot be mistaken for a busy one, and "just now" erased that distinction.
      const idleSince = localStamp(new Date(Date.now() - 50 * 60_000))
      expect(relativeTime(idleSince)).not.toBe('just now')
      expect(relativeTime(idleSince)).toBe('50m ago')
    })],
  ]

  for (const [what, check] of AGE_CHECKS) inEveryZone(what, check)

  it('each age check gives the same answer with the clock in the hour London and New York show twice', () => {
    // A stamp written in the second 01:xx of the night the clocks go back reads back as the first, an hour early. So on
    // the real clock an age that reached back into that hour came out an hour too old: in New York from 06:00 UTC on
    // 1 November 2026, for as long after it as the age reaches back.
    for (const [zone, moment] of IN_THE_REPEATED_HOUR) {
      process.env.TZ = zone
      for (const [what, check] of AGE_CHECKS) {
        vi.useFakeTimers({ toFake: ['Date'] })
        try {
          vi.setSystemTime(new Date(moment))
          check()
        } catch (err) {
          throw new Error(`in ${zone} at ${moment}, ${what}: ${err instanceof Error ? err.message : String(err)}`)
        } finally {
          vi.useRealTimers()
        }
      }
    }
  })
})

// ============================================================================ one rule, one copy

describe('every reader agrees, because there is only one of them', () => {
  inEveryZone('the browser and the shared rule read a stamp identically', () => {
    // parseStamp is what the interface calls; parseLocalStamp is the rule. This is the pair that
    // disagreed. If someone re-implements either one, this fails.
    for (const stamp of [WALL_STAMP, '2026-08-09 23:59:59', '2026-01-15 09:00:00', '2026-08-09']) {
      const viaUi = parseStamp(stamp)
      const viaShared = parseLocalStamp(stamp)
      expect(viaUi).not.toBeNull()
      expect((viaUi as Date).getTime()).toBe(viaShared)
    }
  })

  inEveryZone('attention.ts is the shared rule and not a copy of it', () => {
    expect(parseFromAttention).toBe(parseLocalStamp)
  })

  inEveryZone('the strict reader agrees with the lenient one on well-formed stamps', () => {
    for (const stamp of [WALL_STAMP, '2026-12-31 23:59:59', '2026-02-28 06:00:00']) {
      expect(parseStoredStamp(stamp)).toBe(parseLocalStamp(stamp))
    }
  })

  it('the strict reader refuses what is merely date-shaped', () => {
    process.env.TZ = 'Europe/London'
    // The server uses this where every input was written by localStamp, so a bare date means
    // something upstream is wrong. Refusing gets it reported; accepting would guess a midnight
    // nobody wrote, which is the silent fallback this product does not have.
    expect(parseStoredStamp('2026-08-09')).toBeNull()
    expect(parseStoredStamp('2026-08-09 00:30')).toBeNull()
    expect(parseLocalStamp('2026-08-09')).not.toBeNull()
  })

  it('the validator and the parsers share one grammar', () => {
    // shared/kinds.ts builds its date validator from STAMP_GRAMMAR. Before that it carried its own
    // copy and a comment saying the two matched. If the grammar is edited, both move together.
    expect(STAMP_GRAMMAR).toContain(String.raw`(\d{4})-(\d{2})-(\d{2})`)
    const anchored = new RegExp(`^${STAMP_GRAMMAR}\\s*$`)
    for (const good of ['2026-08-09', '2026-08-09 17:00', '2026-08-09 17:00:00', '2026-08-09T17:00:00']) {
      expect(anchored.test(good)).toBe(true)
      expect(parseLocalStamp(good)).not.toBeNull()
    }
  })
})

// ============================================================================ what is not ours

describe('a stamp that states its own timezone keeps it', () => {
  inEveryZone('a trailing Z still means UTC', () => {
    // Mole Office never writes these, but agent logs and other tools do, and the honest answer is to
    // believe what the string says. Fixing the bug by deleting the Z everywhere would have broken
    // this in the opposite direction.
    const d = parseAnyStamp('2026-08-09T00:30:05Z')
    expect(d).not.toBeNull()
    expect((d as Date).toISOString()).toBe('2026-08-09T00:30:05.000Z')
  })

  inEveryZone('an explicit offset is respected', () => {
    const d = parseAnyStamp('2026-08-09T00:30:05+05:30')
    expect(d).not.toBeNull()
    expect((d as Date).toISOString()).toBe('2026-08-08T19:00:05.000Z')
  })

  inEveryZone('our own form is still read as local even though it has a T in it', () => {
    const d = parseAnyStamp('2026-08-09T00:30:05') as Date
    expect(d.getHours()).toBe(0)
    expect(d.getMinutes()).toBe(30)
  })
})

// ============================================================================ refusals

describe('what cannot be read is refused, never guessed', () => {
  inEveryZone('unreadable input is null rather than now', () => {
    // A date that cannot be read must never be quietly treated as the present moment: an
    // obligation whose due date is unparseable would come due today, every day.
    for (const bad of ['', 'soon', 'next tuesday', 'tomorrow', 'not a date']) {
      expect(parseLocalStamp(bad)).toBeNull()
      expect(parseStamp(bad)).toBeNull()
    }
  })

  inEveryZone('a bare date is the start of the day, and a due date is the end of it', () => {
    const start = parseLocalStamp('2026-08-03') as number
    const due = parseDueStamp('2026-08-03') as number
    expect(new Date(start).getHours()).toBe(0)
    expect(new Date(due).getHours()).toBe(23)
    expect(due).toBeGreaterThan(start)
  })
})

// ============================================================================ which clock wrote it

/**
 * `stampWrittenIn` is the checker the write paths are held to in tests/stamp-columns.test.ts. Its
 * job is to look at a string that is already in a column and say which clock produced it, so that
 * a caller which skipped `localStamp` — or a SQL default, which skips everything — is caught.
 *
 * The case that matters most is `indistinguishable`. At offset zero a local stamp and a UTC stamp
 * are the same characters, so there is no evidence either way, and saying "local" there is what a
 * suite of 1,129 tests effectively did for two months.
 */
describe('which clock a stored stamp came from', () => {
  // THE CLOCK IS SET, NOT READ. Read from the real clock, the first two cases went red in Europe/London from 01:00 GMT
  // on 25 October 2026 until the clocks go forward on 28 March 2027: in winter London is at offset zero, where a local
  // stamp and a UTC one are the same string, as the third case pins. So those two stand at a summer moment, when
  // every zone in ZONES but UTC is away from offset zero.
  // The form SQLite's `datetime('now')` produces: UTC, to the second, space-separated. Built
  // from the moment rather than hard-coded, per this file's rule about epoch literals.
  const fromAUtcClock = (when: Date) => when.toISOString().slice(0, 19).replace('T', ' ')

  inEveryZone('a stamp we just wrote is local, except at offset zero where nothing can tell', (zone) => {
    atTheMoment(IN_SUMMER, (when) => {
      expect(stampWrittenIn(localStamp(when), when)).toBe(zone === 'UTC' ? 'indistinguishable' : 'local')
    })
  })

  inEveryZone('the string a UTC clock writes for the same moment is utc', (zone) => {
    atTheMoment(IN_SUMMER, (when) => {
      expect(stampWrittenIn(fromAUtcClock(when), when)).toBe(zone === 'UTC' ? 'indistinguishable' : 'utc')
    })
  })

  it('in winter London is at offset zero, so nothing can tell a stamp written there from a UTC one', () => {
    process.env.TZ = 'Europe/London'
    atTheMoment('2027-01-15T12:00:00.250Z', (when) => {
      expect(stampWrittenIn(localStamp(when), when)).toBe('indistinguishable')
      expect(stampWrittenIn(fromAUtcClock(when), when)).toBe('indistinguishable')
    })
  })

  it('no tolerance short of absurd can make a UTC stamp look like a local one', () => {
    // +05:30 is the smaller of the two offsets the column tests use. Ten minutes is twenty times
    // the default tolerance and still thirty-three times smaller than the offset.
    process.env.TZ = 'Asia/Kolkata'
    const when = new Date()
    const fromAUtcClock = when.toISOString().slice(0, 19).replace('T', ' ')
    expect(stampWrittenIn(fromAUtcClock, when, 10 * 60_000)).toBe('utc')
  })

  inEveryZone('a stamp of some other moment is neither, not a near miss', () => {
    // An old row read against today. Reporting it as "local" because it is local-shaped would let
    // a column full of stale values pass a check about what was just written to it.
    expect(stampWrittenIn('2020-01-01 00:00:00', new Date())).toBe('neither')
  })

  inEveryZone('what is not a stamp is unreadable, never guessed at', () => {
    for (const bad of ['', 'soon', 'next tuesday', 'not a date']) {
      expect(stampWrittenIn(bad, new Date())).toBe('unreadable')
    }
  })

  inEveryZone('it reads the same grammar the parsers do, so a bare date is judged too', () => {
    // Every form STAMP_GRAMMAR admits, judged rather than refused. `parseStoredStamp` is the one
    // that refuses a merely date-shaped value; this is the lenient side and says so.
    const midnight = new Date()
    midnight.setHours(0, 0, 0, 0)
    const bareDate = localStamp(midnight).slice(0, 10)
    expect(stampWrittenIn(bareDate, midnight)).not.toBe('unreadable')
  })
})
