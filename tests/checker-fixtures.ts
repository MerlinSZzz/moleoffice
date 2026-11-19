// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE FILES THE CHECKER TESTS READ, MADE HERE RATHER THAN FOUND.
 *
 * Shared by tests/each-file-type-is-read-as-deep-as-it-says.test.ts and
 * tests/a-files-changeset-lands-nothing-it-cannot-account-for.test.ts, which check the readers in
 * tools/checks/file-contents.mjs and the files checker that uses them.
 *
 * PNG and PDF files are BUILT here, byte by byte, so a test can break exactly one thing in one: a
 * checksum, a length, a page count, a pointer. The JPEG, WebP and GIF files below were written once
 * by Pillow 10.2.0 on 21 September 2026 (a 12x8 gradient; the GIF has two frames) and are embedded
 * as base64, because building a valid JPEG or WebP by hand is a decoder's worth of code. None of
 * these is an observation of anything: they are test inputs, made for these tests.
 */

import { createHash } from 'node:crypto'
import { crc32, deflateSync } from 'node:zlib'

/** The sha256 of some bytes, as the manifest writes it. */
export function sha256(bytes: Buffer | string): string {
  return createHash('sha256').update(bytes).digest('hex')
}

/** Pillow-made pictures, 12x8. */
export const PILLOW_MADE: Record<'jpeg' | 'jpegProgressive' | 'webpLossy' | 'webpLossless' | 'gif', Buffer> = Object.fromEntries(
  Object.entries({
  jpeg:
    '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAYEBQYFBAYGBQYHBwYIChAKCgkJChQODwwQFxQYGBcUFhYaHSUfGhsjHBYWICwg' +
    'IyYnKSopGR8tMC0oMCUoKSj/2wBDAQcHBwoIChMKChMoGhYaKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgo' +
    'KCgoKCgoKCgoKCgoKCj/wAARCAAIAAwDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAA' +
    'AgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6' +
    'Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXG' +
    'x8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREA' +
    'AgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5' +
    'OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPE' +
    'xcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwDktE+H/wB39z+ldrafD/8AcL+6/SiivFx2' +
    'a4nm+InhTOsX7L4uh//Z',
  jpegProgressive:
    '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAYEBQYFBAYGBQYHBwYIChAKCgkJChQODwwQFxQYGBcUFhYaHSUfGhsjHBYWICwg' +
    'IyYnKSopGR8tMC0oMCUoKSj/2wBDAQcHBwoIChMKChMoGhYaKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgo' +
    'KCgoKCgoKCgoKCgoKCj/wgARCAAIAAwDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAX/xAAVAQEBAAAAAAAAAAAA' +
    'AAAAAAABBP/aAAwDAQACEAMQAAABkWyI/8QAGBAAAgMAAAAAAAAAAAAAAAAAAAUCAyH/2gAIAQEAAQUCpXkV+f/EABkRAAEF' +
    'AAAAAAAAAAAAAAAAAAADBAUSMf/aAAgBAwEBPwGKeq10/8QAGBEAAgMAAAAAAAAAAAAAAAAAAAMEETH/2gAIAQIBAT8BfKZe' +
    'n//EABUQAQEAAAAAAAAAAAAAAAAAAAAx/9oACAEBAAY/Aoj/xAAWEAEBAQAAAAAAAAAAAAAAAAAAITH/2gAIAQEAAT8hyZT/' +
    '2gAMAwEAAgADAAAAEIP/xAAVEQEBAAAAAAAAAAAAAAAAAAAAgf/aAAgBAwEBPxCWf//EABQRAQAAAAAAAAAAAAAAAAAAAAD/' +
    '2gAIAQIBAT8QM//EABYQAQEBAAAAAAAAAAAAAAAAAADh8f/aAAgBAQABPxDISr//2Q==',
  webpLossy:
    'UklGRlAAAABXRUJQVlA4IEQAAADwAQCdASoMAAgAAUAmJbACdLoAAwhAXqAA/v0mUR69hsrGdI0QvEYd8Bf4Vspe/iTve/B8' +
    'YP7TP0ep3f+OfsYx0yQAAA==',
  webpLossless:
    'UklGRiwAAABXRUJQVlA4TB8AAAAvC8ABAJmM6H9sIqL/ASEBYYn/SyUDhmLIYgKQqiwBAA==',
  gif:
    'R0lGODlhDAAIAIQAAAAAZjMAZmYAZpkAZswAZgAzZjMzZmYzZpkzZswzZgBmZjNmZmZmZplmZsxmZgCZZjOZZmaZZpmZZsyZ' +
    'ZgDMZjPMZmbMZpnMZszMZgAAAAAAAAAAAAAAAAAAAAAAAAAAACH/C05FVFNDQVBFMi4wAwEAAAAh+QQACgAAACwAAAAADAAI' +
    'AAAIXAABAAgQQIDBAQMIKCwAwEAAAwIODEAwIAGBAgYyHtiIAEGCjwoULFjAoGSDkw4chFwAgaSEkxNSPoBAM4JNCTgnTKDw' +
    'oAKEChEsSLgwAcNOChUqWFh6oSkGDAEBACH5BAEKABkALAAAAAAMAAgAhAAAZjMAZmYAZpkAZswAZgAzZjMzZmYzZpkzZswz' +
    'ZgBmZjNmZmZmZplmZsxmZgCZZjOZZmaZZpmZZsyZZgDMZjPMZmbMZpnMZszMZgAAAAAAAAAAAAAAAAAAAAAAAAAAAAhWADEI' +
    'vHDBgsEKFShQwDCBoASDEBA+oDChogQJETJCgPDggYOPDRpkyMBgwQIFHh2EFFnS5MkEMBEgOEDTgIECBWAmkEnzgE0ABQgQ' +
    'GEBUgNEAAQAACAgAOw==',
  }).map(([name, text]) => [name, Buffer.from(text, 'base64')]),
) as Record<'jpeg' | 'jpegProgressive' | 'webpLossy' | 'webpLossless' | 'gif', Buffer>

