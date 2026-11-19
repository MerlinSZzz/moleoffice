// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { execFileSync } from 'node:child_process'
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import { deflateSync } from 'node:zlib'

/** Every Git command writes only inside the folder this fixture made. */
export function packedHeadFixture(type: 6 | 7 = 6) {
  const directory = mkdtempSync(join(tmpdir(), 'mole-packed-head-'))
  const home = join(directory, 'home')
  mkdirSync(home)
  const git = (...args: string[]) => execFileSync('git', args, {
    cwd: directory, encoding: 'utf8', timeout: 10_000, stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, HOME: home, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: join(home, 'no-config') },
  }).trim()
  git('init', '-q', '-b', 'main')
  git('config', 'user.name', 'Synthetic packed HEAD test')
  git('config', 'user.email', 'test@example.invalid')
  git('config', 'commit.gpgsign', 'false')
  const message = 'Synthetic shared commit message.\n'.repeat(100)
  for (let i = 0; i < 16; i++) git('commit', '--allow-empty', '-qm', message + `Commit ${i}.`)
  git('-c', `repack.useDeltaBaseOffset=${type === 6}`, 'repack', '-adf', '--window=50', '--depth=50')
  const packs = join(directory, '.git', 'objects', 'pack')
  const index = join(packs, readdirSync(packs).find((name) => name.endsWith('.idx'))!)
  const rows = git('verify-pack', '-v', index).split('\n').map((line) => line.trim().split(/\s+/))
  const delta = rows.find((row) => row[1] === 'commit' && row.length === 7 && Number(row[5]) > 0)
  if (!delta) throw new Error('Git did not store any fixture commit as a delta')
  const head = delta[0]!
  git('update-ref', 'refs/heads/main', head)
  const pack = index.replace(/\.idx$/, '.pack')
  const offset = Number(delta[4])
  const storedType = (readFileSync(pack)[offset]! >> 4) & 7
  if (storedType !== type) throw new Error(`Git stored type ${storedType}, but the fixture needs type ${type}`)
  return { directory, git, head, pack, offset, storedType, delta }
}

export function truncateHeadPack(fixture: ReturnType<typeof packedHeadFixture>) {
  chmodSync(fixture.pack, 0o600)
  writeFileSync(fixture.pack, readFileSync(fixture.pack).subarray(0, 12))
}

function hash(bytes: Buffer): Buffer { return createHash('sha1').update(bytes).digest() }

export function objectId(type: string, body: Buffer): string {
  return hash(Buffer.concat([Buffer.from(`${type} ${body.length}\0`), body])).toString('hex')
}

export function sizeBytes(size: number): Buffer {
  const bytes: number[] = []
  do {
    const low = size % 128
    size = Math.floor(size / 128)
    bytes.push(low | (size > 0 ? 128 : 0))
  } while (size > 0)
  return Buffer.from(bytes)
}

type Entry = { type: number; body: Buffer; id: string; base?: number | string }

/** Small authored packs let a test name the exact invalid instruction or missing base. */
export function writeTestPack(directory: string, entries: Entry[]) {
  const packDirectory = join(directory, '.git', 'objects', 'pack')
  mkdirSync(packDirectory, { recursive: true })
  const header = Buffer.alloc(12)
  header.write('PACK')
  header.writeUInt32BE(2, 4)
  header.writeUInt32BE(entries.length, 8)
  const parts = [header]
  const offsets: number[] = []
  let position = 12
  for (const entry of entries) {
    offsets.push(position)
    let size = Math.floor(entry.body.length / 16)
    const header = [entry.type * 16 + entry.body.length % 16 + (size > 0 ? 128 : 0)]
    while (size > 0) {
      const low = size % 128
      size = Math.floor(size / 128)
      header.push(low | (size > 0 ? 128 : 0))
    }
    let base = Buffer.alloc(0)
    if (typeof entry.base === 'string') base = Buffer.from(entry.base, 'hex')
    if (typeof entry.base === 'number') {
      let distance = position - offsets[entry.base]!
      const bytes = [distance & 127]
      while ((distance = Math.floor(distance / 128)) > 0) {
        distance--
        bytes.unshift(128 | (distance & 127))
      }
      base = Buffer.from(bytes)
    }
    const bytes = Buffer.concat([Buffer.from(header), base, deflateSync(entry.body)])
    parts.push(bytes)
    position += bytes.length
  }
  const packed = Buffer.concat(parts)
  const checksum = hash(packed)
  writeFileSync(join(packDirectory, 'fixture.pack'), Buffer.concat([packed, checksum]))
  const sorted = entries.map((entry, i) => ({ id: Buffer.from(entry.id, 'hex'), offset: offsets[i]! }))
    .sort((a, b) => Buffer.compare(a.id, b.id))
  const index = Buffer.alloc(8 + 256 * 4 + entries.length * 28)
  index.writeUInt32BE(0xff744f63)
  index.writeUInt32BE(2, 4)
  for (let i = 0; i < 256; i++) index.writeUInt32BE(sorted.filter((entry) => entry.id[0]! <= i).length, 8 + i * 4)
  for (const [i, entry] of sorted.entries()) {
    entry.id.copy(index, 8 + 256 * 4 + i * 20)
    index.writeUInt32BE(entry.offset, 8 + 256 * 4 + entries.length * 24 + i * 4)
  }
  const indexed = Buffer.concat([index, checksum])
  writeFileSync(join(packDirectory, 'fixture.idx'), Buffer.concat([indexed, hash(indexed)]))
  writeFileSync(join(directory, '.git', 'HEAD'), entries.at(-1)!.id + '\n')
}
