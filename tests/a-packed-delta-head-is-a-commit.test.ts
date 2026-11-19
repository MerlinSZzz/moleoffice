// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it, vi } from 'vitest'
import { recordedCutFrom, recordedHead } from '../src/server/lib/check-tip.ts'
import { objectId, packedHeadFixture, sizeBytes, truncateHeadPack, writeTestPack } from './packed-head-fixture.ts'

const folders: string[] = []
afterEach(() => {
  vi.unstubAllEnvs()
  for (const folder of folders.splice(0)) rmSync(folder, { recursive: true, force: true })
})

it.each([6, 7] as const)('reads HEAD stored by Git as delta type %i, even without Git on PATH', (type) => {
  const fixture = packedHeadFixture(type)
  folders.push(fixture.directory)
  expect(fixture.delta).toHaveLength(7)
  expect(Number(fixture.delta[5])).toBeGreaterThan(0)
  expect(fixture.storedType).toBe(type)
  expect(existsSync(join(fixture.directory, '.git', 'objects', fixture.head.slice(0, 2), fixture.head.slice(2)))).toBe(false)
  expect(fixture.git('cat-file', '-t', 'HEAD')).toBe('commit')
  const body = Buffer.from(fixture.git('cat-file', '-p', 'HEAD') + '\n')
  expect(objectId('commit', body)).toBe(fixture.head)
  const shared = join(fixture.directory, 'shared')
  fixture.git('clone', '-q', '--shared', fixture.directory, shared)
  vi.stubEnv('PATH', '')
  expect(recordedHead(fixture.directory)).toBe(fixture.head)
  expect(recordedHead(shared)).toBe(fixture.head)
})

it('reads a mixed chain of offset and reference deltas with copy and insert instructions', () => {
  const directory = mkdtempSync(join(tmpdir(), 'mole-mixed-deltas-'))
  folders.push(directory)
  let body = Buffer.from('Synthetic commit contents.\n'.repeat(3000).slice(0, 65536))
  const entries = [{ type: 1, body, id: objectId('commit', body) }]
  for (const [i, type] of [6, 7, 6].entries()) {
    const next = Buffer.concat([body.subarray(0, 65536), Buffer.from(`change ${i}`)])
    const inserted = next.subarray(65536)
    const delta = Buffer.concat([sizeBytes(body.length), sizeBytes(next.length), Buffer.from([0x80, inserted.length]), inserted])
    entries.push({ type, body: delta, id: objectId('commit', next), ...{ base: type === 7 ? entries[i]!.id : i } })
    body = next
  }
  writeTestPack(directory, entries)
  expect(recordedHead(directory)).toBe(objectId('commit', body))
})

it('names the unreadable packed HEAD when a copied pack is truncated', () => {
  const fixture = packedHeadFixture()
  folders.push(fixture.directory)
  const copy = join(fixture.directory, 'damaged-copy')
  cpSync(join(fixture.directory, '.git'), join(copy, '.git'), { recursive: true })
  expect(recordedHead(copy)).toBe(fixture.head)
  const copiedPack = join(copy, '.git', 'objects', 'pack', fixture.pack.split('/').at(-1)!)
  truncateHeadPack({ ...fixture, pack: copiedPack })
  expect(() => recordedHead(copy)).toThrow(`Git object ${fixture.head} could not be read: pack`)
  expect(recordedCutFrom(copy, 'main')).toEqual({ branch: null, says: expect.stringContaining(fixture.head) })
  expect(readFileSync(fixture.pack).length).toBeGreaterThan(12)
  expect(recordedHead(fixture.directory)).toBe(fixture.head)
})

it.each(['wrong type', 'missing base', 'corrupt delta', 'deep chain', 'wrong hash'] as const)('refuses a packed HEAD with a %s in words', (fault) => {
  const directory = mkdtempSync(join(tmpdir(), 'mole-unreadable-delta-'))
  folders.push(directory)
  const body = Buffer.from('Synthetic base bytes.\n')
  const id = objectId(fault === 'wrong type' ? 'blob' : 'commit', body)
  const delta = Buffer.concat([sizeBytes(body.length), sizeBytes(body.length), Buffer.from([0x90, body.length])])
  const entries = [{ type: fault === 'wrong type' ? 3 : 1, body, id }]
  const count = fault === 'deep chain' ? 129 : 1
  for (let i = 0; i < count; i++) entries.push({
    type: fault === 'missing base' ? 7 : 6,
    body: fault === 'corrupt delta' ? Buffer.concat([sizeBytes(body.length), sizeBytes(body.length), Buffer.from([0])]) : delta,
    id: (i + 1).toString(16).padStart(40, '0'),
    ...{ base: fault === 'missing base' ? 'f'.repeat(40) : i },
  })
  writeTestPack(directory, entries)
  const reason = {
    'wrong type': 'resolves to a blob, not a commit',
    'missing base': `delta base ${'f'.repeat(40)} is missing`,
    'corrupt delta': 'delta contains an invalid zero instruction',
    'deep chain': 'delta chain is too deep',
    'wrong hash': 'packed commit does not match its object id',
  }[fault]
  expect(() => recordedHead(directory)).toThrow(reason)
})
