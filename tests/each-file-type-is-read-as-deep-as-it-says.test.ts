// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * EACH FILE TYPE IS READ AS DEEP AS ITS CHECK SAYS, AND A BROKEN FILE IS CAUGHT AT THAT DEPTH.
 *
 * Decision R4 on the sandbox v1 spec asks for deterministic checks per file
 * type: pictures (signature, decoding, size), PDF (parses, page count), data (format and row
 * count). tools/checks/file-contents.mjs holds the readers and src/shared/file-signatures.ts holds
 * the signatures. Each case below breaks one thing a reader claims to look at and expects the
 * reader to say so; a reader that looked at less would pass the broken file and this file would go
 * red.
 *
 * The inputs are made in tests/checker-fixtures.ts. They were also read, once, by pdfinfo and by
 * Pillow on 21 September 2026 and agreed (2 and 3 pages; a 13x9 interlaced PNG). The readers were
 * compared with those two tools over 854 real files on this machine the same day: every
 * disagreement was a file the tools repair or decode past damage, and those are the cases that end
 * in a judgment here rather than a pass.
 *
 * JPEG AND WEBP PIXELS ARE DECODED since the sandbox v1 fix of the queue (22 September 2026), by the two
 * decoders playwright-core already carries in node_modules — jpeg-js and libwebp — and checked the same
 * day against Pillow over 594 real JPEG and WebP files on this machine: the same answer for every file
 * but one original with no end-of-image marker, which the structure walk fails first. A GIF is still read
 * for its structure only: nothing in node_modules decodes one.
 */

import { describe, expect, it } from 'vitest'

import { readDelimited, readGif, readJpeg, readJson, readJsonLines, readPdf, readPng, readWebp, readerFor } from '../tools/checks/file-contents.mjs'
import { typeOfBytes, typeOfExtension } from '../src/shared/file-signatures.ts'
import { PILLOW_MADE, png, pdfClassic, pdfWithObjectStream } from './checker-fixtures.ts'

interface Read {
  check?: string
  ok?: boolean
  detail?: string
  facts?: Record<string, number>
  judgment?: string
}

const read = (value: unknown): Read => value as Read

describe('the first bytes say what a file is, in one declaration', () => {
  it('recognises each type by its signature, and a file with none as none', () => {
    expect(typeOfBytes(png())).toBe('image/png')
    expect(typeOfBytes(PILLOW_MADE.jpeg)).toBe('image/jpeg')
    expect(typeOfBytes(PILLOW_MADE.webpLossy)).toBe('image/webp')
    expect(typeOfBytes(PILLOW_MADE.gif)).toBe('image/gif')
    expect(typeOfBytes(pdfClassic())).toBe('application/pdf')
    for (const zip of [[0x50, 0x4b, 0x03, 0x04], [0x50, 0x4b, 0x05, 0x06], [0x50, 0x4b, 0x07, 0x08]]) {
      expect(typeOfBytes(Buffer.from([...zip, 0, 0]))).toBe('application/zip')
    }
    expect(typeOfBytes(Buffer.from('# a note\n'))).toBeNull()
    expect(typeOfBytes(Buffer.from('RIFF\0\0\0\0WAVE'))).toBeNull()
  })

  it('reads an extension with or without its dot, in any case, and both spellings of jpeg', () => {
    expect(typeOfExtension('.PNG')).toBe('image/png')
    expect(typeOfExtension('jpg')).toBe('image/jpeg')
    expect(typeOfExtension('jpeg')).toBe('image/jpeg')
    expect(typeOfExtension('md')).toBeNull()
  })
})

describe('a PNG decodes: every checksum, and exactly the bytes its size needs', () => {
  it('passes PNGs of several shapes, with their size', () => {
    for (const shape of [{}, { interlace: 1 as const, width: 13, height: 9 }, { colour: 3, depth: 4 }, { colour: 6, depth: 16 }, { colour: 0, depth: 1, width: 9 }]) {
      const result = read(readPng(png(shape)))
      expect(result.ok, result.detail).toBe(true)
      expect(result.check).toBe('decodes')
    }
    expect(read(readPng(png({ width: 13, height: 9 }))).facts).toEqual({ width: 13, height: 9 })
  })

  it('fails a chunk whose bytes no longer match its checksum', () => {
    const broken = png()
    broken.writeUInt8(broken.readUInt8(broken.length - 20) ^ 0xff, broken.length - 20)
    const result = read(readPng(broken))
    expect(result.ok).toBe(false)
    expect(result.detail).toContain('checksum')
  })

  it('fails a PNG cut short', () => {
    const result = read(readPng(png().subarray(0, 40)))
    expect(result.ok).toBe(false)
    expect(result.detail).toContain('truncated')
  })

  it('fails image data that decompresses to fewer bytes than the header promises', () => {
    const result = read(readPng(png({ raw: Buffer.alloc(10) })))
    expect(result.ok).toBe(false)
    expect(result.detail).toContain('decompresses to 10 bytes')
  })

  it('fails a scanline with a filter type PNG does not have', () => {
    const result = read(readPng(png({ filter: 9 })))
    expect(result.ok).toBe(false)
    expect(result.detail).toContain('filter type 9')
  })
})

