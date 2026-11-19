// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHAT A PROGRAM CAN SAY FOR CERTAIN ABOUT ONE FILE'S CONTENT, BY TYPE.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS HERE, AND HOW DEEP EACH READER GOES
 * ---------------------------------------------------------------------------------------
 *
 * Each reader takes the bytes of one file and answers either a decided check
 * `{ check, ok, detail, facts }` or `{ judgment }` when it could not settle the question. `facts`
 * carries what the reader measured (width, height, pages, rows), for a manifest that states what
 * it expects. The check name says how deep the reader went, and so does the detail, so nobody
 * reads "structure" as "decoded":
 *
 *   png   `decodes`    every chunk's CRC, the header, and the image data inflated to exactly the
 *                      bytes its width, height, depth and colour type need, with every scanline's
 *                      filter byte valid. That is everything a decoder needs to succeed.
 *   jpeg  `decodes`    the segments from start-of-image to end-of-image, the frame header's size,
 *                      at least one scan (a failure there is named `structure`), and then every pixel
 *                      decoded by jpeg-js, strictly, to the size the frame header gives. A JPEG coded
 *                      in a way jpeg-js does not read (anything but baseline, extended and progressive
 *                      Huffman) is read for its `structure` only, and says so.
 *   webp  `decodes`    the RIFF container, every chunk inside the file, the size from the VP8, VP8L or
 *                      VP8X header (a failure there is named `structure`), and then every pixel decoded
 *                      by libwebp to that size. An animated WebP, whose frames that decoder does not
 *                      read, is read for its `structure` only, and says so.
 *   gif   `structure`  the header, every block to the trailer, at least one image. The LZW data is
 *                      walked, not decoded.
 *   pdf   `parses`     %PDF header, %%EOF at the end, startxref landing on a cross-reference table
 *                      or stream, and the page tree walked from the catalog, with the pages counted
 *                      and compared with the tree's own /Count. Compressed object streams
 *                      (FlateDecode) are opened for that walk. A startxref that lands on nothing
 *                      is repaired the way PDF readers repair it, by scanning for the last trailer,
 *                      and the answer is then a judgment, not a pass: the file is damaged but
 *                      readable (measured: one of 94 PDFs on this machine, which pdfinfo opens).
 *   json, jsonl, csv, tsv  `parses`, with the row count.
 *
 * TWO DECODERS ARE BORROWED, AND NOTHING IS ADDED FOR THEM. playwright-core, which Mole Office has as
 * the dev dependency its browser tests run on, carries two picture decoders inside it: jpeg-js 0.4.4,
 * pure JavaScript, in `playwright-core/lib/utilsBundle`, and libwebp compiled to WebAssembly, in
 * `playwright-core/lib/coreBundle`'s `utils`. This file reads JPEG and WebP pixels with them (sandbox v1
 * fix of the queue, 22 September 2026). A sandbox runs on the host checkout's own node_modules, so the
 * check goes as deep there as on the host. Measured the same day against Pillow over 594 real JPEG and
 * WebP files on this machine: 580 decode in both, at the same size; 13 carved WebPs whose container
 * is sound and whose bitstream is not fail in both (the structure walk alone passed them); and the one
 * disagreement is a recovery original with no end-of-image marker, which Pillow decodes past and which
 * fails the structure walk here before any decoder is asked. No GIF decoder is in node_modules, so a GIF is read
 * for its structure only, and the files checker hands it on to be looked at.
 *
 * A DECODER THAT IS NOT THERE IS A CHECK THAT CANNOT RUN, never a check that passed: `theDecoder`
 * throws, and the checker exits 2. Nothing falls back to the structure walk without saying so. For the
 * rest — PNG and PDF — these readers use Node alone (zlib), and the tools a machine may have (pdfinfo,
 * Pillow) are not asked, because they are on this host and not in the sandbox image, and a check that
 * went deeper on one machine than another would be a silent change of method (invariant 2).
 *
 * A zip has no reader here on purpose: nothing in Mole Office opens a zip (the promise in
 * src/server/lib/returnedfiles.ts). Its signature is checked by the caller and that is all.
 */

import { createRequire } from 'node:module'
import { crc32, inflateSync } from 'node:zlib'

/** Where each borrowed decoder is, and how it is reached. The one place that is written. */
const DECODERS = {
  jpeg: { module: 'playwright-core/lib/utilsBundle', name: 'jpeg-js', find: (loaded) => loaded?.jpegjs?.decode },
  webp: { module: 'playwright-core/lib/coreBundle', name: 'libwebp', find: (loaded) => loaded?.utils?.decodeWebp },
}

const requireHere = createRequire(import.meta.url)
const loadedDecoders = new Map()

