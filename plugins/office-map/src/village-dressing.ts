// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import catalog from '../assets/village-catalog.json'
import { piece, stableHash, type Piece } from './village.ts'
import type { VillageCell, VillageLayout, VillagePlot } from './village-layout.ts'
import type { Point } from './geometry.ts'
import type { Rect } from './viewport.ts'

export const WALK_WIDTH = 52
export interface Walk { points: Point[]; width: number }
const overlap = (a: Rect, b: Rect, gap = 0) => a.x < b.x + b.width + gap && a.x + a.width > b.x - gap && a.y < b.y + b.height + gap && a.y + a.height > b.y - gap
const sprites = catalog.sprites as Record<string, { size: number[]; trim: number[]; rect: number[]; anchor: number[] }>
export function visiblePiece(p: Piece): Rect {
  const m = sprites[p.sprite]!, scale = p.scale ?? 1
  return { x: p.x + m.trim[0]! * scale, y: p.y + m.trim[1]! * scale, width: m.rect[2]! * scale, height: m.rect[3]! * scale }
}

/** Option A's authored road centres. Houses, doors and the village cell stay native. */
export function villageWalks(plots: readonly VillagePlot[], v: VillageCell): Walk[] {
  const result: Walk[] = [], line = (points: number[][]) => result.push({ width: WALK_WIDTH, points: points.map(([x, y]) => ({ x: v.x + x!, y: v.y + y! })) })
  line([[91, 1651], [2457, 1651]])
  for (const x of [91, 845, 1625, 2457]) line([[x, 1080], [x, 1651]])
  line([[130, 676], [2418, 676], [2418, 1080], [130, 1080], [130, 676]])
  for (const x of [845, 1450, 2050]) line([[x, 676], [x, 1080]])
  for (const h of plots) for (const d of h.doors) line([[d.x - v.x, d.y - v.y], [d.x - v.x, h.slot < 3 ? 676 : 1651]])
  return result
}

/** Rectangles and round joints share one width. The lawn has no earth under props. */
export function walkRings(walk: Walk): Point[][] {
  const rings: Point[][] = [], r = walk.width / 2
  for (let i = 1; i < walk.points.length; i++) {
    const a = walk.points[i - 1]!, b = walk.points[i]!, length = Math.hypot(b.x - a.x, b.y - a.y)
    if (!length) continue
    const nx = -(b.y - a.y) / length * r, ny = (b.x - a.x) / length * r
    rings.push([{ x: a.x + nx, y: a.y + ny }, { x: b.x + nx, y: b.y + ny }, { x: b.x - nx, y: b.y - ny }, { x: a.x - nx, y: a.y - ny }])
  }
  for (const p of walk.points) rings.push(Array.from({ length: 12 }, (_, i) => ({ x: p.x + Math.cos(i * Math.PI / 6) * r, y: p.y + Math.sin(i * Math.PI / 6) * r })))
  return rings
}

/** The option-A recipes from round9f's render-options.py, checked against visible
 * atlas bounds. Seeded jitter changes only loose planting, never allocation. */
