// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A SMALL ZIP WRITER: the few hundred bytes of the format this export needs, and no dependency.
 *
 * Node ships `zlib.deflateRawSync` and every other part of a zip is plumbing: a local header, the
 * compressed bytes, a central directory and an end record. Adding a library for that would be a new
 * dependency and a second set of rules about names and sizes. This file is the first set.
 *
 * WHAT IT DOES NOT DO. It does not write to disk and it does not stream: it takes a list of entries
 * and answers one Buffer. The export's own size line (256 MiB of file bytes before compression, and
 * 10,000 files) keeps the whole zip bounded; if that line ever has to grow past what memory holds,
 * the next step is a streaming writer, not a larger buffer.
 *
 * THE SAME INPUT GIVES THE SAME ZIP ON THE SAME BUILD. Every entry's timestamp is one fixed moment,
 * so the zip does not carry the hour somebody exported at, and the bytes do not change when only the
 * clock did. Deflate is deterministic for one build of zlib, which is the machine's.
 *
 * NO NAME CAN TALK ITS WAY OUT OF THE ZIP. Before an entry is written its name is checked: a
 * backslash, a leading slash, an empty segment, a `..` segment, a NUL, or text this build cannot
 * write back as the same bytes is refused. A record names a file, and a file's name is the whole of
 * its say about where it goes.
 */

import { deflateRawSync } from 'node:zlib'

/** One file that goes into the zip, under a name that is already the name it will have inside. */
export interface ZipEntry {
  name: string
  bytes: Buffer
}

/**
 * THE ZIP FORMAT'S OWN LIMITS, reached before the format is. An archive holds at most 65,535
 * entries, and this writer holds the whole archive in one Buffer, so the archive's own byte count
 * cannot pass 4 GiB. The export's line keeps both out of reach today; the writer refuses rather than
 * writing a zip that a reader cannot open whole.
 */
export const ZIP_MOST_ENTRIES = 65_535
export const ZIP_MOST_BYTES = 4_294_967_296

/** The fixed moment every entry carries: 1980-01-01 00:00:00, the earliest a zip can name. */
const FIXED_DOS_TIME = 0
const FIXED_DOS_DATE = 0x0021

const LOCAL_HEADER = 0x04034b50
const CENTRAL_HEADER = 0x02014b50
const END_RECORD = 0x06054b50
/** General purpose bit 11: the name is UTF-8. */
const UTF8_NAMES = 0x0800
const STORED = 0
const DEFLATED = 8
const MOST_NAME_BYTES = 65_535

const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let at = 0; at < 256; at += 1) {
    let value = at
    for (let bit = 0; bit < 8; bit += 1) value = (value & 1) === 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1
    table[at] = value >>> 0
  }
  return table
})()

/** The CRC-32 every zip reader checks each entry against. */
export function crc32(bytes: Buffer): number {
  let crc = 0xffffffff
  for (const byte of bytes) crc = (CRC_TABLE[(crc ^ byte) & 0xff] as number) ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}

/**
 * WHY A NAME CANNOT GO INTO A ZIP, or null when it can.
 *
 * The export asks this before it reads a file, so a file whose name the zip cannot carry is left out
 * with a reason in the manifest rather than turning the whole export into an error at the last step.
 */
export function whyAZipEntryNameIsUnfit(name: string): string | null {
  if (name === '') return 'the name is empty'
  if (name.includes('\0')) return 'the name holds a NUL byte'
  if (name.includes('\\')) return 'the name holds a backslash'
  if (name.startsWith('/')) return 'the name begins with a slash'
  const segments = name.split('/')
  if (segments.some((segment) => segment === '')) return 'the name holds an empty segment, so it names no file'
  if (segments.some((segment) => segment === '..')) return 'the name holds a ".." segment, which climbs out of the zip'
  if (Buffer.from(name, 'utf8').toString('utf8') !== name) return 'the name is not text this machine can write and read back'
  const length = Buffer.byteLength(name, 'utf8')
  if (length > MOST_NAME_BYTES) return `the name is ${String(length)} bytes, and a zip name holds ${String(MOST_NAME_BYTES)}`
  return null
}

/** The name exactly as it will be written, or a refusal naming what is wrong with it. */
function checkedName(name: string): Buffer {
  const wrong = whyAZipEntryNameIsUnfit(name)
  if (wrong !== null) {
    throw new Error(`The zip entry name ${JSON.stringify(name)} cannot be written: ${wrong}.`)
  }
  return Buffer.from(name, 'utf8')
}

