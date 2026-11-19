// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** Read packed Git commits, including the changes Git stores against a base object. */
import { closeSync, existsSync, fstatSync, openSync, readFileSync, readdirSync, readSync } from 'node:fs'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import { inflateSync } from 'node:zlib'

const MOST_BYTES = 64 * 1024 * 1024
const MOST_DELTAS = 128
const TYPES: Record<number, string> = { 1: 'commit', 2: 'tree', 3: 'blob', 4: 'tag' }
type GitObject = { type: number; body: Buffer }
type Location = { path: string; offset: number }
type OpenPack = { fd: number; end: number }

/** Positional reads never allocate in proportion to a pack or index's length. */
function readAt(fd: number, offset: number, length: number): Buffer {
  const bytes = Buffer.alloc(length)
  let read = 0
  while (read < length) {
    const count = readSync(fd, bytes, read, length - read, offset + read)
    if (count === 0) throw new Error(`pack or index is truncated at offset ${offset + read}`)
    read += count
  }
  return bytes
}

export class UnreadableGitObject extends Error {
  constructor(value: string, reason: string) {
    super(`Git object ${value} could not be read: ${reason}`)
  }
}

/** A missing index entry is absence. An index we cannot search is an error. */
function packedLocation(objects: string, value: string): Location | null {
  const packs = join(objects, 'pack')
  if (!existsSync(packs)) return null
  for (const name of readdirSync(packs).filter((one) => one.endsWith('.idx'))) {
    const path = join(packs, name)
    const fd = openSync(path, 'r')
    try {
      const length = fstatSync(fd).size
      if (length < 8 + 256 * 4 + 40) throw new Error(`pack index ${path} is truncated`)
      const index = readAt(fd, 0, 8 + 256 * 4)
      if (index.readUInt32BE(0) !== 0xff744f63 || index.readUInt32BE(4) !== 2) {
        throw new Error(`pack index ${path} is damaged or is not version 2`)
      }
      const count = index.readUInt32BE(8 + 255 * 4)
      const ids = 8 + 256 * 4
      if (length < ids + count * 28 + 40) throw new Error(`pack index ${path} is truncated`)
      const wanted = Buffer.from(value, 'hex')
      let lo = 0, hi = count - 1
      while (lo <= hi) {
        const mid = (lo + hi) >>> 1
        const cmp = Buffer.compare(readAt(fd, ids + mid * 20, 20), wanted)
        if (cmp < 0) lo = mid + 1
        else if (cmp > 0) hi = mid - 1
        else {
          const offset = readAt(fd, ids + count * 24 + mid * 4, 4).readUInt32BE(0)
          if (offset & 0x80000000) throw new Error(`pack index ${path} uses a large offset this reader cannot read`)
          return { path: path.replace(/\.idx$/, '.pack'), offset }
        }
      }
    } finally { closeSync(fd) }
  }
  return null
}

function objectHash(object: GitObject): string {
  return createHash('sha1').update(`${TYPES[object.type]} ${object.body.length}\0`).update(object.body).digest('hex')
}

/**
 * Zlib tells us when this object's stream is complete. Grow the input only for an incomplete
 * stream, reading each byte once, with a 64 MiB limit plus deflate's worst-case overhead.
 * Tiny commits read at most 4 KiB past their header, even in a multi-gigabyte pack.
 */
function inflateAt(pack: OpenPack, offset: number): Buffer {
  const limit = Math.min(pack.end - offset, MOST_BYTES + 64 * 1024)
  let input = Buffer.alloc(0)
  while (input.length < limit) {
    const length = Math.min(limit, Math.max(4096, input.length * 2))
    const next = Buffer.alloc(length)
    input.copy(next)
    readAt(pack.fd, offset + input.length, length - input.length).copy(next, input.length)
    input = next
    try { return inflateSync(input, { maxOutputLength: MOST_BYTES }) }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'Z_BUF_ERROR') throw error
    }
  }
  throw new Error('the packed object is truncated or exceeds the 64 MiB read limit')
}

/** Apply Git's copy and insert instructions, refusing a read or write outside either object. */
function applyDelta(base: Buffer, delta: Buffer): Buffer {
  let cursor = 0
  const byte = () => {
    if (cursor >= delta.length) throw new Error('the delta is truncated')
    return delta[cursor++]!
  }
  const size = () => {
    let value = 0, scale = 1, one: number
    do {
      one = byte()
      value += (one & 127) * scale
      scale *= 128
      if (!Number.isSafeInteger(value) || scale > 2 ** 53) throw new Error('the delta size is too large')
    } while (one & 128)
    return value
  }
  if (size() !== base.length) throw new Error('the delta names a different base size')
  const length = size()
  if (length > MOST_BYTES) throw new Error('the delta result exceeds the 64 MiB read limit')
  const result = Buffer.alloc(length)
  let written = 0
  while (cursor < delta.length) {
    const instruction = byte()
    if (instruction & 128) {
      let offset = 0, count = 0
      for (let i = 0; i < 4; i++) if (instruction & (1 << i)) offset += byte() * 2 ** (8 * i)
      for (let i = 0; i < 3; i++) if (instruction & (1 << (4 + i))) count += byte() * 2 ** (8 * i)
      if (count === 0) count = 0x10000
      if (offset + count > base.length || written + count > length) throw new Error('the delta copies outside its base or result')
      base.copy(result, written, offset, offset + count)
      written += count
    } else {
      if (instruction === 0) throw new Error('the delta contains an invalid zero instruction')
      if (cursor + instruction > delta.length || written + instruction > length) throw new Error('the delta inserts outside its data or result')
      delta.copy(result, written, cursor, cursor + instruction)
      cursor += instruction
      written += instruction
    }
  }
  if (written !== length) throw new Error('the delta result has the wrong size')
  return result
}

