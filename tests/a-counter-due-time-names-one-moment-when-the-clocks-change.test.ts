// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A COUNTER'S DUE TIME NAMES ONE MOMENT ON THE TWO NIGHTS THE CLOCKS CHANGE.
 *
 * Item 11 of 13r's list, problem tl4r2TCQl_Oh. In Europe/London the hour from 01:00 to 02:00 comes twice on
 * 25 October 2026, and never comes on 28 March 2027. A stamp with no offset cannot say which of the two 01:30s it
 * means. So a counter row keeps its moment with its offset as well, and a counter publishes each due time and each
 * held-back boundary as an instant beside its stamp.
 *
 * WHAT IS PROVED, one claim at a time:
 *
 *   1  a due time in the second 01:30 does not fire at the first one, fires once at its own moment, and the next
 *      one is due 2.5 hours after it, each published with its offset;
 *   2  a firing in the first 01:30 is read back as that moment, so the next one is due 2.5 hours after it and not
 *      an hour later;
 *   3  a limit that runs across 02:00 BST holds for its real length, so the counter does not fire twice inside it;
 *   4  a firing row written before the moment was kept is read as the later of its two moments, so nothing comes
 *      due early;
 *   5  on the March night a due time across the skipped hour fires at its moment and is published with its offset;
 *   6  on the March night a limit across the skipped hour holds for its real length.
 *
 * THE ZONE IS THE TEST'S. The suite may run in any zone, and in UTC no clock ever changes, so this file sets
 * process.env.TZ to Europe/London for itself and puts it back in afterAll. The clock is the test's too:
 * `vi.setSystemTime` moves every stamp the product writes, and each tick takes its moment as an argument.
 *
 * BEFORE THE CODE, cases 1, 3 and 4 are red on what the counter does, and cases 2, 5 and 6 only because no instant
 * was published. Case 2 is right before the code because a bare stamp was read as its earlier moment; it is here so
 * that reading the later moment does not spoil a firing whose moment was kept. MARCH IS RIGHT BEFORE THE CODE TOO:
 * no stamp the office writes falls in the skipped hour, so the old stamps read back right on that night. Only a stamp
 * a person types can fall there, and how one is read is item 11b, not decided here (RoSUAeh46v9j).
 *
 * MUTATIONS: the instant left off nextDue: cases 1, 2, 4 and 5 red. A row's kept moment ignored, its stamp read as
 * the later moment: cases 2 and 3 red. The old reading of a stamp kept, the earlier moment, for a row and for a stamp
 * the office wrote: cases 1 and 4 red. The instant left off heldBack: cases 3 and 6 red.
 */

import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { gateNumber } from '../src/config/settings.mjs'

let t: TestDb
let app: FastifyInstance
let counters: typeof import('../src/server/lib/counters.ts')
const zoneBefore = process.env.TZ

const asKeeper = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': 'clock-change-keeper',
}

type Reading = {
  counter: {
    atMostOnceEvery: number
    nextDue: { at: string; instant?: string } | null
    heldBack: { at: string; until: string; untilInstant?: string } | null
    lastFiring: { at: string } | null
  }
}

/** The wall stamp and the instant of a moment in Europe/London, worked out here by Intl and not by the code under test. */
function inLondon(ms: number): { stamp: string; instant: string } {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Europe/London', hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit', timeZoneName: 'longOffset',
    }).formatToParts(ms).map((part) => [part.type, part.value]),
  )
  const stamp = `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}:${parts.second}`
  const offset = parts.timeZoneName === 'GMT' ? '+00:00' : String(parts.timeZoneName).slice(3)
  return { stamp, instant: `${stamp.replace(' ', 'T')}.${String(ms % 1000).padStart(3, '0')}${offset}` }
}

/** File a counter through its own door at a moment this test chooses, and hand back its id. */
async function aCounterAt(when: Date, body: Record<string, unknown>): Promise<string> {
  vi.setSystemTime(when)
  const r = await app.inject({ method: 'POST', url: '/api/counters', headers: asKeeper, payload: body })
  expect(r.statusCode, r.body).toBe(201)
  return (JSON.parse(r.body) as { counter: { id: string } }).counter.id
}

/** A timer, which nobody adds to, every 2.5 hours from its filing. */
function aTimer(title: string): Record<string, unknown> {
  return {
    title,
    counts: 'Nothing: it is a timer.',
    mayAdd: { anyone: false, who: [] },
    triggers: [{ kind: 'every', hours: 2.5 }],
    action: { kind: 'task', title: `${title}, the look` },
  }
}

