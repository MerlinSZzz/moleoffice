// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE MADE-UP OFFICE BUILDS ON THE DAY THE CLOCKS GO BACK.
 *
 * Round 78 of wave 13y. In Europe/London the hour from 01:00 to 02:00 came twice on 25 October 2026. The builder of
 * the made-up office (tests/the-office-at-the-live-scale.ts) named each counted hour of `hourly_calls` by the local
 * clock, and the table keeps one row for each hour, operation, project and listener. So a build whose counted hours
 * ran back across both 01:00s failed on a duplicate hour, as round 78's first build did that morning. The builder now
 * names those hours by UTC, where no hour comes twice.
 *
 * THE ZONE IS THE TEST'S. In UTC no clock ever changes, so this file sets process.env.TZ to Europe/London for itself
 * and puts it back in afterAll, as tests/a-counter-due-time-names-one-moment-when-the-clocks-change.test.ts does. It
 * builds one in twenty of the copy of 5 October into a fresh test database, with the requests ending at 03:30 UTC
 * that day, so the counted hours run back past 00:00 UTC.
 *
 *   1  the build ends, and it writes the scale's count of counted hours;
 *   2  the hours are named by UTC: the hour of the requests' end, and each hour before it in turn.
 *
 * MUTATIONS: name the hours by the local clock again, and the build fails on the duplicate hour, so both cases are
 * red. Name them an hour off UTC, or by the day alone, and case 2 is red, and by the day alone case 1 as well.
 */
import { afterAll, beforeAll, expect, it } from 'vitest'
import { freshDb, type TestDb } from './helpers.ts'
import { buildTheOfficeAtAScale, oneIn, THE_COPY_OF_5_OCTOBER } from './the-office-at-the-live-scale.ts'

const zoneBefore = process.env.TZ
const SCALE = oneIn(THE_COPY_OF_5_OCTOBER, 20)
/** Half an hour after the clocks went back, in UTC. */
const THE_END = new Date('2026-10-25T03:30:00.000Z')
const HOUR = 3_600_000
let t: TestDb
let failed: unknown = null

beforeAll(async () => {
  process.env.TZ = 'Europe/London'
  t = await freshDb()
  const { readTheOfficeOwner } = await import('../src/server/db/owner-setting.ts')
  const person = readTheOfficeOwner(t.client.sqlite)?.id
  if (person === undefined) throw new Error('The fresh test database has no owner, so the made-up office has nobody to build for.')
  try {
    buildTheOfficeAtAScale(t.client.sqlite, person, SCALE, THE_END)
  } catch (err) {
    failed = err
  }
}, 120_000)

afterAll(() => {
  t?.close()
  if (zoneBefore === undefined) delete process.env.TZ
  else process.env.TZ = zoneBefore
})

it('the zone is London, where the hour from 01:00 came twice on that day', () => {
  expect(new Date('2026-10-25T00:30:00.000Z').getHours()).toBe(1)
  expect(new Date('2026-10-25T01:30:00.000Z').getHours()).toBe(1)
})

it('1 the build ends, and writes the scale\'s count of counted hours', () => {
  expect(failed === null ? null : String(failed)).toBeNull()
  const written = (t.client.sqlite.prepare('SELECT count(*) AS n FROM hourly_calls').get() as { n: number }).n
  expect(written).toBe(SCALE.hourlyCalls)
})

it('2 the hours are named by UTC, from the hour of the end back one hour at a time', () => {
  expect(failed === null ? null : String(failed)).toBeNull()
  const named = (t.client.sqlite.prepare('SELECT DISTINCT hour FROM hourly_calls ORDER BY hour DESC').all() as { hour: string }[]).map((one) => one.hour)
  const utc = named.map((_, back) => new Date(THE_END.getTime() - back * HOUR).toISOString().slice(0, 13).replace('T', ' '))
  expect(named.length).toBeGreaterThan(4)
  expect(named).toEqual(utc)
  expect(named).toContain('2026-10-25 00')
})
