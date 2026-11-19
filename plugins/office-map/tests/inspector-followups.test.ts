// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { OfficeMap } from '../src/map-view.ts'
import { mapOffice, CONTACT_LIMITS } from '../src/model.ts'
import { standingScale } from '../src/appearance.ts'
import { ContactWalks, DEFAULT_MOLE_SCALE, PAPER_ARC_SHIFT, WALK_PIXELS_PER_SECOND, paperArcBlockers, paperArcRect, walkDurationMs, type WalkClock } from '../src/walks.ts'
import { chooseIdleOuting } from '../src/idle-places.ts'
import { translateBody } from '../src/visual-body.ts'
import type { Layout, Point } from '../src/geometry.ts'
import type { Rect } from '../src/viewport.ts'
import catalog from '../assets/village-catalog.json'
import { agent, people } from './fixtures.ts'

// The five follow-ups the inspector listed after the walk-speed check. Each reads
// the value it checks from the code, so a copied number cannot drift.

class Clock implements WalkClock {
  time = 0; next = 0
  frames = new Map<number, () => void>(); timers = new Map<number, { at: number; run: () => void }>()
  now() { return this.time }
  frame(run: () => void) { const id = ++this.next; this.frames.set(id, run); return id }
  cancelFrame(id: number) { this.frames.delete(id) }
  later(run: () => void, delay: number) { const id = ++this.next; this.timers.set(id, { at: this.time + delay, run }); return id }
  cancelLater(id: number) { this.timers.delete(id) }
  advance(ms: number) {
    this.time += ms
    const frames = [...this.frames.values()]; this.frames.clear(); frames.forEach(run => run())
    for (const [id, timer] of [...this.timers]) if (timer.at <= this.time) { this.timers.delete(id); timer.run() }
  }
}
const p = (x: number, y: number): Point => ({ x, y })

it('keeps a short route on the approved speed instead of the old 700 ms floor', () => {
  const points = [p(0, 0), p(7, 0)]
  const expected = 7 / (WALK_PIXELS_PER_SECOND * DEFAULT_MOLE_SCALE) * 1000
  expect(walkDurationMs(points, DEFAULT_MOLE_SCALE)).toBeCloseTo(expected, 6)
  expect(walkDurationMs(points, DEFAULT_MOLE_SCALE)).toBeLessThan(700)
})

it('returns standingScale for a mole whose saved scale is not the default', () => {
  const scale = { version: 1 as const, roleAtGeneration: 'worker', value: .85 }
  const occupant = mapOffice({ ...people, agents: [agent('invented', { scale })] }, null).occupants[0]!
  const map = Object.assign(Object.create(OfficeMap.prototype), { occupants: new Map([[occupant.key, occupant]]), layout: { ownership: true }, individuals: true })
  expect(map.drawnScale(occupant.key)).toBeCloseTo(standingScale(scale.value), 6)
  expect(map.drawnScale(occupant.key)).not.toBe(DEFAULT_MOLE_SCALE)
  // The page passes the map's own scale into the contact walk; this is the one
  // call site that carries it, and no behaviour test reaches the browser loop.
  const page = readFileSync(new URL('../src/page.ts', import.meta.url), 'utf8')
  expect(page).toMatch(/new ContactWalks\([\s\S]*?drawnScale\(key\)[\s\S]*?DEFAULT_MOLE_SCALE[,)]/)
})

it('falls back to the nearest pair and keeps the named blockers when no paper arc is clear', () => {
  const layout = {
    key: 'invented-paper-fallback', bounds: { x: 0, y: 0, width: 640, height: 640 },
    rooms: [], seats: {}, obstacles: [], road: { halfWidth: 0, rings: [], ends: [], faults: [] },
    bodyRadius: 1, houses: [], square: { x: 0, y: 0, width: 640, height: 640 }, pieces: [],
    places: { play: [], sleep: [], sleepingHouse: { x: 0, y: 0, width: 0, height: 0 } },
  } as unknown as Layout
  const body: Rect = { x: -10, y: -20, width: 20, height: 20 }
  const walkers = [{ id: 'invented-a', foot: { x: 100, y: 300 }, body }, { id: 'invented-b', foot: { x: 260, y: 300 }, body }]
  const frame = (catalog.sprites as any)['paper-stack']
  const nearest = chooseIdleOuting(layout, walkers, [], () => true, 0)
  expect(nearest).not.toBeNull()
  const arc = paperArcRect(nearest!.places[0]!, frame, PAPER_ARC_SHIFT)!
  const blocker: Rect = { x: arc.x + 2, y: arc.y + 2, width: 4, height: 4 }
  const calls: { places: readonly Point[]; blockers: readonly Rect[] }[] = []
  const neverClear = (places: readonly Point[], _bodies: readonly Rect[], blockers: readonly Rect[]): boolean => {
    calls.push({ places: [...places], blockers: [...blockers] })
    return false
  }
  const fallback = chooseIdleOuting(layout, walkers, [blocker], () => true, 0, neverClear)
  expect(fallback).not.toBeNull()
  expect(fallback!.places).toEqual(nearest!.places)
  const pair = calls.find(call => call.places.length === 2)
  expect(pair).toBeDefined()
  expect(pair!.blockers).toContainEqual(blocker)
  const playBodies = fallback!.places.map((place, i) => translateBody(walkers[i]!.body, place))
  expect(paperArcBlockers(fallback!.places[0]!, frame, [...pair!.blockers, ...playBodies], PAPER_ARC_SHIFT)).toContainEqual(blocker)
})

it('ends a contact walk at the 15 s cache even when the approved speed needs longer', () => {
  const clock = new Clock(), pending: ((route: { status: 'found'; points: Point[] } | null) => void)[] = []
  const contact = new ContactWalks(clock, () => true, (_from, _to, done) => pending.push(done), () => {}, () => true)
  contact.setEnabled(true)
  contact.accept({ sequence: 1, receivedAt: 0, withdrawn: [], messages: [{ id: 'invented-long-contact', at: 'invented', project: 'invented', from: { kind: 'agent', id: 'from' }, to: [{ kind: 'agent', id: 'to' }] }] })
  const points = [p(0, 0), p(1000, 0)]
  const duration = 1000 / (WALK_PIXELS_PER_SECOND * DEFAULT_MOLE_SCALE) * 1000
  expect(duration).toBeGreaterThan(CONTACT_LIMITS.cacheAgeMs)
  pending.shift()!({ status: 'found', points })
  expect(contact.snapshot().points).toHaveLength(1)
  clock.advance(CONTACT_LIMITS.cacheAgeMs - 1)
  expect(contact.snapshot().points).toHaveLength(1)
  clock.advance(2)
  expect(contact.snapshot().points).toHaveLength(0)
  contact.dispose()
})
