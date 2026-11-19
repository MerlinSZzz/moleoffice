// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { expect, it } from 'vitest'
import { mapOffice } from '../src/model.ts'
import { OwnershipGeometryCache } from '../src/ownership-layout.ts'
import type { RosterView } from '../src/contracts.ts'
import { agent, people } from './fixtures.ts'

it('keeps the five-secretary table group inside the front wall', () => {
  const agents = Array.from({length:5}, (_,i) => agent(`invented-secretary-${i}`, {role:'secretary'}))
  const model = mapOffice({...people,view:'roster',agents} as RosterView,null)
  const work = new OwnershipGeometryCache().build({rooms:model.rooms,roster:model.layoutRoster})
  let next=work.next(); while(!next.done) next=work.next()
  const layout=next.value, house=layout.houses.find(h=>h.type==='secretariat')!, front=house.openings[0]!.y
  for (const sprite of ['tea-table','tea-set','A29']) {
    const piece=layout.pieces.find(p=>p.group===house.group && p.sprite===sprite)
    expect(piece, sprite).toBeDefined()
    expect(piece!.y+piece!.height, `${sprite} stays before the front wall`).toBeLessThanOrEqual(front)
  }
})
