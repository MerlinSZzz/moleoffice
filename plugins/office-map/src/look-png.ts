// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
export interface NativePixels { width: number; height: number; channels: number; data: Uint8Array }
const paeth = (a: number, b: number, c: number): number => {
  const p = a + b - c, x = Math.abs(p - a), y = Math.abs(p - b), z = Math.abs(p - c)
  return x <= y && x <= z ? a : y <= z ? b : c
}
/** Exact unpremultiplied bytes. Only the shipped noninterlaced 8-bit RGBA/grayscale PNGs. */
export async function decodeLookPng(bytes: Uint8Array): Promise<NativePixels> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  if (view.getUint32(0) !== 0x89504e47 || view.getUint32(4) !== 0x0d0a1a0a) throw Error('Invalid look PNG')
  let width = 0, height = 0, channels = 0
  const parts: Uint8Array<ArrayBuffer>[] = []
  for (let at = 8; at + 12 <= bytes.length;) {
    const length = view.getUint32(at), kind = view.getUint32(at + 4)
    if (at + length + 12 > bytes.length) throw Error('Truncated look PNG')
    if (kind === 0x49484452) {
      width = view.getUint32(at + 8); height = view.getUint32(at + 12)
      channels = bytes[at + 17] === 6 ? 4 : bytes[at + 17] === 0 ? 1 : 0
      if (!width || !height || width > 1024 || height > 1024 || !channels || bytes[at + 16] !== 8 ||
          bytes[at + 18] || bytes[at + 19] || bytes[at + 20]) throw Error('Unsupported look PNG')
    } else if (kind === 0x49444154) parts.push(bytes.slice(at + 8, at + 8 + length) as Uint8Array<ArrayBuffer>)
    at += length + 12
  }
  if (!channels) throw Error('Missing look PNG header')
  const stride = width * channels, filtered = new Uint8Array((stride + 1) * height)
  const reader = new Blob(parts).stream().pipeThrough(new DecompressionStream('deflate')).getReader()
  let filled = 0
  try {
    for (;;) {
      const next = await reader.read(); if (next.done) break
      if (filled + next.value.length > filtered.length) throw Error('Look PNG exceeds declared size')
      filtered.set(next.value, filled); filled += next.value.length
    }
  } finally { await reader.cancel() }
  if (filled !== filtered.length) throw Error('Incomplete look PNG')
  for (let y = 0; y < height; y++) {
    const start = y * (stride + 1) + 1, filter = filtered[start - 1]!
    if (filter > 4) throw Error('Invalid PNG filter')
    for (let x = 0; x < stride; x++) {
      const at = start + x, a = x >= channels ? filtered[at - channels]! : 0
      const b = y ? filtered[at - stride - 1]! : 0, c = y && x >= channels ? filtered[at - stride - 1 - channels]! : 0
      filtered[at] = filtered[at]! + (filter === 1 ? a : filter === 2 ? b : filter === 3 ? Math.floor((a + b) / 2) : filter === 4 ? paeth(a, b, c) : 0)
    }
  }
  // Compact in place: never hold a second whole decoded atlas.
  for (let y = 0; y < height; y++) filtered.copyWithin(y * stride, y * (stride + 1) + 1, (y + 1) * (stride + 1))
  return { width, height, channels, data: filtered.subarray(0, stride * height) }
}
