// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A SYSTEM WITH NO PROCESS TABLE IS REFUSED, AND A PROCESS THAT HAS ENDED STILL READS AS GONE.
 *
 * The Linux process reader (`linuxProcessReader` in src/config/process-reader.mjs, which
 * src/config/session-process.mjs reads through since wave 13p round 18) reads each process from /proc. A read that fails for one pid
 * answers null, because that pid's process has ended. On a system with no /proc every read fails
 * the same way, and null would call every live process gone with nothing failing (problem
 * EFWQKhCR6Ivj). So when a read fails and the process table folder itself is not there, the reader
 * throws, and the error names the folder and the port to write.
 *
 * WHAT IS PROVED, with a process table folder this test makes and one it never makes:
 *
 *   1. each of the five readers, pointed at a folder that does not exist, throws, and the error
 *      names the folder, /proc and the port;
 *   2. each of the five readers, pointed at a folder that exists and a pid that is not in it,
 *      answers null;
 *   3. the walk for a live codex process throws against a folder that does not exist, and answers
 *      null against an empty folder that does.
 *
 * ---------------------------------------------------------------------------------------
 * MUTATION, CONTROL RUN FIRST
 * ---------------------------------------------------------------------------------------
 *
 * CONTROL: every case below green.
 *
 * MUTATION: in src/config/process-reader.mjs (src/config/session-process.mjs before wave 13p round 18), the `throw` in `goneUnlessTheTableIsMissing` was
 * replaced by `return null`, which is the reading before the fix. The six cases that expect a
 * refusal went red; the six that expect null stayed green. The throw was put back.
 *
 * CONTROL AFTER THE RESTORE: every case green.
 */

import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { linuxProcessReader, THE_PORT_OF_THIS_MODULE } from '../src/config/process-reader.mjs'
import { commandLineOf, executableOf, nameOf, parentOf, startTimeOf, theLiveCodexProcessFor } from '../src/config/session-process.mjs'

/** The five readers of one process, each read through a Linux reader over the folder named. */
const READERS: Record<string, (pid: number, table: string) => unknown> = {
  commandLineOf: (pid, table) => commandLineOf(pid, linuxProcessReader(table)),
  nameOf: (pid, table) => nameOf(pid, linuxProcessReader(table)),
  executableOf: (pid, table) => executableOf(pid, linuxProcessReader(table)),
  startTimeOf: (pid, table) => startTimeOf(pid, linuxProcessReader(table)),
  parentOf: (pid, table) => parentOf(pid, linuxProcessReader(table)),
}

/** A pid that is not in a folder this test made, because the folder is empty. */
const A_PID = 4242

let made: string
let missing: string

beforeAll(() => {
  made = mkdtempSync(join(tmpdir(), 'mole-office-process-table-'))
  // Inside the folder this test made, and never created, so it cannot exist.
  missing = join(made, 'no-process-table-here')
})

afterAll(() => {
  // Only the folder this test made.
  rmSync(made, { recursive: true, force: true })
})

/** The words the refusal has to carry, for the folder it was pointed at. */
function expectTheRefusal(read: () => unknown): void {
  let thrown: unknown = null
  try {
    read()
  } catch (error) {
    thrown = error
  }
  expect(thrown).toBeInstanceOf(Error)
  const says = (thrown as Error).message
  expect(says).toContain(`This system has no ${missing}.`)
  expect(says).toContain('which is /proc on Linux')
  expect(says).toContain('src/config/process-reader.mjs')
  expect(says).toContain(`A port writes ${THE_PORT_OF_THIS_MODULE}`)
}

describe('a process table folder that does not exist is refused', () => {
  for (const [name, reader] of Object.entries(READERS)) {
    it(`${name} throws and names the missing folder and the port`, () => {
      expectTheRefusal(() => reader(A_PID, missing))
    })
  }

  it('the walk for a live codex process throws too', () => {
    expectTheRefusal(() => theLiveCodexProcessFor('a-thread', linuxProcessReader(missing)))
  })
})

describe('a process that is not in a folder that exists still reads as gone', () => {
  for (const [name, reader] of Object.entries(READERS)) {
    it(`${name} answers null`, () => {
      expect(reader(A_PID, made)).toBeNull()
    })
  }

  it('the walk for a live codex process answers null', () => {
    expect(theLiveCodexProcessFor('a-thread', linuxProcessReader(made))).toBeNull()
  })
})