/** Only file descriptors are kept for this read, including bases reached through another index. */
function packedObject(location: Location, objects: readonly string[], packs: Map<string, OpenPack>, depth: number): GitObject {
  if (depth > MOST_DELTAS) throw new Error(`the delta chain is too deep (more than ${MOST_DELTAS} deltas)`)
  const { path, offset } = location
  let pack = packs.get(path)
  if (!pack) {
    const fd = openSync(path, 'r')
    pack = { fd, end: 0 }
    packs.set(path, pack)
    pack.end = fstatSync(fd).size - 20
    if (pack.end < 12) throw new Error(`pack ${path} has a damaged or unsupported header`)
    const header = readAt(fd, 0, 12)
    if (header.toString('ascii', 0, 4) !== 'PACK' || ![2, 3].includes(header.readUInt32BE(4))) {
      throw new Error(`pack ${path} has a damaged or unsupported header`)
    }
  }
  const { end, fd } = pack
  if (offset < 12 || offset >= end) throw new Error(`pack ${path} has no object at offset ${offset}`)
  let cursor = offset
  const byte = () => {
    if (cursor >= end) throw new Error(`pack ${path} is truncated at offset ${offset}`)
    return readAt(fd, cursor++, 1)[0]!
  }
  let one = byte()
  const type = (one >> 4) & 7
  let size = one & 15
  let scale = 16
  while (one & 128) {
    if (scale > 2 ** 48) throw new Error('the packed object size is too large')
    one = byte()
    size += (one & 127) * scale
    scale *= 128
  }
  if (size > MOST_BYTES) throw new Error('the packed object exceeds the 64 MiB read limit')
  let base: GitObject | null = null
  if (type === 6) {
    one = byte()
    let distance = one & 127
    while (one & 128) {
      one = byte()
      distance = (distance + 1) * 128 + (one & 127)
      if (!Number.isSafeInteger(distance)) throw new Error('the delta base offset is too large')
    }
    if (distance === 0 || offset - distance < 12) throw new Error('the delta base is missing at its recorded offset')
    base = packedObject({ path, offset: offset - distance }, objects, packs, depth + 1)
  } else if (type === 7) {
    if (cursor + 20 > end) throw new Error('the delta base id is truncated')
    const baseId = readAt(fd, cursor, 20).toString('hex')
    cursor += 20
    base = objectById(baseId, objects, packs, depth + 1)
  } else if (TYPES[type] === undefined) {
    throw new Error(`packed object type ${type} is not readable`)
  }
  const body = inflateAt(pack, cursor)
  if (body.length !== size) throw new Error('the packed object has the wrong size')
  return base === null ? { type, body } : { type: base.type, body: applyDelta(base.body, body) }
}

/** A reference delta may name a base in a different pack or an alternate object directory. */
function objectById(value: string, objects: readonly string[], packs: Map<string, OpenPack>, depth: number): GitObject {
  if (depth > MOST_DELTAS) throw new Error(`the delta chain is too deep (more than ${MOST_DELTAS} deltas)`)
  for (const directory of objects) {
    const loose = join(directory, value.slice(0, 2), value.slice(2))
    let object: GitObject
    if (existsSync(loose)) {
      const bytes = inflateSync(readFileSync(loose), { maxOutputLength: MOST_BYTES })
      const end = bytes.indexOf(0)
      const header = /^(commit|tree|blob|tag) (\d+)$/.exec(bytes.toString('ascii', 0, end))
      if (!header || Number(header[2]) !== bytes.length - end - 1) throw new Error(`delta base ${value} has a damaged loose header`)
      object = { type: Number(Object.keys(TYPES).find((key) => TYPES[Number(key)] === header[1])), body: bytes.subarray(end + 1) }
    } else {
      const location = packedLocation(directory, value)
      if (location === null) continue
      object = packedObject(location, objects, packs, depth)
    }
    if (objectHash(object) !== value) throw new Error(`delta base ${value} does not match its object id`)
    return object
  }
  throw new Error(`delta base ${value} is missing`)
}

/** Verify the reconstructed type and hash before calling any packed object a commit. */
export function packedCommitAt(objects: string, value: string, allObjects: readonly string[]): string | null {
  const packs = new Map<string, OpenPack>()
  try {
    const location = packedLocation(objects, value)
    if (location === null) return null
    const object = packedObject(location, allObjects, packs, 0)
    if (object.type !== 1) throw new Error(`the packed object resolves to a ${TYPES[object.type]}, not a commit`)
    if (objectHash(object) !== value) throw new Error('the packed commit does not match its object id')
    return value
  } catch (error) {
    throw new UnreadableGitObject(value, error instanceof Error ? error.message : String(error))
  } finally { for (const { fd } of packs.values()) closeSync(fd) }
}
