// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { afterEach, expect, it, vi } from 'vitest'
import { createHash } from 'node:crypto'
import catalog from '../assets/village-catalog.json'
import snapshots from './fixtures/village-home-seat-hashes.json'
import clearings from './fixtures/woodland-clearing-hashes.json'
import { layoutVillages, villagePieces, villageOverview } from '../src/village-layout.ts'
import { villageWalks, visiblePiece, walkRings } from '../src/village-dressing.ts'
import { villageRoster } from './village-layout-fixtures.ts'
import { GeometryEngine } from '../src/worker-protocol.ts'
import { woodlandPlan } from '../src/woodland.ts'
import { VisibleIndex } from '../src/render-plan.ts'
import { SceneryTiles, SCENERY_TILE_BYTES } from '../src/scenery-tiles.ts'
import { packedRings } from '../src/packed-road.ts'
import type { ArtPack } from '../src/pack.ts'

const overlap = (a: { x:number;y:number;width:number;height:number },b: { x:number;y:number;width:number;height:number }) => a.x < b.x+b.width && a.x+a.width > b.x && a.y < b.y+b.height && a.y+a.height > b.y
const build = (count:number) => {
  const reply = new GeometryEngine(true).receive({ id:1,kind:'layout',input:{ rooms:[],roster:villageRoster(count) } })
  if(reply?.kind !== 'layout') throw Error('No layout')
  return reply.layout
}
afterEach(() => vi.unstubAllGlobals())

it('keeps every home and seat identical to main at 100 and 5000 people', () => {
  for(const row of snapshots.rows) {
    const layout=layoutVillages(villageRoster(row.count))
    expect(createHash('sha256').update(JSON.stringify({ homes:layout.homes,seats:layout.seats })).digest('hex')).toBe(row.homesAndSeatsSha256)
  }
})

it('uses 52-pixel walks and a grass meeting square without earth beneath its furniture', () => {
  const layout=layoutVillages(villageRoster(16)),v=layout.villages[0]!,walks=villageWalks(layout.plots,v)
  expect(walks.every(w=>w.width===52)).toBe(true)
  for(const home of layout.homes) for(const door of home.doors) expect(walks.some(w=>w.points.some(p=>p.x===door.x && p.y===door.y))).toBe(true)
  const page=build(16)
  expect(page.road.halfWidth).toBe(26)
  // Independently decode drawing rings: no broad plaza rectangle is sent.
  const polygons=[...packedRings(page.roadDrawing!)].map(r=>Array.from(r).slice(1))
  expect(polygons.every(p=>Math.max(...p.filter((_,i)=>i%2===1))-Math.min(...p.filter((_,i)=>i%2===1)) < 416 || Math.max(...p.filter((_,i)=>i%2===0))-Math.min(...p.filter((_,i)=>i%2===0)) <= 52)).toBe(true)
  const centre={ x:520,y:860 }
  const contains=(poly:number[])=>{let yes=false;for(let i=0,j=poly.length-2;i<poly.length;j=i,i+=2){const x=poly[i]!,y=poly[i+1]!,px=poly[j]!,py=poly[j+1]!;if((y>centre.y)!==(py>centre.y) && centre.x<(px-x)*(centre.y-y)/(py-y)+x)yes=!yes}return yes}
  expect(polygons.some(contains)).toBe(false)
  expect(page.pieces.find(p=>p.sprite==='B42')!.y).toBe(860)
})

