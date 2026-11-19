// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { describe, expect, it } from 'vitest'
import { idleEligible, onlineIdleEligible, type IdleSubject } from '../src/idle-eligibility.ts'
import { whereabouts, whereaboutsPoint, type Whereabouts } from '../src/ownership.ts'
import type { Layout, Point } from '../src/geometry.ts'
import type { Occupant, WorkRow } from '../src/model.ts'
import { stableHash } from '../src/village.ts'

const key = (id: string) => JSON.stringify(['agent', id])
const byId = (a: string, b: string): number => a < b ? -1 : a > b ? 1 : 0
const at = (found: Map<string, Whereabouts>, id: string): Whereabouts => found.get(id)!
const desk: Whereabouts = { where: 'desk' }
const play = (index: number): Whereabouts => ({ where: 'play', index })
const hidden: Whereabouts = { where: 'hidden' }

const row = (patch: Partial<WorkRow> = {}): WorkRow => ({
  id: 'work-1', project: 'garden', agent: 'agent-a', title: 'Work', detail: 'completed',
  recordedState: {}, doing: null, executing: false, association: 'started this run',
  updatedAt: '2026-01-01 10:00:00', runStanding: 'closed', ...patch,
})

const facts = (revision = 7): NonNullable<Occupant['facts']> => ({
  people: { status: 'loaded', value: {} as never, receivedAt: 1, error: null, revision },
  work: { status: 'loaded', value: [], receivedAt: 1, error: null, revision },
})

const subject = (work: WorkRow[] = [], known: Occupant['facts'] = facts()): IdleSubject => ({ facts: known, work })

const layout = {
  key: 'play-places', bounds: { x: 0, y: 0, width: 500, height: 500 }, rooms: [], seats: {},
  obstacles: [], road: { halfWidth: 0, rings: [], ends: [], faults: [] }, bodyRadius: 1,
  houses: [], square: { x: 0, y: 0, width: 1, height: 1 }, pieces: [],
  places: { play: [{ x: 10, y: 20 }, { x: 40, y: 50 }], sleep: [{ x: 70, y: 80 }], sleepingHouse: { x: 60, y: 60, width: 40, height: 30 } },
} as unknown as Layout

const expectedPlayers = (ids: string[]): string[] =>
  [...ids].sort((a, b) => stableHash(a) - stableHash(b) || byId(a, b)).slice(0, 2)

describe('an offline agent shown outside plays from the existing visibility rule alone', () => {
  it('marks every agent the existing rule puts at a play place idle without work facts', () => {
    const offline = Array.from({ length: 8 }, (_, index) => `offline-${index}`)
    const online = new Map(offline.map(id => [id, false] as const))
    const found = whereabouts(offline.map(id => ({ id, retired: false })), online, new Set(), { play: 2, sleep: 0 })
    const players = expectedPlayers(offline)

    for (const id of players) expect(at(found, id), id).toMatchObject({ where: 'play' })
    for (const id of players) expect(idleEligible(subject([], undefined), at(found, id), false), id).toBe(true)
    for (const id of offline.filter(id => !players.includes(id))) expect(at(found, id), id).toEqual(hidden)
  })

  it('ignores even an executing row for an agent the visibility rule already shows outside', () => {
    const executing = [row({ detail: 'executing', executing: true, runStanding: 'working' })]
    expect(idleEligible(subject(executing, undefined), play(0), false)).toBe(true)
  })

  it('keeps an agent at its desk when the same missing work facts are all it has', () => {
    expect(idleEligible(subject([], undefined), desk, false)).toBe(false)
  })

  it('does not invent an outdoor place when no online reading was loaded', () => {
    const ids = ['alpha', 'beta', 'gamma']
    const found = whereabouts(ids.map(id => ({ id, retired: false })), null, new Set(), { play: 2, sleep: 1 })
    for (const id of ids) {
      expect(at(found, id)).toEqual(desk)
      expect(idleEligible(subject([], undefined), at(found, id), false), id).toBe(false)
    }
  })
})