// ================================================================================== PNG

/** One PNG chunk: length, type, data, and the CRC over type and data. */
export function pngChunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length)
  const typed = Buffer.concat([Buffer.from(type, 'latin1'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(typed))
  return Buffer.concat([length, typed, crc])
}

const CHANNELS: Record<number, number> = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }
const ADAM7 = [
  [0, 0, 8, 8],
  [4, 0, 8, 8],
  [0, 4, 4, 8],
  [2, 0, 4, 4],
  [0, 2, 2, 4],
  [1, 0, 2, 2],
  [0, 1, 1, 2],
] as const

export interface PngShape {
  width?: number
  height?: number
  colour?: number
  depth?: number
  interlace?: 0 | 1
  /** The decompressed scanlines, instead of the right ones, to make a PNG that lies. */
  raw?: Buffer
  /** The filter byte every scanline starts with; PNG allows 0 to 4. */
  filter?: number
}

/** A valid PNG of the given shape, unless `raw` or `filter` says otherwise. */
export function png(shape: PngShape = {}): Buffer {
  const { width = 5, height = 3, colour = 2, depth = 8, interlace = 0, filter = 0 } = shape
  const bitsPerPixel = (CHANNELS[colour] ?? 3) * depth
  const passes = interlace === 1
    ? ADAM7.map(([xs, ys, dx, dy]) => [width > xs ? Math.ceil((width - xs) / dx) : 0, height > ys ? Math.ceil((height - ys) / dy) : 0])
    : [[width, height]]
  const lines: Buffer[] = []
  for (const [w, h] of passes) {
    if ((w ?? 0) === 0) continue
    for (let row = 0; row < (h ?? 0); row += 1) {
      lines.push(Buffer.concat([Buffer.from([filter]), Buffer.alloc(Math.ceil(((w ?? 0) * bitsPerPixel) / 8), 0x5a)]))
    }
  }
  const header = Buffer.alloc(13)
  header.writeUInt32BE(width, 0)
  header.writeUInt32BE(height, 4)
  header[8] = depth
  header[9] = colour
  header[12] = interlace
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', header),
    ...(colour === 3 ? [pngChunk('PLTE', Buffer.alloc(3 * 4, 0x33))] : []),
    pngChunk('IDAT', deflateSync(shape.raw ?? Buffer.concat(lines))),
    pngChunk('IEND', Buffer.alloc(0)),
  ])
}

// ================================================================================== PDF