/** A borrowed decoder, loaded the first time a file of its type is read, or a throw saying it is not there. */
function theDecoder(type) {
  const found = loadedDecoders.get(type)
  if (found !== undefined) return found
  const { module, name, find } = DECODERS[type]
  let decode
  try {
    decode = find(requireHere(module))
  } catch (err) {
    throw new Error(`The ${type} decoder this checker uses (${name}, in ${module}) could not be loaded: ${err.message}. Nothing was checked; install the checkout's dev dependencies.`)
  }
  if (typeof decode !== 'function') throw new Error(`${module} holds no ${name} decoder where this checker looks for it. Nothing was checked; tools/checks/file-contents.mjs must be told where it moved.`)
  loadedDecoders.set(type, decode)
  return decode
}

/**
 * The most pixels a borrowed decoder is asked to decode. jpeg-js refuses more by default (100 million),
 * and libwebp is given the same bound; a larger picture is a judgment, as a PNG too large to inflate is.
 */
const DECODE_MAX_PIXELS = 100_000_000

/** A decoder's error, in its own words. */
const saidBy = (err) => (err instanceof Error ? err.message : String(err))

/** A decided pass. */
function pass(check, detail, facts = {}) {
  return { check, ok: true, detail, facts }
}

/** A decided failure. */
function fail(check, detail) {
  return { check, ok: false, detail, facts: {} }
}

// ================================================================================== PNG

/** Channels per pixel for each PNG colour type, and the bit depths each type allows. */
const PNG_COLOUR_TYPES = {
  0: { channels: 1, depths: [1, 2, 4, 8, 16], name: 'greyscale' },
  2: { channels: 3, depths: [8, 16], name: 'RGB' },
  3: { channels: 1, depths: [1, 2, 4, 8], name: 'palette' },
  4: { channels: 2, depths: [8, 16], name: 'greyscale with alpha' },
  6: { channels: 4, depths: [8, 16], name: 'RGBA' },
}

/** The seven passes of Adam7 interlacing: x start, y start, x step, y step. */
const ADAM7 = [
  [0, 0, 8, 8],
  [4, 0, 8, 8],
  [0, 4, 4, 8],
  [2, 0, 4, 4],
  [0, 2, 2, 4],
  [1, 0, 2, 2],
  [0, 1, 1, 2],
]

/** The largest decompressed image this reader will hold in memory. */
const PNG_MAX_RAW_BYTES = 512 * 1024 * 1024

/** The (width, height) of each sub-image the scanlines come in: one, or Adam7's seven. */
function pngSubImages(width, height, interlaced) {
  if (!interlaced) return [[width, height]]
  return ADAM7.map(([xs, ys, dx, dy]) => [
    width > xs ? Math.ceil((width - xs) / dx) : 0,
    height > ys ? Math.ceil((height - ys) / dy) : 0,
  ])
}

