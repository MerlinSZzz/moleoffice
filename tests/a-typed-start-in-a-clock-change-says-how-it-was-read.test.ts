// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A TYPED START IN A CLOCK-CHANGE HOUR SAYS WHICH MOMENT IT WAS READ AS.
 *
 * Item 11b of 13r's list, on the secretary's decision of 10 November 2026. A counter's `every` trigger may carry a
 * typed `from` with no offset. In Europe/London the wall hour from 01:00 to 02:00 never comes on the spring night
 * and comes twice on the autumn one, so a typed 01:30 can name no moment or two. The door keeps accepting it and
 * reads it the way the office always has: an hour on in the gap, the first of the fold.
 *
 * WHAT IS PROVED, one claim at a time:
 *
 *   1  the hour that never comes: `fromReading` and the trigger's words say the typed start was read an hour on,
 *      and the due instant is one hour on from the typed wall time;
 *   2  the hour that comes twice: `fromReading` and the words say it was read as the first, and the due instant is
 *      that first moment;
 *   3  an ordinary hour: nothing extra is said, and the due instant is the typed moment.
 *
 * THE OLD BEHAVIOUR WAS SILENT. The answer said only "Fires every 24 hours." and a person had to work out from the
 * stored stamp that the office had moved the start by an hour. The decided behaviour says it in plain words, on
 * the door's answer and on the page that draws the same words. The new word keys are the only place the sentence
 * lives; this file reads them through `t` and never copies one.
 *
 * THE ZONE IS THE TEST'S. The suite may run in any zone, and in UTC no clock ever changes, so this file sets
 * process.env.TZ to Europe/London for itself and puts it back in afterAll. The clock is the test's too: each case
 * sets the system time before it files its counter, and the two transitions are worked out from `Intl` hour by
 * hour, so no transition date is copied into this file and none goes stale.
 *
 * MUTATIONS: `typedStartsReading` always null makes cases 1 and 2 red and leaves 3 green. Taking the append out of
 * `triggerWords` makes cases 1 and 2 red on their words and leaves 3 green. Leaving `fromReading` off the trigger
 * reading makes cases 1 and 2 red on the field.
 */

import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { createI18n } from '../src/shared/i18n.ts'
import { gapBetween } from '../src/shared/spacing.ts'

let t: TestDb
let app: FastifyInstance
const zoneBefore = process.env.TZ
const ZONE = 'Europe/London'
const say = createI18n('en').t

const asKeeper = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': 'typed-start-keeper',
}

/** A counter's reply, as much as these cases read. */
type Reading = {
  counter: {
    triggers: { kind: string; fromReading?: string | null; words: string }[]
    nextDue: { at: string; instant: string } | null
  }
}

/** The offset a zone is at a moment, in milliseconds east of UTC, read from `Intl` and not from the code under test. */
const offsetForm = new Intl.DateTimeFormat('en-GB', { timeZone: ZONE, timeZoneName: 'longOffset' })
function offsetAt(ms: number): number {
  const name = offsetForm.formatToParts(ms).find((part) => part.type === 'timeZoneName')?.value ?? ''
  const parts = /^GMT(?:([+-])(\d{2}):(\d{2}))?$/.exec(name)
  if (parts === null) throw new Error(`Intl named an offset this test cannot read: ${name}`)
  return parts[1] === undefined ? 0 : (parts[1] === '-' ? -1 : 1) * (Number(parts[2]) * 60 + Number(parts[3])) * 60_000
}

