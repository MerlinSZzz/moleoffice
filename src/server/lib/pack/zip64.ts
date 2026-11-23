// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { open, type FileHandle } from 'node:fs/promises'
import { Readable } from 'node:stream'
import { createDeflateRaw, createInflateRaw, crc32 } from 'node:zlib'

export const ZIP64_END_SIGNATURE = 0x06064b50
export const ZIP64_LOCATOR_SIGNATURE = 0x07064b50

interface Entry {
  name: string
  method: number
  crc: number
  bytes: number
  compressed: number
  offset: number
}

function size(value: bigint): number {
  const n = Number(value)
  if (!Number.isSafeInteger(n) || n < 0) throw new Error('ZIP64 size is not supported')
  return n
}

/** ZIP64 is used for every entry so large and small archives follow the same path.
 * The other zip writer builds an archive in memory and cannot hold these files. */
export class Zip64Writer {
  private position = 0
  private entries: Entry[] = []
  private entryNames = new Set<string>()
  private constructor(private readonly file: FileHandle) {}

  static async create(path: string): Promise<Zip64Writer> {
    return new Zip64Writer(await open(path, 'wx'))
  }

  private async write(bytes: Buffer): Promise<void> {
    let done = 0
    while (done < bytes.length) {
      const result = await this.file.write(bytes, done, bytes.length - done, this.position)
      if (result.bytesWritten === 0) throw new Error('Could not write the archive')
      done += result.bytesWritten
      this.position += result.bytesWritten
    }
  }

  async add(name: string, source: Readable, method: 'store' | 'deflate'): Promise<{ sha256: string; bytes: number }> {
    if (this.entryNames.has(name)) throw new Error(`Duplicate entry ${name}`)
    const nameBytes = Buffer.from(name)
    if (nameBytes.length > 65535) throw new Error(`Entry name is too long: ${name}`)
    const offset = this.position
    const header = Buffer.alloc(30 + nameBytes.length + 20)
    header.writeUInt32LE(0x04034b50, 0)
    header.writeUInt16LE(45, 4)
    header.writeUInt16LE(0x808, 6)
    header.writeUInt16LE(method === 'store' ? 0 : 8, 8)
    header.writeUInt32LE(0xffffffff, 18)
    header.writeUInt32LE(0xffffffff, 22)
    header.writeUInt16LE(nameBytes.length, 26)
    header.writeUInt16LE(20, 28)
    nameBytes.copy(header, 30)
    header.writeUInt16LE(1, 30 + nameBytes.length)
    header.writeUInt16LE(16, 32 + nameBytes.length)
    await this.write(header)
    let checksum = 0
    let bytes = 0
    const hash = createHash('sha256')
    const tracked = async function* (): AsyncGenerator<Buffer> {
      for await (const part of source) {
        const chunk = Buffer.from(part)
        checksum = crc32(chunk, checksum)
        bytes += chunk.length
        hash.update(chunk)
        yield chunk
      }
    }
    const input = Readable.from(tracked())
    const output = method === 'deflate' ? input.compose(createDeflateRaw({ level: 6 })) : input
    const start = this.position
    for await (const part of output) await this.write(Buffer.from(part))
    const compressed = this.position - start
    const descriptor = Buffer.alloc(24)
    descriptor.writeUInt32LE(0x08074b50, 0)
    descriptor.writeUInt32LE(checksum, 4)
    descriptor.writeBigUInt64LE(BigInt(compressed), 8)
    descriptor.writeBigUInt64LE(BigInt(bytes), 16)
    await this.write(descriptor)
    this.entries.push({ name, method: method === 'store' ? 0 : 8, crc: checksum, bytes, compressed, offset })
    this.entryNames.add(name)
    return { sha256: hash.digest('hex'), bytes }
  }

