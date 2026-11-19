// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { describe, expect, it } from 'vitest'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import catalog from '../assets/village-catalog.json'
import { LayoutCache, pointIsClear, routeBetween } from '../src/geometry.ts'
import { houseCatalog, housePools, houseStyles, inPolygon, polygonTouchesRect } from '../src/village.ts'
import { roadContains } from '../src/road-contour.ts'
import { portraitOf, standingLooks, standingOf, standingScale } from '../src/appearance.ts'
import { ATLAS_BYTES, drawSprite } from '../src/pack.ts'
import { SURFACE_BYTES } from '../src/render-plan.ts'
import { dimensions } from '../src/assets.ts'
import { apron, legacy } from './fixtures.ts'

const made = '2026-11-17 23:59:59'
const input = { rooms: [{ id: 'team', occupants: ['a', 'b', 'c', 'd'] }, { id: 'review', occupants: ['e', 'f'] }, { id: 'welcome', occupants: ['g'] }] }
describe('the reviewed village', () => {
  it('fills the common loop continuously and furnishes its tea, notice and pond gardens', () => {
    const input = { rooms: Array.from({ length: 6 }, (_, i) => ({ id: `village-${i}`, occupants: [`agent-${i}`] })) }
    const layout = new LayoutCache().layout(input)
    expect(layout.square.y + layout.square.height).toBeGreaterThanOrEqual(464 + 39)
    for (const id of ['tea-table', 'tea-set', 'stool-sw', 'stool-se', 'A62', 'A65', 'A46', 'B48', 'B38', 'B40', 'B42', 'B43', 'B52', 'B54', 'B64', 'lantern', 'A58', 'B59', 'A63', 'berry-bush', 'tree-stump']) expect(layout.pieces.some(p => p.sprite === id && p.group === null), id).toBe(true)
    expect(layout.pieces.filter(p => p.group === null).length).toBeGreaterThan(75)
    const tea = layout.pieces.find(p => p.sprite === 'tea-table' && p.group === null)!, cups = layout.pieces.find(p => p.sprite === 'tea-set' && p.group === null)!
    expect(cups.depth).toBeGreaterThan(tea.depth)
    expect(new LayoutCache().layout(structuredClone(input)).pieces).toEqual(layout.pieces)
  })
  it('repeats identical houses, seats, furniture and source layers for the same roster', () => {
    const first = new LayoutCache().layout(input), second = new LayoutCache().layout(structuredClone(input))
    expect(second).toEqual(first)
    expect(housePools.four).toContain(first.houses[0]!.style)
    for (const house of first.houses.slice(1)) expect(housePools.studio).toContain(house.style)
    for (const id of Object.keys(first.seats)) expect(first.pieces.filter(p => p.group === first.seats[id]!.room && p.sprite === 'worker-desk')).toHaveLength(input.rooms.find(r => r.id === first.seats[id]!.room)!.occupants.length)
    for (const sprite of ['open-laptop', 'coffee-mug', 'paper-stack', 'desk-lamp']) expect(first.pieces.filter(p => p.sprite === sprite)).toHaveLength(7)
    for (const sprite of ['message-board', 'B43', 'tea-table', 'B64']) expect(first.pieces.some(p => p.sprite === sprite && p.group === null)).toBe(true)
  })
  it('adds adjacent modules and removes seats while every other group keeps its exact house and furniture', () => {
    const cache = new LayoutCache(), first = cache.layout(input)
    const growing = structuredClone(input); growing.rooms[0]!.occupants.push('new')
    const second = cache.layout(growing)
    expect(second.houses.filter(h => h.group === 'team')).toHaveLength(2)
    for (const house of second.houses.filter(h => h.group === 'team')) expect(housePools.long).toContain(house.style)
    for (const group of ['review', 'welcome']) {
      expect(second.houses.filter(h => h.group === group)).toEqual(first.houses.filter(h => h.group === group))
      expect(second.pieces.filter(p => p.group === group)).toEqual(first.pieces.filter(p => p.group === group))
    }
    for (const key of ['e', 'f', 'g']) expect(second.seats[key]).toEqual(first.seats[key])
    growing.rooms[0]!.occupants = ['a']; const third = cache.layout(growing)
    expect(housePools.studio).toContain(third.houses.find(h => h.group === 'team')!.style)
    expect(third.pieces.filter(p => p.group === 'review')).toEqual(first.pieces.filter(p => p.group === 'review'))
    expect(third.seats['b']).toBeUndefined(); expect(cache.roomComputations).toBe(5)
    expect(cache.layout(input)).toEqual(first)
  })
  it('uses source anchors, polygons and clear openings and routes through every house size and module', () => {
    for (const group of ['green-team', 'four']) {
    const layout = new LayoutCache().layout({ rooms: [{ id: 'one', occupants: ['a'] }, { id: 'two', occupants: ['b', 'c'] }, { id: group, occupants: ['d', 'e', 'f', 'g', 'h', 'i', 'j', 'k'] }] })
    for (const house of layout.houses) {
      const meta = houseCatalog[house.style]!
      expect(house.anchor).toEqual({ x: house.x + meta.groundAnchor[0]!, y: house.y + meta.groundAnchor[1]! })
      expect(house.openings.every(o => o.width >= 78)).toBe(true)
      for (const seat of house.occupants.map(id => layout.seats[id]!)) {
        if (house.style === 'B03') expect(seat.foot.y - house.y).toBeLessThanOrEqual(336)
        if (house.style.endsWith('01') && seat.index % 2 === 0) expect(seat.foot.x - house.x).toBe(120)
      }
      const polygon = layout.obstacles.find(o => o.polygon && o.x === house.x + 40)!
      expect(pointIsClear(layout, { x: polygon.x + 6, y: polygon.y + 16 })).toBe(false)
    }
    for (const [id, seat] of Object.entries(layout.seats)) expect(pointIsClear(layout, seat.foot, [id]), id).toBe(true)
    for (const [from, to] of [['a', 'b'], ['c', 'd'], ['d', 'g'], ['g', 'h'], ['h', 'k']]) {
      const route = routeBetween(layout, from!, to!)
      expect(route.status, `${from} to ${to}`).toBe('found')
      expect(route.points.at(-1)).toEqual(layout.seats[to!]!.talk)
      expect(route.points.every(p => pointIsClear(layout, p, [from!, to!]))).toBe(true)
    }
    expect(inPolygon({ x: -1, y: -1 }, layout.houses[0]!.walkable[0]!)).toBe(false)
    }
  })
  it('repeats group preferences and resolves neighbouring matches across many current rosters', () => {
    const used = new Set<string>()
    for (let n = 0; n < 96; n++) {
      const rooms = Array.from({ length: 12 }, (_, i) => ({ id: `group-${n}-${i}`, occupants: Array.from({ length: n % 3 === 0 ? 8 : n % 3 === 1 ? 4 : 2 }, (_, j) => `${i}-${j}`) }))
      const styles = houseStyles(rooms)
      expect(houseStyles(structuredClone(rooms))).toEqual(styles)
      styles.forEach((style, i) => {
        used.add(style)
        if (i >= 2) expect(style).not.toBe(styles[i - 2])
        if (i % 2) expect(style).not.toBe(styles[i - 1])
      })
      expect(houseStyles(rooms.map(r => ({ ...r, occupants: [...r.occupants].reverse() })))).toEqual(styles)
    }
    expect([...used].sort()).toEqual(Object.keys(houseCatalog).sort())
  })
  it('attaches every used variant to its own desks, source layers, collision, doors and clear routes', () => {
    for (const style of Object.keys(houseCatalog)) {
      const count = housePools.studio.some(id => id === style) ? 2 : housePools.four.some(id => id === style) ? 4 : 8
      for (const side of [0, 1]) {
        let outside = 'outside'
        for (let n = 0; n < 1000 && houseStyles([{ id: outside, occupants: ['outside'] }])[0] === style; n++) outside = `outside-${n}`
        const rooms = (id: string) => {
          const own = { id, occupants: Array.from({ length: count }, (_, i) => `seat-${i}`) }, other = { id: outside, occupants: ['outside'] }
          return side === 0 ? [own, other] : [other, own]
        }
        let id = ''
        for (let n = 0; n < 1000; n++) {
          const candidate = `variant-${style}-${n}`
          if (houseStyles(rooms(candidate))[side] === style) { id = candidate; break }
        }
        expect(id).not.toBe('')
        const layout = new LayoutCache().layout({ rooms: rooms(id) })
        expect(layout.houses.find(h => h.group === id)!.style).toBe(style)
        for (const house of layout.houses.filter(h => h.group === id)) {
          const meta = houseCatalog[style]!
          expect(house.occupants.length).toBeLessThanOrEqual(meta.deskSlots.length)
          for (const [local, occupant] of house.occupants.entries()) {
            const seat = layout.seats[occupant]!, slot = meta.deskSlots[local]!
            expect(seat.desk).toMatchObject({ x: house.x + slot.xy[0]!, width: slot.size[0], height: slot.size[1] })
            expect(seat.desk.y).toBeLessThanOrEqual(house.y + slot.xy[1]!)
            expect(seat.desk.y + seat.desk.height).toBeLessThanOrEqual(house.y + house.height - 103)
            expect(pointIsClear(layout, seat.foot, [occupant]), `${style} ${occupant} foot`).toBe(true)
            expect(pointIsClear(layout, seat.talk, [occupant]), `${style} ${occupant} talk`).toBe(true)
            for (const [from, to] of [[occupant, 'outside'], ['outside', occupant]]) {
              const route = routeBetween(layout, from!, to!)
              expect(route.status, `${style} ${from} to ${to}`).toBe('found')
              expect(route.points.every(p => pointIsClear(layout, p, [from!, to!]))).toBe(true)
              expect(route.points.at(-1)).toEqual(layout.seats[to!]!.talk)
            }
          }
          for (const door of house.doors) {
            expect(roadContains(layout.road, door)).toBe(true)
            expect(pointIsClear(layout, door), `${style} door`).toBe(true)
            const roadY = house.y + house.height + 48, laneX = house.x + house.width / 2 - 360
            const path = [door, { x: door.x, y: roadY }, { x: laneX, y: roadY }, { x: laneX, y: side === 0 ? 48 : 464 }]
            for (let i = 1; i < path.length; i++) for (const f of [0, .25, .5, .75, 1]) {
              const a = path[i - 1]!, b = path[i]!, point = { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f }
              expect(roadContains(layout.road, point), `${style} door approach`).toBe(true)
              if (i === 1) expect(pointIsClear(layout, point), `${style} clear entrance`).toBe(true)
            }
          }
          for (const layer of meta.layers) expect(layout.pieces).toContainEqual(expect.objectContaining({ sprite: layer.sprite, x: house.x, y: house.y, layer: layer.layer, ...(layer.depth === null ? {} : { depth: house.y + layer.depth }) }))
          for (const poly of meta.collisionPolygons) expect(layout.obstacles).toContainEqual(expect.objectContaining({ polygon: poly.map(p => ({ x: house.x + p[0]!, y: house.y + p[1]! })) }))
        }
      }
    }
  })
  it('keeps a polygon opening clear where its bounding box alone would block a foot', () => {
    const triangle = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 0, y: 100 }]
    expect(polygonTouchesRect(triangle, { x: 80, y: 80, width: 10, height: 10 })).toBe(false)
    expect(polygonTouchesRect(triangle, { x: 40, y: 40, width: 10, height: 10 })).toBe(true)
    expect(polygonTouchesRect(triangle, { x: 0, y: 45, width: 100, height: 1 })).toBe(true)
    const layout = new LayoutCache().layout({ rooms: [] })
    layout.obstacles = [{ x: 0, y: 0, width: 100, height: 100, polygon: triangle, kind: 'wall' }]
    expect(pointIsClear(layout, { x: 90, y: 90 })).toBe(true)
    expect(pointIsClear(layout, { x: 45, y: 45 })).toBe(false)
  })
  it('keeps tall woodland pieces outside every house, door and seat hit area', () => {
    const layout = new LayoutCache().layout(input)
    for (const tree of layout.pieces.filter(p => ['tree-assembled', 'pine-tree', 'B56'].includes(p.sprite))) {
      const overlaps = (r: { x: number; y: number; width: number; height: number }) => tree.x < r.x + r.width && tree.x + tree.width > r.x && tree.y < r.y + r.height && tree.y + tree.height > r.y
      expect(layout.houses.some(overlaps)).toBe(false)
      for (const seat of Object.values(layout.seats)) expect(overlaps({ x: seat.foot.x - 72, y: seat.foot.y - 140, width: 180, height: 196 })).toBe(false)
      for (const house of layout.houses) expect(house.openings.some(overlaps)).toBe(false)
    }
  })
  it('maps the five saved catalogue ids, preserves unsupported originals and repeats a stable sixteen-look fallback', () => {
    const expected = { bare: 'crest', scarf: 'bun', 'sand-apron': 'apron', 'cocoa-vest': 'part', 'silver-glasses': 'waves' }
    for (const [id, look] of Object.entries(expected)) expect(standingOf(portraitOf({ version: 2, style: 'c-forest', lookId: id }), 'agent', made)).toEqual({ look, source: 'saved-catalogue' })
    expect(standingOf(portraitOf(apron), 'agent', made).look).toBe('apron')
    for (const stored of [legacy, { ...apron, fur: 'grey-brown' }, { version: 99 }, null]) {
      const before = structuredClone(stored), portrait = portraitOf(stored)
      expect(standingOf(portrait, 'fixed-id', made)).toEqual(standingOf(portraitOf(structuredClone(stored)), 'fixed-id', made))
      expect(standingOf(portrait, 'fixed-id', made).source).toBe('stable-fallback'); expect(portrait.stored).toEqual(before)
    }
    const looks = Array.from({ length: 512 }, (_, i) => standingOf(portraitOf(null), `agent-${i}`, made).look)
    expect(new Set(looks).size).toBe(16); expect(looks.length).toBeGreaterThan(new Set(looks).size)
    expect(standingScale(.3)).toBe(.8); expect(standingScale(1.6)).toBe(.92)
    expect(standingLooks.every(id => Object.hasOwn(catalog.sprites, 'stand-' + id))).toBe(true)
  })
  it('checks emitted atlas hashes and native headers and counts decode overlap and all canvas buffers', () => {
    let decoded = 0
    for (const [id, atlas] of Object.entries(catalog.atlases)) {
      const png = readFileSync(new URL(`../assets/${id}.png`, import.meta.url))
      expect(createHash('sha256').update(png).digest('hex')).toBe(atlas.sha256)
      expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual(atlas.size)
      expect(png.length).toBe(atlas.bytes); expect(atlas.decodedBytes).toBe(atlas.size[0]! * atlas.size[1]! * 4)
      expect(atlas.decodedBytes).toBeLessThanOrEqual(4 * 1024 * 1024); decoded += atlas.decodedBytes
    }
    for (const [id, size] of Object.entries(dimensions)) if (!id.startsWith('village-')) decoded += size[0] * size[1] * 4
    expect(decoded).toBeLessThanOrEqual(ATLAS_BYTES)
    expect(decoded + SURFACE_BYTES + 4 * 1024 * 1024 + 256 * 160 * 4 + 2 * 26 * 26 * 4).toBeLessThanOrEqual(64 * 1024 * 1024)
  })
  it('draws the trimmed frame at its native origin, and missing atlases return a plain-shape signal', () => {
    const frame = catalog.sprites['stand-tuft'], calls: unknown[][] = [], image = {} as HTMLImageElement
    const ctx = { drawImage: (...args: unknown[]) => calls.push(args) } as unknown as CanvasRenderingContext2D
    const pack = { images: new Map([[frame.atlas, image]]), sources: { sprites: catalog.sprites } } as unknown as import('../src/pack.ts').ArtPack
    expect(drawSprite(ctx, pack, 'stand-tuft', 10, 20)).toBe(true)
    expect(calls[0]).toEqual([image, ...frame.rect, 10 + frame.trim[0]!, 20 + frame.trim[1]!, frame.rect[2], frame.rect[3]])
    pack.images.clear(); expect(drawSprite(ctx, pack, 'stand-tuft', 10, 20)).toBe(false)
  })
})
