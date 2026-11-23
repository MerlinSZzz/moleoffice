// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE USER'S PATH IS WHAT THE LOGIN SHELL PRINTED BETWEEN THE MARKERS, AND IT IS JOINED AFTER THE OFFICE'S OWN. Wave 13u,
 * round 242.
 *
 * The start runs the user's login shell as a login shell, and the shell prints PATH between two markers made new at each
 * read (src/config/the-users-own-path.mjs). A line a startup file prints before them, text it leaves with no line end,
 * and a line printed after them are not PATH. The join keeps the office's own entries first, in their order, adds each
 * of the user's that is not there yet, in the user's order, and drops empty entries and repeats.
 *
 * WHAT IS MADE UP. The login shell is a /bin/sh script in this test's temp folder (tests/made-up-login-shells.ts), and
 * every entry is a made-up folder. No real login shell runs, and this machine's PATH is not read.
 */

import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { giveTheOfficeTheUsersPath, readTheUsersPath, theJoinedSearchPath } from '../src/config/the-users-own-path.mjs'
import { writeAMadeUpLoginShell } from './made-up-login-shells.ts'

const scratch = mkdtempSync(join(tmpdir(), 'mole-office-the-users-path-'))
afterAll(() => rmSync(scratch, { recursive: true, force: true }))

describe("the login shell's answer", () => {
  it('is only what it printed between the two markers', async () => {
    const shell = writeAMadeUpLoginShell(join(scratch, 'prints-around'), ['/made-up/users/bin', '/made-up/users/tools'], { printAroundTheMarkers: true })
    const reading = await readTheUsersPath({ platform: 'linux', shell: shell.program, shellEnvironment: { HOME: scratch } })
    expect(reading).toEqual({ read: true, from: 'loginShell', shell: shell.program, entries: shell.path })
    expect(JSON.stringify(reading)).not.toContain(shell.printed.before)
    expect(JSON.stringify(reading)).not.toContain(shell.printed.unended)
    expect(JSON.stringify(reading)).not.toContain(shell.printed.after)
  }, 30_000)

  it('is asked of a login shell, with one command', async () => {
    const shell = writeAMadeUpLoginShell(join(scratch, 'asked'), ['/made-up/users/bin'])
    await readTheUsersPath({ platform: 'linux', shell: shell.program, shellEnvironment: { HOME: scratch } })
    expect(shell.starts()).toEqual(['-l -c'])
  }, 30_000)
})

describe('the join', () => {
  it("puts the office's entries first in their order, then the user's in theirs, and drops repeats and empty entries", () => {
    expect(theJoinedSearchPath('/office/one::/office/two:/office/one', ['/users/a', '', '/office/two', '/users/b', '/users/a', '/office/one'], 'linux')).toEqual({
      joined: '/office/one:/office/two:/users/a:/users/b',
      added: 2,
    })
  })

  it("gives the start's environment the joined PATH and says how many of the user's entries it added", async () => {
    const shell = writeAMadeUpLoginShell(join(scratch, 'joined'), ['/office/two', '/made-up/users/bin', '', '/made-up/users/bin'])
    const env: Record<string, string | undefined> = { PATH: '/office/one:/office/two', HOME: scratch }
    const at = await giveTheOfficeTheUsersPath({ env, platform: 'linux', shell: shell.program, shellEnvironment: { HOME: scratch }, aTestStartedThis: false })
    const itsPrintenv = shell.path[shell.path.length - 1]
    expect(env['PATH']).toBe(`/office/one:/office/two:/made-up/users/bin:${String(itsPrintenv)}`)
    expect(at).toMatchObject({ own: '/office/one:/office/two', joined: env['PATH'], added: 2 })
  }, 30_000)
})
