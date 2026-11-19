// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A TEST'S COPY OF THE DATABASE CARRIES ITS AGE IN ITS NAME.
 *
 * Problem `lZ7OSjBOhUIO`. A test killed with SIGKILL runs no `afterEach`, and its database folder
 * stays in the temporary directory. A sweep has to find such a folder and tell how old it is. It
 * finds it by the one prefix, and reads its age from the time in the name, because the folder's own
 * times move whenever a file inside it is written.
 */
import { basename, dirname } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import { buildTheFirstOfficeInAHook, freshDb, TEST_DATABASE_PREFIX, whenThisTestFolderWasMade, type TestDb } from './helpers.ts'

// The first office of this process is built in a hook, so no case below pays for it (wave 13t round 34).
buildTheFirstOfficeInAHook()

let db: TestDb | null = null

afterEach(() => {
  db?.close()
  db = null
})

describe('a test database folder', () => {
  it('starts with the one prefix and ends with the time it was made', async () => {
    // To the second, so the time in the name can be a fraction of a second before `before`.
    const before = Math.floor(Date.now() / 1000) * 1000
    db = await freshDb()
    const after = Date.now()
    const folder = dirname(db.file)

    expect(folder.startsWith(TEST_DATABASE_PREFIX), folder).toBe(true)
    expect(basename(folder), 'the name a test of its own reads').toMatch(/^mole-office-test-/)
    const made = whenThisTestFolderWasMade(folder)
    expect(made, `${folder} carries no time`).not.toBeNull()
    expect(made?.getTime()).toBeGreaterThanOrEqual(before)
    expect(made?.getTime()).toBeLessThanOrEqual(after)
    // The first database of a process runs every migration. That build is now in the hook at the top (wave 13t
    // round 34); this case's limit was set for it and is kept as it was.
  }, 60_000)

  it('reads no time out of a name that carries none', () => {
    expect(whenThisTestFolderWasMade('/tmp/mole-office-test-aB3dE9')).toBeNull()
    expect(whenThisTestFolderWasMade('/tmp/mole-office-test-20261005T143700Z-aB3dE9')?.toISOString())
      .toBe('2026-10-05T14:37:00.000Z')
  })
})
