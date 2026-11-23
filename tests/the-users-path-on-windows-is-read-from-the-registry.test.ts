// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * ON WINDOWS THE USER'S PATH IS THE MACHINE'S AND THE USER'S PATH FROM THE REGISTRY, EXPANDED, AND JOINED AS WINDOWS
 * COMPARES FOLDERS. Wave 13u, round 242.
 *
 * On Windows no shell is run. The start reads the machine's Path and the user's from the registry, in the order Windows
 * joins them, expands each %NAME% from the office's environment in any case, and leaves a name the environment does not
 * hold as it is written (src/config/the-users-own-path.mjs). The join treats two entries as one where Windows would find
 * the same folder by them: in any case, with / or \, with or without a \ at the end.
 *
 * WHAT IS MADE UP. The registry reader is a function of this test, which answers made-up Paths, and every folder is a
 * made-up one. The real registry is not read, and PowerShell is not started.
 */

import { describe, expect, it } from 'vitest'
import { giveTheOfficeTheUsersPath, THE_LONGEST_THE_USERS_PATH_IS_WAITED_FOR_MS, type WhatTheRegistryHolds } from '../src/config/the-users-own-path.mjs'

/** A made-up registry reader: it answers `holds`, and writes down the bound it was given. */
function aMadeUpRegistry(holds: WhatTheRegistryHolds): { read: (longestMs: number) => Promise<WhatTheRegistryHolds>; asked: number[] } {
  const asked: number[] = []
  return {
    asked,
    read: (longestMs) => {
      asked.push(longestMs)
      return Promise.resolve(holds)
    },
  }
}

const THE_OFFICES_OWN = { Path: 'C:\\Windows\\system32;C:\\Windows', SystemRoot: 'C:\\Windows', USERPROFILE: 'C:\\Users\\made-up' }

describe("the user's PATH on Windows", () => {
  it("reads the machine's and the user's Path, expands %NAME% in any case, and counts entries Windows finds as one folder once", async () => {
    const registry = aMadeUpRegistry({
      read: true,
      machine: '%SystemRoot%\\system32;%SYSTEMROOT%;C:\\Program Files\\Made Up\\bin\\',
      user: '%userprofile%\\AppData\\Roaming\\npm;c:\\program files\\made up\\BIN;%NOT_SET_HERE%\\bin;;C:\\Users\\made-up\\.local\\bin;c:/users/made-up/.local/bin/',
    })
    const env: Record<string, string | undefined> = { ...THE_OFFICES_OWN }
    const at = await giveTheOfficeTheUsersPath({ env, platform: 'win32', readTheRegistry: registry.read, aTestStartedThis: false })
    expect(at.reading).toEqual({
      read: true,
      from: 'registry',
      shell: null,
      entries: [
        'C:\\Windows\\system32',
        'C:\\Windows',
        'C:\\Program Files\\Made Up\\bin\\',
        'C:\\Users\\made-up\\AppData\\Roaming\\npm',
        'c:\\program files\\made up\\BIN',
        '%NOT_SET_HERE%\\bin',
        'C:\\Users\\made-up\\.local\\bin',
        'c:/users/made-up/.local/bin/',
      ],
    })
    expect(env['Path']).toBe(
      'C:\\Windows\\system32;C:\\Windows;C:\\Program Files\\Made Up\\bin\\;C:\\Users\\made-up\\AppData\\Roaming\\npm;%NOT_SET_HERE%\\bin;C:\\Users\\made-up\\.local\\bin',
    )
    expect(at.added).toBe(4)
    expect(registry.asked).toEqual([THE_LONGEST_THE_USERS_PATH_IS_WAITED_FOR_MS])
  })

  it('is not read when the registry cannot be read, and the Path stays the office\'s own', async () => {
    const registry = aMadeUpRegistry({ read: false, outOfTime: false, why: 'a made-up reader could not open the key.' })
    const env: Record<string, string | undefined> = { ...THE_OFFICES_OWN }
    const at = await giveTheOfficeTheUsersPath({ env, platform: 'win32', readTheRegistry: registry.read, aTestStartedThis: false })
    expect(at.reading).toMatchObject({ read: false, from: 'registry', shell: null, code: 'registryUnreadable' })
    expect(env['Path']).toBe(THE_OFFICES_OWN.Path)
  })

  it('is not read when the reader ran out of time, with the code a shell that ran out of time has', async () => {
    const registry = aMadeUpRegistry({ read: false, outOfTime: true, why: 'a made-up reader ran out of time.' })
    const env: Record<string, string | undefined> = { ...THE_OFFICES_OWN }
    const at = await giveTheOfficeTheUsersPath({ env, platform: 'win32', readTheRegistry: registry.read, aTestStartedThis: false })
    expect(at.reading).toMatchObject({ read: false, from: 'registry', code: 'noAnswerInTime' })
    expect(env['Path']).toBe(THE_OFFICES_OWN.Path)
  })
})
