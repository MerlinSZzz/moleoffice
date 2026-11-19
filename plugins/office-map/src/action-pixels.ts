// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import type { NativePixels } from './look-png.ts'
import type { SpriteFrame } from './pack.ts'
import { sha256Bytes } from './look-identity.ts'
import { ActionFormatError, ActionTransportError } from './action-data.ts'
export const pixelHash = (bytes: Uint8Array): string => [...sha256Bytes(bytes)].map(value => value.toString(16).padStart(2, '0')).join('')
const current = (signal: AbortSignal, alive: () => boolean): void => { if (signal.aborted || !alive()) throw Error('Action read cancelled') }

/** Exact existing PNG pixels; call only while holding the shared decode owner. */
export async function readNativePixels(image: HTMLImageElement, frame: SpriteFrame, signal: AbortSignal, alive: () => boolean): Promise<NativePixels> {
  current(signal, alive)
  const [sx, sy, width, height] = frame.rect as [number, number, number, number]
  const [fullWidth, fullHeight] = frame.size as [number, number]
  if (fullWidth > 160 || fullHeight > 128 || width > fullWidth || height > fullHeight) throw new ActionFormatError('Action crop exceeds dimensions')
  let bitmap: ImageBitmap | null = null, canvas: HTMLCanvasElement | null = null, gl: WebGLRenderingContext | null = null
  let texture: WebGLTexture | null = null, framebuffer: WebGLFramebuffer | null = null
  try {
    bitmap = await createImageBitmap(image, sx, sy, width, height, { premultiplyAlpha: 'none', colorSpaceConversion: 'none' })
    current(signal, alive)
    canvas = document.createElement('canvas'); canvas.width = canvas.height = 1
    gl = canvas.getContext('webgl', { alpha: true, premultipliedAlpha: false, depth: false, stencil: false, antialias: false, preserveDrawingBuffer: false })
    if (!gl) throw new ActionFormatError('Exact action pixels unavailable')
    texture = gl.createTexture(); framebuffer = gl.createFramebuffer(); if (!texture || !framebuffer) throw new ActionFormatError('Action allocation failed')
    gl.bindTexture(gl.TEXTURE_2D, texture); gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false); gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE); gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, bitmap)
    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer); gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0)
    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) throw new ActionFormatError('Action framebuffer incomplete')
    const raw = new Uint8Array(width * height * 4); gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, raw)
    if (gl.getError() !== gl.NO_ERROR) throw new ActionFormatError('Action pixel read failed')
    current(signal, alive)
    const data = new Uint8Array(fullWidth * fullHeight * 4), [tx, ty] = frame.trim as [number, number]
    for (let y = 0; y < height; y++) data.set(raw.subarray(y * width * 4, (y + 1) * width * 4), ((ty + y) * fullWidth + tx) * 4)
    return { width: fullWidth, height: fullHeight, channels: 4, data }
  } finally {
    if (gl) { if (texture) gl.deleteTexture(texture); if (framebuffer) gl.deleteFramebuffer(framebuffer); gl.getExtension('WEBGL_lose_context')?.loseContext() }
    bitmap?.close(); if (canvas) canvas.width = canvas.height = 1
  }
}
/** A PNG URL is admitted by real demand, never by module/roster discovery. */
export async function readActionImage(url: string, width: number, height: number, signal: AbortSignal, alive: () => boolean): Promise<NativePixels> {
  current(signal, alive)
  const image = new Image(); image.crossOrigin = 'anonymous'; image.decoding = 'async'
  let abort: (() => void) | null = null
  try {
    await new Promise<void>((resolve, reject) => {
      abort = () => { image.src = ''; reject(Error('Action image cancelled')) }
      signal.addEventListener('abort', abort, { once: true })
      image.onload = () => {
        if (abort) { signal.removeEventListener('abort', abort); abort = null }
        resolve()
      }; image.onerror = () => reject(new ActionTransportError('Action image unavailable')); image.src = url
    })
    current(signal, alive)
    if (image.naturalWidth !== width || image.naturalHeight !== height) throw new ActionFormatError('Action image dimensions differ')
    try { await image.decode() } catch (error) { current(signal, alive); throw new ActionFormatError(String(error)) }; current(signal, alive)
    const raw = await readNativePixels(image, { atlas: '', rect: [0, 0, width, height], trim: [0, 0], size: [width, height], anchor: [0, 0] }, signal, alive)
    current(signal, alive); return raw
  } finally { if (abort) signal.removeEventListener('abort', abort); image.onload = null; image.onerror = null; image.src = '' }
}
/** Pillow's accumulated nearest centers; approved props opt into transparent RGB clearing. */
export function resizeNative(source: NativePixels, width: number, height: number, clearAlphaZeroRGB = false): Uint8Array {
  const raw = new Uint8Array(width * height * 4)
  const stepX = source.width / width, stepY = source.height / height
  let centerY = stepY / 2
  for (let y = 0; y < height; y++) {
    const sy = Math.min(source.height - 1, Math.floor(centerY))
    let centerX = stepX / 2
    for (let x = 0; x < width; x++) {
      const sx = Math.min(source.width - 1, Math.floor(centerX)), from = (sy * source.width + sx) * 4
      if (!clearAlphaZeroRGB || source.data[from + 3] !== 0) raw.set(source.data.subarray(from, from + 4), (y * width + x) * 4)
      centerX += stepX
    }
    centerY += stepY
  }
  return raw
}