it('places mixed approved planting in groups, uniformly scaled and clear of houses and walks', () => {
  const layout=layoutVillages(villageRoster(100))
  for(const v of layout.villages) {
    const added=villagePieces(layout,v.id).filter(p=>p.decoration),homes=layout.homes.filter(h=>h.village===v.id),walks=villageWalks(layout.plots.filter(p=>p.village===v.id),v)
    expect(added.length).toBeGreaterThan(100)
    expect(villagePieces(layout,v.id).filter(p=>['tree-assembled','pine-tree','berry-bush'].includes(p.sprite)).every(p=>p.decoration || p.cached)).toBe(true)
    expect(new Set(added.map(p=>p.sprite)).size).toBeGreaterThan(6)
    expect(added.some(p=>(p.scale??1)<1)).toBe(true)
    for(const p of added) {
      const m=(catalog.sprites as Record<string,{size:number[]}>)[p.sprite]!,b=visiblePiece(p)
      expect(p.width/m.size[0]!).toBeCloseTo(p.height/m.size[1]!,10)
      expect(p.layer).toBe('floor')
      expect(homes.some(h=>overlap(b,h))).toBe(false)
      for(const walk of walks) for(let i=1;i<walk.points.length;i++) {
        const a=walk.points[i-1]!,c=walk.points[i]!,r=walk.width/2
        expect(overlap(b,{x:Math.min(a.x,c.x)-r,y:Math.min(a.y,c.y)-r,width:Math.abs(a.x-c.x)+2*r,height:Math.abs(a.y-c.y)+2*r})).toBe(false)
      }
      expect(b.x).toBeGreaterThanOrEqual(v.x+8);expect(b.x+b.width).toBeLessThanOrEqual(v.x+v.width-8)
      expect(b.y).toBeGreaterThanOrEqual(v.y+8);expect(b.y+b.height).toBeLessThanOrEqual(v.y+v.height-8)
    }
    const south=added.filter(p=>p.y>v.y+1690).sort((a,b)=>a.x-b.x)
    expect(south.some((p,i)=>i>0 && p.x-(south[i-1]!.x+south[i-1]!.width)>100)).toBe(true)
  }
})

it('projects woodland houses into clearings and joins them with narrow paths at both far levels', () => {
  const layout=build(1000)
  for(const zoom of [.07,.0377,.015]) {
    const overview=villageOverview({villages:layout.villages!},zoom),woodland=woodlandPlan(layout,overview,zoom)
    expect(overview.level).not.toBe('homes')
    expect(villageOverview({villages:layout.villages!},.05).side).toBe(2)
    expect(overview.blocks.reduce((n,b)=>n+b.total,0)).toBe(1000)
    expect(woodland.pieces.filter(p=>p.sprite==='tree-assembled'||p.sprite==='pine-tree').length).toBeGreaterThan(30)
    expect(woodland.pieces.some(p=>p.sprite.endsWith('-floor'))).toBe(true)
    expect(woodland.walks.length).toBeGreaterThan(overview.blocks.length-1)
    expect(woodland.walks.every(w=>w.width===Math.max(52,2/zoom))).toBe(true)
    const trees=woodland.pieces.filter(p=>['tree-assembled','pine-tree'].includes(p.sprite))
    const houses=woodland.pieces.filter(p=>p.sprite.endsWith('-floor'))
    for(const h of houses) { const block=overview.blocks.find(b=>h.x>=b.x && h.x<b.x+b.width && h.y>=b.y && h.y<b.y+b.height)!; const bottom=Math.min(block.y+block.height,layout.bounds.y+layout.bounds.height); expect(h.y+h.height).toBeLessThanOrEqual(bottom-38/zoom) }
    for(const t of trees) { expect(houses.some(h=>overlap(t,h))).toBe(false); expect(t.width/t.height).toBeCloseTo(t.sprite==='pine-tree'?106/143:208/240,10) }
    expect(walkRings(woodland.walks[0]!).length).toBeGreaterThan(0)
  }
})

it('keeps every reviewed clearing position and population fixed while the forest changes', () => {
  const layouts=new Map<number,ReturnType<typeof build>>()
  for(const row of clearings.rows) {
    if(!layouts.has(row.count))layouts.set(row.count,build(row.count))
    const layout=layouts.get(row.count)!,overview=villageOverview({villages:layout.villages!},row.zoom),plan=woodlandPlan(layout,overview,row.zoom)
    const data={blocks:overview.blocks,houses:plan.pieces.filter(p=>/-(floor|back|front)$/.test(p.sprite))}
    expect(createHash('sha256').update(JSON.stringify(data)).digest('hex')).toBe(row.sha256)
  }
})

