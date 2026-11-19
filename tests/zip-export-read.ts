// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * READ A ZIP BACK, IN A TEST, WITHOUT A ZIP LIBRARY.
 *
 * The export's own manifest names each entry, and the test checks the bytes themselves. Reading the
 * central directory and inflating each entry with Node's `zlib` proves the writer produced a zip a
 * reader can open, rather than only that our writer and our reader agree on a private shape.
 */

import { inflateRawSync } from 'node:zlib'

export interface ReadZipEntry {
  name: string
  bytes: Buffer
  method: number
  crc: number
  compressedBytes: number
  uncompressedBytes: number
}

const END_RECORD = 0x06054b50
const CENTRAL_HEADER = 0x02014b50
const LOCAL_HEADER = 0x04034b50

/** Every entry in the zip, by the name it was written under. */
export function entriesOfZip(zip: Buffer): Map<string, ReadZipEntry> {
  let end = -1
  for (let at = zip.length - 22; at >= 0; at -= 1) {
    if (zip.readUInt32LE(at) === END_RECORD) {
      end = at
      break
    }
  }
  if (end < 0) throw new Error('this is not a zip: it has no end record')
  const total = zip.readUInt16LE(end + 10)
  let at = zip.readUInt32LE(end + 16)
  const entries = new Map<string, ReadZipEntry>()
  for (let index = 0; index < total; index += 1) {
    if (zip.readUInt32LE(at) !== CENTRAL_HEADER) throw new Error(`the central directory has no header at ${String(at)}`)
    const method = zip.readUInt16LE(at + 10)
    const crc = zip.readUInt32LE(at + 16)
    const compressedBytes = zip.readUInt32LE(at + 20)
    const uncompressedBytes = zip.readUInt32LE(at + 24)
    const nameLength = zip.readUInt16LE(at + 28)
    const extraLength = zip.readUInt16LE(at + 30)
    const commentLength = zip.readUInt16LE(at + 32)
    const localAt = zip.readUInt32LE(at + 42)
    const name = zip.toString('utf8', at + 46, at + 46 + nameLength)
    at += 46 + nameLength + extraLength + commentLength
    if (zip.readUInt32LE(localAt) !== LOCAL_HEADER) throw new Error(`${name} has no local header`)
    const localName = zip.readUInt16LE(localAt + 26)
    const localExtra = zip.readUInt16LE(localAt + 28)
    const start = localAt + 30 + localName + localExtra
    const packed = zip.subarray(start, start + compressedBytes)
    const bytes = method === 8 ? Buffer.from(inflateRawSync(packed)) : method === 0 ? Buffer.from(packed) : null
    if (bytes === null) throw new Error(`${name} uses compression method ${String(method)}, which this reader does not know`)
    if (bytes.length !== uncompressedBytes) throw new Error(`${name} reads ${String(bytes.length)} bytes and its header says ${String(uncompressedBytes)}`)
    entries.set(name, { name, bytes, method, crc, compressedBytes, uncompressedBytes })
  }
  return entries
}
