// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A SERVER IN A SANDBOX READS NOTHING, STARTS NO SHELL, AND KEEPS ITS CONTAINER'S PATH. Wave 13u, round 242.
 *
 * Where the start's environment names a sandbox (`theSandboxIn`, src/config/run-permissions.mjs), the start does not
 * read the user's PATH (src/config/the-users-own-path.mjs). The reading says inASandbox and the PATH is left as it was.
 * A server a test started is not read either, so it runs no startup file of the user's real home.
 *
 * WHAT IS MADE UP. The sandbox is this test's temp folder, named in a made-up environment, and the login shell is a
 * /bin/sh script there that writes down each start (tests/made-up-login-shells.ts). No real login shell runs.
 */

import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { IN_A_SANDBOX } from '../src/config/run-permissions.mjs'
import { giveTheOfficeTheUsersPath } from '../src/config/the-users-own-path.mjs'
import { writeAMadeUpLoginShell } from './made-up-login-shells.ts'

const scratch = mkdtempSync(join(tmpdir(), 'mole-office-the-users-path-sandbox-'))
afterAll(() => rmSync(scratch, { recursive: true, force: true }))

describe('a server that may not read the user\'s login shell', () => {
  it('in a sandbox: not read, no shell started, and the PATH unchanged', async () => {
    const shell = writeAMadeUpLoginShell(join(scratch, 'sandboxed'), ['/made-up/users/bin'])
    const env: Record<string, string | undefined> = { PATH: '/container/bin', HOME: scratch, [IN_A_SANDBOX]: scratch }
    const at = await giveTheOfficeTheUsersPath({ env, platform: 'linux', shell: shell.program, shellEnvironment: { HOME: scratch }, aTestStartedThis: false })
    expect(at.reading).toMatchObject({ read: false, from: null, shell: null, code: 'inASandbox' })
    expect(shell.starts()).toEqual([])
    expect(env['PATH']).toBe('/container/bin')
  }, 30_000)

  it('started by a test: not read, no shell started, and the PATH unchanged', async () => {
    const shell = writeAMadeUpLoginShell(join(scratch, 'by-a-test'), ['/made-up/users/bin'])
    const env: Record<string, string | undefined> = { PATH: '/office/one', HOME: scratch }
    const at = await giveTheOfficeTheUsersPath({ env, platform: 'linux', shell: shell.program, shellEnvironment: { HOME: scratch }, aTestStartedThis: true })
    expect(at.reading).toMatchObject({ read: false, from: null, shell: null, code: 'aTestStartedThisServer' })
    expect(shell.starts()).toEqual([])
    expect(env['PATH']).toBe('/office/one')
  }, 30_000)
})