interface LocalPart {
  name: Buffer
  method: number
  crc: number
  raw: number
  packed: Buffer
  offset: number
}

/**
 * WRITE ONE ZIP from the entries, in the order given.
 *
 * Each entry is deflated, and kept whole when compression would make it larger, which is usual for
 * png and jpeg bytes. The central directory is written after the entries, then the end record.
 */
export function writeZip(entries: readonly ZipEntry[]): Buffer {
  if (entries.length > ZIP_MOST_ENTRIES) {
    throw new Error(`A zip holds at most ${String(ZIP_MOST_ENTRIES)} entries, and this export names ${String(entries.length)}.`)
  }
  const seen = new Set<string>()
  const parts: LocalPart[] = []
  let offset = 0
  for (const entry of entries) {
    const name = checkedName(entry.name)
    const key = name.toString('utf8')
    if (seen.has(key)) throw new Error(`The zip entry name ${JSON.stringify(entry.name)} is used twice.`)
    seen.add(key)
    const crc = crc32(entry.bytes)
    const deflated = deflateRawSync(entry.bytes, { level: 6 })
    const useDeflated = deflated.length < entry.bytes.length
    const packed = useDeflated ? deflated : entry.bytes
    const part: LocalPart = {
      name,
      method: useDeflated ? DEFLATED : STORED,
      crc,
      raw: entry.bytes.length,
      packed,
      offset,
    }
    parts.push(part)
    offset += 30 + name.length + packed.length
    if (offset > ZIP_MOST_BYTES) {
      throw new Error(`This zip would be ${String(offset)} bytes, and a zip this writer holds whole cannot pass ${String(ZIP_MOST_BYTES)}.`)
    }
  }

  const local: Buffer[] = []
  for (const part of parts) {
    const header = Buffer.alloc(30)
    header.writeUInt32LE(LOCAL_HEADER, 0)
    header.writeUInt16LE(20, 4)
    header.writeUInt16LE(UTF8_NAMES, 6)
    header.writeUInt16LE(part.method, 8)
    header.writeUInt16LE(FIXED_DOS_TIME, 10)
    header.writeUInt16LE(FIXED_DOS_DATE, 12)
    header.writeUInt32LE(part.crc, 14)
    header.writeUInt32LE(part.packed.length, 18)
    header.writeUInt32LE(part.raw, 22)
    header.writeUInt16LE(part.name.length, 26)
    header.writeUInt16LE(0, 28)
    local.push(header, part.name, part.packed)
  }

  const centralOffset = offset
  const central: Buffer[] = []
  for (const part of parts) {
    const header = Buffer.alloc(46)
    header.writeUInt32LE(CENTRAL_HEADER, 0)
    header.writeUInt16LE(20, 4)
    header.writeUInt16LE(20, 6)
    header.writeUInt16LE(UTF8_NAMES, 8)
    header.writeUInt16LE(part.method, 10)
    header.writeUInt16LE(FIXED_DOS_TIME, 12)
    header.writeUInt16LE(FIXED_DOS_DATE, 14)
    header.writeUInt32LE(part.crc, 16)
    header.writeUInt32LE(part.packed.length, 20)
    header.writeUInt32LE(part.raw, 24)
    header.writeUInt16LE(part.name.length, 28)
    header.writeUInt16LE(0, 30)
    header.writeUInt16LE(0, 32)
    header.writeUInt16LE(0, 34)
    header.writeUInt16LE(0, 36)
    header.writeUInt32LE(0, 38)
    header.writeUInt32LE(part.offset, 42)
    central.push(header, part.name)
    offset += 46 + part.name.length
  }

  if (offset > ZIP_MOST_BYTES) {
    throw new Error(`This zip would be ${String(offset)} bytes, and a zip this writer holds whole cannot pass ${String(ZIP_MOST_BYTES)}.`)
  }

  const end = Buffer.alloc(22)
  end.writeUInt32LE(END_RECORD, 0)
  end.writeUInt16LE(0, 4)
  end.writeUInt16LE(0, 6)
  end.writeUInt16LE(parts.length, 8)
  end.writeUInt16LE(parts.length, 10)
  end.writeUInt32LE(offset - centralOffset, 12)
  end.writeUInt32LE(centralOffset, 16)
  end.writeUInt16LE(0, 20)

  return Buffer.concat([...local, ...central, end])
}
