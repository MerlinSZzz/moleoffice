// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHERE THE PASSWORD ENTRY NAMES NO LOGIN SHELL, THE USER'S PATH IS NOT READ AND NO SHELL IS STARTED. Wave 13u, round
 * 242.
 *
 * The start asks the password entry for the user's login shell (`userInfo().shell`, src/config/the-users-own-path.mjs).
 * Where it names none, the reading says noLoginShell, the start's PATH is left as it was, and nothing is started.
 *
 * WHAT IS MADE UP. This file's `userInfo` answers the real password entry with its shell taken out, and its `spawn` is
 * the real one with a spy on it, so the test can say that nothing was started. No shell runs.
 */

import { describe, expect, it, vi } from 'vitest'
import { spawn } from 'node:child_process'
import { giveTheOfficeTheUsersPath } from '../src/config/the-users-own-path.mjs'

vi.mock('node:os', async (importOriginal) => {
  const real = await importOriginal<typeof import('node:os')>()
  const userInfo = () => ({ ...real.userInfo(), shell: null })
  return { ...real, userInfo, default: { ...real, userInfo } }
})

vi.mock('node:child_process', async (importOriginal) => {
  const real = await importOriginal<typeof import('node:child_process')>()
  const spied = vi.fn(real.spawn)
  return { ...real, spawn: spied, default: { ...real, spawn: spied } }
})

describe('no login shell named', () => {
  it('is not read, the PATH stays the office\'s own, and no shell is started', async () => {
    vi.mocked(spawn).mockClear()
    const env: Record<string, string | undefined> = { PATH: '/office/one', HOME: '/made-up/home' }
    const at = await giveTheOfficeTheUsersPath({ env, platform: 'linux', shellEnvironment: { HOME: '/made-up/home' }, aTestStartedThis: false })
    expect(at.reading).toMatchObject({ read: false, from: 'loginShell', shell: null, code: 'noLoginShell' })
    expect(env['PATH']).toBe('/office/one')
    expect(vi.mocked(spawn)).not.toHaveBeenCalled()
  })

  it('is not read where the entry names the empty word either', async () => {
    vi.mocked(spawn).mockClear()
    const env: Record<string, string | undefined> = { PATH: '/office/one', HOME: '/made-up/home' }
    const at = await giveTheOfficeTheUsersPath({ env, platform: 'linux', shell: '', shellEnvironment: { HOME: '/made-up/home' }, aTestStartedThis: false })
    expect(at.reading).toMatchObject({ read: false, code: 'noLoginShell' })
    expect(vi.mocked(spawn)).not.toHaveBeenCalled()
  })
})
