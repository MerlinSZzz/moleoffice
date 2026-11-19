// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE SERVER LOOKS AT THE TIMES OF ITS OWN FILES AT MOST ONCE A SECOND, AND A REPLY WITHIN THAT SECOND READS THE LAST LOOK.
 * Wave 13y round 86, item 11b.
 *
 * MEASURED FIRST: in wave 13y round 85, a warm look at the times of the 822 files the server is built from took a median
 * of 1.64 ms, and every reply paid it for its freshness header.
 *
 * WHAT THIS HOLDS, on a scratch file under the temporary directory that stands in for the server's files:
 *   - the first reading of a process looks at the files itself, rather than starting from what the process loaded;
 *   - a file saved after a look is not seen by a reading within a second of that look, and the header's reading and the
 *     runtime record's reading say the same thing in that second;
 *   - a reading a second after the look looks again and sees the save.
 *
 * WHAT IT DOES NOT HOLD. Whether the verdict is right, which freshness-is-provable.test.ts and
 * staleness-is-counted-from-when-it-started.test.ts hold on real servers.
 *
 * The second is counted on a faked `performance.now()`, so the test does not turn on how fast this machine runs it.
 *
 * Mutations: without the hold, the reading 999 ms after the look sees the save and the second step goes red; with a look
 * held for longer than a second, the reading a second after the look does not see the save and the third step goes red.
 */
import { utimesSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeAll, expect, it, vi } from 'vitest'
import { aTestDatabaseFolder, removeThisTestFolder } from './a-test-folder.ts'
import { freshDb, type TestDb } from './helpers.ts'

/** The scratch file that stands in for the files the server is built from, and how many times the server looked at it. */
const scratch = vi.hoisted(() => ({ file: '', looks: 0 }))

vi.mock('../src/config/newest-source.mjs', async (importOriginal) => {
  const real = await importOriginal<typeof import('../src/config/newest-source.mjs')>()
  const { statSync } = await import('node:fs')
  return {
    ...real,
    newestSourceBuiltFrom: (entry: string, root?: string) => {
      if (entry !== real.THE_SERVER_ENTRY) return real.newestSourceBuiltFrom(entry, root)
      scratch.looks++
      return { at: statSync(scratch.file).mtime, file: 'the-scratch-file.ts', files: 1 }
    },
  }
})

/** When the scratch file was last saved before the process loaded it: a minute ago, so a later save is a later second. */
const LOADED_AT = new Date(Date.now() - 60_000)
/** When it is saved again, five seconds after that. */
const SAVED_AT = new Date(LOADED_AT.getTime() + 5_000)

let folder = ''
let t: TestDb
let runtime: typeof import('../src/server/lib/runtime.ts')
let world: typeof import('../src/server/lib/world.ts')
let localStamp: (at: Date) => string

beforeAll(async () => {
  folder = aTestDatabaseFolder('once-a-second')
  scratch.file = join(folder, 'the-scratch-file.ts')
  writeFileSync(scratch.file, 'export const saved = 1\n')
  utimesSync(scratch.file, LOADED_AT, LOADED_AT)
  t = await freshDb()
  runtime = await import('../src/server/lib/runtime.ts')
  world = await import('../src/server/lib/world.ts')
  localStamp = (await import('../src/shared/time.ts')).localStamp
}, 60000)

afterAll(() => {
  vi.useRealTimers()
  t.close()
  removeThisTestFolder(folder)
})

it('a reading within a second of the last look reads that look, and a reading a second after it looks again', () => {
  const { Gaps, freshness } = runtime
  const { howOldThisServersCodeIs } = world
  vi.useFakeTimers({ toFake: ['performance'] })
  const loaded = scratch.looks

  expect(howOldThisServersCodeIs().verdict, "the header's first reading").toBe('fresh')
  expect(scratch.looks - loaded, 'the first reading of the process looks at the files itself').toBe(1)

  writeFileSync(scratch.file, 'export const saved = 2\n')
  utimesSync(scratch.file, SAVED_AT, SAVED_AT)

  vi.advanceTimersByTime(999)
  expect(howOldThisServersCodeIs().verdict, "the header's reading 999 ms after the look").toBe('fresh')
  expect(freshness(new Gaps()).newestOnDisk, "the runtime record's reading in the same second").toBe(localStamp(LOADED_AT))
  expect(scratch.looks - loaded, 'neither reading within the second looked at the files').toBe(1)

  vi.advanceTimersByTime(1)
  expect(howOldThisServersCodeIs().verdict, "the header's reading a second after the look").toBe('stale')
  expect(freshness(new Gaps()).newestOnDisk, "the runtime record's reading in the second of the new look").toBe(
    localStamp(SAVED_AT),
  )
  expect(scratch.looks - loaded, 'the reading a second after the look looked at the files once').toBe(2)
})
