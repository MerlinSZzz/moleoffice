// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { afterEach, expect, it, vi } from 'vitest'
import { mapFixture } from './tuft-action-map-fixture.ts'
import { pageActionPacks } from '../src/action-runtime.ts'
import { releaseMapSurfaces } from '../src/map-view.ts'
import { atDesk } from '../src/desk-things.ts'
import { flush } from './tuft-action-fixture.ts'
import { workRow } from './fixtures.ts'
afterEach(async()=>{pageActionPacks.setNeeds([]);await flush();releaseMapSurfaces();vi.restoreAllMocks();vi.useRealTimers();vi.unstubAllGlobals()})

// A mole whose foot is beside its desk, as in a room of 9 to 12 or 14 or more, works behind
// that desk: it is drawn at atDesk(seat), inside the desk, facing the room as every mole at
// its desk does. The fixture's desk piece is taken away, so the desk action does not bind the
// mole; a mole it binds stands at its working desk (desk-action-at-foot.test.ts).
it.each([[false,false],[true,false],[false,true],[true,true]] as const)(
  'draws a mole whose foot is beside its desk behind the desk, unturned, in still=%s, recoloured=%s', async(still,recoloured)=>{
    const f=mapFixture(); f.options.still=still; f.actor.standing.recipe=recoloured?1:0
    f.actor.work=[workRow('generated-work',{agent:f.actor.agent.id,detail:'executing',executing:true,runStanding:'working'})]
    const seat=f.layout.seats[f.actor.key]!; seat.foot={x:seat.desk.x+seat.desk.width+76,y:500}; f.layout.pieces=[]; f.update();await f.drain()
    expect((f.map as any).actionBindings.size).toBe(0)
    expect(seat.foot.x).toBeGreaterThan(seat.desk.x+seat.desk.width)
    const actor=((f.map as any).actors([f.actor.key]) as {key:string;point:{x:number;y:number};walk?:unknown}[]).find(a=>a.key===f.actor.key)
    expect(actor?.walk).toBeUndefined()
    expect(actor?.point).toEqual(atDesk(seat))
    vi.spyOn(f.map.actions,'draw').mockReturnValue(false)
    const scale=vi.fn(), drawImage=vi.fn(), ctx={save:vi.fn(),restore:vi.fn(),translate:vi.fn(),scale,drawImage,beginPath:vi.fn(),moveTo:vi.fn(),lineTo:vi.fn(),closePath:vi.fn(),fill:vi.fn()} as unknown as CanvasRenderingContext2D
    ;(f.map as any).actor(ctx,f.actor.key,actor!.point)
    expect(drawImage).toHaveBeenCalled()
    expect(scale).not.toHaveBeenCalledWith(-1,1)
    f.map.dispose()
  },30000,
)
