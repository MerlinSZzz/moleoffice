// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A PERMANENT RESIDENT'S SLEEP, HEARTBEAT, CRITERION AND NAMING, AS THE PAGES DRAW THEM FROM A READING.
 *
 * Three decisions say: item 1 of the first, how long ago it last slept shows on the agent's chat side and on its
 * profile, with its compactions, and a postponed sleep is shown and sent to nobody; the criterion on the proposal,
 * and the picture-and-name reminder; and the heartbeat.
 * The server's half is in
 * tests/a-permanent-resident-sleeps-and-is-named.test.ts.
 *
 * WHAT IS MEASURED, each drawn with renderToStaticMarkup from a reading written here, with no server:
 *   1. the chat's line: "Asleep since" while a resident is asleep, and nothing for an awake resident, with or without a
 *      last sleep, or for a non-resident;
 *   2. the profile's Sleep place: heartbeat, now, last sleep ended, compactions, and the postponed sleeps;
 *   3. the naming place: the press for the person only, and "Chosen" once it is said;
 *   4. the proposal's criterion list: each part met, not met, not reported, and the area.
 *
 * MUTATION, not yet run: `sleepLineWords` in src/web/components/SleepLine.tsx says "Last slept" again for an awake
 * resident → case 1 goes red. The change that wrote this case ran no tests.
 *
 * OLD (wave 13s round 113): the cases ran on the real clock in the machine's zone. Run at 04:23 winter time on 25
 * October 2026, case 1's sleep three hours before was written 01:23, a time the clocks show twice that night. It was
 * read as the summer-time one, four hours before, and the line said "Last slept 4h ago".
 * NEW: the cases run on a fixed clock in Europe/London, frozen at noon summer time on 24 October 2026, and never read
 * the real time.
 * WHY: a test that reads the real time passes or fails by the hour it is run at.
 * MUTATION (round 113, after a control run, then restored): `sleepLineWords` says how long ago the line is drawn, not
 * the last sleep → case 1 went red. Case 1 no longer draws a last sleep, so it cannot catch this mutation now.
 *
 * OLD: the chat's line said how long ago an awake resident last slept, and when it sleeps.
 * NEW: the chat's line says only that a resident is asleep. An awake resident has no line in the chat. The profile's
 * Sleep place still says when its last sleep ended (case 2).
 * WHY: the chat shows whether a resident is asleep where it shows presence. The rest of its sleep is on the profile.
 *
 * OLD (wave 13y round 111): a resident with no sleep recorded had the chat's line "No sleep recorded".
 * NEW: it has no line in the chat. The profile's Sleep place still says "No sleep recorded" (case 2).
 * WHY: where the chat has nothing to show, it shows nothing, and no sentence
 * stands in for the missing value.
 */

import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { setWordLanguage } from '../src/shared/i18n.ts'
import { localStamp } from '../src/shared/time.ts'
import type { OneResidentReading } from '../src/web/lib/residents.ts'

// THE CLOCK READS IN EUROPE/LONDON, set before any module reads the zone. The zone before is put back after the file.
const theZoneBefore = vi.hoisted(() => {
  const before = process.env.TZ
  process.env.TZ = 'Europe/London'
  return before
})
/** Noon summer time on 24 October 2026, an ordinary day: the clock every case stands at. */
const AN_ORDINARY_NOON = Date.UTC(2026, 9, 24, 11, 0, 0)

// src/web/api.ts reads window.localStorage when it is imported. This is the smallest stand-in that
// lets the components load; nothing in it is under test.
const store = new Map<string, string>()
const storage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
}
;(globalThis as unknown as { window: unknown }).window = {
  localStorage: storage,
  sessionStorage: storage,
  location: { hash: '', search: '' },
  addEventListener: () => {},
  removeEventListener: () => {},
}

let line: typeof import('../src/web/components/SleepLine.tsx')
let sleep: typeof import('../src/web/components/ResidentSleep.tsx')
let proposals: typeof import('../src/web/components/ResidentProposals.tsx')

beforeAll(async () => {
  vi.useFakeTimers({ toFake: ['Date'], now: AN_ORDINARY_NOON })
  line = await import('../src/web/components/SleepLine.tsx')
  sleep = await import('../src/web/components/ResidentSleep.tsx')
  proposals = await import('../src/web/components/ResidentProposals.tsx')
})

afterAll(() => {
  vi.useRealTimers()
  if (theZoneBefore === undefined) delete process.env.TZ
  else process.env.TZ = theZoneBefore
})

afterEach(() => setWordLanguage('en'))

