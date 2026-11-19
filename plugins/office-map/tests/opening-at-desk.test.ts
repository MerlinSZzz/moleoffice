// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { afterEach, expect, it, vi } from 'vitest'
import { mapFixture } from './tuft-action-map-fixture.ts'
import { pageActionPacks } from '../src/action-runtime.ts'
import { releaseMapSurfaces } from '../src/map-view.ts'
import { atDesk } from '../src/desk-things.ts'
import { flush } from './tuft-action-fixture.ts'
afterEach(async()=>{pageActionPacks.setNeeds([]);await flush();releaseMapSurfaces();vi.restoreAllMocks();vi.useRealTimers();vi.unstubAllGlobals()})

// The view opens on the first mole where it is drawn, behind its desk at atDesk(seat), and
// locating a mole at its desk centres on the same point. A foot beside the desk is as in a room
// of 9 to 12 or 14 or more; a foot below it is as in the rooms of 1 to 8 and the hall of 13.
// The fixture's desk piece is taken away, so the desk action does not bind the mole; a mole it
// binds during a completed idle episode stands at its action desk (desk-action-at-foot.test.ts).
const centre=(f:ReturnType<typeof mapFixture>)=>{
  const zoom=(f.map as unknown as {zoom:number}).zoom, b=f.layout.bounds
  return {x:b.x+(f.view.scrollLeft+f.view.clientWidth/2)/zoom,y:b.y+(f.view.scrollTop+f.view.clientHeight/2)/zoom}
}
it.each([['beside',true],['below',false]] as const)('opens and locates on a mole whose foot is %s its desk where it is drawn', async(_where,beside)=>{
  const f=mapFixture(); f.actor.work[0]!.runStanding='working'; f.actor.work[0]!.executing=true; const seat=f.layout.seats[f.actor.key]!
  if(beside) seat.foot={x:seat.desk.x+seat.desk.width+76,y:500}
  f.layout.pieces=[]
  f.update();await f.drain()
  expect((f.map as unknown as {actionBindings:Map<string,unknown>}).actionBindings.size).toBe(0)
  expect((f.map as unknown as {zoom:number}).zoom).toBe(1)
  const drawn=atDesk(seat)
  expect(Math.hypot(drawn.x-seat.foot.x,drawn.y-seat.foot.y)).toBeGreaterThan(50)
  expect(centre(f)).toEqual(drawn)
  f.view.scrollLeft=0;f.view.scrollTop=0
  f.map.locate(f.actor.key)
  expect(centre(f)).toEqual(drawn)
  f.map.dispose()
},30000)