  async close(): Promise<void> {
    const centralStart = this.position
    for (const entry of this.entries) {
      const name = Buffer.from(entry.name)
      const row = Buffer.alloc(46 + name.length + 28)
      row.writeUInt32LE(0x02014b50, 0)
      row.writeUInt16LE(45, 4)
      row.writeUInt16LE(45, 6)
      row.writeUInt16LE(0x808, 8)
      row.writeUInt16LE(entry.method, 10)
      row.writeUInt32LE(entry.crc, 16)
      row.writeUInt32LE(0xffffffff, 20)
      row.writeUInt32LE(0xffffffff, 24)
      row.writeUInt16LE(name.length, 28)
      row.writeUInt16LE(28, 30)
      row.writeUInt32LE(0xffffffff, 42)
      name.copy(row, 46)
      const at = 46 + name.length
      row.writeUInt16LE(1, at)
      row.writeUInt16LE(24, at + 2)
      row.writeBigUInt64LE(BigInt(entry.bytes), at + 4)
      row.writeBigUInt64LE(BigInt(entry.compressed), at + 12)
      row.writeBigUInt64LE(BigInt(entry.offset), at + 20)
      await this.write(row)
    }
    const centralSize = this.position - centralStart
    const endOffset = this.position
    const end = Buffer.alloc(98)
    end.writeUInt32LE(ZIP64_END_SIGNATURE, 0)
    end.writeBigUInt64LE(44n, 4)
    end.writeUInt16LE(45, 12)
    end.writeUInt16LE(45, 14)
    end.writeBigUInt64LE(BigInt(this.entries.length), 24)
    end.writeBigUInt64LE(BigInt(this.entries.length), 32)
    end.writeBigUInt64LE(BigInt(centralSize), 40)
    end.writeBigUInt64LE(BigInt(centralStart), 48)
    end.writeUInt32LE(ZIP64_LOCATOR_SIGNATURE, 56)
    end.writeBigUInt64LE(BigInt(endOffset), 64)
    end.writeUInt32LE(1, 72)
    end.writeUInt32LE(0x06054b50, 76)
    end.writeUInt16LE(0xffff, 84)
    end.writeUInt16LE(0xffff, 86)
    end.writeUInt32LE(0xffffffff, 88)
    end.writeUInt32LE(0xffffffff, 92)
    await this.write(end)
    await this.file.close()
  }

  async abort(): Promise<void> { await this.file.close() }
}

/** Reads the directory first and checks the CRC as each entry is consumed. */
export class Zip64Reader {
  private constructor(private readonly path: string, private readonly file: FileHandle, private readonly entries: Map<string, Entry>, private readonly directoryStart: number) {}

