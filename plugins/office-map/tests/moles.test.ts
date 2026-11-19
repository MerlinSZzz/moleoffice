// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { describe, expect, it } from 'vitest'
import catalog from '../assets/village-catalog.json'
import { standingLooks } from '../src/appearance.ts'
import { badges, moleGroup, moleSprite } from '../src/mole-state.ts'
import { gaitFrame, onRoute, type MovingContact } from '../src/walks.ts'
import { LayoutCache } from '../src/geometry.ts'
import { bodyBox, Nameplates, overlaps, shortName } from '../src/nameplates.ts'
import { workRow } from './fixtures.ts'
import { drawAnchoredSprite, type ArtPack } from '../src/pack.ts'

const walk: MovingContact = { id: 'sample', from: 'a', to: 'b', point: { x: 0, y: 0 }, elapsed: 0, facing: 1 }
describe('approved gait and honest poses', () => {
  it('holds A, pass, B, pass for six frames each at thirty frames per second', () => {
    const frames = Array.from({ length: 48 }, (_, frame) => gaitFrame(frame * 1000 / 30))
    expect(frames).toEqual(['A', 'pass', 'B', 'pass', 'A', 'pass', 'B', 'pass'].flatMap(frame => Array(6).fill(frame)))
    for (const [ms, frame] of [[0, 'A'], [199.999, 'A'], [200, 'pass'], [400, 'B'], [600, 'pass'], [800, 'A']] as const) expect(gaitFrame(ms)).toBe(frame)
  })
  it('moves at constant arc speed and flips at the reversal without a turn drawing or pause', () => {
    const route = [{ x: 0, y: 0 }, { x: 80, y: 0 }, { x: 80, y: 20 }, { x: 0, y: 20 }]
    expect(onRoute(route, 40 / 180)).toEqual({ point: { x: 40, y: 0 }, facing: 1 })
    expect(onRoute(route, 90 / 180)).toEqual({ point: { x: 80, y: 10 }, facing: 1 })
    expect(onRoute(route, 100 / 180)).toEqual({ point: { x: 80, y: 20 }, facing: -1 })
    expect(onRoute(route, 140 / 180)).toEqual({ point: { x: 40, y: 20 }, facing: -1 })
    expect(onRoute(route, 1).point).toEqual(route.at(-1))
  })
  it('uses the same look, canvas origin and scale for standing, walking and every still pose', () => {
    for (const look of standingLooks) {
      const stand = catalog.sprites[`stand-${look}` as keyof typeof catalog.sprites]
      for (const action of ['A', 'pass', 'B'] as const) {
        const id = `walk-${look}-${action}` as keyof typeof catalog.sprites
        expect(catalog.sprites[id].anchor).toEqual(stand.anchor); expect(catalog.sprites[id].size).toEqual(stand.size)
      }
      for (const elapsed of [0, 200, 400, 600]) expect(moleSprite(look, [], false, { ...walk, elapsed })).toBe(`walk-${look}-${gaitFrame(elapsed)}`)
      for (const pose of ['carry', 'cheer', 'wave']) {
        const frame = catalog.sprites[`${pose}-${look}` as keyof typeof catalog.sprites]
        expect(frame.source).toContain(`-${look}`); expect(frame.anchor).toEqual(stand.anchor); expect(frame.size).toEqual(stand.size)
      }
      expect(moleSprite(look, [], false)).toBe(`stand-${look}`)
    }
    expect(catalog.sprites['walk-bun-A'].source).toBe('round4s-stride-a/registered/sprites/03-bun-A.png')
    expect(catalog.sprites['walk-flower-B'].source).toBe('round4s-stride-b/fix/work/16-flower/sprites/S1-B.png')
  })
  it('mirrors native drawings about the shared ground origin without moving the canvas or resampling it', () => {
    const calls: unknown[][] = [], image = {} as HTMLImageElement
    const ctx = Object.fromEntries(['save', 'restore', 'translate', 'scale', 'drawImage'].map(name => [name, (...args: unknown[]) => calls.push([name, ...args])])) as unknown as CanvasRenderingContext2D
    const frame = catalog.sprites['walk-tuft-A'], pack = { sources: { sprites: catalog.sprites }, images: new Map([[frame.atlas, image]]) } as unknown as ArtPack
    expect(drawAnchoredSprite(ctx, pack, 'walk-tuft-A', { x: 200, y: 300 }, .85, -1)).toBe(true)
    expect(calls.slice(0, 3)).toEqual([['save'], ['translate', 200, 300], ['scale', -1, 1]])
    expect(calls[3]!.slice(0, 6)).toEqual(['drawImage', image, ...frame.rect])
    const expected = [(frame.trim[0]! - frame.anchor[0]!) * .85, (frame.trim[1]! - frame.anchor[1]!) * .85, frame.rect[2]! * .85, frame.rect[3]! * .85]
    calls[3]!.slice(6).forEach((value, i) => expect(value).toBeCloseTo(expected[i]!, 10))
    expect(calls[4]).toEqual(['restore'])
    expect(drawAnchoredSprite(ctx, null, 'walk-tuft-A', { x: 200, y: 300 }, .85, 1)).toBe(false)
  })
  it('carries only for checking and delivering and cheers only for confirmed-complete work', () => {
    for (const detail of ['waiting_check', 'rebuttal', 'reporting']) expect(moleSprite('tuft', [workRow('one', { detail })], false)).toBe('carry-tuft')
    for (const runStanding of ['closed unchecked', 'working', null] as const) {
      const rows = [workRow('one', { detail: 'completed', runStanding })]
      expect(moleSprite('tuft', rows, false)).toBe('stand-tuft'); expect(moleGroup(rows)).toBe('unknown')
    }
    expect(moleSprite('tuft', [workRow('task', { detail: 'task_completed', runStanding: 'closed' })], false)).toBe('stand-tuft')
    const done = workRow('done', { detail: 'completed', runStanding: 'closed' })
    expect(moleSprite('tuft', [done], false)).toBe('cheer-tuft')
    expect(moleSprite('tuft', [done, workRow('active', { detail: 'executing' })], false)).toBe('stand-tuft')
    expect(moleSprite('tuft', [done], false, undefined, false, false)).toBe('stand-tuft')
  })
  it('uses wave only for an explicit local preview and standing for quiet or reduced motion', () => {
    const rows = [workRow('done', { detail: 'completed', runStanding: 'closed' })]
    expect(moleSprite('bun', rows, false, undefined, true)).toBe('wave-bun')
    expect(moleSprite('bun', rows, false)).toBe('cheer-bun')
    for (const look of standingLooks) for (const detail of ['completed', 'reporting', 'executing', 'task_completed']) for (const moving of [undefined, walk]) {
      expect(moleSprite(look, [workRow('one', { detail, runStanding: 'closed' })], true, moving, true)).toBe('stand-' + look)
    }
  })
  it('keeps one symbol and word for all seven groups and prioritizes actionable simultaneous work', () => {
    expect(Object.keys(badges)).toHaveLength(7)
    for (const badge of Object.values(badges)) expect(badge.symbol && badge.en && badge.zh).toBeTruthy()
    expect(moleGroup([workRow('done', { detail: 'completed', runStanding: 'closed' }), workRow('blocked', { detail: 'blocked' })])).toBe('attention')
    expect(moleGroup([workRow('waiting', { detail: 'queued' }), workRow('handoff', { detail: 'reporting' })])).toBe('handoff')
    expect(moleGroup([], true)).toBe('unknown'); expect(moleGroup([workRow('active', { detail: 'executing' })], false)).toBe('unknown')
  })
})
describe('compact nameplates beside protected geometry', () => {
  it('moves a home nameplate aside when a passing face crosses its usual place', () => {
    const layout = new LayoutCache().layout({ rooms: [{ id: 'sample', occupants: ['a', 'b'] }] })
    const planner = new Nameplates(layout), home = Object.entries(layout.seats).map(([key, seat]) => ({ key, point: seat.foot }))
    const original = planner.place(home).get('a')!, point = { x: original.x + 50, y: original.y + 80 }
    const plates = planner.place(home.map(actor => actor.key === 'b' ? { ...actor, point } : actor))
    expect(plates.get('a')).not.toEqual(original)
    expect(overlaps(plates.get('a')!, bodyBox(point))).toBe(false)
  })
  it('avoids desk fronts, doors, every body and other nameplates over changing synthetic rosters', () => {
    let checked = 0
    for (let seed = 0; seed < 64; seed++) {
      const rooms = Array.from({ length: 1 + seed % 9 }, (_, group) => ({ id: `group-${seed}-${group}`, occupants: Array.from({ length: 1 + (seed * 3 + group * 5) % 17 }, (_, n) => `agent-${group}-${n}`) }))
      const layout = new LayoutCache().layout({ rooms }), actors = Object.entries(layout.seats).map(([key, seat]) => ({ key, point: seat.foot }))
      // A passing body must move the nameplate too, without covering any home face.
      if (seed % 2) actors[0] = { ...actors[0]!, point: { x: actors[0]!.point.x + 112, y: actors[0]!.point.y + 32 } }
      const planner = new Nameplates(layout), plates = planner.place(actors)
      // Expected geometry is built independently of the planner's protection index.
      // A seat with a desk is drawn at its desktop, so only a seat without a desk
      // keeps a standing home body; every actor's drawn point describes its body.
      // The desk front is written here as the part of a desk a plate may never cover, a little inside
      // the planner's own margin, so the test does not pass by reading the planner's rule back. The body
      // is the planner's box for a drawn mole, read from it, since the planner is what keeps it clear.
      const blocks = [
        ...Object.values(layout.seats).map(seat => ({ x: seat.desk.x, y: seat.desk.y + 30, width: seat.desk.width, height: seat.desk.height - 30 })),
        ...layout.houses.flatMap(house => house.openings),
        ...[...Object.values(layout.seats).filter(seat => seat.desk.width === 0).map(s => s.foot), ...actors.map(a => a.point)].map(p => bodyBox(p)),
      ]
      expect(plates).toEqual(planner.place(actors)); expect(plates.size).toBe(actors.length)
      const used = []
      for (const rect of plates.values()) {
        expect(blocks.some(block => overlaps(rect, block))).toBe(false)
        expect(used.some(other => overlaps(rect, other))).toBe(false); used.push(rect); checked++
      }
    }
    expect(checked).toBeGreaterThan(2500)
    expect(shortName('A very long synthetic name')).toBe('A very long…')
  })
})