/** A counter that fires on every addition, at most once every 60 minutes or the office's shortest time if longer. */
function aCountOfOne(title: string): Record<string, unknown> {
  return {
    title,
    counts: 'Synthetic additions.',
    triggers: [{ kind: 'count', n: 1 }],
    atMostOnceEvery: 60,
    action: { kind: 'task', title: `${title}, the look` },
  }
}

/** Add one at a moment this test chooses, and hand back what the door said. */
async function addAt(when: Date, id: string): Promise<{ fired: unknown; heldBack: unknown }> {
  vi.setSystemTime(when)
  const r = await app.inject({ method: 'POST', url: `/api/counters/${id}/add`, headers: asKeeper, payload: { by: 1, because: 'One more.' } })
  expect(r.statusCode, r.body).toBe(201)
  return JSON.parse(r.body) as never
}

/** One tick of the counters' own watcher, at a moment this test chooses. */
function tickAt(when: Date): string[] {
  vi.setSystemTime(when)
  return counters.fireTheCountersThatAreDue(when).fired
}

async function read(id: string): Promise<Reading> {
  const r = await app.inject({ method: 'GET', url: `/api/counters/${id}`, headers: asKeeper })
  expect(r.statusCode, r.body).toBe(200)
  return JSON.parse(r.body) as Reading
}

