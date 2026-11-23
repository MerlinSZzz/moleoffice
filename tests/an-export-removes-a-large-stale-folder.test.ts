// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import { aTestDatabaseFolder, removeThisTestFolder } from './a-test-folder.ts'
import { buildTheFirstOfficeInAHook, freshDb } from './helpers.ts'

buildTheFirstOfficeInAHook()

it('removes every stale file in a large managed folder', async () => {
  const db = await freshDb()
  const root = aTestDatabaseFolder('large-export')
  try {
    const folder = join(root, 'records', 'stale')
    mkdirSync(folder, { recursive: true })
    const count = 140_000
    for (let i = 0; i < count; i += 1) writeFileSync(join(folder, `${i}.md`), '')
    const { writeExport } = await import('../src/server/lib/export.ts')
    const result = writeExport(root)
    expect(result.removed).toHaveLength(count)
    expect(new Set(result.removed).size).toBe(count)
    expect(existsSync(folder) ? readdirSync(folder) : []).toEqual([])
  } finally {
    db.close()
    removeThisTestFolder(root)
  }
}, 120_000)
