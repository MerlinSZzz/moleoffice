// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { afterEach, expect, it, vi } from 'vitest'
import { mapFixture } from './tuft-action-map-fixture.ts'
import { pageActionPacks } from '../src/action-runtime.ts'
import { releaseMapSurfaces } from '../src/map-view.ts'
import { atDesk } from '../src/desk-things.ts'
import type { Occupant } from '../src/model.ts'
import { flush } from './tuft-action-fixture.ts'
afterEach(async()=>{pageActionPacks.setNeeds([]);await flush();releaseMapSurfaces();vi.restoreAllMocks();vi.useRealTimers();vi.unstubAllGlobals()})

// The page starts and ends every walk of a mole at its desk, the idle outing and the walk to a
// desk-talk point, at map.drawnPoint, which is the seat's foot. A mole free to walk is drawn
// there, standing at its seat, so its walk starts and ends where it is drawn and it does not
// jump from behind its desk to its foot. A mole at work is drawn behind its desk, at atDesk(seat).
// A foot beside the desk is as in a room of 9 to 12 or 14 or more; a foot below it is as in the
// rooms of 1 to 8 and the hall of 13. The fixture's desk piece is taken away, so no action binds.
const centre=(f:ReturnType<typeof mapFixture>)=>{
  const zoom=(f.map as unknown as {zoom:number}).zoom, b=f.layout.bounds
  return {x:b.x+(f.view.scrollLeft+f.view.clientWidth/2)/zoom,y:b.y+(f.view.scrollTop+f.view.clientHeight/2)/zoom}
}
const loaded=<T>(value:T)=>({status:'loaded' as const,value,receivedAt:1,error:null,revision:1,pending:false})
it.each([['beside',true],['below',true],['beside',false],['below',false]] as const)('draws a mole whose foot is %s its desk, free to walk: %s, at the point its walks start from if free and behind its desk if not', async(where,free)=>{
  const beside=where==='beside'
  const f=mapFixture(); const seat=f.layout.seats[f.actor.key]!
  if(beside) seat.foot={x:seat.desk.x+seat.desk.width+76,y:500}
  f.layout.pieces=[]
  const actor=f.actor as Occupant
  actor.facts={people:loaded({} as never),work:loaded([])}
  actor.work[0]!.runStanding=free?'closed':'open'
  f.update();await f.drain()
  const map=f.map as unknown as {actionBindings:Map<string,unknown>;actors:(keys:string[])=>{key:string;point:{x:number;y:number};walk?:unknown}[]}
  expect(map.actionBindings.size).toBe(0)
  const drawn=map.actors([f.actor.key]).find(a=>a.key===f.actor.key)
  expect(drawn?.walk).toBeUndefined()
  expect(Math.hypot(atDesk(seat).x-seat.foot.x,atDesk(seat).y-seat.foot.y)).toBeGreaterThan(50)
  expect(f.map.drawnPoint(f.actor.key)).toEqual(seat.foot)
  const at=free?seat.foot:atDesk(seat)
  expect(drawn?.point).toEqual(at)
  expect(centre(f)).toEqual(at)
  f.view.scrollLeft=0;f.view.scrollTop=0
  f.map.locate(f.actor.key)
  expect(centre(f)).toEqual(at)
  f.map.dispose()
},30000)
