// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A SMALL COPY OF A PNG PICTURE, MADE WITH NODE'S OWN ZLIB.
 *
 * Round 10 of wave 13x. A role portrait is a 1024 by 1024 PNG of about 1 MB, and the pages draw it at
 * 156, 56 and 36 pixels: five of them made the Role cards page's first load 14.0 MB on an office of the
 * live size. `GET /api/portraits/<set>/<of>/<name>?size=small` answers the copy this file makes, and the
 * picture somebody chose is still the whole file at the address without `?size`.
 *
 * WHAT IT READS. An 8-bit PNG that is not interlaced, in colour (RGB) or in colour with transparency
 * (RGBA). That is every portrait this checkout ships. Anything else, a JPEG, a WebP, a palette or a
 * 16-bit PNG, is not shrunk: `smallPngOf` answers why in words, and the route sends the whole picture
 * and says so in a header. The project has no picture library, and this one is about 150 lines.
 *
 * HOW IT SHRINKS. Each pixel of the copy is the average of the block of pixels it covers, weighted by
 * how opaque each is, so a transparent edge does not darken the copy.
 *
 * WHAT ELSE READS BY IT. `thePixelsOfAPng` gives the pixels of the same PNGs, not shrunk. Wave 13y round
 * 52: tools/review.mjs compares two canvases by them.
 */
import { crc32, deflateSync, inflateSync } from 'node:zlib'

/** What a PNG file starts with. */
const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

/** The copy, or the reason none was made. */
export type SmallPng = { made: true; body: Buffer; width: number; height: number; fromWidth: number } | { made: false; why: string }

/** A copy of `png` `width` pixels wide, or the picture itself when it is no wider than that. */
export function smallPngOf(png: Buffer, width: number): SmallPng {
  const parts = thePartsOfAPng(png)
  if (!parts.read) return { made: false, why: parts.why }
  if (!parts.readable) return { made: false, why: `the PNG is ${parts.format}; only 8-bit RGB or RGBA without interlace is shrunk` }
  const from = { width: parts.width, height: parts.height }
  if (from.width <= width) return { made: false, why: `the picture is ${String(from.width)} pixels wide, which is no wider than ${String(width)}` }
  const pixels = unfilter(inflateSync(Buffer.concat(parts.data)), from.width, from.height, parts.channels)
  const to = { width, height: Math.max(1, Math.round((from.height * width) / from.width)) }
  const small = shrink(pixels, from, to, parts.channels)
  return { made: true, body: encode(small, to, parts.colour, parts.channels), width: to.width, height: to.height, fromWidth: from.width }
}

/** The pixels of a PNG, row after row, or the reason they were not read. */
export type PngPixels = { read: true; width: number; height: number; channels: 3 | 4; pixels: Uint8Array } | { read: false; why: string }

/**
 * THE PIXELS OF A PNG THIS FILE READS, for a comparison of two pictures (wave 13y round 52: tools/review.mjs compares
 * two canvases by them). Each pixel is `channels` bytes: red, green, blue, and its opacity when there are four.
 */
export function thePixelsOfAPng(png: Buffer): PngPixels {
  const parts = thePartsOfAPng(png)
  if (!parts.read) return parts
  if (!parts.readable) return { read: false, why: `the PNG is ${parts.format}; only 8-bit RGB or RGBA without interlace is read` }
  const pixels = unfilter(inflateSync(Buffer.concat(parts.data)), parts.width, parts.height, parts.channels)
  return { read: true, width: parts.width, height: parts.height, channels: parts.channels, pixels }
}

type PngParts =
  | { read: false; why: string }
  | { read: true; readable: boolean; format: string; width: number; height: number; colour: number; channels: 3 | 4; data: Buffer[] }

/** A PNG's header and its compressed data, and whether its format is the one this file reads. */
function thePartsOfAPng(png: Buffer): PngParts {
  if (png.length < SIGNATURE.length || !png.subarray(0, SIGNATURE.length).equals(SIGNATURE)) {
    return { read: false, why: 'the file is not a PNG' }
  }
  let at = SIGNATURE.length
  let header: Buffer | null = null
  const data: Buffer[] = []
  while (at + 8 <= png.length) {
    const length = png.readUInt32BE(at)
    const type = png.toString('latin1', at + 4, at + 8)
    const body = png.subarray(at + 8, at + 8 + length)
    if (type === 'IHDR') header = body
    else if (type === 'IDAT') data.push(body)
    else if (type === 'IEND') break
    at += 12 + length
  }
  if (header === null || header.length < 13) return { read: false, why: 'the PNG has no header' }
  const from = { width: header.readUInt32BE(0), height: header.readUInt32BE(4) }
  const depth = header[8]
  const colour = header.readUInt8(9)
  const interlaced = header[12]
  return {
    read: true,
    readable: depth === 8 && (colour === 2 || colour === 6) && interlaced === 0,
    format: `${String(depth)}-bit, colour type ${String(colour)}, interlace ${String(interlaced)}`,
    ...from,
    colour,
    channels: colour === 6 ? 4 : 3,
    data,
  }
}

