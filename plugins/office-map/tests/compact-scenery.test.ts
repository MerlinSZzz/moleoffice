// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { createHash } from 'node:crypto'
import { expect, it } from 'vitest'
import { GeometryEngine, appendDrawing, emptyDrawing } from '../src/worker-protocol.ts'
import { drawingChunks } from '../src/drawing-layout.ts'
import { plantingPiece, SceneryIndex } from '../src/compact-scenery.ts'
import { VisibleIndex } from '../src/render-plan.ts'
import { villageRoster } from './village-layout-fixtures.ts'
import control from './fixtures/native-piece-control.json'
import type { Layout } from '../src/geometry.ts'
import { packedRings } from '../src/packed-road.ts'
import { Navigation } from '../src/navigation.ts'
import { piece, type Piece } from '../src/village.ts'
function build(count: number): Layout {
  const reply = new GeometryEngine(true).receive({ id: 1, kind: 'layout', input: { rooms: [], roster: villageRoster(count) } })
  if (reply?.kind !== 'layout') throw Error('No village layout')
  return reply.layout
}
function expanded(layout: Layout): Piece[] {
  const result: Piece[] = [], chunks = layout.planting ?? []
  let chunk = 0
  for (let at = 0; at <= layout.pieces.length; at++) {
    while (chunk < chunks.length && chunks[chunk]!.before === at) {
      const p = chunks[chunk++]!
      for (let i = 0; i < p.sprites.length; i++) result.push(plantingPiece(p, i))
    }
    if (at < layout.pieces.length) result.push(layout.pieces[at]!)
  }
  return result
}
const finish = <T>(work: Generator<unknown, T>): T => { for (;;) { const next = work.next(); if (next.done) return next.value } }
it('retains 26 bytes per added plant and preserves every native piece except the removed interior rails at 100 and 5000 people', () => {
  for (const row of control.rows) {
    const layout = build(row.count), pieces = expanded(layout), chunks = layout.planting ?? []
    expect(layout.pieces.some(p => p.decoration)).toBe(false)
    expect(chunks.reduce((n, p) => n + p.sprites.length, 0)).toBe(row.decorations)
    expect(chunks.reduce((n, p) => n + p.positions.byteLength + p.sprites.byteLength, 0)).toBe(row.decorations * 26)
    expect(chunks.every(p => p.sprites.length <= 128)).toBe(true)
    // Retain the original control hashes: put only the deliberately removed rail
    // back at its original position to prove every other piece stayed exact.
    const original = pieces.flatMap(p => p.sprite === 'A03-back' ? [p, piece('A03-partition', p.x, p.y, p.group, 'object')] : [p])
    expect(original.length).toBe(row.pieces)
    const values = original.map(p => [p.sprite,p.x,p.y,p.width,p.height,p.group,p.layer,p.depth,p.scale??1,p.decoration??false,p.cached??false])
    expect(createHash('sha256').update(JSON.stringify(values)).digest('hex')).toBe(row.sha256)
  }
})
it('keeps cell traversal, overlaps and depth ties identical while materializing only nearby planting', () => {
  const layout = build(100), pieces = expanded(layout), old = new VisibleIndex(pieces.map(value => ({ value, rect: value })), 256, true)
  const index = finish(SceneryIndex.build(layout.pieces, layout.planting))
  for (let i = 0; i < 80; i++) {
    const camera = { left: layout.bounds.x + i * 113, top: layout.bounds.y + i * 71, width: 714, height: 563 }
    expect(index.query(camera)).toEqual(old.query(camera))
  }
  const camera = { left: 500, top: 1050, width: 1800, height: 780 }, work = index.querySteps(camera)
  let steps = 0, result
  for (;;) { const next = work.next(); if (next.done) { result = next.value; break } steps++ }
  expect(steps).toBeGreaterThan(0); expect(result).toEqual(old.query(camera))
})
it('transfers bounded planting chunks without detaching the worker cache and reconstructs the same query results', () => {
  const layout = build(100), work = drawingChunks(layout), drawing = emptyDrawing()
  for (;;) {
    const next = work.next()
    if (next.done) {
      const page = Object.assign(next.value, drawing)
      expect(page.planting).toEqual(layout.planting)
      expect(expanded(page)).toEqual(expanded(layout))
      const camera = { left: -1200, top: -700, width: 3600, height: 2600 }
      expect(finish(SceneryIndex.build(page.pieces,page.planting)).query(camera)).toEqual(finish(SceneryIndex.build(layout.pieces,layout.planting)).query(camera))
      break
    }
    expect(next.value.planting?.length ?? 0).toBeLessThanOrEqual(1)
    for (const p of next.value.planting ?? []) expect(p.sprites.length).toBeLessThanOrEqual(128)
    const copy = structuredClone(next.value, { transfer: [ ...(next.value.roadDrawing?.map(p => p.buffer as ArrayBuffer) ?? []), ...(next.value.planting?.flatMap(p => [p.positions.buffer as ArrayBuffer,p.sprites.buffer as ArrayBuffer]) ?? []) ] })
    appendDrawing(drawing,copy)
  }
  expect(layout.planting!.every(p => p.positions.byteLength > 0 && p.sprites.byteLength > 0)).toBe(true)
})

it('batches 17429 walk rings into 545 backing stores with every original road double unchanged', () => {
  for (const row of control.rows) {
    const layout = build(row.count), batches = layout.roadDrawing!, rings = [...packedRings(batches)]
    expect(batches.length).toBe(Math.ceil(row.roads / 32))
    expect(rings.length).toBe(row.roads)
    expect(batches.reduce((n, p) => n + p.byteLength, 0)).toBe(row.roadBytes)
    expect(createHash('sha256').update(Buffer.concat(batches.map(p => Buffer.from(p.buffer,p.byteOffset,p.byteLength)))).digest('hex')).toBe(row.roadSha256)
  }
})
it('keeps navigation ground in later rings of a batch and produces the same route as separate buffers', () => {
  const layout = build(16), separated = { ...layout, roadDrawing: [...packedRings(layout.roadDrawing!)] }
  const batched = new Navigation(layout), original = new Navigation(separated)
  finish(batched.build()); finish(original.build())
  const ground = (batched as unknown as { packedGround: VisibleIndex<Float64Array> }).packedGround
  const ring = separated.roadDrawing[10]!, x=ring[1]!, y=ring[2]!
  expect(ground.query({ left:x,top:y,width:1,height:1 })).toContainEqual(ring)
  const ids = Object.keys(layout.seats)
  for (const to of [ids[1]!,ids[6]!,ids.at(-1)!]) expect(batched.route(ids[0]!,to,80000)).toEqual(original.route(ids[0]!,to,80000))
})
