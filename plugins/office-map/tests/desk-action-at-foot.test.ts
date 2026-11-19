// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { afterEach, expect, it, vi } from 'vitest'
import { mapFixture } from './tuft-action-map-fixture.ts'
import { pageActionPacks } from '../src/action-runtime.ts'
import { releaseMapSurfaces } from '../src/map-view.ts'
import { bodyBox, overlaps } from '../src/nameplates.ts'
import type { ContactPiece } from '../src/action-binding.ts'
import type { Piece } from '../src/village.ts'
import { flush } from './tuft-action-fixture.ts'
afterEach(async()=>{pageActionPacks.setNeeds([]);await flush();releaseMapSurfaces();vi.restoreAllMocks();vi.useRealTimers();vi.unstubAllGlobals()})

// An idle mole finishing a completed episode may be bound to the desk action. The action takes the
// mole's own desk away and draws its working desk and stool round the seat's foot, and plays at
// that foot. When the action is not drawing the mole, it stands at that foot as well, at the
// working desk, and the view opens and locates on it there. A foot beside the desk is as in a
// room of 9 to 12 or 14 or more; a foot below it is as in the rooms of 1 to 8 and the hall of 13.
const centre=(f:ReturnType<typeof mapFixture>)=>{
  const zoom=(f.map as unknown as {zoom:number}).zoom, b=f.layout.bounds
  return {x:b.x+(f.view.scrollLeft+f.view.clientWidth/2)/zoom,y:b.y+(f.view.scrollTop+f.view.clientHeight/2)/zoom}
}
it.each([['beside',true],['below',false]] as const)('draws, opens and locates an idle mole bound to the desk action, with its foot %s its own desk', async(_where,beside)=>{
  const f=mapFixture(); const seat=f.layout.seats[f.actor.key]!
  if(beside) seat.foot={x:seat.desk.x+seat.desk.width+76,y:500}
  f.update();await f.drain()
  const map=f.map as unknown as {zoom:number;actionBindings:Map<string,{action:string}>;bindingLayout:{pieces:Piece[]};actors:(keys:string[])=>{key:string;point:{x:number;y:number};walk?:unknown}[]}
  expect(map.zoom).toBe(1)
  expect(map.actionBindings.get(f.actor.key)?.action).toBe('desk')
  const working=map.bindingLayout.pieces.find(p=>p.sprite==='worker-desk'&&(p as ContactPiece).contactSize)
  expect(working,'the working desk').toBeDefined()
  expect(map.bindingLayout.pieces.some(p=>p.sprite==='worker-desk'&&p.x===seat.desk.x&&p.y===seat.desk.y),'its own desk').toBe(false)
  const actor=map.actors([f.actor.key]).find(a=>a.key===f.actor.key)
  expect(actor?.walk).toBeUndefined()
  expect(actor?.point).toEqual(seat.foot)
  expect(overlaps(bodyBox(actor!.point),working!),'the mole drawn at its working desk').toBe(true)
  expect(centre(f)).toEqual(seat.foot)
  f.view.scrollLeft=0;f.view.scrollTop=0
  f.map.locate(f.actor.key)
  expect(centre(f)).toEqual(seat.foot)
  f.map.dispose()
},30000)