/** The raw pixels of a PNG's decompressed data, each row's filter undone. */
function unfilter(raw: Buffer, width: number, height: number, channels: number): Uint8Array {
  const stride = width * channels
  const out = new Uint8Array(stride * height)
  for (let y = 0; y < height; y += 1) {
    const filter = raw[y * (stride + 1)]
    const row = y * (stride + 1) + 1
    const here = y * stride
    const above = here - stride
    for (let x = 0; x < stride; x += 1) {
      const value = raw[row + x]!
      const left = x >= channels ? out[here + x - channels]! : 0
      const up = y > 0 ? out[above + x]! : 0
      const upLeft = y > 0 && x >= channels ? out[above + x - channels]! : 0
      let added: number
      if (filter === 0) added = 0
      else if (filter === 1) added = left
      else if (filter === 2) added = up
      else if (filter === 3) added = (left + up) >> 1
      else if (filter === 4) added = paeth(left, up, upLeft)
      else throw new Error(`A PNG row has filter ${String(filter)}, which is not one of the five a PNG may use.`)
      out[here + x] = (value + added) & 0xff
    }
  }
  return out
}

function paeth(a: number, b: number, c: number): number {
  const p = a + b - c
  const pa = Math.abs(p - a)
  const pb = Math.abs(p - b)
  const pc = Math.abs(p - c)
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c
}

/** Each pixel of the copy as the average of the block it covers, weighted by opacity where there is any. */
function shrink(pixels: Uint8Array, from: { width: number; height: number }, to: { width: number; height: number }, channels: number): Uint8Array {
  const out = new Uint8Array(to.width * to.height * channels)
  for (let y = 0; y < to.height; y += 1) {
    const y0 = Math.floor((y * from.height) / to.height)
    const y1 = Math.max(y0 + 1, Math.floor(((y + 1) * from.height) / to.height))
    for (let x = 0; x < to.width; x += 1) {
      const x0 = Math.floor((x * from.width) / to.width)
      const x1 = Math.max(x0 + 1, Math.floor(((x + 1) * from.width) / to.width))
      let r = 0
      let g = 0
      let b = 0
      let weight = 0
      let count = 0
      for (let sy = y0; sy < y1; sy += 1) {
        for (let sx = x0; sx < x1; sx += 1) {
          const i = (sy * from.width + sx) * channels
          const a = channels === 4 ? pixels[i + 3]! : 255
          r += pixels[i]! * a
          g += pixels[i + 1]! * a
          b += pixels[i + 2]! * a
          weight += a
          count += 1
        }
      }
      const o = (y * to.width + x) * channels
      if (weight > 0) {
        out[o] = Math.round(r / weight)
        out[o + 1] = Math.round(g / weight)
        out[o + 2] = Math.round(b / weight)
      }
      if (channels === 4) out[o + 3] = Math.round(weight / count)
    }
  }
  return out
}

/** A PNG of `pixels`, each row with the filter that leaves the smallest numbers to compress. */
function encode(pixels: Uint8Array, size: { width: number; height: number }, colour: number, channels: number): Buffer {
  const stride = size.width * channels
  const raw = Buffer.alloc((stride + 1) * size.height)
  const trial = Buffer.alloc(stride)
  for (let y = 0; y < size.height; y += 1) {
    const here = y * stride
    let best = -1
    let bestCost = Infinity
    for (let filter = 0; filter <= 4; filter += 1) {
      let cost = 0
      for (let x = 0; x < stride; x += 1) {
        const left = x >= channels ? pixels[here + x - channels]! : 0
        const up = y > 0 ? pixels[here - stride + x]! : 0
        const upLeft = y > 0 && x >= channels ? pixels[here - stride + x - channels]! : 0
        const predicted = filter === 0 ? 0 : filter === 1 ? left : filter === 2 ? up : filter === 3 ? (left + up) >> 1 : paeth(left, up, upLeft)
        const value = (pixels[here + x]! - predicted) & 0xff
        cost += value < 128 ? value : 256 - value
      }
      if (cost < bestCost) {
        bestCost = cost
        best = filter
      }
    }
    const row = y * (stride + 1)
    raw[row] = best
    for (let x = 0; x < stride; x += 1) {
      const left = x >= channels ? pixels[here + x - channels]! : 0
      const up = y > 0 ? pixels[here - stride + x]! : 0
      const upLeft = y > 0 && x >= channels ? pixels[here - stride + x - channels]! : 0
      const predicted = best === 0 ? 0 : best === 1 ? left : best === 2 ? up : best === 3 ? (left + up) >> 1 : paeth(left, up, upLeft)
      trial[x] = (pixels[here + x]! - predicted) & 0xff
    }
    trial.copy(raw, row + 1)
  }
  const header = Buffer.alloc(13)
  header.writeUInt32BE(size.width, 0)
  header.writeUInt32BE(size.height, 4)
  header[8] = 8
  header[9] = colour
  return Buffer.concat([SIGNATURE, chunk('IHDR', header), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))])
}

function chunk(type: string, body: Buffer): Buffer {
  const head = Buffer.alloc(8)
  head.writeUInt32BE(body.length, 0)
  head.write(type, 4, 'latin1')
  const tail = Buffer.alloc(4)
  tail.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), body])), 0)
  return Buffer.concat([head, body, tail])
}
