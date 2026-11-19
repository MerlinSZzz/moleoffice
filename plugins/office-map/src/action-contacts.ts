// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { decodeOwner, pageCompositions } from './action-resources.ts'
import { readNativePixels, resizeNative } from './action-pixels.ts'
import type { ArtPack } from './pack.ts'
import type { NativePixels } from './look-png.ts'
import type { ContactPiece } from './action-binding.ts'
export class NativeContacts {
  private raw = new Map<string, NativePixels>()
  private abort: AbortController | null = null
  private epoch = 0
  ready = false
  async select(pack: ArtPack): Promise<boolean> {
    this.release(); const epoch = this.epoch, abort = this.abort = new AbortController(), alive = () => epoch === this.epoch && !abort.signal.aborted
    try {
      for (const key of ['worker-desk','stool-se','bookshelf','tea-table','message-board']) {
        const frame = pack.sources.sprites?.[key], image = frame && pack.images.get(frame.atlas); if (!frame || !image) throw Error('Native contact unavailable')
        const raw = await decodeOwner.run('native contact', () => readNativePixels(image,frame,abort.signal,alive),abort.signal)
        if (!alive()) return false
        this.raw.set(key,raw)
      }
      this.ready = true; return true
    } catch { if (alive()) this.release(); return false }
  }
  draw(ctx: CanvasRenderingContext2D, piece: ContactPiece): boolean {
    if (!piece.contactSize) return false
    const source = this.raw.get(piece.sprite); if (!source) return false
    const [width,height] = piece.contactSize, key = 'native-contact:'+piece.sprite+':'+width+':'+height
    const entry = pageCompositions.get(key) ?? pageCompositions.put(key,resizeNative(source,width,height,true),width,height)
    if (!entry) return false
    ctx.drawImage(entry.canvas,piece.x,piece.y,piece.width,piece.height); return true
  }
  release(): void { this.epoch++; this.abort?.abort(); this.abort = null; this.ready = false; this.raw.clear(); pageCompositions.dropPrefix('native-contact:') }
}