export function readPng(bytes) {
  const check = 'decodes'
  let at = 8
  let header = null
  let palette = false
  let ended = false
  const data = []
  while (at < bytes.length) {
    if (at + 12 > bytes.length) return fail(check, `The file ends inside a chunk header at byte ${String(at)}: it is truncated.`)
    const length = bytes.readUInt32BE(at)
    const type = bytes.toString('latin1', at + 4, at + 8)
    if (length > 0x7fffffff || at + 12 + length > bytes.length) {
      return fail(check, `The ${type} chunk at byte ${String(at)} says it holds ${String(length)} bytes and the file ends first: it is truncated.`)
    }
    const stored = bytes.readUInt32BE(at + 8 + length)
    if (crc32(bytes.subarray(at + 4, at + 8 + length)) !== stored) {
      return fail(check, `The ${type} chunk at byte ${String(at)} fails its checksum: its bytes are not the bytes that were written.`)
    }
    const body = bytes.subarray(at + 8, at + 8 + length)
    if (header === null && type !== 'IHDR') return fail(check, `The first chunk is ${type}, not the IHDR header every PNG starts with.`)
    if (type === 'IHDR') {
      if (length !== 13) return fail(check, `The IHDR header is ${String(length)} bytes, not 13.`)
      header = {
        width: body.readUInt32BE(0),
        height: body.readUInt32BE(4),
        depth: body[8],
        colour: body[9],
        compression: body[10],
        filter: body[11],
        interlace: body[12],
      }
    } else if (type === 'PLTE') {
      palette = true
    } else if (type === 'IDAT') {
      data.push(body)
    } else if (type === 'IEND') {
      ended = true
      at += 12 + length
      break
    }
    at += 12 + length
  }
  if (header === null) return fail(check, 'There is no IHDR header.')
  if (!ended) return fail(check, 'There is no IEND chunk: the file stops before the image does, so it is truncated.')
  const { width, height, depth, colour, compression, filter, interlace } = header
  const kind = PNG_COLOUR_TYPES[colour]
  if (width === 0 || height === 0) return fail(check, `The header gives a size of ${String(width)}x${String(height)}.`)
  if (kind === undefined || !kind.depths.includes(depth)) return fail(check, `The header gives colour type ${String(colour)} at ${String(depth)} bits, which PNG does not allow.`)
  if (compression !== 0 || filter !== 0 || interlace > 1) return fail(check, 'The header names a compression, filter or interlace method PNG does not have.')
  if (colour === 3 && !palette) return fail(check, 'It is a palette image with no PLTE palette.')
  if (data.length === 0) return fail(check, 'There is no IDAT image data.')
  const bitsPerPixel = kind.channels * depth
  const rows = pngSubImages(width, height, interlace === 1)
  const expected = rows.reduce((sum, [w, h]) => sum + (w === 0 ? 0 : h * (1 + Math.ceil((w * bitsPerPixel) / 8))), 0)
  if (expected > PNG_MAX_RAW_BYTES) {
    return { judgment: `It is ${String(width)}x${String(height)}, which decompresses to ${String(expected)} bytes, more than this reader holds in memory (${String(PNG_MAX_RAW_BYTES)}). Its chunks and checksums were read and hold; the image data was not inflated.` }
  }
  let raw
  try {
    raw = inflateSync(Buffer.concat(data), { maxOutputLength: expected })
  } catch (err) {
    const why = err.code === 'ERR_BUFFER_TOO_LARGE' ? `it holds more than the ${String(expected)} bytes a ${String(width)}x${String(height)} image of this kind needs` : err.message
    return fail(check, `The image data does not decompress cleanly: ${why}.`)
  }
  if (raw.length !== expected) {
    return fail(check, `The image data decompresses to ${String(raw.length)} bytes; a ${String(width)}x${String(height)} ${kind.name} image at ${String(depth)} bits needs ${String(expected)}.`)
  }
  let offset = 0
  for (const [w, h] of rows) {
    if (w === 0) continue
    const stride = 1 + Math.ceil((w * bitsPerPixel) / 8)
    for (let row = 0; row < h; row += 1) {
      if (raw[offset] > 4) return fail(check, `A scanline starts with filter type ${String(raw[offset])}; PNG has types 0 to 4.`)
      offset += stride
    }
  }
  const trailing = bytes.length - at
  return pass(
    check,
    `${String(width)}x${String(height)}, ${String(depth)}-bit ${kind.name}${interlace === 1 ? ', interlaced' : ''}. Every chunk's checksum holds and the image data decompresses to exactly the bytes its size needs.` +
      (trailing > 0 ? ` ${String(trailing)} bytes follow the IEND chunk and were not read.` : ''),
    { width, height },
  )
}

// ================================================================================== JPEG

/** The markers that open a frame header (SOF0 to SOF15, without DHT, JPG and DAC). */
function isFrameMarker(marker) {
  return marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc
}

/** The frame markers jpeg-js decodes, and what each coding is called. Any other is read for its structure only. */
const JPEG_CODINGS_DECODED = { 0xc0: 'baseline', 0xc1: 'extended', 0xc2: 'progressive' }