beforeAll(async () => {
  process.env.TZ = 'Europe/London'
  vi.useFakeTimers({ toFake: ['Date'] })
  t = await freshDb()
  app = (await apiApp()).app
  counters = await import('../src/server/lib/counters.ts')
  const r = await app.inject({
    method: 'POST',
    url: '/api/agents/started',
    headers: { ...asKeeper, 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id },
    payload: { handle: 'clock-change-keeper', name: 'Synthetic clock-change keeper' },
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

describe('25 October 2026, when the hour from 01:00 to 02:00 comes twice', () => {
  it('the zone is Europe/London, where 00:30 and 01:30 UTC are both 01:30 on the wall', () => {
    expect(inLondon(Date.parse('2026-10-25T00:30:00Z')).stamp).toBe('2026-10-25 01:30:00')
    expect(inLondon(Date.parse('2026-10-25T01:30:00Z')).stamp).toBe('2026-10-25 01:30:00')
    expect(new Date('2026-10-25T00:30:00Z').getTimezoneOffset()).toBe(-60)
  })

  it('a due time in the second 01:30 fires once at its own moment, not an hour early, and the next is due 2.5 hours on', async () => {
    const id = await aCounterAt(new Date('2026-10-24T23:00:00Z'), aTimer('Second pass'))
    const due = (await read(id)).counter.nextDue
    expect(due?.at).toBe('2026-10-25 01:30:00')

    expect(tickAt(new Date('2026-10-25T00:30:00Z')), 'it fired at the first 01:30, an hour early').not.toContain(id)
    expect(tickAt(new Date('2026-10-25T01:30:00Z'))).toContain(id)
    expect(tickAt(new Date('2026-10-25T01:30:00Z')), 'it fired twice at one moment').not.toContain(id)

    const back = await read(id)
    expect(back.counter.lastFiring?.at).toBe('2026-10-25 01:30:00')
    expect(back.counter.nextDue?.at, 'the next one was not counted from the moment it fired').toBe('2026-10-25 04:00:00')
    expect(tickAt(new Date('2026-10-25T03:59:00Z')), 'the next one fired early').not.toContain(id)

    expect(due?.instant, 'the due time was published without its moment').toBe('2026-10-25T01:30:00.000+00:00')
    expect(back.counter.nextDue?.instant).toBe('2026-10-25T04:00:00.000+00:00')
  })

  it('a firing in the first 01:30 is read back as that moment, so the next is due 2.5 hours on and not an hour later', async () => {
    const id = await aCounterAt(new Date('2026-10-24T22:00:00Z'), aTimer('First pass'))
    const due = (await read(id)).counter.nextDue
    expect(due?.at).toBe('2026-10-25 01:30:00')

    expect(tickAt(new Date('2026-10-25T00:30:00Z'))).toContain(id)
    const back = await read(id)
    expect(back.counter.lastFiring?.at).toBe('2026-10-25 01:30:00')
    expect(back.counter.nextDue?.at, 'the firing was read back as the second 01:30').toBe('2026-10-25 03:00:00')
    expect(tickAt(new Date('2026-10-25T03:00:00Z'))).toContain(id)

    expect(due?.instant, 'the due time was published without its moment').toBe('2026-10-25T01:30:00.000+01:00')
    expect(back.counter.nextDue?.instant).toBe('2026-10-25T03:00:00.000+00:00')
  })

  it('a limit that runs across 02:00 BST holds for its real length, so the counter does not fire twice inside it', async () => {
    const id = await aCounterAt(new Date('2026-10-24T23:00:00Z'), aCountOfOne('Across the change'))
    const window = Math.max((await read(id)).counter.atMostOnceEvery, gateNumber('counter-spacing')) * 60_000
    const firedAt = Date.parse('2026-10-25T00:40:00Z')
    const ends = inLondon(firedAt + window)

    expect((await addAt(new Date(firedAt), id)).fired).not.toBeNull()
    expect((await addAt(new Date(firedAt + 10 * 60_000), id)).fired, 'it fired again ten minutes into its limit').toBeNull()
    const held = (await read(id)).counter.heldBack
    expect(held?.until).toBe(ends.stamp)

    expect(tickAt(new Date(firedAt + window - 1000)), 'it fired before its limit was over').not.toContain(id)
    expect(tickAt(new Date(firedAt + window))).toContain(id)
    expect(held?.untilInstant, 'the boundary was published without its moment').toBe(ends.instant)
  })

  it('a firing row written before the moment was kept is read as the later of its two moments, so nothing comes due early', async () => {
    const id = await aCounterAt(new Date('2026-10-24T22:00:00Z'), aTimer('An old row'))
    expect(tickAt(new Date('2026-10-25T00:30:00Z'))).toContain(id)
    // AS AN OFFICE BEFORE MIGRATION 0299 WROTE IT: the stamp alone, which names 00:30 UTC and 01:30 UTC alike. Before
    // that migration there is no column to empty, and every row is written this way.
    const columns = (t.client.sqlite.prepare('PRAGMA table_info(counter_rows)').all() as { name: string }[]).map((c) => c.name)
    if (columns.includes('at_instant')) t.client.sqlite.prepare('UPDATE counter_rows SET at_instant = NULL WHERE counter_id = ?').run(id)

    const due = (await read(id)).counter.nextDue
    expect(due?.at, 'a stamp with no moment kept was read as its earlier moment').toBe('2026-10-25 04:00:00')
    expect(tickAt(new Date('2026-10-25T03:00:00Z')), 'it came due early').not.toContain(id)
    expect(due?.instant).toBe('2026-10-25T04:00:00.000+00:00')
  })
})

describe('28 March 2027, when the hour from 01:00 to 02:00 never comes', () => {
  it('a due time across the skipped hour fires at its moment and is published with its offset', async () => {
    const id = await aCounterAt(new Date('2027-03-27T23:30:00Z'), aTimer('Across the gap'))
    const due = (await read(id)).counter.nextDue
    expect(due?.at).toBe('2027-03-28 03:00:00')

    expect(tickAt(new Date('2027-03-28T01:59:00Z'))).not.toContain(id)
    expect(tickAt(new Date('2027-03-28T02:00:00Z'))).toContain(id)
    const next = (await read(id)).counter.nextDue
    expect(next?.at).toBe('2027-03-28 05:30:00')

    expect(due?.instant, 'the due time was published without its moment').toBe('2027-03-28T03:00:00.000+01:00')
    expect(next?.instant).toBe('2027-03-28T05:30:00.000+01:00')
  })

  it('a limit across the skipped hour holds for its real length', async () => {
    const id = await aCounterAt(new Date('2027-03-28T00:00:00Z'), aCountOfOne('A limit across the gap'))
    const window = Math.max((await read(id)).counter.atMostOnceEvery, gateNumber('counter-spacing')) * 60_000
    const firedAt = Date.parse('2027-03-28T00:30:00Z')
    const ends = inLondon(firedAt + window)

    expect((await addAt(new Date(firedAt), id)).fired).not.toBeNull()
    expect((await addAt(new Date(firedAt + 30 * 60_000), id)).fired, 'it fired again inside its limit').toBeNull()
    const held = (await read(id)).counter.heldBack
    expect(held?.until).toBe(ends.stamp)

    expect(tickAt(new Date(firedAt + window - 1000))).not.toContain(id)
    expect(tickAt(new Date(firedAt + window))).toContain(id)
    expect(held?.untilInstant, 'the boundary was published without its moment').toBe(ends.instant)
  })
})
