// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A PERMANENT RESIDENT'S SLEEP PRESSES STAND BESIDE ITS SLEEP, FOR THOSE WHO MAY PRESS THEM, AND ITS OFFICE FLOW STANDS
 * BESIDE ITS COMPACTIONS. Item 1 of a decision (wave 13k, round 47) says how long ago it last slept
 * shows on its chat side and on its profile, "together with its compactions and its office flow".
 * The presses are the ones the doors in
 * src/server/api/residents.ts allow; tests/a-permanent-resident-sleeps-and-is-named.test.ts proves the doors.
 *
 * WHAT IS MEASURED, each drawn with renderToStaticMarkup from a reading written here, with no server:
 *   1. the person sees Sleep now on an awake resident and Wake now on a sleeping one, and no Postpone;
 *   2. the resident itself sees Sleep now and Postpone this sleep while awake, and only Wake now while asleep;
 *   3. another agent sees no press, and nobody sees one on a retired resident;
 *   4. the office flow is drawn after the Sleep place's facts and before the naming place, and an agent with no run
 *      here is told so in words rather than shown an empty list;
 *   5. the three presses ask the three doors, by path, method and body;
 *   6. on the profile the resident's own section leaves out how it wishes to be addressed and its heartbeat, which the
 *      profile draws already, and elsewhere draws both;
 *   7. the chat's line after a press says what the door answered, by the same two facts the office's line holds.
 *
 * MUTATIONS, EACH AFTER A CONTROL RUN AND RESTORED (round 47's report names each run):
 *   - `whoMayPress` gives the person Postpone as well: case 1 goes red;
 *   - `whoMayPress` forgets the resident itself: case 2 goes red;
 *   - the Sleep place draws its office flow before its facts: case 4 goes red;
 *   - `residentWake` asks the sleep door: case 5 goes red;
 *   - `onTheProfile` no longer leaves out the address: case 6 goes red;
 *   - the line after a press forgets when the last sleep ended: case 7 goes red.
 */

import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { setWordLanguage } from '../src/shared/i18n.ts'
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
let section: typeof import('../src/web/components/ResidentSection.tsx')
let line: typeof import('../src/web/components/SleepLine.tsx')
let api: typeof import('../src/web/api.ts')['api']
const realFetch = globalThis.fetch

beforeAll(async () => {
  sleep = await import('../src/web/components/ResidentSleep.tsx')
  presses = await import('../src/web/components/SleepPresses.tsx')
  section = await import('../src/web/components/ResidentSection.tsx')
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

const stamp = '2026-10-14 10:02:00'
const lark = { kind: 'agent' as const, id: 'test-lark' }
const asleepNow = { asleep: { since: stamp, because: null, by: lark, wakesAt: null }, sleepTime: null, lastSleepEndedAt: null, postponements: [], postponedInAll: 0, recorded: true, says: 'x' }

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
      retired: false,
      retiredAt: null,
      successor: null,
      naming: { askedAt: null, namedAt: null, namedBy: null },
      heartbeat: { state: 'none', heldNow: false, lastBeatAt: null, lapsed: false, endedBecause: null, lapsesAfterSeconds: 120, says: 'x' },
      sleep: { asleep: null, sleepTime: null, lastSleepEndedAt: null, postponements: [], postponedInAll: 0, recorded: false, says: 'x' },
      compactionsReported: 3,
      holdsTheSecretaryCard: false,
      ...over,
    },
    space: { mayRead: false, private: 'Test: private.' },
  }
}

const THE_PERSON = { type: 'human', id: 'test-owner' }
const ITSELF = { type: 'agent', id: 'test-lark' }
const ANOTHER = { type: 'agent', id: 'test-sable' }

function drawn(reading: OneResidentReading, looking: { type: string; id: string }, thePerson: boolean, flow: unknown = null): string {
  return renderToStaticMarkup(
    h(sleep.TheResidentSleep, {
      reading,
      thePerson,
      may: presses.whoMayPress(looking, thePerson, reading.resident.agentId),
      flow: flow as never,
      onChanged: () => {},
    }),
  )
}

