// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { afterEach,expect,it,vi } from 'vitest'
import { bindActions } from '../src/action-binding.ts'
import { facilityPlan } from '../src/ownership-facilities.ts'
import { releaseMapSurfaces } from '../src/map-view.ts'
import { pageActionPacks } from '../src/action-runtime.ts'
import { pageCompositions } from '../src/action-resources.ts'
import { workIntent } from '../src/action-intent.ts'
import { moleGroup } from '../src/mole-state.ts'
import { mapFixture } from './tuft-action-map-fixture.ts'
import { flush } from './tuft-action-fixture.ts'

// Keep the terminal frame observed before an idle actor leaves for its facility.
function terminalFrames(f: ReturnType<typeof mapFixture>) {
  const frames: {sourceIndex: number; terminal: boolean; episodeToken: string}[] = [], draw = f.map.actions.draw.bind(f.map.actions)
  vi.spyOn(f.map.actions, 'draw').mockImplementation((ctx, key) => {
    const result = draw(ctx, key), actor = f.map.actions.snapshot().actors[key]
    if (actor?.terminal) frames.push({sourceIndex: actor.sourceIndex, terminal: actor.terminal, episodeToken: actor.episodeToken})
    return result
  })
  return frames
}
afterEach(async()=>{pageActionPacks.setNeeds([]);await flush();releaseMapSurfaces();vi.restoreAllMocks();vi.useRealTimers();vi.unstubAllGlobals()})
it('observes a presented action without changing shared cache recency or retained bytes',async()=>{
  const f=mapFixture(true);f.update();await f.drain();f.paints.turn();f.paints.turn();await vi.waitFor(()=>expect(pageActionPacks.resident('tuft')).not.toBeNull());await f.drain()
  const action=f.map.actions.evidence(f.actor.key);expect(action).not.toBeNull()
  pageCompositions.put('generated-diagnostic-follower',new Uint8Array(4),1,1)
  const before=pageCompositions.snapshot(),observed=f.map.actions.evidence(f.actor.key)
  expect(observed?.canvas).toBe(action!.canvas);expect(pageCompositions.snapshot()).toEqual(before)
  f.map.dispose()
})
it('keeps contact binding fixed through loading, quiet and failure without mutating seats or source pieces',async()=>{
  const f=mapFixture(),before=structuredClone(f.layout),a=bindActions(f.layout,f.model),b=bindActions(f.layout,f.model)
  expect(a.bindings.get(f.actor.key)?.action).toBe('desk');expect(a.rejected).toEqual([]);expect(a.layout.pieces).toEqual(b.layout.pieces);expect(f.layout).toEqual(before);expect(a.layout.seats).toBe(f.layout.seats)
  f.update();await f.drain();f.paints.turn();f.paints.turn();await f.drain();f.options.still=true;f.update();await f.drain();expect(f.layout).toEqual(before);f.map.dispose()
})
it('binds an actual generated facility desk to the exact existing native stool and leaves Secretariat cells alone',()=>{
  const f=mapFixture(),plan=facilityPlan([f.actor.key],'generated-room');f.layout.seats=Object.fromEntries(plan.seats);f.layout.pieces=plan.pieces;f.layout.obstacles=plan.obstacles
  const bound=bindActions(f.layout,f.model);expect(bound.rejected).toEqual([]);expect(bound.bindings.get(f.actor.key)?.action).toBe('desk');expect(bound.layout.pieces.some(p=>p.sprite==='stool-se')).toBe(true)
  Object.assign(f.layout.seats[f.actor.key]!,{cluster:'generated-room/secretary-0'});const held=bindActions(f.layout,f.model);expect(held.bindings.size).toBe(0);expect(held.layout).toBe(f.layout);f.map.dispose()
})
it('uses terminal one-shot episodes and requires a new explicit work intent after visibility loss',async()=>{
  const f=mapFixture(true),terminal=terminalFrames(f);try { f.actor.key='generated-terminal';f.layout.seats[f.actor.key]=f.layout.seats['generated-tuft']!;delete f.layout.seats['generated-tuft'];f.update();await f.drain();f.paints.turn();f.paints.turn();await vi.waitFor(()=>expect(pageActionPacks.resident('tuft')).not.toBeNull());await f.drain()
  expect(f.map.actions.snapshot().actors[f.actor.key]?.sourceIndex).toBe(60)
  f.actions.turn(10000);await f.drain();expect(terminal.at(-1)).toMatchObject({sourceIndex:143,terminal:true});expect(f.map.actions.settled(f.actor.key,terminal.at(-1)!.episodeToken)).toBe(true);expect(f.actions.pending.size).toBe(0)
  f.map.setMotionActive(false);f.map.setMotionActive(true);await f.drain();expect(f.map.actions.snapshot().actors[f.actor.key]).toBeUndefined()
  f.actor.work[0]!.updatedAt='renewed-fixture-intent';f.update();await vi.waitFor(()=>expect(pageActionPacks.resident('tuft')).not.toBeNull());await f.drain();expect(f.map.actions.snapshot().actors[f.actor.key]?.sourceIndex).toBe(60)
  f.map.setMotionActive(false);f.map.setMotionActive(true);await f.drain();expect(f.map.actions.snapshot().actors[f.actor.key]).toBeUndefined()
  } finally { f.map.dispose() }
})
it('keeps a completed production episode through row reorder and renews only on an explicit tuple revision',async()=>{
  const f=mapFixture(true),terminal=terminalFrames(f);try { f.actor.key='generated-canonical-rows';f.layout.seats[f.actor.key]=f.layout.seats['generated-tuft']!;delete f.layout.seats['generated-tuft'];f.actor.work.push({...f.actor.work[0]!,id:'generated-second-work'})
  f.update();await f.drain();f.paints.turn();f.paints.turn();await vi.waitFor(()=>expect(pageActionPacks.resident('tuft')).not.toBeNull());await f.drain();f.actions.turn(10000);await f.drain()
  const before=terminal.at(-1)!;expect(before).toMatchObject({sourceIndex:143,terminal:true});expect(f.map.actions.settled(f.actor.key,before.episodeToken)).toBe(true)
  const loads=f.load.mock.calls.length;f.actor.work.reverse();f.update();await f.drain();expect(f.load).toHaveBeenCalledTimes(loads);expect(f.map.actions.settled(f.actor.key,before.episodeToken)).toBe(true);expect(f.map.actions.snapshot().actors[f.actor.key]).toBeUndefined()
  f.actor.work[0]!.updatedAt='explicit-new-revision';f.update();await vi.waitFor(()=>expect(pageActionPacks.resident('tuft')).not.toBeNull());f.actions.turn();await f.drain();expect(f.map.actions.snapshot().actors[f.actor.key]?.episodeToken).not.toBe(before.episodeToken);expect(f.map.actions.snapshot().actors[f.actor.key]?.sourceIndex).toBe(60)
  } finally { f.map.dispose() }
})
it.each(['actor','rows','tuple'] as const)('keeps the own still without demand above the %s input bound',async(bound)=>{
  const f=mapFixture();try {
  if(bound==='actor'){f.actor.key='x'.repeat(2049);f.layout.seats[f.actor.key]=f.layout.seats['generated-tuft']!;delete f.layout.seats['generated-tuft']}
  if(bound==='rows'){
    f.actor.work=Array.from({length:4097},(_,i)=>({...f.actor.work[0]!,id:i.toString(36),detail:'waiting_check',runStanding:null,updatedAt:''}))
    expect(moleGroup(f.actor.work)).toBe('handoff');expect(workIntent(f.actor.work.slice(1))).not.toBeNull();expect(workIntent(f.actor.work)).toBeNull()
  }
  if(bound==='tuple'){
    const row=f.actor.work[0]!;row.updatedAt='x'.repeat(65537-row.id.length-row.detail.length-(row.runStanding?.length??0))
    expect(workIntent([{...row,updatedAt:row.updatedAt.slice(1)}])).not.toBeNull();expect(workIntent(f.actor.work)).toBeNull()
  }
  f.update();await f.drain();f.paints.turn();f.paints.turn();await f.drain();expect(f.load).not.toHaveBeenCalled();expect(f.map.actions.evidence(f.actor.key)).toBeNull()
  } finally { f.map.dispose() }
})
it('keeps untracked production identities still after page capacity and preserves tracked admission on map replacement',async()=>{
  const f=mapFixture(),used=(f.map.actions as unknown as {used:{canPlay:(key:string,token:string)=>boolean;snapshot:()=>{count:number}}}).used
  try {
  for(let i=0;i<4096&&used.snapshot().count<4096;i++)used.canPlay('generated-capacity-'+i,'a'.repeat(64))
  expect(used.snapshot().count).toBe(4096)
  f.actor.key='generated-untracked-overflow';f.layout.seats[f.actor.key]=f.layout.seats['generated-tuft']!;delete f.layout.seats['generated-tuft'];f.update();await f.drain();f.paints.turn();f.paints.turn();await f.drain();expect(f.load).not.toHaveBeenCalled();expect(f.map.actions.snapshot().intentLedger).toMatchObject({count:4096,saturated:true})
  } finally { f.map.dispose() }
  const next=mapFixture();try { next.actor.key='generated-capacity-0';next.layout.seats[next.actor.key]=next.layout.seats['generated-tuft']!;delete next.layout.seats['generated-tuft'];next.update();await next.drain();next.paints.turn();next.paints.turn();await next.drain();expect(next.load).toHaveBeenCalledTimes(1);expect(next.map.actions.snapshot().intentLedger.count).toBe(4096) } finally { next.map.dispose() }
})