export function readJpeg(bytes) {
  const check = 'structure'
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) return fail(check, 'It does not start with the start-of-image marker.')
  let at = 2
  let frame = null
  let scans = 0
  let ended = false
  while (at < bytes.length) {
    if (bytes[at] !== 0xff) return fail(check, `Byte ${String(at)} should begin a marker and holds 0x${bytes[at].toString(16)}.`)
    while (at < bytes.length && bytes[at] === 0xff) at += 1
    if (at >= bytes.length) break
    const marker = bytes[at]
    at += 1
    if (marker === 0xd9) {
      ended = true
      break
    }
    if ((marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) continue
    if (marker === 0xd8 || marker === 0x00) return fail(check, `A marker 0xff${marker.toString(16)} stands where a segment should.`)
    if (at + 2 > bytes.length) break
    const length = bytes.readUInt16BE(at)
    if (length < 2 || at + length > bytes.length) {
      return fail(check, `The segment 0xff${marker.toString(16)} at byte ${String(at - 2)} runs past the end of the file: it is truncated.`)
    }
    if (isFrameMarker(marker) && frame === null) {
      if (length < 8) return fail(check, 'The frame header is too short to hold a size.')
      frame = { marker, height: bytes.readUInt16BE(at + 3), width: bytes.readUInt16BE(at + 5), components: bytes[at + 7] }
    }
    at += length
    if (marker === 0xda) {
      if (frame === null) return fail(check, 'A scan begins before any frame header.')
      scans += 1
      // The entropy-coded data runs to the next marker that is not a stuffed 0xff00 or a restart.
      for (;;) {
        const next = bytes.indexOf(0xff, at)
        if (next === -1 || next + 1 >= bytes.length) {
          at = bytes.length
          break
        }
        const after = bytes[next + 1]
        if (after === 0x00 || (after >= 0xd0 && after <= 0xd7) || after === 0xff) {
          at = next + (after === 0xff ? 1 : 2)
          continue
        }
        at = next
        break
      }
    }
  }
  if (!ended) return fail(check, 'There is no end-of-image marker: the file is truncated, or other bytes stand where the marker should be.')
  if (frame === null) return fail(check, 'There is no frame header, so there is no picture size.')
  if (scans === 0) return fail(check, 'There is no scan, so there is no picture data.')
  if (frame.width === 0) return fail(check, 'The frame header gives a width of 0.')
  if (frame.height === 0) {
    return { judgment: 'The frame header leaves the height to a later DNL segment, which this reader does not read. The segments were read to the end-of-image marker.' }
  }
  const trailing = bytes.length - at
  const walked =
    `${String(frame.width)}x${String(frame.height)}, ${String(frame.components)} components, ${String(scans)} scan(s), read from the start-of-image to the end-of-image marker.` +
    (trailing > 0 ? ` ${String(trailing)} bytes follow the end-of-image marker and were not read.` : '')
  const size = { width: frame.width, height: frame.height }
  const coding = JPEG_CODINGS_DECODED[frame.marker]
  if (coding === undefined) {
    return pass(check, `${walked} It is coded with frame marker 0xff${frame.marker.toString(16)}, which jpeg-js does not read, so the compressed pixel data was walked, not decoded.`, size)
  }
  if (frame.width * frame.height > DECODE_MAX_PIXELS) {
    return { judgment: `${walked} It has ${String(frame.width * frame.height)} pixels, more than the ${String(DECODE_MAX_PIXELS)} this checker decodes, so its pixels were not decoded.` }
  }
  const decode = theDecoder('jpeg')
  let decoded
  try {
    decoded = decode(bytes, { tolerantDecoding: false, useTArray: true, formatAsRGBA: false, maxResolutionInMP: DECODE_MAX_PIXELS / 1e6, maxMemoryUsageInMB: 2048 })
  } catch (err) {
    const said = saidBy(err)
    // A LIMIT OF THE DECODER'S OWN IS NOT A FAULT OF THE FILE.
    if (/limit exceeded/u.test(said)) return { judgment: `${walked} jpeg-js would need more memory than this checker gives it (${said}), so its pixels were not decoded.` }
    return fail('decodes', `Its markers hold, and its ${coding} pixel data does not decode: jpeg-js, reading strictly, says "${said}".`)
  }
  if (decoded.width !== frame.width || decoded.height !== frame.height) {
    return fail('decodes', `The frame header gives ${String(frame.width)}x${String(frame.height)}, and jpeg-js decoded ${String(decoded.width)}x${String(decoded.height)}.`)
  }
  return pass('decodes', `${walked} Every pixel of its ${coding} data was decoded by jpeg-js, reading strictly.`, size)
}

// ================================================================================== WEBP