describe('a hidden or sleeping agent never plays', () => {
  it('refuses an offline agent beyond the play places even with perfect idle facts', () => {
    const offline = Array.from({ length: 5 }, (_, index) => `offline-${index}`)
    const found = whereabouts(offline.map(id => ({ id, retired: false })), new Map(offline.map(id => [id, false] as const)), new Set(), { play: 1, sleep: 0 })
    const players = expectedPlayers(offline).slice(0, 1)
    const leftOut = offline.filter(id => !players.includes(id))
    expect(leftOut.length).toBeGreaterThan(0)
    for (const id of leftOut) expect(idleEligible(subject([row()]), at(found, id), true), id).toBe(false)
  })

  it('refuses a sleeper at its sleeping place even with perfect idle facts', () => {
    const found = whereabouts([{ id: 'sleeper', retired: false }], new Map([['sleeper', false]]), new Set(['sleeper']), { play: 2, sleep: 1 })
    expect(at(found, 'sleeper')).toEqual({ where: 'sleep', index: 0 })
    expect(idleEligible(subject([row()]), at(found, 'sleeper'), true)).toBe(false)
  })

  it('keeps a retired agent hidden and ineligible', () => {
    const found = whereabouts([{ id: '0-retired', retired: true }], new Map([['0-retired', false]]), new Set(), { play: 2, sleep: 1 })
    expect(at(found, '0-retired')).toEqual(hidden)
    expect(idleEligible(subject([row()]), at(found, '0-retired'), true)).toBe(false)
  })
})

describe('the outdoor branch uses the actual play places the visibility rule chose', () => {
  it('is eligible exactly where whereaboutsPoint returns that play place', () => {
    const ids = ['one', 'two', 'three', 'four']
    const found = whereabouts(ids.map(id => ({ id, retired: false })), new Map(ids.map(id => [id, false] as const)), new Set(), { play: 2, sleep: 1 })
    for (const id of ids) {
      const where = at(found, id)
      const point: Point | null = whereaboutsPoint(layout, key(id), where)
      if (where.where === 'play') {
        expect(point).toEqual(layout.places!.play[where.index])
        expect(idleEligible(subject([], undefined), where, false), id).toBe(true)
      } else {
        expect(idleEligible(subject([row()]), where, true), id).toBe(false)
      }
    }
  })
})

describe('an online agent idles on a coherent loaded pair, even while its refresh is pending', () => {
  it('accepts loaded people and work from one revision with every row closed', () => {
    const work = [row(), row({ id: 'work-2', runStanding: 'closed unchecked' }), row({ id: 'work-3', runStanding: 'superseded' })]
    expect(onlineIdleEligible(subject(work), true)).toBe(true)
  })

  it('keeps the loaded pair while either half of its refresh is pending', () => {
    expect(onlineIdleEligible(subject([row()], { people: { ...facts().people, pending: true }, work: facts().work }), true)).toBe(true)
    expect(onlineIdleEligible(subject([row()], { people: facts().people, work: { ...facts().work, pending: true } }), true)).toBe(true)
  })

  it('refuses missing, stale or unavailable facts and unavailable work', () => {
    const cases: [string, IdleSubject, boolean][] = [
      ['no facts at all', { facts: undefined, work: [] }, true],
      ['unloaded people', subject([], { people: { status: 'unloaded', error: null }, work: facts().work }), true],
      ['a people read error', subject([], { people: { ...facts().people, error: 'read failed' }, work: facts().work }), true],
      ['different revisions', subject([], { people: facts().people, work: { ...facts().work, revision: 8 } }), true],
      ['a missing revision', subject([], { people: { ...facts().people, revision: undefined }, work: { ...facts().work, revision: undefined } }), true],
      ['a revision below one', subject([], facts(0)), true],
      ['the work read unavailable', subject([row()]), false],
    ]
    for (const [name, one, available] of cases) expect(onlineIdleEligible(one, available), name).toBe(false)
  })

  it('refuses a pending refresh whose loaded halves do not agree', () => {
    expect(onlineIdleEligible(subject([row()], { people: { ...facts().people, pending: true }, work: { ...facts().work, revision: 8 } }), true)).toBe(false)
  })

  it('refuses any executing, open or working row', () => {
    const cases: [string, WorkRow][] = [
      ['an executing row whose run is closed', row({ detail: 'executing', executing: true, runStanding: 'closed' })],
      ['an executing working row', row({ detail: 'executing', executing: true, runStanding: 'working' })],
      ['a working row', row({ detail: 'recorded_work', runStanding: 'working' })],
      ['a row under inspection', row({ detail: 'waiting_check', runStanding: 'inspecting' })],
      ['a row awaiting discussion', row({ detail: 'rebuttal', runStanding: 'rebuttal' })],
      ['a reporting row', row({ detail: 'reporting', runStanding: 'reporting' })],
      ['a row with no run standing', row({ detail: 'work_open', runStanding: null })],
    ]
    for (const [name, one] of cases) expect(onlineIdleEligible(subject([one]), true), name).toBe(false)
  })

  it('refuses a desk agent holding one open row beside a closed one', () => {
    const mixed = [row(), row({ id: 'work-2', detail: 'recorded_work', runStanding: 'working' })]
    expect(onlineIdleEligible(subject(mixed), true)).toBe(false)
    expect(idleEligible(subject(mixed), desk, true)).toBe(false)
  })
})
