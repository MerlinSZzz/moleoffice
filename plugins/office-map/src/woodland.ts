// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import type { Layout, Point } from './geometry.ts'
import { piece, stableHash, houseCatalog, type Piece } from './village.ts'
import type { VillageOverview } from './village-layout.ts'
import type { Rect } from './viewport.ts'
import { WALK_WIDTH, type Walk } from './village-dressing.ts'

export interface Woodland { pieces: Piece[]; walks: Walk[] }
const overlap = (a: Rect,b: Rect) => a.x < b.x+b.width && a.x+a.width > b.x && a.y < b.y+b.height && a.y+a.height > b.y
/** Far-only symbols, from the approved houses and trees. These never enter the
 * allocation or route geometry. Each occupied bucket is one woodland clearing. */
export function woodlandPlan(layout: Layout, overview: VillageOverview, zoom: number, labels?: Rect[]): Woodland {
  const work = woodlandSteps(layout,overview,zoom,labels)
  for (;;) { const next = work.next(); if(next.done) return next.value }
}
export function* woodlandSteps(layout: Layout, overview: VillageOverview, zoom: number, labels?: Rect[]): Generator<void,Woodland> {
  const pieces: Piece[] = [], walks: Walk[] = [], avoid: Rect[] = []
  const nodes: { x:number;y:number;at:(x:number,y:number)=>Point }[] = []
  const pathWidth=Math.max(WALK_WIDTH,2/zoom)
  const stride=Math.max(1,overview.side/2)
  const bounds = layout.bounds
  const villages = new Map(layout.villages!.map(v=>[v.id,v])), byVillage = new Map<number,Layout['houses']>()
  for (const home of layout.houses) { const homes=byVillage.get(home.village!)??[];homes.push(home);byVillage.set(home.village!,homes);yield }
  for (const [index,block] of overview.blocks.entries()) {
    const left = Math.max(block.x,bounds.x), top = Math.max(block.y,bounds.y)
    const width = Math.min(block.x+block.width,bounds.x+bounds.width)-left, height = Math.min(block.y+block.height,bounds.y+bounds.height)-top
    const factor = Math.min(Math.min(width/2548,height/1794)*(overview.side>1 ? .675 : .60),Math.max(1,height-40/zoom)/1794)
    const origin = { x: left+(width-2548*factor)/2, y: top+Math.max(0,(height-40/zoom-1794*factor)/2) }
    const point = (x: number,y: number) => ({ x: origin.x+x*factor,y: origin.y+y*factor })
    nodes.push({ x:block.x,y:block.y,at:point })
    // Reserve the actual compact chip, not a band spanning the whole district.
    const labelWidth=Math.min(130/zoom,width-14/zoom)
    const label=labels?.[index] ?? {x:left+(width-labelWidth)/2,y:top+height-38/zoom,width:labelWidth,height:32/zoom}
    avoid.push(label)
    const source = block.villages.map(id => villages.get(id)!).sort((a,b) => b.total-a.total || a.id-b.id)[0]!
    const homes = byVillage.get(source.id) ?? []
    const add = (sprite:string,x:number,y:number) => {
      const p = piece(sprite,origin.x+x*factor,origin.y+y*factor,null,'floor')
      p.scale = factor; p.width *= factor; p.height *= factor; p.depth = p.y+p.height; p.decoration = true; pieces.push(p)
      return p
    }
    for (const home of homes) {
      const x = home.x-source.x,y = home.y-source.y
      const frame = { x:origin.x+x*factor,y:origin.y+y*factor,width:home.width*factor,height:home.height*factor }
      avoid.push({ x:frame.x-20*factor,y:frame.y-20*factor,width:frame.width+40*factor,height:frame.height+40*factor })
      for (const layer of houseCatalog[home.style]!.layers) add(layer.sprite,x,y)
      yield
      for (const door of home.doors) walks.push({ width:pathWidth,points:[point(door.x-source.x,door.y-source.y),point(door.x-source.x,home.y-source.y < 650 ? 897 : 1651)] })
    }
    walks.push({ width:pathWidth,points:[point(130,897),point(2418,897)] },
      { width:pathWidth,points:[point(845,50),point(845,1651)] },
      { width:pathWidth,points:[point(468,1651),point(2050,1651)] })
    avoid.push({ x:origin.x+104*factor,y:origin.y+766*factor,width:2340*factor,height:208*factor })
    add('B64',1118,766)
    for (const x of [400,680,960,1510,1810,2220]) for (const y of [708,1000]) avoid.push(add('berry-bush',x,y))
    yield
  }
  // The art study's connected neighbour tree, entering each clearing at its
  // authored ports. Curves wind through woodland, never across the house bands.
  const stepX=2548*overview.side,stepY=1794*overview.side
  const grid=new Map(nodes.map(n=>[`${n.x},${n.y}`,n])),ordered=[...nodes].sort((a,b)=>a.y-b.y||a.x-b.x)
  const visited=new Set<typeof nodes[number]>(),queue=ordered.length?[ordered[0]!]:[]
  if(queue[0])visited.add(queue[0])
  for(let i=0;i<queue.length;i++) {
    const a=queue[i]!
    for(const [dc,dr]of [[1,0],[0,1],[-1,0],[0,-1]] as const) {
      const b=grid.get(`${a.x+dc*stepX},${a.y+dr*stepY}`)
      if(!b||visited.has(b))continue
      visited.add(b);queue.push(b)
      const sign=stableHash(`${a.x},${a.y}`)%2?1:-1
      const p=a.at(dc?(dc>0?2418:130):845,dr?(dr>0?1651:50):897)
      const q=b.at(dc?(dc>0?130:2418):845,dr?(dr>0?50:1651):897)
      const c=dc?{x:p.x+dc*160*stride,y:p.y+sign*520*stride}:{x:p.x-sign*550*stride,y:p.y+dr*330*stride}
      const d=dc?{x:q.x-dc*160*stride,y:q.y-sign*520*stride}:{x:q.x+sign*550*stride,y:q.y-dr*330*stride}
      walks.push({width:pathWidth,points:woodlandCurve(p,c,d,q)});yield
    }
  }
  if(visited.size!==nodes.length)throw Error('The woodland clearing graph is disconnected')
  for (const walk of walks) for(let i=1;i<walk.points.length;i++) {
    const a=walk.points[i-1]!,b=walk.points[i]!, r=walk.width/2+16*stride
    avoid.push({ x:Math.min(a.x,b.x)-r,y:Math.min(a.y,b.y)-r,width:Math.abs(b.x-a.x)+2*r,height:Math.abs(b.y-a.y)+2*r });yield
  }
  const factor=(overview.side>1 ? .675 : .60)*overview.side,dx=(overview.side>1 ? 180 : 125)*stride,dy=(overview.side>1 ? 120 : 90)*stride
  for(let y=bounds.y+20;y<bounds.y+bounds.height-360*stride;y+=dy) for(let x=bounds.x+20;x<bounds.x+bounds.width-360*stride;x+=dx) {
    yield
    const hash=stableHash(`${x},${y}`),wave=woodlandWave(x/stride,y/stride)
    if(wave < -.9 || hash%100 > 88) continue
    const p=piece(hash%100<68?'tree-assembled':'pine-tree',x+(hash%101-50)*stride,y+((hash>>>8)%91-45)*stride,null,'floor')
    p.scale=factor;p.width*=factor;p.height*=factor;p.depth=p.y+p.height;p.decoration=true
    if(p.x<bounds.x || p.y<bounds.y || p.x+p.width>bounds.x+bounds.width || p.y+p.height>bounds.y+bounds.height || avoid.some(a=>overlap(a,p))) continue
    pieces.push(p)
  }
  return { pieces,walks }
}

/** Round 9f's three overlapping waves leave broad, irregular quiet meadows. */
export const woodlandWave=(x:number,y:number):number=>Math.sin(x/610)+Math.cos(y/490)+Math.sin((x+y)/950)
export function woodlandCurve(a:Point,b:Point,c:Point,d:Point):Point[] {
  return Array.from({length:17},(_,i)=>{const t=i/16,u=1-t;return{x:u*u*u*a.x+3*u*u*t*b.x+3*u*t*t*c.x+t*t*t*d.x,y:u*u*u*a.y+3*u*u*t*b.y+3*u*t*t*c.y+t*t*t*d.y}})
}