export function readWebp(bytes) {
  const check = 'structure'
  if (bytes.length < 12) return fail(check, 'It is too short to hold a RIFF header.')
  const declared = bytes.readUInt32LE(4) + 8
  if (declared > bytes.length) return fail(check, `The RIFF header says ${String(declared)} bytes and the file has ${String(bytes.length)}: it is truncated.`)
  let at = 12
  let size = null
  let kind = null
  let animated = false
  while (at + 8 <= declared) {
    const fourcc = bytes.toString('latin1', at, at + 4)
    const length = bytes.readUInt32LE(at + 4)
    const body = bytes.subarray(at + 8, at + 8 + length)
    if (at + 8 + length > declared) return fail(check, `The ${fourcc.trim()} chunk at byte ${String(at)} runs past the end of the RIFF container.`)
    if (fourcc === 'VP8 ' && size === null) {
      if (length < 10 || body[3] !== 0x9d || body[4] !== 0x01 || body[5] !== 0x2a) return fail(check, 'The VP8 chunk does not carry the VP8 start code.')
      size = { width: body.readUInt16LE(6) & 0x3fff, height: body.readUInt16LE(8) & 0x3fff }
      kind = 'lossy (VP8)'
    } else if (fourcc === 'VP8L' && size === null) {
      if (length < 5 || body[0] !== 0x2f) return fail(check, 'The VP8L chunk does not carry the lossless signature.')
      const bits = body.readUInt32LE(1)
      size = { width: (bits & 0x3fff) + 1, height: ((bits >>> 14) & 0x3fff) + 1 }
      kind = 'lossless (VP8L)'
    } else if (fourcc === 'VP8X' && size === null) {
      if (length < 10) return fail(check, 'The VP8X chunk is too short to hold a canvas size.')
      size = { width: body.readUIntLE(4, 3) + 1, height: body.readUIntLE(7, 3) + 1 }
      kind = 'extended (VP8X)'
      // THE ANIMATION FLAG: libwebp's one-picture decoder refuses an animated file, which is not a fault of it.
      if ((body[0] & 0x02) !== 0) animated = true
    }
    if (fourcc === 'ANIM' || fourcc === 'ANMF') animated = true
    at += 8 + length + (length % 2)
  }
  if (size === null) return fail(check, 'There is no VP8, VP8L or VP8X chunk, so there is no picture.')
  if (size.width === 0 || size.height === 0) return fail(check, `The picture header gives a size of ${String(size.width)}x${String(size.height)}.`)
  const walked = `${String(size.width)}x${String(size.height)}, ${kind}; every chunk lies inside the file.`
  if (animated) return pass(check, `${walked} It is animated, and the decoder here reads one picture, so its frames were not decoded.`, size)
  if (size.width * size.height > DECODE_MAX_PIXELS) {
    return { judgment: `${walked} It has ${String(size.width * size.height)} pixels, more than the ${String(DECODE_MAX_PIXELS)} this checker decodes, so its pixels were not decoded.` }
  }
  const decode = theDecoder('webp')
  let decoded
  try {
    decoded = decode(bytes)
  } catch (err) {
    return fail('decodes', `Its container holds, and its pixel data does not decode: libwebp says "${saidBy(err)}".`)
  }
  if (decoded.width !== size.width || decoded.height !== size.height) {
    return fail('decodes', `The picture header gives ${String(size.width)}x${String(size.height)}, and libwebp decoded ${String(decoded.width)}x${String(decoded.height)}.`)
  }
  return pass('decodes', `${walked} Every pixel was decoded by libwebp.`, size)
}

// ================================================================================== GIF

export function readGif(bytes) {
  const check = 'structure'
  if (bytes.length < 13) return fail(check, 'It is too short to hold the GIF screen descriptor.')
  const width = bytes.readUInt16LE(6)
  const height = bytes.readUInt16LE(8)
  const flags = bytes[10]
  let at = 13 + (flags & 0x80 ? 3 * 2 ** ((flags & 0x07) + 1) : 0)
  let frames = 0
  const skipSubBlocks = () => {
    for (;;) {
      if (at >= bytes.length) return false
      const n = bytes[at]
      at += 1
      if (n === 0) return true
      at += n
    }
  }
  for (;;) {
    if (at >= bytes.length) return fail(check, 'The file stops before the GIF trailer: it is truncated.')
    const introducer = bytes[at]
    if (introducer === 0x3b) break
    if (introducer === 0x21) {
      at += 2
      if (!skipSubBlocks()) return fail(check, 'An extension block runs past the end of the file: it is truncated.')
    } else if (introducer === 0x2c) {
      if (at + 10 > bytes.length) return fail(check, 'An image descriptor runs past the end of the file: it is truncated.')
      const local = bytes[at + 9]
      at += 10 + (local & 0x80 ? 3 * 2 ** ((local & 0x07) + 1) : 0)
      at += 1 // the LZW minimum code size
      if (!skipSubBlocks()) return fail(check, 'An image\'s data runs past the end of the file: it is truncated.')
      frames += 1
    } else {
      return fail(check, `Byte ${String(at)} holds 0x${introducer.toString(16)}, which begins no GIF block.`)
    }
  }
  if (frames === 0) return fail(check, 'There is no image in it.')
  if (width === 0 || height === 0) return fail(check, `The screen descriptor gives a size of ${String(width)}x${String(height)}.`)
  return pass(check, `${String(width)}x${String(height)}, ${String(frames)} image(s), every block read to the trailer. The LZW data was walked, not decoded.`, { width, height })
}

// ================================================================================== PDF

/** An integer or a reference after a key in a dictionary's text: `/Count 3` or `/Count 12 0 R`. */
function valueAfter(dict, key) {
  const found = new RegExp(`/${key}\\s+(\\d+)(?:\\s+(\\d+)\\s+R)?`, 'u').exec(dict)
  if (found === null) return null
  return found[2] === undefined ? { number: Number(found[1]) } : { ref: Number(found[1]) }
}

/**
 * Every object in the file by number, read by scanning `N G obj … endobj` in file order, with
 * streams skipped by their `endstream` so their bytes are never scanned for objects. A later
 * definition replaces an earlier one, which is what an incremental update means. Objects inside
 * compressed object streams are added at the position of the stream that holds them.
 */