/** The objects of a small page tree: catalog 1, page-tree node 2, pages 3 onward. */
function pageTreeObjects(pages: number, count: number): string[] {
  const kids = Array.from({ length: pages }, (_, index) => `${String(index + 3)} 0 R`).join(' ')
  return [
    '<< /Type /Catalog /Pages 2 0 R >>',
    `<< /Type /Pages /Kids [${kids}] /Count ${String(count)} >>`,
    ...Array.from({ length: pages }, () => '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 100] >>'),
  ]
}

export interface PdfShape {
  pages?: number
  /** What the page-tree node claims as /Count, when it should lie. */
  count?: number
  /** Where startxref points, when it should point somewhere wrong. */
  pointer?: number
}

/** A PDF 1.4 with a classic cross-reference table and every object in the open. */
export function pdfClassic(shape: PdfShape = {}): Buffer {
  const { pages = 2 } = shape
  const objects = pageTreeObjects(pages, shape.count ?? pages)
  let text = '%PDF-1.4\n%âãÏÓ\n'
  const offsets: number[] = []
  for (const [index, body] of objects.entries()) {
    offsets.push(Buffer.byteLength(text, 'latin1'))
    text += `${String(index + 1)} 0 obj\n${body}\nendobj\n`
  }
  const xrefAt = Buffer.byteLength(text, 'latin1')
  text += `xref\n0 ${String(objects.length + 1)}\n0000000000 65535 f \n`
  for (const offset of offsets) text += `${String(offset).padStart(10, '0')} 00000 n \n`
  text += `trailer\n<< /Size ${String(objects.length + 1)} /Root 1 0 R >>\nstartxref\n${String(shape.pointer ?? xrefAt)}\n%%EOF\n`
  return Buffer.from(text, 'latin1')
}

/**
 * A PDF 1.5 whose catalog, page tree and pages all sit inside one compressed object stream, found
 * through a cross-reference stream: the shape most PDF writers produce today.
 */
export function pdfWithObjectStream(shape: PdfShape = {}): Buffer {
  const { pages = 3 } = shape
  const inner = pageTreeObjects(pages, shape.count ?? pages)
  const bodies: string[] = []
  const pairs: string[] = []
  let at = 0
  for (const [index, body] of inner.entries()) {
    pairs.push(`${String(index + 1)} ${String(at)}`)
    bodies.push(`${body}\n`)
    at += Buffer.byteLength(`${body}\n`, 'latin1')
  }
  const headerText = `${pairs.join(' ')}\n`
  const packed = deflateSync(Buffer.from(headerText + bodies.join(''), 'latin1'))
  const streamNumber = inner.length + 1
  const xrefNumber = inner.length + 2
  const parts: Buffer[] = [Buffer.from('%PDF-1.5\n%âãÏÓ\n', 'latin1')]
  const length = (): number => parts.reduce((sum, part) => sum + part.length, 0)
  const streamAt = length()
  parts.push(
    Buffer.from(`${String(streamNumber)} 0 obj\n<< /Type /ObjStm /N ${String(inner.length)} /First ${String(Buffer.byteLength(headerText, 'latin1'))} /Length ${String(packed.length)} /Filter /FlateDecode >>\nstream\n`, 'latin1'),
    packed,
    Buffer.from('\nendstream\nendobj\n', 'latin1'),
  )
  const xrefAt = length()
  const rows: Buffer[] = [Buffer.from([0, 0, 0, 0, 0, 0xff, 0xff])]
  for (let index = 0; index < inner.length; index += 1) {
    const row = Buffer.alloc(7)
    row[0] = 2
    row.writeUInt32BE(streamNumber, 1)
    row.writeUInt16BE(index, 5)
    rows.push(row)
  }
  for (const offset of [streamAt, xrefAt]) {
    const row = Buffer.alloc(7)
    row[0] = 1
    row.writeUInt32BE(offset, 1)
    rows.push(row)
  }
  const table = deflateSync(Buffer.concat(rows))
  parts.push(
    Buffer.from(`${String(xrefNumber)} 0 obj\n<< /Type /XRef /Size ${String(xrefNumber + 1)} /W [1 4 2] /Root 1 0 R /Length ${String(table.length)} /Filter /FlateDecode >>\nstream\n`, 'latin1'),
    table,
    Buffer.from(`\nendstream\nendobj\nstartxref\n${String(shape.pointer ?? xrefAt)}\n%%EOF\n`, 'latin1'),
  )
  return Buffer.concat(parts)
}
