// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A SECRETARY'S SLEEP TIME IS DRAWN ON ITS PROFILE, BESIDE ITS LAST SLEEP. ITS CHAT SIDE SAYS UNTIL WHEN IT SLEEPS
 * WHILE THE OFFICE'S SLEEP GOES ON, AND NOTHING WHILE IT IS AWAKE. On 6 November 2026
 * each secretary sets its own sleep time, and the person may change it too. The door is
 * PUT /api/residents/:agentId/sleep-time; tests/a-secretary-sleeps-at-its-own-time.test.ts proves the door and the clock.
 *
 * WHAT IS MEASURED, each drawn with renderToStaticMarkup from a reading written here, with no server:
 *   1. the profile's Sleep place says the sleep time, the zone, when the next sleep begins and who set it; with none
 *      set it says so; a resident without the secretary card is drawn the same way;
 *   2. the sleep-time editor is drawn for the person and for the resident itself, holding the time that is set, for a
 *      resident without the secretary card too, and for nobody else, nor on a retired resident;
 *   3. while the office's sleep goes on, the Sleep place says until when, and the secretary itself may postpone it;
 *      a sleep begun by a press still has no Postpone;
 *   4. the chat's line says until when it sleeps while the office's sleep goes on, and nothing for an awake resident,
 *      with a last sleep and a sleep time or with a sleep time alone;
 *   5. the editor's press asks the sleep-time door, by path, method and body.
 *
 * MUTATIONS, EACH AFTER A CONTROL RUN AND RESTORED (the round's report names each run):
 *   - the Sleep time fact says "none" whatever is set: case 1 goes red;
 *   - the editor is drawn only for a resident holding the secretary card: case 2 goes red;
 *   - `SleepPresses` draws Postpone only while awake, as before: case 3 goes red;
 *   - `sleepLineWords` forgets `wakesAt`: case 4 goes red;
 *   - `residentSleepTime` asks with POST: case 5 goes red.
 */

import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { setWordLanguage, t } from '../src/shared/i18n.ts'
import { SLEEP_TIME_LONGEST_MINUTES, SLEEP_TIME_SHORTEST_MINUTES } from '../src/shared/residents.ts'
import { drawnStamp } from '../src/shared/time.ts'
import type { OneResidentReading } from '../src/web/lib/residents.ts'

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
  location: { hash: '', search: '', origin: 'http://127.0.0.1', protocol: 'http:', host: '127.0.0.1', hostname: '127.0.0.1', port: '' },
  addEventListener: () => {},
  removeEventListener: () => {},
}

let sleep: typeof import('../src/web/components/ResidentSleep.tsx')
let presses: typeof import('../src/web/components/SleepPresses.tsx')
let line: typeof import('../src/web/components/SleepLine.tsx')
let api: typeof import('../src/web/api.ts')['api']
const realFetch = globalThis.fetch

beforeAll(async () => {
  sleep = await import('../src/web/components/ResidentSleep.tsx')
  presses = await import('../src/web/components/SleepPresses.tsx')
  line = await import('../src/web/components/SleepLine.tsx')
  api = (await import('../src/web/api.ts')).api
})

afterEach(() => {
  setWordLanguage('en')
})

afterAll(() => {
  globalThis.fetch = realFetch
})