  static async open(path: string): Promise<Zip64Reader> {
    const file = await open(path, 'r')
    try {
      const length = (await file.stat()).size
      async function at(offset: number, bytes: number): Promise<Buffer> {
        if (offset < 0 || bytes < 0 || offset + bytes > length) throw new Error('archive ends early')
        const result = Buffer.alloc(bytes)
        const read = await file.read(result, 0, bytes, offset)
        if (read.bytesRead !== bytes) throw new Error('archive ends early')
        return result
      }
      if (length < 98) throw new Error('archive ends early')
      const tail = await at(length - 98, 98)
      if (tail.readUInt32LE(0) !== ZIP64_END_SIGNATURE || tail.readUInt32LE(56) !== ZIP64_LOCATOR_SIGNATURE || tail.readUInt32LE(76) !== 0x06054b50) throw new Error('ZIP64 end records are missing')
      const end = length - 98
      if (size(tail.readBigUInt64LE(64)) !== end || tail.readBigUInt64LE(4) !== 44n || tail.readUInt32LE(16) !== 0 || tail.readUInt32LE(20) !== 0 || tail.readUInt32LE(60) !== 0 || tail.readUInt32LE(72) !== 1 || tail.readUInt16LE(80) !== 0 || tail.readUInt16LE(82) !== 0 || tail.readUInt16LE(96) !== 0) throw new Error('ZIP64 end records do not add up')
      const count = size(tail.readBigUInt64LE(32))
      if (size(tail.readBigUInt64LE(24)) !== count) throw new Error('ZIP64 entry counts do not add up')
      const start = size(tail.readBigUInt64LE(48))
      const directoryBytes = size(tail.readBigUInt64LE(40))
      if (start + directoryBytes !== end) throw new Error('central directory does not add up')
      const entries = new Map<string, Entry>()
      let cursor = start
      for (let i = 0; i < count; i += 1) {
        const header = await at(cursor, 46)
        if (header.readUInt32LE(0) !== 0x02014b50) throw new Error('central directory entry is invalid')
        const nameLength = header.readUInt16LE(28)
        const extraLength = header.readUInt16LE(30)
        const commentLength = header.readUInt16LE(32)
        const variable = await at(cursor + 46, nameLength + extraLength + commentLength)
        const name = variable.subarray(0, nameLength).toString('utf8')
        let pos = nameLength
        const extraEnd = nameLength + extraLength
        let extra: Buffer | null = null
        while (pos + 4 <= extraEnd) {
          const kind = variable.readUInt16LE(pos)
          const n = variable.readUInt16LE(pos + 2)
          pos += 4
          if (pos + n > extraEnd) throw new Error(`bad extra field for ${name}`)
          if (kind === 1) extra = variable.subarray(pos, pos + n)
          pos += n
        }
        if (pos !== extraEnd || extra === null || extra.length < 24) throw new Error(`missing ZIP64 fields for ${name}`)
        const entry: Entry = { name, method: header.readUInt16LE(10), crc: header.readUInt32LE(16), bytes: size(extra.readBigUInt64LE(0)), compressed: size(extra.readBigUInt64LE(8)), offset: size(extra.readBigUInt64LE(16)) }
        if (entries.has(name) || (entry.method !== 0 && entry.method !== 8) || entry.offset >= start || header.readUInt16LE(34) !== 0) throw new Error(`invalid entry ${name}`)
        entries.set(name, entry)
        cursor += 46 + variable.length
        if (cursor > end) throw new Error('central directory ends early')
      }
      if (cursor !== end) throw new Error('central directory length does not add up')
      return new Zip64Reader(path, file, entries, start)
    } catch (error) {
      await file.close()
      throw new Error(`${path}: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  names(): string[] { return Array.from(this.entries.keys()) }

  async *read(name: string): AsyncGenerator<Buffer> {
    try {
      const entry = this.entries.get(name)
      if (entry === undefined) throw new Error('entry is missing')
      const header = Buffer.alloc(30)
      const result = await this.file.read(header, 0, 30, entry.offset)
      if (result.bytesRead !== 30 || header.readUInt32LE(0) !== 0x04034b50) throw new Error('local header is invalid')
      if (header.readUInt16LE(8) !== entry.method) throw new Error('compression method does not match')
      const start = entry.offset + 30 + header.readUInt16LE(26) + header.readUInt16LE(28)
      if (start + entry.compressed + 24 > this.directoryStart) throw new Error('entry extends into the central directory')
      const localName = Buffer.alloc(header.readUInt16LE(26))
      const named = await this.file.read(localName, 0, localName.length, entry.offset + 30)
      if (named.bytesRead !== localName.length || localName.toString('utf8') !== name) throw new Error('local name does not match')
      const descriptor = Buffer.alloc(24)
      const described = await this.file.read(descriptor, 0, 24, start + entry.compressed)
      if (described.bytesRead !== 24 || descriptor.readUInt32LE(0) !== 0x08074b50 || descriptor.readUInt32LE(4) !== entry.crc || size(descriptor.readBigUInt64LE(8)) !== entry.compressed || size(descriptor.readBigUInt64LE(16)) !== entry.bytes) throw new Error('entry sizes do not match')
      const input = entry.compressed === 0 ? Readable.from([]) : createReadStream(this.path, { start, end: start + entry.compressed - 1 })
      const output = entry.method === 8 ? input.compose(createInflateRaw()) : input
      let checksum = 0
      let bytes = 0
      for await (const part of output) {
        const chunk = Buffer.from(part)
        checksum = crc32(chunk, checksum)
        bytes += chunk.length
        yield chunk
      }
      if (checksum !== entry.crc || bytes !== entry.bytes) throw new Error('CRC or size does not match')
    } catch (error) {
      throw new Error(`${this.path}: ${name}: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  async close(): Promise<void> { await this.file.close() }
}
