// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { crc32, deflateSync } from 'node:zlib'

/** A complete PNG chunk, also used to make metadata and animation fixtures. */
export function avatarPngChunk(type: string, data: Buffer): Buffer {
  const chunk = Buffer.alloc(data.length + 12)
  chunk.writeUInt32BE(data.length)
  chunk.write(type, 4, 'ascii')
  data.copy(chunk, 8)
  chunk.writeUInt32BE(crc32(chunk.subarray(4, -4)), chunk.length - 4)
  return chunk
}

/** Deliberately uncompressed scanlines: colour and alpha vary, with no lossy encoder involved. */
export function avatarPng(seed = 0, width = 64, height = 64): Buffer {
  const header = Buffer.alloc(13)
  header.writeUInt32BE(width)
  header.writeUInt32BE(height, 4)
  header[8] = 8
  header[9] = 6
  const raw = Buffer.alloc(height * (width * 4 + 1))
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const at = y * (width * 4 + 1) + 1 + x * 4
      raw[at] = (x * 3 + seed) & 255
      raw[at + 1] = (y * 3 + seed) & 255
      raw[at + 2] = seed & 255
      raw[at + 3] = (x + y) & 255
    }
  }
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    avatarPngChunk('IHDR', header),
    avatarPngChunk('IDAT', deflateSync(raw, { level: 0 })),
    avatarPngChunk('IEND', Buffer.alloc(0)),
  ])
}

export function avatarPngParts(bytes: Buffer): { type: string; data: Buffer; whole: Buffer }[] {
  const chunks = []
  for (let at = 8; at < bytes.length;) {
    const size = bytes.readUInt32BE(at)
    chunks.push({ type: bytes.toString('ascii', at + 4, at + 8), data: bytes.subarray(at + 8, at + 8 + size), whole: bytes.subarray(at, at + 12 + size) })
    at += size + 12
  }
  return chunks
}

/** A valid, highly compressible one-bit image just above a pixel ceiling, without a large raw fixture. */
export function avatarOverPixelLimit(limit: number): Buffer {
  const side=Math.floor(Math.sqrt(limit))+1
  const header=Buffer.alloc(13)
  header.writeUInt32BE(side);header.writeUInt32BE(side,4);header[8]=1
  const raw=Buffer.alloc((Math.ceil(side/8)+1)*side)
  return Buffer.concat([avatarPng().subarray(0,8),avatarPngChunk('IHDR',header),avatarPngChunk('IDAT',deflateSync(raw,{level:9})),avatarPngChunk('IEND',Buffer.alloc(0))])
}