function strip(markup: string): string {
  return markup.replace(/<style[\s\S]*?<\/style>/g, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
}

function buttons(markup: string): string[] {
  return [...markup.matchAll(/<button[^>]*>([\s\S]*?)<\/button>/g)].map((one) => strip(one[1]!))
}

const stamp = '2026-10-14 10:02:00'
const lark = { kind: 'agent' as const, id: 'test-lark' }

function aReading(over: Partial<OneResidentReading['resident']>): OneResidentReading {
  return {
    resident: {
      agentId: 'test-lark',
      handle: 'lark',
      name: 'Test agent Lark',
      since: stamp,
      proposalId: 'test-proposal',
      proposedBy: 'test-sable',
      decisionId: 'test-decision',
      confirmedBy: { kind: 'person', id: 'test-owner' },
      factsAtProposal: null,
      homeWorldIsThisOffice: null,
      retired: false,
      retiredAt: null,
      successor: null,
      naming: { askedAt: null, namedAt: null, namedBy: null },
      heartbeat: { state: 'none', heldNow: false, lastBeatAt: null, lapsed: false, endedBecause: null, lapsesAfterSeconds: 120, says: 'x' },
      sleep: { asleep: null, sleepTime: null, lastSleepEndedAt: null, postponements: [], postponedInAll: 0, recorded: false, says: 'x' },
      compactionsReported: 0,
      holdsTheSecretaryCard: false,
      ...over,
    },
    space: { mayRead: false, private: 'Test: private.' },
  }
}

describe('the chat’s line beside a resident', () => {
  it('1: says asleep since while it sleeps, and nothing for an awake resident, with or without a last sleep, or for a non-resident', () => {
    const threeHoursAgo = localStamp(new Date(Date.now() - 3 * 3600_000))
    const asleep = renderToStaticMarkup(h(line.SleepLine, { reading: { residentSleep: { asleepSince: threeHoursAgo, lastSleptAt: null, wakesAt: null, sleepTime: null } } }))
    expect(asleep).toContain('data-sleep="asleep"')
    expect(strip(asleep)).toMatch(/^Asleep since /)
    expect(renderToStaticMarkup(h(line.SleepLine, { reading: { residentSleep: { asleepSince: null, lastSleptAt: threeHoursAgo, wakesAt: null, sleepTime: null } } }))).toBe('')
    expect(renderToStaticMarkup(h(line.SleepLine, { reading: { residentSleep: { asleepSince: null, lastSleptAt: null, wakesAt: null, sleepTime: null } } }))).toBe('')
    expect(renderToStaticMarkup(h(line.SleepLine, { reading: {} }))).toBe('')
    expect(renderToStaticMarkup(h(line.SleepLine, { reading: undefined }))).toBe('')
  })
})

describe('the Sleep place on the profile', () => {
  it('2: draws the heartbeat, the sleep now, the last one ended, the compactions and the postponed sleeps', () => {
    const reading = aReading({
      heartbeat: { state: 'lapsed', heldNow: false, lastBeatAt: stamp, lapsed: true, endedBecause: null, lapsesAfterSeconds: 120, says: 'x' },
      sleep: {
        asleep: { since: stamp, because: null, by: lark, wakesAt: null },
        sleepTime: null,
        lastSleepEndedAt: '2026-10-13 07:00:00',
        postponements: [{ at: '2026-10-12 23:00:00', because: 'Test: a deadline tonight.', by: lark }],
        postponedInAll: 1,
        recorded: true,
        says: 'x',
      },
      compactionsReported: 7,
    })
    const said = strip(renderToStaticMarkup(h(sleep.TheResidentSleep, { reading, thePerson: true, onChanged: () => {} })))
    expect(said).toContain('Heartbeat')
    expect(said).toContain('Lapsed. Last beat')
    expect(said).toContain('Asleep since')
    expect(said).toContain('Last sleep ended')
    expect(said).toContain('Compactions its runs reported 7')
    expect(said).toContain('1 postponed sleep')
    expect(said).toContain('Test: a deadline tonight.')

    const quiet = strip(renderToStaticMarkup(h(sleep.TheResidentSleep, { reading: aReading({}), thePerson: true, onChanged: () => {} })))
    expect(quiet).toContain('No session has ever held its handle')
    expect(quiet).toContain('No sleep recorded')
    expect(quiet).toContain('None reported')
    expect(quiet).toContain('No sleep was postponed.')
  })
})

describe('the picture and the name', () => {
  it('3: the press is the person’s only, and once said it reads chosen; a resident never asked has no place', () => {
    const asked = aReading({ naming: { askedAt: stamp, namedAt: null, namedBy: null } })
    const forThePerson = renderToStaticMarkup(h(sleep.TheResidentSleep, { reading: asked, thePerson: true, onChanged: () => {} }))
    expect(forThePerson).toContain('data-naming="waiting"')
    expect(buttons(forThePerson)).toContain('The picture and the name are chosen')
    const forAnAgent = renderToStaticMarkup(h(sleep.TheResidentSleep, { reading: asked, thePerson: false, onChanged: () => {} }))
    expect(buttons(forAnAgent)).not.toContain('The picture and the name are chosen')
    const chosen = renderToStaticMarkup(
      h(sleep.TheResidentSleep, { reading: aReading({ naming: { askedAt: stamp, namedAt: stamp, namedBy: lark } }), thePerson: true, onChanged: () => {} }),
    )
    expect(chosen).toContain('data-naming="chosen"')
    expect(buttons(chosen)).toEqual([])
    expect(renderToStaticMarkup(h(sleep.TheResidentSleep, { reading: aReading({}), thePerson: true, onChanged: () => {} }))).not.toContain('data-naming')
  })
})

describe('the criterion on the proposal row', () => {
  it('4: says each part met, not met or not reported, and the area named or not', () => {
    const met = strip(
      renderToStaticMarkup(
        h(proposals.ResidentCriterionList, {
          criterion: {
            days: { needed: 3, have: 4, part: 'met' },
            compactions: { needed: 5, have: 2, part: 'not-met' },
            area: { named: 'Test: the billing pages', part: 'named' },
          },
        }),
      ),
    )
    expect(met).toContain('Days with a run 4 of 3 needed, met')
    expect(met).toContain('Compactions reported 2 of 5 needed, not met')
    expect(met).toContain('Area of responsibility Test: the billing pages')
    expect(met).toContain('Falling short does not stop Confirm.')
    const none = strip(
      renderToStaticMarkup(
        h(proposals.ResidentCriterionList, {
          criterion: {
            days: { needed: 3, have: 1, part: 'not-met' },
            compactions: { needed: 5, have: null, part: 'not-reported' },
            area: { named: null, part: 'not-named' },
          },
        }),
      ),
    )
    expect(none).toContain('No compaction has been reported for its runs')
    expect(none).toContain('No area was named')
  })
})