describe('the sleep presses on the profile', () => {
  it('1: the person sees Sleep now on an awake resident and Wake now on a sleeping one, and no Postpone', () => {
    expect(buttons(drawn(aReading({}), THE_PERSON, true))).toEqual(['Sleep now'])
    expect(buttons(drawn(aReading({ sleep: asleepNow }), THE_PERSON, true))).toEqual(['Wake now'])
  })

  it('2: the resident itself sees Sleep now and Postpone this sleep while awake, and only Wake now while asleep', () => {
    expect(buttons(drawn(aReading({}), ITSELF, false))).toEqual(['Sleep now', 'Postpone this sleep'])
    expect(buttons(drawn(aReading({ sleep: asleepNow }), ITSELF, false))).toEqual(['Wake now'])
  })

  it('3: another agent sees no press, and nobody sees one on a retired resident', () => {
    expect(buttons(drawn(aReading({}), ANOTHER, false))).toEqual([])
    expect(buttons(drawn(aReading({ retired: true, retiredAt: stamp }), THE_PERSON, true))).toEqual([])
    expect(buttons(drawn(aReading({ retired: true, retiredAt: stamp }), ITSELF, false))).toEqual([])
  })
})

describe('the office flow beside the compactions', () => {
  it('4: is drawn after the facts and before the naming place, and an agent with no run here is told so', () => {
    const markup = drawn(aReading({ naming: { askedAt: stamp, namedAt: null, namedBy: null } }), THE_PERSON, true, h('p', { 'data-test-flow': '' }, 'Test: the flow'))
    const compactions = markup.indexOf('Compactions its runs reported')
    const flow = markup.indexOf('data-test-flow')
    const naming = markup.indexOf('data-naming')
    expect(compactions).toBeGreaterThan(-1)
    expect(flow).toBeGreaterThan(compactions)
    expect(naming).toBeGreaterThan(flow)

    const none = renderToStaticMarkup(h(sleep.OfficeFlowOfARun, { runId: null }))
    expect(strip(none)).toContain('Office flow of its newest run')
    expect(strip(none)).toContain('No run of it is on record in this project, so there is no office flow to show.')
    expect(none).toContain('data-office-flow="none"')
  })
})

describe('the doors the presses ask', () => {
  it('5: Sleep, Wake and Postpone each ask their own door, by path, method and body', async () => {
    const asked: { url: string; method: string; body: string }[] = []
    globalThis.fetch = (async (url: string | URL, init?: RequestInit) => {
      asked.push({ url: String(url), method: init?.method ?? 'GET', body: String(init?.body ?? '') })
      return new Response(JSON.stringify({ said: 'Test: done.', held: 0, sleep: asleepNow }), { status: 200, headers: { 'content-type': 'application/json' } })
    }) as typeof fetch
    try {
      await api.residentSleep('test-lark')
      await api.residentWake('test-lark')
      await api.residentPostpone('test-lark', 'Test: a review is due.')
    } finally {
      globalThis.fetch = realFetch
    }
    expect(asked.map((one) => [new URL(one.url, 'http://127.0.0.1').pathname, one.method])).toEqual([
      ['/api/residents/test-lark/sleep', 'POST'],
      ['/api/residents/test-lark/wake', 'POST'],
      ['/api/residents/test-lark/sleep/postpone', 'POST'],
    ])
    expect(JSON.parse(asked[2]!.body)).toEqual({ because: 'Test: a review is due.' })
  })
})

describe("the resident's own section", () => {
  it('6: on the profile leaves out how it wishes to be addressed and its heartbeat, and elsewhere draws both', () => {
    const agent = { kind: 'agent', id: 'test-lark', name: 'Test agent Lark', handle: 'lark', addressAs: {} } as never
    const props = { agent, reading: aReading({}), listing: null, origins: { status: 'no-file' } as const, thePerson: true, onChanged: () => {} }
    const whole = renderToStaticMarkup(h(section.TheResidentSection, props))
    const onTheProfile = renderToStaticMarkup(h(section.TheResidentSection, { ...props, onTheProfile: true }))
    expect(whole).toContain('data-heartbeat')
    expect(strip(whole)).toContain('How Test agent Lark wishes to be addressed')
    expect(onTheProfile).not.toContain('data-heartbeat')
    expect(strip(onTheProfile)).not.toContain('wishes to be addressed')
    expect(onTheProfile).toContain('resident.residency')
  })
})

describe("the chat's line after a press", () => {
  it('7: says asleep since when the door answered asleep, and when the last sleep ended otherwise', () => {
    expect(line.theLineAfterAPress(asleepNow)).toEqual({ asleepSince: stamp, lastSleptAt: null, wakesAt: null, sleepTime: null })
    expect(line.theLineAfterAPress({ asleep: null, lastSleepEndedAt: stamp, sleepTime: null })).toEqual({ asleepSince: null, lastSleptAt: stamp, wakesAt: null, sleepTime: null })
    expect(line.theLineAfterAPress({ asleep: null, lastSleepEndedAt: null, sleepTime: null })).toEqual({ asleepSince: null, lastSleptAt: null, wakesAt: null, sleepTime: null })
  })
})
