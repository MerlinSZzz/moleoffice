// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import catalog from '../assets/village-catalog.json'
import { piece, type Piece } from './village.ts'
import { overlapsCamera, type Camera } from './viewport.ts'

const sprites = Object.keys(catalog.sprites)
const spriteIds = new Map(sprites.map((name, i) => [name, i]))
/** Added planting has no group and always uses the floor layer. Coordinates and
 * scale are exact doubles; all other values follow the unchanged atlas recipe.
 * before preserves its position among the retained native pieces. */
export interface CompactPlanting { before: number; positions: Float64Array; sprites: Uint16Array }
export function compactPlanting(pieces: readonly Piece[], before: number): CompactPlanting[] {
  const chunks: CompactPlanting[] = []
  for (let start = 0; start < pieces.length; start += 128) {
    const local = pieces.slice(start, start + 128), positions = new Float64Array(local.length * 3), ids = new Uint16Array(local.length)
    local.forEach((p, i) => { positions.set([p.x, p.y, p.scale ?? 1], i * 3); ids[i] = spriteIds.get(p.sprite)! })
    chunks.push({ before, positions, sprites: ids })
  }
  return chunks
}
export function plantingPiece(chunk: CompactPlanting, index: number): Piece {
  const at = index * 3, scale = chunk.positions[at + 2]!, sprite = sprites[chunk.sprites[index]!]!
  const p = piece(sprite, chunk.positions[at]!, chunk.positions[at + 1]!, null, 'floor')
  p.scale = scale; p.width *= scale; p.height *= scale
  p.depth = p.y + catalog.sprites[sprite as keyof typeof catalog.sprites].anchor[1]! * scale; p.decoration = true
  return p
}
/** Numeric planting references share the original cell insertion order with
 * native pieces. Queries materialize only nearby pieces, never the whole office. */
export class SceneryIndex {
  private cells = new Map<string, (Piece | number)[]>()
  constructor(private planting: readonly CompactPlanting[] = []) {}
  static *build(pieces: readonly Piece[], planting: readonly CompactPlanting[] = []): Generator<void, SceneryIndex> {
    const index = new SceneryIndex(planting)
    let chunk = 0, steps = 0
    function* add(value: Piece | number, rect: Piece): Generator<void> {
      for (let y = Math.floor(rect.y / 256); y <= Math.floor((rect.y + rect.height) / 256); y++) for (let x = Math.floor(rect.x / 256); x <= Math.floor((rect.x + rect.width) / 256); x++) {
        const key = `${x},${y}`, cell = index.cells.get(key) ?? []
        cell.push(value); index.cells.set(key, cell)
        if (++steps === 32) { steps = 0; yield }
      }
    }
    for (let at = 0; at <= pieces.length; at++) {
      while (chunk < planting.length && planting[chunk]!.before === at) {
        const p = planting[chunk]!
        for (let i = 0; i < p.sprites.length; i++) yield* add(chunk * 128 + i, plantingPiece(p, i))
        chunk++
      }
      if (at < pieces.length) yield* add(pieces[at]!, pieces[at]!)
    }
    return index
  }
  query(camera: Camera): Piece[] {
    const work = this.querySteps(camera)
    for (;;) { const next = work.next(); if (next.done) return next.value }
  }
  *querySteps(camera: Camera): Generator<void, Piece[]> {
    const seen = new Set<Piece | number>(), found: Piece[] = []
    let entries = 0, cells = 0
    for (let y = Math.floor(camera.top / 256); y <= Math.floor((camera.top + camera.height) / 256); y++) for (let x = Math.floor(camera.left / 256); x <= Math.floor((camera.left + camera.width) / 256); x++) {
      for (const value of this.cells.get(`${x},${y}`) ?? []) {
        if (!seen.has(value)) {
          seen.add(value)
          const p = typeof value === 'number' ? plantingPiece(this.planting[Math.floor(value / 128)]!, value % 128) : value
          if (overlapsCamera(p, camera)) found.push(p)
        }
        if (++entries === 32) { entries = 0; yield }
      }
      if (++cells === 128) { cells = 0; yield }
    }
    return found
  }
}