it('winds a stable connected path tree through irregular groves and open meadows', () => {
  const layout=build(1000),zoom=.05,overview=villageOverview({villages:layout.villages!},zoom),plan=woodlandPlan(layout,overview,zoom)
  const curves=plan.walks.filter(w=>w.points.length>2)
  expect(curves).toHaveLength(overview.blocks.length-1)
  for(const curve of curves) {
    const a=curve.points[0]!,b=curve.points.at(-1)!
    expect(curve.points.some(p=>Math.abs((p.x-a.x)*(b.y-a.y)-(p.y-a.y)*(b.x-a.x))>100)).toBe(true)
  }
  const trees=plan.pieces.filter(p=>['tree-assembled','pine-tree'].includes(p.sprite)),stride=Math.max(1,overview.side/2)
  expect(trees.length).toBeGreaterThan(1000)
  // Groves may reach the row beside a compact chip. Reserving a full label
  // band would force empty horizontal stripes and fail this assertion.
  expect(trees.filter(t=>overview.blocks.some(b=>t.y+t.height>b.y+b.height-38/zoom && t.y<b.y+b.height-6/zoom)).length).toBeGreaterThan(100)
  for(const t of trees) {
    const x=layout.bounds.x+20+Math.round((t.x-layout.bounds.x-20)/(180*stride))*180*stride
    const y=layout.bounds.y+20+Math.round((t.y-layout.bounds.y-20)/(120*stride))*120*stride
    const wave=Math.sin(x/stride/610)+Math.cos(y/stride/490)+Math.sin((x+y)/stride/950)
    expect(wave).toBeGreaterThanOrEqual(-.9)
  }
  expect(woodlandPlan(layout,overview,zoom)).toEqual(plan)
})

it('keeps the whole clearing picture above the label at the narrow village threshold', () => {
  const layout=build(16),zoom=96/2548,overview=villageOverview({villages:layout.villages!},zoom),woodland=woodlandPlan(layout,overview,zoom)
  const houses=woodland.pieces.filter(p=>p.sprite.endsWith('-floor'))
  expect(houses).toHaveLength(6)
  for(const home of houses)expect(home.y+home.height).toBeLessThanOrEqual(1794-38/zoom)
})

it('rasterizes decoration tiles once, bounds their memory, and releases evicted and closed pixels', () => {
  const rasters:object[]=[],destinations:number[][]=[],canvases:{width:number;height:number}[]=[],atlas={}
  const context=new Proxy({ drawImage:(image:object,...args:number[])=>{if(image===atlas){rasters.push(image);destinations.push(args.slice(-2))}} },{get:(t,k)=>k in t?t[k as keyof typeof t]:()=>{}})
  vi.stubGlobal('document',{createElement:()=>{const c={width:0,height:0,getContext:()=>context};canvases.push(c);return c}})
  const p={sprite:'pine-tree',x:0,y:0,width:63.6,height:85.8,depth:85.8,group:null,layer:'floor' as const,decoration:true,scale:.6}
  const pack={images:new Map([['art',atlas]]),sources:{sprites:{'pine-tree':{atlas:'art',rect:[0,0,106,143],trim:[0,0],size:[106,143],anchor:[53,142]}}}} as unknown as ArtPack
  let groundPaints=0
  const ground=function*(){groundPaints++;yield}
  const tiles=new SceneryTiles(),drain=(x:number)=>{const work=tiles.draw(context as unknown as CanvasRenderingContext2D,[{...p,x}],{left:x,top:0,width:512,height:512},pack,512,undefined,ground);while(!work.next().done){}}
  drain(0);const count=rasters.length;expect(count).toBe(1)
  expect(destinations[0]![0]).toBeCloseTo(63.6,8);expect(destinations[0]![1]).toBeCloseTo(85.8,8)
  drain(0);expect(rasters).toHaveLength(count);expect(groundPaints).toBe(1)
  for(let i=1;i<20;i++)drain(i*512)
  expect(tiles.bytes).toBe(SCENERY_TILE_BYTES)
  expect(canvases.slice(0,-8).every(c=>c.width===1&&c.height===1)).toBe(true)
  tiles.clear();expect(tiles.bytes).toBe(0);expect(canvases.every(c=>c.width===1&&c.height===1)).toBe(true)
  const offscreen={...p,x:400},source=new VisibleIndex([{value:p,rect:p},{value:offscreen,rect:offscreen}])
  const before=rasters.length,work=tiles.draw(context as unknown as CanvasRenderingContext2D,[],{left:0,top:0,width:100,height:100},pack,512,source)
  while(!work.next().done){}
  expect(rasters.length-before).toBe(2)
  tiles.clear()
  const cancelled=tiles.draw(context as unknown as CanvasRenderingContext2D,[p],{left:0,top:0,width:100,height:100},pack)
  cancelled.next();cancelled.return(undefined)
  expect(canvases.at(-1)!.width).toBe(1);expect(tiles.bytes).toBe(0)
})
