// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import type { SpriteFrame } from './pack.ts'
/** Straight pixels from permitted anonymous Image loads. No connect request or 2D colour recovery. */
export class NativeStandingReader {
  private canvas: HTMLCanvasElement | null = null
  private gl: WebGLRenderingContext | null = null
  async read(image: HTMLImageElement, frame: SpriteFrame, signal: AbortSignal): Promise<Uint8Array> {
    if (signal.aborted) throw Error('Standing load cancelled')
    const [sx, sy, width, height] = frame.rect as [number, number, number, number]
    if (width > 128 || height > 128 || frame.size[0] !== 128 || frame.size[1] !== 128) throw Error('Standing crop exceeds allocation')
    const bitmap = await createImageBitmap(image, sx, sy, width, height, { premultiplyAlpha: 'none', colorSpaceConversion: 'none' })
    let texture: WebGLTexture | null = null, framebuffer: WebGLFramebuffer | null = null
    try {
      if (signal.aborted) throw Error('Standing load cancelled')
      if (!this.canvas) { this.canvas = document.createElement('canvas'); this.canvas.width = this.canvas.height = 1 }
      const gl = this.gl ??= this.canvas.getContext('webgl', { alpha: true, premultipliedAlpha: false, depth: false, stencil: false, antialias: false, preserveDrawingBuffer: false })
      if (!gl) throw Error('Exact standing readback unavailable')
      texture = gl.createTexture(); framebuffer = gl.createFramebuffer()
      if (!texture || !framebuffer) throw Error('Standing readback allocation failed')
      gl.bindTexture(gl.TEXTURE_2D, texture)
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false); gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE); gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, bitmap)
      gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer); gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0)
      if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) throw Error('Standing framebuffer incomplete')
      const raw = new Uint8Array(width * height * 4)
      gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, raw)
      if (gl.getError() !== gl.NO_ERROR) throw Error('Standing readback failed')
      const out = new Uint8Array(128 * 128 * 4), [tx, ty] = frame.trim as [number, number]
      for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
        const from = (y * width + x) * 4
        if (raw[from + 3]) out.set(raw.subarray(from, from + 4), ((ty + y) * 128 + tx + x) * 4)
      }
      return out
    } finally {
      if (this.gl) { if (framebuffer) this.gl.deleteFramebuffer(framebuffer); if (texture) this.gl.deleteTexture(texture) }
      bitmap.close()
    }
  }
  release(): void {
    this.gl?.getExtension('WEBGL_lose_context')?.loseContext(); this.gl = null
    if (this.canvas) this.canvas.width = this.canvas.height = 1
    this.canvas = null
  }
}
/** Vite inlines these tiny masks. Decoding data locally is allowed by connect-src none. */
export async function inlineLookMask(url: string, signal: AbortSignal): Promise<Uint8Array> {
  if (signal.aborted || !url.startsWith('data:image/png;base64,')) throw Error('Exact inline mask unavailable')
  return Uint8Array.from(atob(url.slice('data:image/png;base64,'.length)), char => char.charCodeAt(0))
}
