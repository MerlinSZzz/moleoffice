// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A MARK THAT CANNOT BE WRITTEN ENDS THE START IN WORDS (design/window/the-data-folder-move.criteria.md, DF30).
 *
 * The server writes the database's mark once it has opened the database. Until this change, a mark that
 * could not be written ended the start with an uncaught error and a stack, whether the folder was not
 * writable, the disk was read-only or full, or a file stood where a folder should be. The start now ends
 * with a sentence that names the mark's path and the system's reason and says what the person can do, and
 * with the failed exit code.
 *
 * The failure is made the same way for every user, root included: the per-user folder is a regular file,
 * so the mark's folder cannot be made under it. Every path is under a temporary folder; nothing is
 * written in the home folder.
 *
 * THE MUTANT THIS FILE EXISTS FOR. Take the try and catch out of `keepTheMarkOfTheDatabase` and let the
 * mkdir or the write throw: this file goes red because the call throws instead of answering with words.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'

import { keepTheMarkOfTheDatabase, theMarkOfTheDatabase } from '../src/config/may-a-start-make-the-database.mjs'

const made: string[] = []

function aTemporaryFolder(name: string): string {
  const folder = mkdtempSync(join(tmpdir(), `mole-office-mark-${name}-`))
  made.push(folder)
  return folder
}

afterAll(() => {
  for (const folder of made) rmSync(folder, { recursive: true, force: true })
})

describe('a mark that cannot be written ends the start in words', () => {
  it('answers with a sentence naming the mark and the system reason, and throws nothing', () => {
    const held = aTemporaryFolder('held')
    const configHomeStandingAsAFile = join(held, 'config-home-is-a-file')
    writeFileSync(configHomeStandingAsAFile, 'a file stands where the per-user folder should be\n')
    const place = aTemporaryFolder('place')
    const dataRoot = aTemporaryFolder('data-root')
    const database = join(place, 'office', 'mole-office.db')
    const here = { env: { XDG_CONFIG_HOME: configHomeStandingAsAFile }, platform: 'linux', dataRoot }
    const mark = theMarkOfTheDatabase(database, here)

    let whatTheSystemSaid = ''
    try {
      mkdirSync(dirname(mark), { recursive: true })
    } catch (error) {
      whatTheSystemSaid = error instanceof Error ? error.message : String(error)
    }
    expect(whatTheSystemSaid, 'the mark folder was made, so this case does not fail the write').not.toBe('')

    let said: string | null = null
    expect(() => {
      said = keepTheMarkOfTheDatabase(database, here)
    }).not.toThrow()
    expect(said).not.toBeNull()
    expect(said).toContain(mark)
    expect(said).toContain(whatTheSystemSaid)
    expect(said).toContain('Make the folder that holds the mark writable')
    expect(said).toContain('start Mole Office again')
  })
})