/** The first byte of a JPEG's scan data: just past its start-of-scan header. */
function scanDataOf(jpeg: Buffer): number {
  const sos = jpeg.indexOf(Buffer.from([0xff, 0xda]))
  return sos + 2 + jpeg.readUInt16BE(sos + 2)
}

/**
 * AN ANIMATED WEBP, made by Pillow 10.2.0 on 22 September 2026: two 12x8 lossless frames (VP8X with the
 * animation flag, ANIM, two ANMF). Pillow reads it as animated, with 2 frames.
 */
const ANIMATED_WEBP = Buffer.from(
  'UklGRogAAABXRUJQVlA4WAoAAAACAAAACwAABwAAQU5JTQYAAAAAAAAAAABBTk1GKgAAAAAAAAAAAAsAAAcAAGQAAAJWUDhMEQAAAC8LwAEAB1CPItej/4GI6H8AAEFOTUYqAAAAAAAAAAAACwAABwAAZAAAAFZQOEwRAAAALwvAAQAHUOR61KP/gYjofwAA',
  'base64',
)

describe('a JPEG and a WebP are decoded by the decoders node_modules already holds, and a GIF is read for its structure', () => {
  it('decodes the Pillow-made JPEGs and WebPs with their size, and reads the GIF for its structure only, saying so', () => {
    for (const [name, bytes, reader, decoder] of [
      ['jpeg', PILLOW_MADE.jpeg, readJpeg, 'jpeg-js'],
      ['progressive jpeg', PILLOW_MADE.jpegProgressive, readJpeg, 'jpeg-js'],
      ['lossy webp', PILLOW_MADE.webpLossy, readWebp, 'libwebp'],
      ['lossless webp', PILLOW_MADE.webpLossless, readWebp, 'libwebp'],
    ] as const) {
      const result = read(reader(bytes))
      expect(result.ok, `${name}: ${String(result.detail)}`).toBe(true)
      expect(result.check, name).toBe('decodes')
      expect(result.facts).toEqual({ width: 12, height: 8 })
      expect(result.detail).toContain(`decoded by ${decoder}`)
    }
    const gif = read(readGif(PILLOW_MADE.gif))
    expect(gif.ok, String(gif.detail)).toBe(true)
    expect(gif.check).toBe('structure')
    expect(gif.facts).toEqual({ width: 12, height: 8 })
    expect(gif.detail).toMatch(/not decoded/u)
  })

  it('fails a JPEG whose markers hold and whose pixel data does not decode', () => {
    const jpeg = PILLOW_MADE.jpeg
    // THE SCAN CUT TO THREE BYTES, with the end-of-image marker kept: every segment the walk reads still holds.
    const cut = Buffer.concat([jpeg.subarray(0, scanDataOf(jpeg) + 3), jpeg.subarray(jpeg.length - 2)])
    const result = read(readJpeg(cut))
    expect(result.ok).toBe(false)
    expect(result.check).toBe('decodes')
    expect(result.detail).toContain('does not decode: jpeg-js, reading strictly, says')
  })

  it('fails a WebP whose container holds and whose pixel data does not decode', () => {
    const webp = Buffer.from(PILLOW_MADE.webpLossy)
    // FOUR BYTES OF THE VP8 BITSTREAM TURNED OVER, past its frame header: the chunks and sizes are untouched.
    for (let at = 30; at < 34; at += 1) webp[at] = webp[at]! ^ 0xff
    const result = read(readWebp(webp))
    expect(result.ok).toBe(false)
    expect(result.check).toBe('decodes')
    expect(result.detail).toContain('does not decode: libwebp says')
  })

  it('reads a JPEG coded in a way jpeg-js does not read, and an animated WebP, for their structure only, and says so', () => {
    const jpeg = Buffer.from(PILLOW_MADE.jpeg)
    const frame = jpeg.indexOf(Buffer.from([0xff, 0xc0]))
    jpeg[frame + 1] = 0xc9 // SOF9: arithmetic coding, which jpeg-js refuses as an unknown marker
    const coded = read(readJpeg(jpeg))
    expect(coded.ok, String(coded.detail)).toBe(true)
    expect(coded.check).toBe('structure')
    expect(coded.detail).toContain('frame marker 0xffc9, which jpeg-js does not read')
    const animated = read(readWebp(ANIMATED_WEBP))
    expect(animated.ok, String(animated.detail)).toBe(true)
    expect(animated.check).toBe('structure')
    expect(animated.facts).toEqual({ width: 12, height: 8 })
    expect(animated.detail).toContain('It is animated')
  })

  it('fails a JPEG that stops before its end-of-image marker', () => {
    const result = read(readJpeg(PILLOW_MADE.jpeg.subarray(0, PILLOW_MADE.jpeg.length - 2)))
    expect(result.ok).toBe(false)
    expect(result.detail).toContain('end-of-image')
  })

  it('fails a JPEG whose segment runs past the end of the file', () => {
    const result = read(readJpeg(PILLOW_MADE.jpeg.subarray(0, 30)))
    expect(result.ok).toBe(false)
    expect(result.detail).toContain('truncated')
  })

  it('fails a WebP shorter than its RIFF header says', () => {
    const result = read(readWebp(PILLOW_MADE.webpLossy.subarray(0, 60)))
    expect(result.ok).toBe(false)
    expect(result.detail).toContain('truncated')
  })

  it('fails a GIF that stops before its trailer', () => {
    const result = read(readGif(PILLOW_MADE.gif.subarray(0, PILLOW_MADE.gif.length - 1)))
    expect(result.ok).toBe(false)
    expect(result.detail).toContain('trailer')
  })
})