function strip(markup: string): string {
  return markup.replace(/<style[\s\S]*?<\/style>/g, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
}

function buttons(markup: string): string[] {
  return [...markup.matchAll(/<button[^>]*>([\s\S]*?)<\/button>/g)].map((one) => strip(one[1]!))
}

function inputValues(markup: string): string[] {
  return [...markup.matchAll(/<input[^>]*value="([^"]*)"[^>]*>/g)].map((one) => one[1]!)
}

const stamp = '2026-10-14 10:02:00'
const wakes = '2026-10-14 12:00:00'
const lark = { kind: 'agent' as const, id: 'test-lark' }
const office = { kind: 'agent' as const, id: 'test-office' }
const owner = { kind: 'person' as const, id: 'test-owner' }
const itsTime = { startsAt: '03:00', minutes: 120, zone: 'Test/Zone', setAt: stamp, setBy: lark, nextBeginsAt: '2026-10-15 03:00:00' }

type TheSleep = OneResidentReading['resident']['sleep']
const awake: TheSleep = { asleep: null, lastSleepEndedAt: null, postponements: [], postponedInAll: 0, recorded: false, sleepTime: itsTime, says: 'x' }
const asleepByTheOffice: TheSleep = { ...awake, asleep: { since: stamp, because: null, by: office, wakesAt: wakes }, recorded: true }
const asleepByAPress: TheSleep = { ...awake, asleep: { since: stamp, because: null, by: lark, wakesAt: null }, recorded: true }

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
      confirmedBy: owner,
      factsAtProposal: null,
      homeWorldIsThisOffice: null,
      retired: false,
      retiredAt: null,
      successor: null,
      naming: { askedAt: null, namedAt: null, namedBy: null },
      heartbeat: { state: 'none', heldNow: false, lastBeatAt: null, lapsed: false, endedBecause: null, lapsesAfterSeconds: 120, says: 'x' },
      sleep: awake,
      compactionsReported: 0,
      holdsTheSecretaryCard: true,
      ...over,
    },
    space: { mayRead: false, private: 'Test: private.' },
  }
}

const THE_PERSON = { type: 'human', id: 'test-owner' }
const ITSELF = { type: 'agent', id: 'test-lark' }
const ANOTHER = { type: 'agent', id: 'test-sable' }

function drawn(reading: OneResidentReading, looking: { type: string; id: string }, thePerson: boolean): string {
  return renderToStaticMarkup(
    h(sleep.TheResidentSleep, {
      reading,
      thePerson,
      may: presses.whoMayPress(looking, thePerson, reading.resident.agentId),
      onChanged: () => {},
    }),
  )
}

const SET_THE_TIME = (): string => t('resident.sleep.time.press')

describe('the sleep time on the profile', () => {
  it('1: says the time, the zone, the next sleep and who set it; with none set, says none is set; the card changes nothing', () => {
    const set = strip(drawn(aReading({}), ANOTHER, false))
    expect(set).toContain(t('resident.sleep.time.label'))
    expect(set).toContain(t('resident.sleep.time.set', { startsAt: '03:00', minutes: 120, zone: 'Test/Zone', next: drawnStamp('2026-10-15 03:00:00') }))
    expect(set).toContain(t('resident.sleep.time.setByItself', { name: 'Test agent Lark', when: drawnStamp(stamp) }))

    const byThePerson = aReading({ sleep: { ...awake, sleepTime: { ...itsTime, setBy: owner } } })
    expect(strip(drawn(byThePerson, THE_PERSON, true))).toContain(t('resident.sleep.time.setByYou', { when: drawnStamp(stamp) }))
    expect(strip(drawn(byThePerson, ITSELF, false))).toContain(t('resident.sleep.time.setByThePerson', { when: drawnStamp(stamp) }))

    expect(strip(drawn(aReading({ sleep: { ...awake, sleepTime: null } }), ANOTHER, false))).toContain(t('resident.sleep.time.noneSet'))
    const noCard = strip(drawn(aReading({ holdsTheSecretaryCard: false }), ANOTHER, false))
    expect(noCard).toContain(t('resident.sleep.time.set', { startsAt: '03:00', minutes: 120, zone: 'Test/Zone', next: drawnStamp('2026-10-15 03:00:00') }))
    expect(noCard).not.toContain(t('resident.sleep.time.notASecretaryWord'))
  })

  it('2: the editor is drawn for the person and for the resident itself, holding the time that is set, and for nobody else', () => {
    for (const [looking, thePerson] of [
      [THE_PERSON, true],
      [ITSELF, false],
    ] as const) {
      const markup = drawn(aReading({}), looking, thePerson)
      expect(buttons(markup)).toContain(SET_THE_TIME())
      expect(inputValues(markup)).toEqual(['03:00', '120'])
      expect(strip(markup)).toContain(t('resident.sleep.time.startsAt'))
      expect(strip(markup)).toContain(t('resident.sleep.time.minutes', { shortest: SLEEP_TIME_SHORTEST_MINUTES, longest: SLEEP_TIME_LONGEST_MINUTES }))
    }
    expect(inputValues(drawn(aReading({ sleep: { ...awake, sleepTime: null } }), THE_PERSON, true))).toEqual(['', ''])
    expect(buttons(drawn(aReading({}), ANOTHER, false))).not.toContain(SET_THE_TIME())
    expect(buttons(drawn(aReading({ retired: true, retiredAt: stamp }), THE_PERSON, true))).not.toContain(SET_THE_TIME())
    const noCard = drawn(aReading({ holdsTheSecretaryCard: false }), THE_PERSON, true)
    expect(buttons(noCard)).toContain(SET_THE_TIME())
    expect(inputValues(noCard)).toEqual(['03:00', '120'])
  })

  it('3: while the office’s sleep goes on it says until when, and the secretary itself may postpone it; a sleep by a press may not be', () => {
    const itselfNow = drawn(aReading({ sleep: asleepByTheOffice }), ITSELF, false)
    expect(strip(itselfNow)).toContain(t('resident.sleep.asleepUntil', { when: drawnStamp(stamp), until: drawnStamp(wakes) }))
    expect(buttons(itselfNow)).toEqual(['Wake now', 'Postpone this sleep', SET_THE_TIME()])
    expect(buttons(drawn(aReading({ sleep: asleepByTheOffice }), THE_PERSON, true))).toEqual(['Wake now', SET_THE_TIME()])

    const pressed = drawn(aReading({ sleep: asleepByAPress }), ITSELF, false)
    expect(strip(pressed)).toContain(t('resident.sleep.asleepSince', { when: drawnStamp(stamp) }))
    expect(buttons(pressed)).toEqual(['Wake now', SET_THE_TIME()])
  })
})

