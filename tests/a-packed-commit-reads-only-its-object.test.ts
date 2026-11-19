// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { randomBytes } from 'node:crypto'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import { measureGitReads } from './measure-git-reads.ts'
import { largePackedCommitFixture } from './large-packed-commit-fixture.ts'
import { packedCommitAt } from '../src/server/lib/packed-git-object.ts'
import { objectId, writeTestPack } from './packed-head-fixture.ts'

it.each(['first', 'last'] as const)('verifies a tiny commit %s in a large pack with at most 16 KiB of reads', async (position) => {
  const fixture = largePackedCommitFixture(position)
  try {
    const measured = await measureGitReads(() => packedCommitAt(fixture.objects, fixture.head, [fixture.objects]))
    console.log('PACKED_COMMIT_MEASUREMENT', JSON.stringify({ ...measured, packBytes: fixture.packBytes }))
    expect(measured.result).toBe(fixture.head)
    expect(measured.wholePackReads).toBe(0)
    expect(measured.bytes).toBeLessThanOrEqual(16 * 1024)
  } finally { rmSync(fixture.directory, { recursive: true, force: true }) }
})

it('also verifies an incompressible commit larger than one read chunk', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'mole-multiple-chunk-commit-'))
  try {
    const body = randomBytes(100 * 1024)
    const id = objectId('commit', body)
    writeTestPack(directory, [{ type: 1, body, id }])
    const objects = join(directory, '.git', 'objects')
    const measured = await measureGitReads(() => packedCommitAt(objects, id, [objects]))
    expect(measured.result).toBe(id)
    expect(measured.wholePackReads).toBe(0)
    expect(measured.bytes).toBeLessThan(128 * 1024)
  } finally { rmSync(directory, { recursive: true, force: true }) }
})

it.each([6, 7] as const)('bounds the reads for a type %i delta and its base in a large pack', async (type) => {
  const fixture = largePackedCommitFixture('last', type)
  try {
    const measured = await measureGitReads(() => packedCommitAt(fixture.objects, fixture.head, [fixture.objects]))
    expect(measured.result).toBe(fixture.head)
    expect(measured.wholePackReads).toBe(0)
    expect(measured.bytes).toBeLessThanOrEqual(16 * 1024)
  } finally { rmSync(fixture.directory, { recursive: true, force: true }) }
})
