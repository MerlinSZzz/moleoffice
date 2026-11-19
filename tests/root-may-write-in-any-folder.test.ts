// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A CASE THAT NEEDS A FOLDER OR A FILE THIS PROCESS MAY NOT WRITE IN SKIPS WHERE A SHUT FOLDER TAKES A WRITE, AND SAYS
 * WHY (wave 13t, rounds W27 and W28).
 *
 * tests/root-may-write-in-any-folder.ts holds the rule, and tests/a-shut-folder-takes-a-write.ts the question it asks.
 * These cases prove the rule with a stand-in for that question's answer, so they say the same whoever runs them, and
 * nothing here runs as root. Until round W28 the rule asked the uid, and these cases gave a stand-in for the uid.
 *   1. Where a shut folder takes a write, the rule warns and skips with the reason, and says that it skipped, though
 *      the uid is 1000.
 *   2. Where a shut folder takes no write, the rule neither warns nor skips, though the uid is 0.
 *   3. Where a shut folder takes a write, tests/a-folder-shut-after-the-copy.ts throws the rule's words, and makes no
 *      pipe and runs no press.
 *   4. The question itself, with a stand-in for its one write: the folder is shut when it is written in; a write
 *      refused is no and a write done is yes; any other failure is thrown; and no folder is left.
 *
 * MUTATIONS (each after a control run; the commit message names the runs):
 *   - the rule asks the uid again: cases 1 and 2 go red.
 *   - the rule skips without the warning: case 1 goes red.
 *   - the shut-folder helper's own check taken out: case 3 goes red.
 *   - the shut-folder helper asks the uid again: case 3 goes red.
 *   - the question writes before it shuts the folder: case 4 goes red.
 *   - the question takes any failure for no: case 4 goes red.
 */
import { existsSync, mkdtempSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { aFolderShutAfterTheCopy } from './a-folder-shut-after-the-copy.ts'
import { ROOT_MAY_WRITE_IN_ANY_FOLDER, skippedAsRoot } from './root-may-write-in-any-folder.ts'

/** THE STAND-IN FOR THE QUESTION'S ANSWER: undefined asks the real question. */
const stand = vi.hoisted(() => ({ answer: undefined as boolean | undefined }))

vi.mock('./a-shut-folder-takes-a-write.ts', async (importOriginal) => {
  const real = await importOriginal<typeof import('./a-shut-folder-takes-a-write.ts')>()
  return { aShutFolderTakesAWrite: (write?: (path: string) => void) => stand.answer ?? real.aShutFolderTakesAWrite(write) }
})

afterEach(() => {
  stand.answer = undefined
  vi.restoreAllMocks()
})

/** A context that notes each skip instead of skipping, so the case can see it. */
function aContextThatNotes(): { skips: string[]; skip: (note: string) => void } {
  const skips: string[] = []
  return { skips, skip: (note) => skips.push(note) }
}

/** An error with a file system's code, as a write would throw it. */
const anError = (code: string) => Object.assign(new Error(`${code}: the stand-in's write`), { code })

describe('a case that needs a folder this process may not write in', () => {
  it('1: where a shut folder takes a write, warns and skips with the reason, though the uid is 1000', () => {
    stand.answer = true
    vi.spyOn(process, 'getuid').mockReturnValue(1000)
    const warned = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const context = aContextThatNotes()
    expect(skippedAsRoot(context)).toBe(true)
    expect(context.skips).toEqual([ROOT_MAY_WRITE_IN_ANY_FOLDER])
    expect(warned.mock.calls).toEqual([[`Skipped. ${ROOT_MAY_WRITE_IN_ANY_FOLDER}`]])
  })

  it('2: where a shut folder takes no write, neither warns nor skips, though the uid is 0', () => {
    stand.answer = false
    vi.spyOn(process, 'getuid').mockReturnValue(0)
    const warned = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const context = aContextThatNotes()
    expect(skippedAsRoot(context)).toBe(false)
    expect(context.skips).toEqual([])
    expect(warned.mock.calls).toEqual([])
  })

  it('3: where a shut folder takes a write, the shut-folder helper throws the same words, and makes no pipe and runs no press', async () => {
    stand.answer = true
    vi.spyOn(process, 'getuid').mockReturnValue(1000)
    const folder = mkdtempSync(join(tmpdir(), 'root-may-write-in-any-folder-test-'))
    const press = vi.fn()
    try {
      await expect(aFolderShutAfterTheCopy({ folder, copy: join(folder, 'copy'), temporary: join(folder, 'temporary') }, press)).rejects.toThrow(
        `${ROOT_MAY_WRITE_IN_ANY_FOLDER} Ask skippedAsRoot(context) before this helper.`,
      )
      expect(press).not.toHaveBeenCalled()
      expect(existsSync(join(folder, 'temporary'))).toBe(false)
    } finally {
      rmSync(folder, { recursive: true, force: true })
    }
  })

  it('4: the question shuts its folder before the write, says no to a refused write and yes to a done one, throws any other failure, and leaves no folder', async () => {
    const { aShutFolderTakesAWrite } = await vi.importActual<typeof import('./a-shut-folder-takes-a-write.ts')>('./a-shut-folder-takes-a-write.ts')
    const written: { path: string; mode: number }[] = []
    /** A stand-in for the write: it notes the folder's mode, then does what it is told. */
    const aWrite = (then: () => void) => (path: string) => {
      written.push({ path, mode: statSync(dirname(path)).mode & 0o777 })
      then()
    }
    expect(aShutFolderTakesAWrite(aWrite(() => { throw anError('EACCES') }))).toBe(false)
    expect(aShutFolderTakesAWrite(aWrite(() => { throw anError('EPERM') }))).toBe(false)
    expect(aShutFolderTakesAWrite(aWrite(() => undefined))).toBe(true)
    expect(() => aShutFolderTakesAWrite(aWrite(() => { throw anError('ENOSPC') }))).toThrow("ENOSPC: the stand-in's write")
    expect(written.map((write) => write.mode)).toEqual([0o500, 0o500, 0o500, 0o500])
    for (const write of written) expect(existsSync(dirname(write.path)), `the question left ${dirname(write.path)}`).toBe(false)
  })
})