export function dressVillage(layout: VillageLayout, v: VillageCell, original: Piece[]): Piece[] {
  const plots = layout.plots.filter(p => p.village === v.id), homes = plots.filter(p => p.built)
  const walks = villageWalks(plots, v)
  for (const path of layout.paths) if (path.id.startsWith('east-') || path.id.startsWith('south-')) {
    if (!overlap(path, v)) continue
    walks.push({ width: WALK_WIDTH, points: path.width > path.height ? [{ x: path.x, y: path.y + path.height / 2 }, { x: path.x + path.width, y: path.y + path.height / 2 }] : [{ x: path.x + path.width / 2, y: path.y }, { x: path.x + path.width / 2, y: path.y + path.height }] })
  }
  const moved = original.map(p => {
    if (p.group !== null || p.y - v.y < 650 || p.y - v.y >= 1066) return p
    const q = { ...p }, y: Record<string, number> = { B42: 860, B52: 870, A65: 766, B38: 766, A58: 850, B59: 784, B40: 790, lantern: 990 }
    const x: Record<string, number> = { B52: 1915, B59: 2220, B40: 2330 }
    if (y[q.sprite] !== undefined) q.y = v.y + y[q.sprite]!
    if (x[q.sprite] !== undefined) q.x = v.x + x[q.sprite]!
    if (q.sprite === 'lantern' && [800, 2040].includes(q.x - v.x)) q.x += q.x - v.x === 800 ? -20 : 52
    q.depth = q.sprite === 'tea-set' ? v.y + 870.1 : q.y + sprites[q.sprite]!.anchor[1]!
    return q
  })
  const occupied = moved.filter(p => !['floor', 'front', 'back'].includes(p.layer) && !/^(worker-|desk-)/.test(p.sprite)).map(visiblePiece)
  const doors = homes.flatMap(h => h.doors.map(p => ({ x: p.x - 45, y: p.y - 8, width: 90, height: 40 })))
  const roadBoxes = walks.flatMap(w => w.points.slice(1).map((b, i) => {
    const a = w.points[i]!, r = w.width / 2 + 6
    return { x: Math.min(a.x, b.x) - r, y: Math.min(a.y, b.y) - r, width: Math.abs(a.x - b.x) + r * 2, height: Math.abs(a.y - b.y) + r * 2 }
  }))
  const added: Piece[] = []
  const add = (sprite: string, x: number, y: number, scale = 1, spacing = 5) => {
    const p = piece(sprite, v.x + Math.round(x), v.y + Math.round(y), null, 'floor')
    p.scale = scale; p.width *= scale; p.height *= scale; p.depth = p.y + sprites[sprite]!.anchor[1]! * scale; p.decoration = true
    const b = visiblePiece(p)
    if (b.x < v.x + 8 || b.y < v.y + 8 || b.x + b.width > v.x + v.width - 8 || b.y + b.height > v.y + v.height - 8 ||
      overlap(b, { x: v.x + 104, y: v.y + 766, width: 2340, height: 208 }, 8) || homes.some(h => overlap(b, h, 8)) ||
      doors.some(d => overlap(b, d, 4)) || roadBoxes.some(r => overlap(b, r)) || occupied.some(o => overlap(b, o, spacing))) return
    added.push(p); occupied.push(b)
  }
  for (const [k, x, y] of [['B54',900,870],['A65',900,740],['lantern',1390,730],['B54',1480,916],['A46',1510,766],['B54',1910,870],['lantern',1980,730],['A65',2334,780],['lantern',2360,930],['lantern',900,1550],['A65',944,1530],['lantern',1685,1550],['A46',1730,1510],['B54',1468,1565]] as const) add(k,x,y)
  let seed = stableHash(`dressing-${v.id}`)
  const jitter = (radius: number) => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return Math.round((seed / 2 ** 32 * 2 - 1) * radius) }
  for (let x = 230; x < 2270; x += 155) add('pine-tree', x + jitter(15), 8)
  for (const x of [14, 2370]) for (const y of [268,454,760,910]) add('pine-tree',x,y+jitter(10))
  for (const x of [792,1578,1708,2250]) for (const y of [198,388,1090,1300]) add('B56',x,y+jitter(12))
  ;[[22,1700],[380,1712],[760,1695],[1140,1708],[1550,1716],[1925,1694],[2320,1708]].forEach(([px,py], i) => {
    const x = px! + jitter(12), y = py! + jitter(3)
    if ([0,2,5].includes(i)) { add(i === 2 ? 'tree-assembled' : 'pine-tree',x,y,i === 2 ? .38 : .60); add('berry-bush',x+85,y+10); add('B57',x+108,y-20) }
    else if ([1,4,6].includes(i)) { add('berry-bush',x,y); add('B57',x+84,y+9); add('daisies',x+106,y-20) }
    else { add('tree-stump',x,y+8); add('B57',x+70,y+20); add('ground-fern',x+118,y+4) }
  })
  walks.forEach((w, li) => w.points.slice(1).forEach((b, i) => {
    const a = w.points[i]!, dx = b.x-a.x, dy = b.y-a.y, length = Math.hypot(dx,dy), n = Math.max(1,Math.floor(length/115))
    if (length < 20) return
    for (let j = 0; j < n; j++) for (const side of [-1,1]) {
      const sprite = ['B57','ground-fern','daisies'][(j+li)%3]!, m = sprites[sprite]!, offset = 35 + Math.max(...m.size)/2, t = (j+.5)/n
      add(sprite,a.x-v.x+dx*t-dy/length*side*offset-m.size[0]!/2,a.y-v.y+dy*t+dx/length*side*offset-m.size[1]!/2,1,3)
    }
  }))
  for (const y of [580,1110]) for (let x = 175; x < 2330; x += 118) { add('berry-bush',x,y); add('B57',x+84,y+27) }
  for (const [k,x,y] of [['B54',880,878],['A65',901,766],['B54',1480,916],['A46',1510,766],['B54',1940,814],['A65',2334,780],['lantern',792,740],['lantern',1394,928],['lantern',1986,934],['lantern',2360,962],['log-seat-a',1320,1740],['tree-stump',2240,1730]] as const) add(k,x,y)
  for (const [x,y] of [[180,770],[720,934],[920,940],[1080,934],[1390,752],[1750,738],[1942,920],[2085,950],[2300,724]]) {
    add('berry-bush',x!,y!); for (const [dx,dy] of [[-8,76],[83,26],[66,78]]) add('B57',x!+dx!,y!+dy!)
  }
  for (const x of [160,905,1685,2330]) { add('lantern',x,1568); add(x < 1000 ? 'A65' : 'A46',x+34,1530); add('berry-bush',x+80,1584) }
  for (const x of [180,740,920,1100,1320,1490,2010,2140,2320]) add('B57',x,724)
  for (const x of [180,740,920,1070,1230,1390,2010,2160,2310]) add('B57',x,1004)
  const nature = new Set(['tree-assembled','pine-tree','berry-bush','ground-fern','daisies','B57','B56','tree-stump','log-seat-a'])
  const kept = moved.map(p=>nature.has(p.sprite) ? {...p,cached:true} : p)
  return kept.concat(added)
}
