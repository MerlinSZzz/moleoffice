// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { expect, it } from 'vitest'
import { OfficeMap } from '../src/map-view.ts'
import { mapOffice } from '../src/model.ts'
import { OwnershipGeometryCache } from '../src/ownership-layout.ts'
import type { RosterView } from '../src/contracts.ts'
import catalog from '../assets/village-catalog.json'
import { agent, people } from './fixtures.ts'

it('draws one native B01 front and floor from the actual doorway fragments', () => {
  const model = mapOffice({ ...people, view: 'roster', agents: [agent('invented-secretary', { role: 'secretary' })] } as RosterView, null)
  const work = new OwnershipGeometryCache().build({ rooms: model.rooms, roster: model.layoutRoster })
  let next = work.next(); while (!next.done) next = work.next()
  const layout = next.value, house = layout.houses.find(h => h.type === 'secretariat')!
  const source: any = catalog.sprites, images = new Map(Object.keys(catalog.atlases).map(key => [key, {}]))
  // A crop that lies where its layer has no art draws nothing, so only the crops that hold art are drawn.
  for (const [sprite, expected, withArt] of [['B01-front', 12, 4], ['B01-floor', 8, 8]] as const) {
    const items = layout.pieces.filter(p => p.group === house.group && p.sprite === sprite)
    expect(items, `${sprite} remains one piece`).toHaveLength(1)
    const fragments = (items[0] as any).fragments
    expect(fragments, `${sprite} has its real crops`).toHaveLength(expected)
    const [tx, ty] = source[sprite].trim, [, , width, height] = source[sprite].rect
    const drawn = fragments.filter((part: any) => Math.min(tx + width, part.crop.x + part.crop.width) > Math.max(tx, part.crop.x) && Math.min(ty + height, part.crop.y + part.crop.height) > Math.max(ty, part.crop.y))
    expect(drawn, `${sprite} has its crops that hold art`).toHaveLength(withArt)
    const calls: number[][] = [], ctx = { drawImage: (_image: unknown, ...args: number[]) => calls.push(args) }
    const fake: any = { pack: { sources: { sprites: source }, images }, contacts: null }
    ;(OfficeMap.prototype as any).drawPiece.call(fake, ctx, items[0])
    expect(calls, `${sprite} draws every crop that holds art`).toHaveLength(withArt)
    for (const [i, part] of drawn.entries()) {
      expect(calls[i]![4]).toBe(house.x + part.x + Math.max(tx, part.crop.x) - part.crop.x)
      expect(calls[i]![5]).toBe(house.y + part.y + Math.max(ty, part.crop.y) - part.crop.y)
    }
  }
})

it('retains the board and bookshelf in the one-secretary house', () => {
  const model = mapOffice({ ...people, view: 'roster', agents: [agent('invented-secretary', { role: 'secretary' })] } as RosterView, null)
  const work = new OwnershipGeometryCache().build({ rooms: model.rooms, roster: model.layoutRoster })
  let next = work.next(); while (!next.done) next = work.next()
  const layout = next.value, house = layout.houses.find(h => h.type === 'secretariat')!
  for (const sprite of ['message-board', 'bookshelf']) expect(layout.pieces.filter(p => p.group === house.group && p.sprite === sprite), sprite).toHaveLength(1)
})
