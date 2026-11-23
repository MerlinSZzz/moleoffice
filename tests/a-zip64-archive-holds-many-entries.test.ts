// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { createHash } from 'node:crypto'
import { readFileSync, truncateSync, copyFileSync } from 'node:fs'
import { join } from 'node:path'
import { Readable } from 'node:stream'
import { expect, it } from 'vitest'
import { aTestDatabaseFolder, removeThisTestFolder } from './a-test-folder.ts'
import { ZIP64_END_SIGNATURE, ZIP64_LOCATOR_SIGNATURE, Zip64Reader, Zip64Writer } from '../src/server/lib/pack/zip64.ts'

it('writes and reads more entries than a classic zip can name', async () => {
  const folder = aTestDatabaseFolder('zip64')
  try {
    const path = join(folder, 'many.zip')
    const writer = await Zip64Writer.create(path)
    const count = 70_000
    for (let i = 0; i < count; i += 1) {
      const bytes = Buffer.from(`entry ${i}`)
      const result = await writer.add(`entry-${i}`, Readable.from([bytes]), i % 2 === 0 ? 'store' : 'deflate')
      expect(result.sha256).toBe(createHash('sha256').update(bytes).digest('hex'))
    }
    await writer.close()
    const tail = readFileSync(path).subarray(-98)
    expect(tail.readUInt32LE(0)).toBe(ZIP64_END_SIGNATURE)
    expect(tail.readUInt32LE(56)).toBe(ZIP64_LOCATOR_SIGNATURE)
    const reader = await Zip64Reader.open(path)
    expect(reader.names()).toHaveLength(count)
    for (let i = 0; i < count; i += 1) {
      const chunks: Buffer[] = []
      for await (const chunk of reader.read(`entry-${i}`)) chunks.push(Buffer.from(chunk))
      const bytes = Buffer.concat(chunks)
      expect(bytes.toString()).toBe(`entry ${i}`)
      expect(createHash('sha256').update(bytes).digest('hex')).toBe(createHash('sha256').update(`entry ${i}`).digest('hex'))
    }
    await reader.close()
    const cut = join(folder, 'cut.zip')
    copyFileSync(path, cut)
    truncateSync(cut, readFileSync(cut).length - 100)
    await expect(Zip64Reader.open(cut)).rejects.toThrow('cut.zip')
  } finally {
    removeThisTestFolder(folder)
  }
}, 300_000)
