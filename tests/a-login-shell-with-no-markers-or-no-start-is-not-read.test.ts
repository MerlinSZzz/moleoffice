// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A LOGIN SHELL THAT ENDS WITHOUT THE MARKERS, AND ONE THAT CANNOT BE STARTED, ARE EACH NOT READ, EACH WITH ITS OWN CODE.
 * Wave 13u, round 242.
 *
 * The start takes the user's PATH only from between the two markers the shell prints (src/config/the-users-own-path.mjs).
 * A shell that ends before it prints them says noMarkers, and a shell the system cannot start says couldNotStart. Either
 * way the start's PATH is left as it was.
 *
 * WHAT IS MADE UP. The first login shell is a /bin/sh script in this test's temp folder whose startup file ends the shell
 * (tests/made-up-login-shells.ts). The second is a path in that folder where no program is. No real login shell runs.
 */

import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { giveTheOfficeTheUsersPath } from '../src/config/the-users-own-path.mjs'
import { writeAMadeUpLoginShell } from './made-up-login-shells.ts'

const scratch = mkdtempSync(join(tmpdir(), 'mole-office-the-users-path-not-read-'))
afterAll(() => rmSync(scratch, { recursive: true, force: true }))

describe('a login shell that does not print its PATH', () => {
  it('is not read when it ends without the markers, and the PATH stays the office\'s own', async () => {
    const shell = writeAMadeUpLoginShell(join(scratch, 'ends'), ['/made-up/users/bin'], { endsBeforeTheCommand: true })
    const env: Record<string, string | undefined> = { PATH: '/office/one', HOME: scratch }
    const at = await giveTheOfficeTheUsersPath({ env, platform: 'linux', shell: shell.program, shellEnvironment: { HOME: scratch }, aTestStartedThis: false })
    expect(at.reading).toMatchObject({ read: false, from: 'loginShell', shell: shell.program, code: 'noMarkers' })
    expect(shell.starts()).toEqual(['-l -c'])
    expect(env['PATH']).toBe('/office/one')
  }, 30_000)

  it('is not read when it cannot be started, with a code of its own, and the PATH stays the office\'s own', async () => {
    const nowhere = join(scratch, 'no-shell-here')
    const env: Record<string, string | undefined> = { PATH: '/office/one', HOME: scratch }
    const at = await giveTheOfficeTheUsersPath({ env, platform: 'linux', shell: nowhere, shellEnvironment: { HOME: scratch }, aTestStartedThis: false })
    expect(at.reading).toMatchObject({ read: false, from: 'loginShell', shell: nowhere, code: 'couldNotStart' })
    expect(at.reading.read ? '' : at.reading.says).toContain('ENOENT')
    expect(env['PATH']).toBe('/office/one')
  }, 30_000)
})
