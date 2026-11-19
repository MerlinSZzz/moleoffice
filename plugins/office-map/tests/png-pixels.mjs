// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { readFileSync } from 'node:fs'
import { inflateSync } from 'node:zlib'
import assert from 'node:assert/strict'

/** Decode Chromium's 8-bit RGB/RGBA screenshots, and the 8-bit palette pictures the page bundles, without an optional
 * image dependency. A palette picture comes back as RGBA. */
export function pixels(path) {
  const png = readFileSync(path), parts = [], chunks = {}
  assert.equal(png.subarray(1, 4).toString(), 'PNG')
  const width = png.readUInt32BE(16), height = png.readUInt32BE(20), type = png[25], channels = type === 6 ? 4 : type === 2 ? 3 : 1
  assert.equal(png[24], 8); assert.ok([2, 3, 6].includes(type)); assert.equal(png[28], 0)
  for (let at = 8; at < png.length;) {
    const length = png.readUInt32BE(at), kind = png.subarray(at + 4, at + 8).toString(), body = png.subarray(at + 8, at + 8 + length)
    if (kind === 'IDAT') parts.push(body); else chunks[kind] = body
    at += 12 + length
  }
  const raw = inflateSync(Buffer.concat(parts)), stride = width * channels, data = Buffer.alloc(stride * height)
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)], row = y * stride
    for (let x = 0; x < stride; x++) {
      const a = x >= channels ? data[row + x - channels] : 0, b = y ? data[row + x - stride] : 0, c = y && x >= channels ? data[row + x - stride - channels] : 0
      const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c)
      const prediction = filter === 0 ? 0 : filter === 1 ? a : filter === 2 ? b : filter === 3 ? Math.floor((a + b) / 2) : pa <= pb && pa <= pc ? a : pb <= pc ? b : c
      assert.ok(filter <= 4); data[row + x] = raw[y * (stride + 1) + 1 + x] + prediction
    }
  }
  if (type !== 3) return { width, height, channels, data }
  // Each byte is a palette entry; an entry past the end of the transparency list is opaque.
  const colours = chunks.PLTE, opacity = chunks.tRNS ?? Buffer.alloc(0), rgba = Buffer.alloc(width * height * 4)
  assert.ok(colours)
  for (let at = 0; at < data.length; at++) {
    const entry = data[at]; assert.ok(entry * 3 < colours.length)
    colours.copy(rgba, at * 4, entry * 3, entry * 3 + 3); rgba[at * 4 + 3] = entry < opacity.length ? opacity[entry] : 255
  }
  return { width, height, channels: 4, data: rgba }
}
export function comparePixels(a, b) {
  const old = pixels(a), next = pixels(b)
  assert.equal(old.width, next.width); assert.equal(old.height, next.height); assert.equal(old.channels, next.channels)
  let differentPixels = 0
  for (let at = 0; at < old.data.length; at += old.channels) if (!old.data.subarray(at, at + old.channels).equals(next.data.subarray(at, at + old.channels))) differentPixels++
  return { pixels: old.width * old.height, differentPixels }
}