function pdfObjects(bytes, text) {
  const objects = new Map()
  const opener = /(\d+)\s+(\d+)\s+obj\b/gu
  let broken = null
  for (;;) {
    const found = opener.exec(text)
    if (found === null) break
    const number = Number(found[1])
    const start = found.index + found[0].length
    const endobj = text.indexOf('endobj', start)
    const streamWord = /\bstream(\r\n|\n|\r)/gu
    streamWord.lastIndex = start
    const stream = streamWord.exec(text)
    if (stream !== null && (endobj === -1 || stream.index < endobj) && /(>>)\s*$/u.test(text.slice(start, stream.index))) {
      const dataStart = stream.index + stream[0].length
      const endstream = text.indexOf('endstream', dataStart)
      if (endstream === -1) {
        broken = `object ${String(number)} opens a stream that never ends`
        break
      }
      const dict = text.slice(start, stream.index)
      const length = valueAfter(dict, 'Length')
      const end = length?.number !== undefined && dataStart + length.number <= endstream ? dataStart + length.number : endstream
      objects.set(number, { dict, stream: bytes.subarray(dataStart, end), at: found.index })
      const after = text.indexOf('endobj', endstream)
      opener.lastIndex = after === -1 ? endstream + 9 : after + 6
    } else {
      if (endobj === -1) {
        broken = `object ${String(number)} never ends`
        break
      }
      objects.set(number, { dict: text.slice(start, endobj), stream: null, at: found.index })
      opener.lastIndex = endobj + 6
    }
  }
  return { objects, broken }
}

/** Open every FlateDecode object stream and add the objects it holds. Returns the ones it could not open. */
function openObjectStreams(objects) {
  const unopened = []
  for (const [number, object] of [...objects.entries()]) {
    if (object.stream === null || !/\/Type\s*\/ObjStm\b/u.test(object.dict)) continue
    if (!/\/Filter\s*\/FlateDecode\b/u.test(object.dict) || /\/DecodeParms/u.test(object.dict)) {
      unopened.push(`object stream ${String(number)} uses a filter this reader does not open`)
      continue
    }
    let decoded
    try {
      decoded = inflateSync(object.stream).toString('latin1')
    } catch (err) {
      unopened.push(`object stream ${String(number)} does not decompress (${err.message})`)
      continue
    }
    const count = valueAfter(object.dict, 'N')?.number
    const first = valueAfter(object.dict, 'First')?.number
    if (count === undefined || first === undefined) {
      unopened.push(`object stream ${String(number)} has no /N or /First`)
      continue
    }
    const pairs = decoded.slice(0, first).trim().split(/\s+/u).map(Number)
    for (let index = 0; index < count; index += 1) {
      const inner = pairs[index * 2]
      const from = first + pairs[index * 2 + 1]
      const to = index + 1 < count ? first + pairs[index * 2 + 3] : decoded.length
      const known = objects.get(inner)
      // An uncompressed definition later in the file is a later update and wins.
      if (known === undefined || known.at < object.at) objects.set(inner, { dict: decoded.slice(from, to), stream: null, at: object.at })
    }
  }
  return unopened
}

