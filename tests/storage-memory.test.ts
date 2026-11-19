// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'
import { expect, it } from 'vitest'
import { aTestDatabaseFolder, removeThisTestFolder } from './a-test-folder.ts'
import { STORAGE_CATEGORIES } from '../src/shared/storage/categories.ts'
import { STORAGE_BATCH_SIZE } from '../src/server/lib/storage/inventory.ts'

it('measures a large made-up office within a heap limit and fixed request work', () => {
  const folder = aTestDatabaseFolder('storage-memory')
  try {
    const run = spawnSync('bash', ['-c', 'ulimit -c 0; exec "$@"', 'storage-probe', process.execPath,
      '--max-old-space-size=64', '--expose-gc', '--import', 'tsx', resolve('tools/storage/memory-probe.ts'), folder],
    { encoding: 'utf8', timeout: 90_000, maxBuffer: 1024 * 1024 })
    expect(run.status, run.stderr).toBe(0)
    const measured = JSON.parse(run.stdout)
    console.log('STORAGE_MEMORY_EVIDENCE', JSON.stringify(measured))
    expect(measured.files).toBeGreaterThan(STORAGE_BATCH_SIZE * 32)
    expect(measured.countedFiles).toBe(measured.files)
    expect(measured.planLines).toBe(measured.files + 2)
    expect(measured.batches).toBe(Math.ceil(measured.files / STORAGE_BATCH_SIZE))
    expect(measured.heapGrowth).toBeLessThan(measured.fakeCorpusBytes / 4)
    expect(measured.rssGrowth).toBeLessThan(measured.fakeCorpusBytes / 2)
    expect(measured.peakHeap).toBeLessThan(64 * 1024 * 1024)
    expect(measured.queries).toBe(2)
    expect(measured.resultRows).toBeLessThanOrEqual(STORAGE_CATEGORIES.length + 1)
  } finally { removeThisTestFolder(folder) }
}, 120_000)
