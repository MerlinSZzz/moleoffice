// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { afterEach,expect,it,vi } from 'vitest'
import { releaseMapSurfaces } from '../src/map-view.ts'
import { pageActionPacks } from '../src/action-runtime.ts'
import { draws,mapFixture,ownLook } from './tuft-action-map-fixture.ts'
import { flush } from './tuft-action-fixture.ts'
import { actorRect } from '../src/layout-index.ts'
import { overlapsCamera } from '../src/viewport.ts'
afterEach(async()=>{pageActionPacks.setNeeds([]);await flush();releaseMapSurfaces();vi.restoreAllMocks();vi.useRealTimers();vi.unstubAllGlobals()})
it('makes zero action requests before the complete production surface and two actual paint acknowledgements',async()=>{
  const f=mapFixture();f.update();expect(f.load).not.toHaveBeenCalled();await f.drain()
  expect(f.view.children[0]?.children.some(node=>node.dataset.lookReady==='true')).toBe(true)
  expect(f.map.actions.snapshot().latched).toBe(false);expect(f.load).not.toHaveBeenCalled()
  f.paints.turn();expect(f.load).not.toHaveBeenCalled();f.paints.turn();await f.drain();expect(f.load).toHaveBeenCalledTimes(1)
  expect(f.map.actions.snapshot().latched).toBe(true);expect(draws.some(args=>args[0]===f.image)).toBe(true);expect(f.map.actions.evidence(f.actor.key)).toBeNull()
  expect(f.layout.seats[f.actor.key]!.foot).toEqual({x:420,y:500});f.map.dispose()
})
it.each(['offscreen','no-action','quiet','reduced','unsupported','recolour','wave','inactive'] as const)('does not request an action pack for %s in the production actor path',async(gate)=>{
  const f=mapFixture();if(gate==='offscreen')f.view.scrollLeft=650
  if(gate==='no-action')f.actor.work=[]
  if(gate==='quiet'||gate==='reduced')f.options.still=true
  if(gate==='unsupported'){f.actor.agent.appearance={unsupported:true};f.actor.portrait.unavailable='unsupported'}
  if(gate==='recolour')f.actor.standing.recipe=1
  if(gate==='wave')f.options.wave=f.actor.key
  if(gate==='inactive')f.map.setMotionActive(false)
  f.update();await f.drain();
  if(gate==='offscreen'){const actual=f.map as unknown as {bufferedSeats:string[];actualCamera:()=>{left:number;top:number;width:number;height:number}};expect(actual.bufferedSeats).toContain(f.actor.key);expect(overlapsCamera(actorRect(f.layout.seats[f.actor.key]!.foot),actual.actualCamera())).toBe(false)}
  f.paints.turn();f.paints.turn();await f.drain();expect(f.load).not.toHaveBeenCalled()
  if(gate==='recolour')expect(draws.some(args=>args[0]===ownLook)).toBe(true)
  f.map.dispose()
})
it('withdraws failed eligibility and keeps the same appearance and reserved seat',async()=>{
  const f=mapFixture();f.update();await f.drain();f.paints.turn();f.paints.turn();await f.drain();expect(f.load).toHaveBeenCalledTimes(1)
  const foot={...f.layout.seats[f.actor.key]!.foot};f.map.setMotionActive(false);await f.drain();expect(f.map.actions.evidence(f.actor.key)).toBeNull();expect(f.layout.seats[f.actor.key]!.foot).toEqual(foot);expect(f.actor.standing.recipe).toBe(0);f.map.dispose()
})
