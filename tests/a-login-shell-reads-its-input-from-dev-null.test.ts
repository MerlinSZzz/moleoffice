// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A LOGIN SHELL WHOSE STARTUP FILE READS ITS INPUT READS NOTHING, AND ANSWERS. Wave 13u, round 242.
 *
 * The start runs the user's login shell with its standard input from /dev/null (src/config/the-users-own-path.mjs). A
 * startup file that reads its input reaches the end of it at once, so the shell goes on and prints its PATH. With an
 * input that was never closed, the made-up startup file below would wait until the bound and the PATH would not be read.
 *
 * WHAT IS MADE UP. The login shell is a /bin/sh script in this test's temp folder (tests/made-up-login-shells.ts). Its
 * startup file asks whether its input is /dev/null, and reads all of it. No real login shell runs.
 */

import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { readTheUsersPath } from '../src/config/the-users-own-path.mjs'
import { writeAMadeUpLoginShell } from './made-up-login-shells.ts'

const scratch = mkdtempSync(join(tmpdir(), 'mole-office-the-users-path-input-'))
afterAll(() => rmSync(scratch, { recursive: true, force: true }))

describe("the login shell's input", () => {
  it('is /dev/null, so a startup file that reads it reads nothing and the shell answers', async () => {
    const shell = writeAMadeUpLoginShell(join(scratch, 'reads'), ['/made-up/users/bin'], { readsItsInput: true })
    const reading = await readTheUsersPath({ platform: 'linux', shell: shell.program, shellEnvironment: { HOME: scratch } })
    expect(reading).toEqual({ read: true, from: 'loginShell', shell: shell.program, entries: shell.path })
    expect(shell.inputWasDevNull()).toBe(true)
    expect(shell.input()).toBe('')
  }, 30_000)
})
