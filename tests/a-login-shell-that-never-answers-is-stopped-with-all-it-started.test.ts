// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A LOGIN SHELL THAT NEVER ANSWERS IS NOT READ WITHIN THE BOUND, THE OFFICE KEEPS ITS OWN PATH, AND NOTHING THE SHELL
 * STARTED IS LEFT RUNNING. Wave 13u, round 242.
 *
 * The start runs the user's login shell in a process group of its own and waits for it no longer than the bound
 * (src/config/the-users-own-path.mjs). At the bound the whole group is stopped: the shell and the program its startup
 * file started. The reading says noAnswerInTime, and the start's PATH is left as it was.
 *
 * WHAT IS MADE UP. The login shell is a /bin/sh script in this test's temp folder (tests/made-up-login-shells.ts). Its
 * startup file starts this test's own Node on a script that never ends, writes down both process numbers, and waits.
 * The bound is given as three seconds here, so the test does not wait the start's five. No real login shell runs.
 */

import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it, vi } from 'vitest'
import { giveTheOfficeTheUsersPath } from '../src/config/the-users-own-path.mjs'
import { isRunning, writeAMadeUpLoginShell } from './made-up-login-shells.ts'

const scratch = mkdtempSync(join(tmpdir(), 'mole-office-the-users-path-no-answer-'))
afterAll(() => rmSync(scratch, { recursive: true, force: true }))

describe('a login shell that never answers', () => {
  it('is not read, the PATH stays the office\'s own, and the shell and what it started are stopped', async () => {
    const shell = writeAMadeUpLoginShell(join(scratch, 'waits'), ['/made-up/users/bin'], { neverAnswers: true })
    const env: Record<string, string | undefined> = { PATH: '/office/one:/office/two', HOME: scratch }
    const at = await giveTheOfficeTheUsersPath({ env, platform: 'linux', shell: shell.program, shellEnvironment: { HOME: scratch }, aTestStartedThis: false, longestMs: 3_000 })
    expect(at.reading).toMatchObject({ read: false, from: 'loginShell', shell: shell.program, code: 'noAnswerInTime' })
    expect(at.reading.read ? '' : at.reading.says).toContain('3 seconds')
    expect(at).toMatchObject({ joined: null, added: 0 })
    expect(env['PATH']).toBe('/office/one:/office/two')
    const pids = shell.pids()
    expect(pids).toHaveLength(2)
    await vi.waitFor(() => expect(pids.filter(isRunning)).toEqual([]), { timeout: 10_000, interval: 100 })
  }, 30_000)
})
