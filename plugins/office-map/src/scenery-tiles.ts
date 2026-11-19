// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import type { Rect, Camera } from './viewport.ts'
import { overlapsCamera } from './viewport.ts'
import type { Piece } from './village.ts'
import { drawSprite, type ArtPack } from './pack.ts'

export const SCENERY_TILE_SIDE = 512
// Three simultaneous scenery caches share6 MiB; art, surfaces and looks count separately.
export const SCENERY_TILE_BYTES = 2 * 1024 * 1024
/** Native, transparent decoration tiles. A bounded LRU owns its pixels and is
 * discarded with the model/pack. Walking restores these pixels from background. */
export class SceneryTiles {
  private tiles = new Map<string, HTMLCanvasElement>()
  rasterized = 0
  bytes = 0
  private worldSide = 512;
  *draw(ctx: CanvasRenderingContext2D, pieces: Piece[], camera: Camera, pack: ArtPack | null, worldSide = 512, source?: { querySteps(camera: Camera): Generator<void, Piece[]> }, ground?: (ctx:CanvasRenderingContext2D,area:Rect)=>Generator<void>): Generator<void> {
    if (this.worldSide !== worldSide) { this.clear(); this.worldSide = worldSide }
    const side = worldSide, pixels = SCENERY_TILE_SIDE
    for (let row = Math.floor(camera.top/side); row*side < camera.top+camera.height; row++) for (let column = Math.floor(camera.left/side); column*side < camera.left+camera.width; column++) {
      const x=column*side,y=row*side,area: Rect = { x, y, width: side, height: side }, key = `${column},${row}`
      const tileCamera = { left:x,top:y,width:side,height:side }
      // Query the whole tile, including its off-camera fringe; later pans may expose it.
      const local = source ? (yield* source.querySteps(tileCamera)).filter(p=>p.decoration || p.cached) : pieces.filter(p => overlapsCamera(p,tileCamera))
      if (!local.length && !ground) { yield; continue }
      let tile = this.tiles.get(key)
      if (tile) this.tiles.delete(key)
      else {
        while (this.bytes + pixels * pixels * 4 > SCENERY_TILE_BYTES) {
          const first = this.tiles.entries().next().value!
          this.tiles.delete(first[0]); first[1].width = first[1].height = 1; this.bytes -= pixels * pixels * 4
        }
        tile = document.createElement('canvas'); tile.width = tile.height = pixels
        const drawing = tile.getContext('2d', { willReadFrequently: true })!
        drawing.save(); drawing.setTransform(pixels/side,0,0,pixels/side,-x*pixels/side,-y*pixels/side); drawing.imageSmoothingEnabled = false
        let complete = false
        try {
          if (ground) yield* ground(drawing,area)
          for (const p of local.sort((a,b) => a.depth-b.depth)) {
            drawSprite(drawing, pack, p.sprite, p.x, p.y, p.scale ?? 1, p.crop)
            drawing.getImageData(0,0,1,1); yield
          }
          complete = true
        } finally { drawing.restore(); if(!complete) tile.width = tile.height = 1 }
        this.rasterized++; this.bytes += pixels * pixels * 4
      }
      this.tiles.set(key,tile)
      ctx.drawImage(tile,area.x,area.y,area.width,area.height)
      ctx.getImageData(0,0,1,1); yield
    }
  }
  clear(): void { for (const tile of this.tiles.values()) tile.width = tile.height = 1; this.tiles.clear(); this.bytes = 0 }
}