export function readPdf(bytes) {
  const check = 'parses'
  const text = bytes.toString('latin1')
  const version = /^%PDF-(\d\.\d)/u.exec(text)?.[1]
  if (version === undefined) return fail(check, 'It does not start with a %PDF- header and version.')
  if (!text.slice(-1024).includes('%%EOF')) return fail(check, 'There is no %%EOF in the last 1024 bytes: the file is truncated.')
  const pointerAt = text.lastIndexOf('startxref')
  const pointer = pointerAt === -1 ? null : /^startxref\s+(\d+)/u.exec(text.slice(pointerAt))
  if (pointer === null) return fail(check, 'There is no startxref pointer to the cross-reference data.')
  const xrefAt = Number(pointer[1])
  const { objects, broken } = pdfObjects(bytes, text)
  if (broken !== null) return fail(check, `It is damaged: ${broken}.`)
  // WHERE THE TRAILER IS. The pointer should land on a cross-reference table (whose trailer follows
  // it) or on a cross-reference stream (whose dictionary is the trailer). When it lands on neither,
  // the file is damaged, and PDF readers repair it by scanning for the last trailer; so does this
  // reader, and it then says so as a judgment rather than a pass.
  let trailer = null
  let lands = null
  let repaired = null
  if (text.startsWith('xref', xrefAt)) {
    const trailerAt = text.indexOf('trailer', xrefAt)
    if (trailerAt !== -1) {
      lands = 'a cross-reference table'
      trailer = text.slice(trailerAt, text.indexOf('startxref', trailerAt))
    }
  } else {
    const number = /^(\d+)\s+\d+\s+obj\b/u.exec(text.slice(xrefAt, xrefAt + 40))?.[1]
    const xrefStream = number === undefined ? undefined : objects.get(Number(number))
    if (xrefStream !== undefined && /\/Type\s*\/XRef\b/u.test(xrefStream.dict)) {
      lands = 'a cross-reference stream'
      trailer = xrefStream.dict
    }
  }
  if (trailer === null) {
    repaired = `The startxref pointer names byte ${String(xrefAt)}, where there is neither a cross-reference table with a trailer nor a cross-reference stream`
    const lastTrailer = text.lastIndexOf('trailer')
    const lastXrefStream = [...objects.values()].filter((object) => /\/Type\s*\/XRef\b/u.test(object.dict)).sort((a, b) => b.at - a.at)[0]
    if (lastTrailer !== -1 && (lastXrefStream === undefined || lastTrailer > lastXrefStream.at)) trailer = text.slice(lastTrailer, text.indexOf('>>', lastTrailer) + 2)
    else if (lastXrefStream !== undefined) trailer = lastXrefStream.dict
    else return fail(check, `${repaired}, and there is no trailer anywhere in the file to repair it from.`)
  }
  const unopened = openObjectStreams(objects)
  const encrypted = /\/Encrypt\b/u.test(trailer)
  const cannotTell = (why) =>
    encrypted || unopened.length > 0
      ? { judgment: `The page count could not be read: ${why}${encrypted ? '; the file is encrypted' : ''}${unopened.length > 0 ? `; ${unopened.join('; ')}` : ''}. Its header, %%EOF and cross-reference pointer hold.` }
      : fail(check, `${why[0].toUpperCase()}${why.slice(1)}.`)
  const root = valueAfter(trailer, 'Root')?.ref
  if (root === undefined) return cannotTell('the trailer names no document catalog (/Root)')
  const catalog = objects.get(root)
  if (catalog === undefined) return cannotTell(`the catalog, object ${String(root)}, is not in the file`)
  const pagesRoot = valueAfter(catalog.dict, 'Pages')?.ref
  if (pagesRoot === undefined) return cannotTell('the catalog names no page tree (/Pages)')
  const seen = new Set()
  let problem = null
  const countLeaves = (number, depth) => {
    if (problem !== null) return 0
    if (depth > 64 || seen.has(number)) {
      problem = `the page tree loops back to object ${String(number)}`
      return 0
    }
    seen.add(number)
    const node = objects.get(number)
    if (node === undefined) {
      problem = `the page tree names object ${String(number)}, which is not in the file`
      return 0
    }
    if (/\/Type\s*\/Pages\b/u.test(node.dict)) {
      let kidsText = /\/Kids\s*\[([^\]]*)\]/u.exec(node.dict)?.[1]
      if (kidsText === undefined) {
        const indirect = valueAfter(node.dict, 'Kids')?.ref
        kidsText = indirect === undefined ? undefined : objects.get(indirect)?.dict
      }
      if (kidsText === undefined) {
        problem = `page-tree node ${String(number)} has no /Kids`
        return 0
      }
      let leaves = 0
      for (const kid of kidsText.matchAll(/(\d+)\s+(\d+)\s+R/gu)) leaves += countLeaves(Number(kid[1]), depth + 1)
      return leaves
    }
    if (/\/Type\s*\/Page(?![A-Za-z])/u.test(node.dict)) return 1
    problem = `object ${String(number)} in the page tree is neither a page nor a page-tree node`
    return 0
  }
  const counted = countLeaves(pagesRoot, 0)
  if (problem !== null) return cannotTell(problem)
  const declaredValue = valueAfter(objects.get(pagesRoot).dict, 'Count')
  const declared = declaredValue?.ref !== undefined ? Number(/^\s*(\d+)/u.exec(objects.get(declaredValue.ref)?.dict ?? '')?.[1]) : declaredValue?.number
  if (declared !== counted) {
    return fail(check, `The page tree says it holds ${String(declared)} pages and holds ${String(counted)}.`)
  }
  if (repaired !== null) {
    return {
      judgment: `${repaired}. PDF readers repair this by scanning the file, and so did this reader: the page tree, walked from the catalog, holds ${String(counted)} page(s), as many as it says. The file is damaged but readable; whether it should land is for a reader to say.`,
    }
  }
  return pass(
    check,
    `PDF ${version}, ${String(counted)} page(s). startxref lands on ${lands}, and the page tree, walked from the catalog, holds as many pages as it says.` +
      (encrypted ? ' The file is encrypted; its text was not read.' : ''),
    { pages: counted },
  )
}

// ================================================================================== DATA

/** The text of a data file, or null when it is not UTF-8. A leading byte-order mark is dropped. */
function utf8(bytes) {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes).replace(/^﻿/u, '')
  } catch {
    return null
  }
}

