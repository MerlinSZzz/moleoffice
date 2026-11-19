// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * ONE MODULE ANSWERS THE OFFICE'S KEY, AND IT IS THE ONLY PLACE A PROCESS FINDS THE FILE.
 *
 * Criterion P83 point 5, and C1 of the piece that sends the key. The path is declared once, in
 * `keysPathFrom` in src/config/settings.mjs. A second spelling of it — `keys.json`, or the
 * directory arithmetic — would silently read the wrong file the moment MOLE_OFFICE_DB moves, and
 * nothing would fail. So the reader is pinned two ways: it uses the one function, and no other file
 * under src/ or tools/ spells the file's name.
 *
 * THE READER BEHAVIOUR IS DRIVEN, NOT ASSERTED FROM A CONSTANT. Two made-up key files in two
 * directories answer their own values; a missing file answers nothing and tells a person to start
 * the office once, naming the file and never any bytes; a file with no office value does the same;
 * and asking never makes the file.
 *
 * ---------------------------------------------------------------------------------------
 * MUTATION PROOF (after a green control)
 * ---------------------------------------------------------------------------------------
 *
 * In src/config/office-key.mjs, replace `keysPathFrom(env)` with a path this module spells for
 * itself (for example `join(dirname(String(env['MOLE_OFFICE_DB'])), 'keys.json')`). The source scan
 * goes red on both halves — the module no longer calls the one function and now spells the name.
 * Restoring the line turns it green.
 */

import { existsSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { theOfficeKey } from '../src/config/office-key.mjs'
import { aTestDatabaseFolder } from './a-test-folder.ts'




const MADE_UP_ONE = 'a1'.repeat(32)
const MADE_UP_TWO = 'b2'.repeat(32)
const MADE_UP_PERSON = 'c3'.repeat(32)

let oneDir = ''
let twoDir = ''

beforeAll(() => {
  oneDir = aTestDatabaseFolder('reader-one')
  twoDir = aTestDatabaseFolder('reader-two')
})

afterAll(() => {
  rmSync(oneDir, { recursive: true, force: true })
  rmSync(twoDir, { recursive: true, force: true })
})

describe('the one reader answers the office’s key', () => {
  it('answers the office value beside whichever database it is told about', () => {
    writeFileSync(
      join(oneDir, 'keys.json'),
      `${JSON.stringify({ person: MADE_UP_PERSON, office: MADE_UP_ONE, providers: {} }, null, 2)}\n`,
    )
    writeFileSync(
      join(twoDir, 'keys.json'),
      `${JSON.stringify({ person: MADE_UP_PERSON, office: MADE_UP_TWO, providers: {} }, null, 2)}\n`,
    )
    expect(theOfficeKey({ MOLE_OFFICE_DB: join(oneDir, 'panelx.db') }).key).toBe(MADE_UP_ONE)
    expect(theOfficeKey({ MOLE_OFFICE_DB: join(twoDir, 'other.db') }).key).toBe(MADE_UP_TWO)
  })

  it('answers nothing, names the file and never makes it when there is no key file', () => {
    const there = join(oneDir, 'nowhere')
    const answer = theOfficeKey({ MOLE_OFFICE_DB: join(there, 'panelx.db') })
    expect(answer.key).toBeNull()
    expect(answer.says, 'the sentence does not name the file a person must look at').toContain(join(there, 'keys.json'))
    expect(answer.says, 'the sentence does not say what to do').toContain('start the office')
    expect(existsSync(join(there, 'keys.json')), 'the reader made a key file for a database the server has not opened').toBe(
      false,
    )
  })

  it('answers nothing and names the file when the file holds no office value', () => {
    const there = aTestDatabaseFolder('reader-no-office')
    try {
      writeFileSync(join(there, 'keys.json'), `${JSON.stringify({ person: MADE_UP_PERSON, providers: {} })}\n`)
      const answer = theOfficeKey({ MOLE_OFFICE_DB: join(there, 'panelx.db') })
      expect(answer.key).toBeNull()
      expect(answer.says).toContain(join(there, 'keys.json'))
    } finally {
      rmSync(there, { recursive: true, force: true })
    }
  })
})

