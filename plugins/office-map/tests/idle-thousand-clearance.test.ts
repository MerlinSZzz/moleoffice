// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { expect, it } from 'vitest'
import { mapOffice } from '../src/model.ts'
import { OwnershipGeometryCache } from '../src/ownership-layout.ts'
import { standingScale } from '../src/appearance.ts'
import type { RosterView } from '../src/contracts.ts'
import { sprites as bundled } from '../src/assets.ts'
import { agent, people } from './fixtures.ts'

type Rect = { x: number; y: number; width: number; height: number }
const overlaps = (a: Rect, b: Rect) => a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y
const sprites: Record<string, any> = bundled
function body(look: string, scale: number, foot: { x: number; y: number }): Rect {
  let l = Infinity, r = -Infinity, t = Infinity, b = -Infinity
  for (const name of [`stand-${look}`, `walk-${look}-A`, `walk-${look}-pass`, `walk-${look}-B`, `wave-${look}`, `cheer-${look}`, `carry-${look}`]) {
    const f = sprites[name]; if (!f) throw Error(`Missing body frame ${name}`)
    const [x,y] = f.trim, [, , w,h] = f.rect, [ax,ay] = f.anchor
    l = Math.min(l,(x-ax)*scale,(ax-x-w)*scale); r = Math.max(r,(x-ax+w)*scale,(ax-x)*scale)
    t = Math.min(t,(y-ay)*scale); b = Math.max(b,(y-ay+h)*scale)
  }
  return { x:foot.x+l-1e-6, y:foot.y+t-1e-6, width:r-l+2e-6, height:b-t+2e-6 }
}
function art(p: any): Rect {
  const f = sprites[p.sprite]; if (!f) throw Error(`Missing artwork ${p.sprite}`)
  const [x,y] = f.trim, [, , w,h] = f.rect, scale = p.scale ?? 1
  return { x:p.x+x*scale, y:p.y+y*scale, width:w*scale, height:h*scale }
}
it('keeps every desktop start clear in a 1000-agent invented roster', () => {
  const agents = [agent('invented-secretary', { role:'secretary' }), ...Array.from({length:999}, (_,i) => agent(`invented-worker-${String(i).padStart(4,'0')}`, { startedBy:{kind:'agent', id:'invented-secretary'} }))]
  const model = mapOffice({ ...people, view:'roster', agents } as RosterView, null)
  const work = new OwnershipGeometryCache().build({ rooms:model.rooms, roster:model.layoutRoster })
  let next = work.next(); while (!next.done) next = work.next()
  const layout = next.value
  const entries = model.occupants.map(o => { const seat = layout.seats[o.key]!, scale = o.agent.scale === null ? .82 : standingScale(o.agent.scale.value); return { o, seat, box:body(o.standing.look, scale, seat.foot) } })
  expect(entries).toHaveLength(1000)
  const desks = layout.obstacles.filter(o => o.kind === 'desk'), pieces = layout.pieces.filter(p => ['worker-desk','laptop-back','coffee-mug'].includes(p.sprite)).map(p => ({sprite:p.sprite, box:art(p)}))
  let count = 0; const examples: string[] = []
  const failed = (s: string) => { count++; if (examples.length < 20) examples.push(s) }
  for (const e of entries.filter(e => (e.seat as any).activity === 'desk')) {
    for (const d of desks) if (overlaps(e.box,d)) failed(`${e.o.agent.id} desk ${d.station}`)
    for (const p of pieces) if (overlaps(e.box,p.box)) failed(`${e.o.agent.id} ${p.sprite}`)
    for (const other of entries) if (e.o.key !== other.o.key && overlaps(e.box,other.box)) failed(`${e.o.agent.id} body ${other.o.agent.id}`)
  }
  expect(count, `First collisions: ${examples.join('; ')}`).toBe(0)
}, 30000)