/** The wall clock of a moment in the zone, `YYYY-MM-DD HH:MM:SS`, worked out here by Intl. */
function wallAt(ms: number): string {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: ZONE, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    }).formatToParts(ms).map((part) => [part.type, part.value]),
  )
  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}:${parts.second}`
}

/** The instant of a moment in the zone, with its offset, worked out here by Intl. */
function instantAt(ms: number): string {
  const wall = wallAt(ms)
  const name = offsetForm.formatToParts(ms).find((part) => part.type === 'timeZoneName')?.value ?? ''
  const offset = name === 'GMT' ? '+00:00' : name.slice(3)
  return `${wall.replace(' ', 'T')}.${String(ms % 1000).padStart(3, '0')}${offset}`
}

/** A wall stamp moved by whole minutes on the wall clock, which is how the hour a zone skips is named. */
function wallPlus(stamp: string, minutes: number): string {
  const ms = Date.UTC(
    Number(stamp.slice(0, 4)), Number(stamp.slice(5, 7)) - 1, Number(stamp.slice(8, 10)),
    Number(stamp.slice(11, 13)), Number(stamp.slice(14, 16)), Number(stamp.slice(17, 19)),
  ) + minutes * 60_000
  return new Date(ms).toISOString().slice(0, 19).replace('T', ' ')
}

/**
 * THE NEXT CLOCK CHANGE IN THE ZONE after a moment, as the first instant after it, worked out hour by hour. No date
 * is copied into the file; the transition is found from the offset Intl reports on either side of it.
 */
function theNextChange(after: number, direction: 'forward' | 'back'): number {
  const hour = 3_600_000
  for (let ms = Math.floor(after / hour) * hour; ms < after + 2 * 366 * 24 * hour; ms += hour) {
    const before = offsetAt(ms)
    const later = offsetAt(ms + hour)
    if (direction === 'forward' ? later <= before : later >= before) continue
    let earlier = ms
    let at = ms + hour
    while (at - earlier > 1) {
      const middle = Math.floor((earlier + at) / 2)
      if (offsetAt(middle) === before) earlier = middle
      else at = middle
    }
    return at
  }
  throw new Error(`${ZONE} has no night when its clocks change ${direction} in the next two years.`)
}

/** File a timer through the counter door at a moment this test chooses, and hand back the reply. */
async function aCounterFrom(when: Date, from: string): Promise<Reading> {
  vi.setSystemTime(when)
  const r = await app.inject({
    method: 'POST',
    url: '/api/counters',
    headers: asKeeper,
    payload: {
      title: 'A typed start',
      counts: 'Nothing: it is a timer.',
      mayAdd: { anyone: false, who: [] },
      triggers: [{ kind: 'every', hours: 24, from }],
      action: { kind: 'task', title: 'A typed start, the look' },
    },
  })
  expect(r.statusCode, r.body).toBe(201)
  return JSON.parse(r.body) as Reading
}

/** The wall words the classifier writes for a person, from a stored wall stamp. */
function forAPerson(stamp: string): string {
  return `${stamp.slice(0, 4)}/${stamp.slice(5, 7)}/${stamp.slice(8, 10)} ${stamp.slice(11, 16)}`
}

beforeAll(async () => {
  process.env.TZ = ZONE
  vi.useFakeTimers({ toFake: ['Date'] })
  t = await freshDb()
  app = (await apiApp()).app
  const r = await app.inject({
    method: 'POST',
    url: '/api/agents/started',
    headers: { ...asKeeper, 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id },
    payload: { handle: 'typed-start-keeper', name: 'Synthetic typed-start keeper' },
  })
  expect(r.statusCode, r.body).toBe(201)
}, 60_000)

afterAll(async () => {
  vi.useRealTimers()
  await app?.close()
  t?.close()
  if (zoneBefore === undefined) delete process.env.TZ
  else process.env.TZ = zoneBefore
})

describe('a typed start in a clock-change hour', () => {
  it('the hour that never comes is read an hour on, and the answer says so', async () => {
    const at = theNextChange(Date.UTC(2026, 0, 1), 'forward')
    const readMs = at + 30 * 60_000
    const shift = (offsetAt(at) - offsetAt(at - 1)) / 60_000
    const typed = wallPlus(wallAt(readMs), -shift).slice(0, 16)
    const readAs = wallAt(readMs).slice(0, 16)
    const reply = await aCounterFrom(new Date(at - 30 * 24 * 3_600_000), typed)
    const trigger = reply.counter.triggers[0]!
    const reading = say('g7a.counters.triggerFromSkipped', { from: forAPerson(typed), readAs: readAs.slice(11) })

    expect(trigger.fromReading, 'the answer did not say which moment the typed start was read as').toBe(reading)
    expect(trigger.words).toBe(say('g7a.counters.triggerEvery', { n: 24 }) + gapBetween(say('g7a.counters.triggerEvery', { n: 24 }), reading) + reading)
    expect(reply.counter.nextDue?.instant, 'the due moment is not the moment the answer says it was read as').toBe(instantAt(readMs))
  })

  it('the hour that comes twice is read as its first moment, and the answer says so', async () => {
    const at = theNextChange(Date.UTC(2026, 0, 1), 'back')
    const typed = wallAt(at - 30 * 60_000).slice(0, 16)
    const readAs = wallAt(at - 30 * 60_000).slice(0, 16)
    const reply = await aCounterFrom(new Date(at - 30 * 24 * 3_600_000), typed)
    const trigger = reply.counter.triggers[0]!
    const reading = say('g7a.counters.triggerFromRepeated', { from: forAPerson(typed), readAs: readAs.slice(11) })

    expect(trigger.fromReading, 'the answer did not say which moment the typed start was read as').toBe(reading)
    expect(trigger.words).toBe(say('g7a.counters.triggerEvery', { n: 24 }) + gapBetween(say('g7a.counters.triggerEvery', { n: 24 }), reading) + reading)
    expect(reply.counter.nextDue?.instant, 'the due moment is not the first of the two moments').toBe(instantAt(at - 30 * 60_000))
  })

  it('an ordinary hour says nothing extra', async () => {
    const at = theNextChange(Date.UTC(2026, 0, 1), 'forward')
    const typed = wallAt(at + 2 * 3_600_000).slice(0, 16)
    const reply = await aCounterFrom(new Date(at - 30 * 24 * 3_600_000), typed)
    const trigger = reply.counter.triggers[0]!

    expect('fromReading' in trigger, 'an ordinary start was given a clock-change reading').toBe(false)
    expect(trigger.words).toBe(say('g7a.counters.triggerEvery', { n: 24 }))
    expect(reply.counter.nextDue?.instant).toBe(instantAt(at + 2 * 3_600_000))
  })
})
