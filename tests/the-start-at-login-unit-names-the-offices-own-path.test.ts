// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE START-AT-LOGIN UNIT NAMES THE OFFICE'S OWN PATH, NOT THE JOINED ONE, AND SO DO THE RESTART AND THE DATA-FOLDER
 * MOVER. Wave 13u, round 242.
 *
 * After the start has joined the user's PATH after the office's own, the server's PATH holds the user's entries. What
 * the server hands on as its own is the PATH it was started with (`theOfficesOwnSearchPathIn`,
 * src/config/the-users-own-path.mjs): the PATH line of the unit a press writes (src/config/start-at-login.mjs), the
 * environment the restart hands the new server (src/server/lib/the-environment-the-restart-hands-the-service.ts), and the
 * one the data-folder mover is handed (src/config/the-data-folder-move.mjs). The office each of them starts reads the
 * user's PATH again at its own start.
 *
 * WHAT IS MADE UP. The office's own PATH is one empty folder in this test's temp folder. The login shell is a /bin/sh
 * script there whose PATH is a made-up folder (tests/made-up-login-shells.ts). No real login shell runs, and no unit is
 * written.
 */

import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { IN_A_SANDBOX } from '../src/config/run-permissions.mjs'
import { quoted } from '../src/config/the-mail-tool.mjs'
import { freshDb, type TestDb } from './helpers.ts'
import { withThePath } from './made-up-agent-tools.ts'
import { writeAMadeUpLoginShell, type AMadeUpLoginShell } from './made-up-login-shells.ts'

let t: TestDb
let scratch = ''
let own = ''
let shell: AMadeUpLoginShell
let atLogin: typeof import('../src/config/start-at-login.mjs')
let restart: typeof import('../src/server/lib/the-environment-the-restart-hands-the-service.ts')
let mover: typeof import('../src/config/the-data-folder-move.mjs')
const before = { PATH: process.env['PATH'], sandbox: process.env[IN_A_SANDBOX] }
const A_USERS_ENTRY = '/made-up/users/bin'

beforeAll(async () => {
  t = await freshDb()
  scratch = join(dirname(t.file), 'the-users-path')
  own = join(scratch, 'the-offices-own-bin')
  mkdirSync(own, { recursive: true })
  shell = writeAMadeUpLoginShell(join(scratch, 'made-up-shell'), [A_USERS_ENTRY])
  // AFTER freshDb, so each is the copy that holds what this start read.
  const thePath = await import('../src/config/the-users-own-path.mjs')
  atLogin = await import('../src/config/start-at-login.mjs')
  restart = await import('../src/server/lib/the-environment-the-restart-hands-the-service.ts')
  mover = await import('../src/config/the-data-folder-move.mjs')
  process.env['PATH'] = own
  // This test may itself run in a sandbox; the start it stands for does not.
  delete process.env[IN_A_SANDBOX]
  try {
    await thePath.giveTheOfficeTheUsersPath({ shell: shell.program, shellEnvironment: { HOME: scratch }, aTestStartedThis: false })
  } finally {
    if (before.sandbox !== undefined) process.env[IN_A_SANDBOX] = before.sandbox
  }
}, 60_000)

afterAll(() => {
  if (before.PATH === undefined) delete process.env['PATH']
  else process.env['PATH'] = before.PATH
  t?.close()
})

describe("what a server hands on is the office's own PATH", () => {
  it("the server's own PATH is the joined one", () => {
    expect(process.env['PATH']).toBe([own, ...shell.path].join(':'))
  })

  it("the unit names the office's own PATH, and none of the user's entries", () => {
    const office = atLogin.theOfficeThisServerIs()
    expect(office.path).toBe(own)
    const unit = atLogin.theStartAtLoginUnit(office)
    expect(unit.split('\n')).toContain(`Environment=${quoted(`PATH=${own}`)}`)
    expect(unit).not.toContain(A_USERS_ENTRY)
  })

  it("the restart and the data-folder mover hand on the office's own PATH", () => {
    const envFile = join(scratch, 'a-made-up.env')
    writeFileSync(envFile, '')
    expect(restart.theEnvironmentTheRestartHandsTheService(process.env, envFile)['PATH']).toBe(own)
    expect(mover.theEnvironmentTheMoverIsHanded(process.env, envFile)['PATH']).toBe(own)
  })

  it('a PATH set after the start is handed on as it is', async () => {
    const office = await withThePath('/a/path/set/after/the/start', () => atLogin.theOfficeThisServerIs())
    expect(office.path).toBe('/a/path/set/after/the/start')
  })
})