describe("the chat's line", () => {
  it('4: says until when it sleeps while the office’s sleep goes on, and nothing while it is awake', () => {
    const now = '2026-10-14 11:00:00'
    expect(line.sleepLineWords({ asleepSince: stamp, lastSleptAt: null, wakesAt: wakes, sleepTime: { startsAt: '10:00', minutes: 120 } }, now)).toBe(
      t('resident.sleep.line.asleepUntil', { until: '12:00' }),
    )
    expect(line.sleepLineWords({ asleepSince: null, lastSleptAt: stamp, wakesAt: null, sleepTime: { startsAt: '03:00', minutes: 120 } }, now)).toBeNull()
    expect(line.sleepLineWords({ asleepSince: null, lastSleptAt: null, wakesAt: null, sleepTime: { startsAt: '03:00', minutes: 120 } }, now)).toBeNull()
    expect(line.sleepLineWords({ asleepSince: null, lastSleptAt: null, wakesAt: null, sleepTime: null }, now)).toBeNull()
  })
})

describe('the door the editor asks', () => {
  it('5: the sleep-time press asks PUT /api/residents/<id>/sleep-time with the time and the minutes', async () => {
    const asked: { url: string; method: string; body: string }[] = []
    globalThis.fetch = (async (url: string | URL, init?: RequestInit) => {
      asked.push({ url: String(url), method: init?.method ?? 'GET', body: String(init?.body ?? '') })
      return new Response(JSON.stringify({ said: 'Test: set.', sleep: awake }), { status: 200, headers: { 'content-type': 'application/json' } })
    }) as typeof fetch
    try {
      await api.residentSleepTime('test-lark', { startsAt: '3.00', minutes: 90 })
    } finally {
      globalThis.fetch = realFetch
    }
    expect(asked.map((one) => [new URL(one.url, 'http://127.0.0.1').pathname, one.method])).toEqual([['/api/residents/test-lark/sleep-time', 'PUT']])
    expect(JSON.parse(asked[0]!.body)).toEqual({ startsAt: '3.00', minutes: 90 })
  })
})