describe('a PDF parses, and its page tree holds as many pages as it says', () => {
  it('counts the pages of a classic PDF and of one whose objects are compressed', () => {
    expect(read(readPdf(pdfClassic({ pages: 2 }))).facts).toEqual({ pages: 2 })
    const packed = read(readPdf(pdfWithObjectStream({ pages: 3 })))
    expect(packed.ok, packed.detail).toBe(true)
    expect(packed.facts).toEqual({ pages: 3 })
    expect(packed.detail).toContain('cross-reference stream')
  })

  it('fails a page tree whose /Count is not the pages it holds', () => {
    const result = read(readPdf(pdfClassic({ pages: 2, count: 5 })))
    expect(result.ok).toBe(false)
    expect(result.detail).toContain('says it holds 5 pages and holds 2')
  })

  it('fails a PDF cut short, with no %%EOF', () => {
    const whole = pdfClassic({ pages: 2 })
    const result = read(readPdf(whole.subarray(0, whole.length - 40)))
    expect(result.ok).toBe(false)
    expect(result.detail).toContain('%%EOF')
  })

  it('hands on a PDF whose pointer lands on nothing, after repairing it the way readers do', () => {
    for (const bytes of [pdfClassic({ pages: 2, pointer: 3 }), pdfWithObjectStream({ pages: 3, pointer: 5 })]) {
      const result = read(readPdf(bytes))
      expect(result.ok).toBeUndefined()
      expect(result.judgment).toMatch(/startxref pointer names byte \d+/u)
      expect(result.judgment).toMatch(/holds [23] page/u)
    }
  })
})

describe('data files parse, and say how many rows they hold', () => {
  it('counts the rows of JSON, JSON lines, CSV and TSV', () => {
    expect(read(readJson(Buffer.from('[{"a":1},{"a":2}]'))).facts).toEqual({ rows: 2 })
    expect(read(readJsonLines(Buffer.from('{"a":1}\n{"a":2}\n{"a":3}\n'))).facts).toEqual({ rows: 3 })
    expect(read(readDelimited(Buffer.from('a,b\n"1, one","x ""q"""\n2,"two\nlines"\n'), ',')).facts).toEqual({ rows: 3 })
    expect(read(readDelimited(Buffer.from('a\tb\n1\t2\n'), '\t')).facts).toEqual({ rows: 2 })
  })

  it('fails JSON that does not parse, a JSON line that does not, and a CSV quote never closed', () => {
    expect(read(readJson(Buffer.from('{"a":'))).ok).toBe(false)
    const line = read(readJsonLines(Buffer.from('{"a":1}\n{"a":\n')))
    expect(line.ok).toBe(false)
    expect(line.detail).toContain('Line 2')
    const quote = read(readDelimited(Buffer.from('a,b\n1,"never closed\n'), ','))
    expect(quote.ok).toBe(false)
    expect(quote.detail).toContain('never closed')
    expect(read(readJson(Buffer.from([0xff, 0xfe, 0x00]))).detail).toContain('not UTF-8')
  })

  it('hands on a ragged CSV rather than calling it right or wrong', () => {
    const result = read(readDelimited(Buffer.from('a,b,c\n1,2,3\n4,5\n'), ','))
    expect(result.judgment).toContain('record 3 has 2')
  })
})

describe('a reader is chosen by the type the bytes and the name agree on', () => {
  it('has a reader for every picture and document type it names, none for a zip, and data by extension', () => {
    expect(readerFor('image/png', 'png')).toBe(readPng)
    expect(readerFor('application/pdf', 'pdf')).toBe(readPdf)
    expect(readerFor('application/zip', 'zip')).toBeNull()
    expect(readerFor(null, 'jsonl')).toBe(readJsonLines)
    expect(readerFor(null, 'md')).toBeNull()
    // A zip that is named .csv is not read as a CSV: the bytes said zip first.
    expect(readerFor('application/zip', 'csv')).toBeNull()
  })
})
