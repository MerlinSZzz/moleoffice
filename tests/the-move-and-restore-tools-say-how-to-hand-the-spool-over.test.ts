// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** Every database, home and spool here is made up in a test folder; nothing reads or writes the machine's own spool. */
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, relative } from 'node:path'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { freshDb } from './helpers.ts'
import { aTestDatabaseFolder, removeThisTestFolder } from './a-test-folder.ts'
import { GATE_COUNT_SPOOL } from '../src/config/gate-count-spool.mjs'
import { databaseIdentity } from '../src/config/database-identity.mjs'
import { SURFACES } from '../src/shared/surfaces.ts'
import { enWave13q } from '../src/shared/words/en-wave-13q.ts'
import { enWave13r } from '../src/shared/words/en-wave-13r.ts'
import { theGateCountSpoolStep } from '../tools/stable/stable-gate-count-spool-step.mjs'

// THE MOVE AND RESTORE TOOLS SAY HOW TO HAND THE SPOOL OVER (wave 13q item 1h). The gate-count spool belongs to one
// world, and a world is the database file's path and creation time. A data-folder move changes the path, and the
// stable upgrade's recovery renames a new file over the database, so the office has a new world and counts nothing
// from the spool until the person hands it over. The tools say so in one sentence-maker, and never read .world.
const WHY = { moved: 'w13q.spool.movedWhy', restored: 'w13q.spool.restoredWhy', 'restore-later': 'w13q.spool.restoreLaterWhy' } as const
const CHANGES = Object.keys(WHY) as (keyof typeof WHY)[]
// A backup's words are read before any restore, so they give the world as it was when the backup was taken, not as "now".
const WORLD = { moved: 'w13q.spool.world', restored: 'w13q.spool.world', 'restore-later': 'w13q.spool.worldWhenTaken' } as const

// THE STEP ASKS THE OFFICE'S ONE FUNCTION FOR THE FOLDER (wave 13q item 5b). theGateCountSpoolFolder answers as itself
// unless a case sets `answer`, and each home it is asked for is kept. A join of the step's own gives the same folder as
// the function, so only an answer the function alone gives shows that the step asked it.
const spoolFolder = vi.hoisted(() => ({ askedFor: [] as string[], answer: null as string | null }))
vi.mock('../src/config/gate-count-spool.mjs', async (importOriginal) => {
  const real = await importOriginal<typeof import('../src/config/gate-count-spool.mjs')>()
  return {
    ...real,
    theGateCountSpoolFolder: (home: string) => {
      spoolFolder.askedFor.push(home)
      return spoolFolder.answer ?? real.theGateCountSpoolFolder(home)
    },
  }
})
let folder: string, home: string, database: string
beforeEach(() => {
  folder = aTestDatabaseFolder('spool-step')
  home = join(folder, 'a-made-up-home')
  database = join(folder, 'invented.db')
  writeFileSync(database, 'a made-up database file\n')
  expect(databaseIdentity(database).id, databaseIdentity(database).how).not.toBe('unknown')
})
afterEach(() => removeThisTestFolder(folder))

it('puts the spool where the office reads it, for the home the office runs with', async () => {
  const t = await freshDb()
  try {
    const { THE_GATE_COUNT_SPOOL } = await import('../src/server/lib/gate-count-spool.ts')
    expect(theGateCountSpoolStep({ database, home: homedir(), change: 'moved' }).folder).toBe(THE_GATE_COUNT_SPOOL)
    expect(relative(home, theGateCountSpoolStep({ database, home, change: 'moved' }).folder)).toBe(relative(homedir(), THE_GATE_COUNT_SPOOL))
  } finally { t.close() }
}, 30_000)

it("takes the spool's folder from theGateCountSpoolFolder, asked with the home it was handed, with a world and without", () => {
  const answer = join(folder, 'a-folder-only-the-function-answers')
  const missing = join(folder, 'no-such-database.db')
  spoolFolder.answer = answer
  spoolFolder.askedFor.length = 0
  try {
    for (const change of CHANGES) {
      const withAWorld = theGateCountSpoolStep({ database, home, change })
      expect(withAWorld.folder, change).toBe(answer)
      expect(withAWorld.says, change).toContain(answer)
      expect(theGateCountSpoolStep({ database: missing, home, change }).folder, `${change}, with no world`).toBe(answer)
    }
    // Each change asked twice: once with a world and once without.
    expect(spoolFolder.askedFor).toEqual(CHANGES.flatMap(() => [home, home]))
  } finally {
    spoolFolder.answer = null
  }
})

it('names the spool, its world file, the world and when it was read, the press and its place, and why the world changed', () => {
  const world = databaseIdentity(database)
  const theWorld = (word: (typeof WORLD)[keyof typeof WORLD]) => enWave13q[word].replace('{id}', () => world.id).replace('{how}', () => world.how)
  const said = CHANGES.map(change => {
    const step = theGateCountSpoolStep({ database, home, change })
    for (const part of [database, step.folder, GATE_COUNT_SPOOL.world, GATE_COUNT_SPOOL.rejects, world.id, world.how, enWave13r['gates.spool.give'], enWave13r['gates.title'], SURFACES['rail.settings']]) expect(step.says, `${change}: ${part}`).toContain(part)
    for (const other of CHANGES) {
      if (other === change) expect(step.says).toContain(enWave13q[WHY[other]])
      else expect(step.says, `${change} says why for ${other}`).not.toContain(enWave13q[WHY[other]])
    }
    for (const word of new Set(Object.values(WORLD))) {
      if (word === WORLD[change]) expect(step.says, `${change}: ${word}`).toContain(theWorld(word))
      else expect(step.says, `${change} gives the world as ${word}`).not.toContain(theWorld(word))
    }
    return step.says
  })
  expect(new Set(said).size).toBe(CHANGES.length)
})

it('never makes, reads or removes the spool\'s world file, so what it says does not depend on that file', () => {
  const without = theGateCountSpoolStep({ database, home, change: 'moved' })
  expect(existsSync(without.folder)).toBe(false)
  mkdirSync(without.folder, { recursive: true, mode: GATE_COUNT_SPOOL.folderMode })
  const worldFile = join(without.folder, GATE_COUNT_SPOOL.world)
  for (const names of ['a-made-up-world\n', `${databaseIdentity(database).id}\n`]) {
    writeFileSync(worldFile, names, { mode: GATE_COUNT_SPOOL.fileMode })
    const before = statSync(worldFile)
    expect(theGateCountSpoolStep({ database, home, change: 'moved' })).toEqual(without)
    expect(readFileSync(worldFile, 'utf8')).toBe(names)
    expect(statSync(worldFile).mtimeMs).toBe(before.mtimeMs)
  }
})

it('says an office with no world reads no spool, with the reason, and names no press', () => {
  const missing = join(folder, 'no-such-database.db')
  for (const change of CHANGES) {
    const step = theGateCountSpoolStep({ database: missing, home, change })
    expect(step.says).toContain(missing)
    expect(step.says).toContain(databaseIdentity(missing).how)
    expect(step.says).not.toContain(enWave13r['gates.spool.give'])
  }
})

it('refuses a change it has no words for', () => {
  // @ts-expect-error A caller in plain JavaScript can pass any word, and the step must refuse it rather than say nothing.
  expect(() => theGateCountSpoolStep({ database, home, change: 'copied' })).toThrow(/copied/)
})