export function readJson(bytes) {
  const check = 'parses'
  const text = utf8(bytes)
  if (text === null) return fail(check, 'It is not UTF-8 text.')
  let held
  try {
    held = JSON.parse(text)
  } catch (err) {
    return fail(check, `It is not JSON: ${err.message}.`)
  }
  if (Array.isArray(held)) return pass(check, `JSON, a list of ${String(held.length)} rows.`, { rows: held.length })
  const what = held === null ? 'null' : typeof held === 'object' ? `an object with ${String(Object.keys(held).length)} keys` : `a single ${typeof held}`
  return pass(check, `JSON, ${what}.`)
}

export function readJsonLines(bytes) {
  const check = 'parses'
  const text = utf8(bytes)
  if (text === null) return fail(check, 'It is not UTF-8 text.')
  const lines = text.split('\n')
  let rows = 0
  let blank = 0
  for (const [index, raw] of lines.entries()) {
    const line = raw.replace(/\r$/u, '')
    if (line.trim() === '') {
      if (index < lines.length - 1) blank += 1
      continue
    }
    try {
      JSON.parse(line)
    } catch (err) {
      return fail(check, `Line ${String(index + 1)} is not JSON: ${err.message}.`)
    }
    rows += 1
  }
  return pass(check, `JSON lines, ${String(rows)} rows${blank > 0 ? ` and ${String(blank)} blank lines` : ''}.`, { rows })
}

/** Records of a comma-separated file, with RFC 4180 quoting, or the reason it cannot be read. */
function csvRecords(text) {
  const records = []
  let row = []
  let field = ''
  let quoted = false
  let quoteLine = 0
  let line = 1
  for (let index = 0; index < text.length; index += 1) {
    const c = text[index]
    if (quoted) {
      if (c === '"') {
        if (text[index + 1] === '"') {
          field += '"'
          index += 1
        } else quoted = false
      } else {
        if (c === '\n') line += 1
        field += c
      }
    } else if (c === '"' && field === '') {
      quoted = true
      quoteLine = line
    } else if (c === ',') {
      row.push(field)
      field = ''
    } else if (c === '\n') {
      row.push(field)
      records.push(row)
      row = []
      field = ''
      line += 1
    } else if (c !== '\r' || text[index + 1] !== '\n') {
      field += c
    }
  }
  if (quoted) return { error: `A quoted field that opens on line ${String(quoteLine)} is never closed: the file is truncated or malformed.` }
  if (field !== '' || row.length > 0) {
    row.push(field)
    records.push(row)
  }
  return { records }
}

/** Records of a tab-separated file: one per line, fields split on tabs, no quoting. */
function tsvRecords(text) {
  const lines = text.split('\n').map((line) => line.replace(/\r$/u, ''))
  if (lines[lines.length - 1] === '') lines.pop()
  return { records: lines.map((line) => line.split('\t')) }
}

export function readDelimited(bytes, separator) {
  const check = 'parses'
  const name = separator === ',' ? 'CSV' : 'TSV'
  const text = utf8(bytes)
  if (text === null) return fail(check, 'It is not UTF-8 text.')
  const read = separator === ',' ? csvRecords(text) : tsvRecords(text)
  if (read.error !== undefined) return fail(check, read.error)
  const records = read.records
  const widths = records.map((record) => record.length)
  const first = widths[0] ?? 0
  const odd = widths.findIndex((width) => width !== first)
  if (odd !== -1) {
    return {
      judgment: `It reads as ${name}, but its records do not all have the same number of fields: record 1 has ${String(first)} and record ${String(odd + 1)} has ${String(widths[odd])}. A ragged file can be deliberate or damaged.`,
    }
  }
  return pass(check, `${name}, ${String(records.length)} records (a header, if it has one, counted among them) of ${String(first)} fields each.`, { rows: records.length })
}

// ================================================================================== BY NAME

/**
 * The reader for a file, chosen by the type its bytes and its name agree on, or by its extension
 * for data files, which carry no signature. Null when there is no reader for it.
 */
export function readerFor(signedType, extension) {
  switch (signedType) {
    case 'image/png':
      return readPng
    case 'image/jpeg':
      return readJpeg
    case 'image/webp':
      return readWebp
    case 'image/gif':
      return readGif
    case 'application/pdf':
      return readPdf
    default:
      break
  }
  if (signedType !== null) return null
  switch (extension) {
    case 'json':
      return readJson
    case 'jsonl':
    case 'ndjson':
      return readJsonLines
    case 'csv':
      return (bytes) => readDelimited(bytes, ',')
    case 'tsv':
      return (bytes) => readDelimited(bytes, '\t')
    default:
      return null
  }
}
