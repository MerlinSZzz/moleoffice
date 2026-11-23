// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A TOOL ONLY THE USER'S LOGIN SHELL HOLDS IS INSTALLED ON EVERY READER ONCE THE START HAS READ THE USER'S PATH, AND
 * GET /api/harnesses SAYS WHAT WAS READ. Wave 13u, round 242.
 *
 * Before the start reads the user's PATH, a tool in a folder only the user's shell puts on PATH is not on the PATH the
 * server holds, and the terminal page lists it as not installed. The start reads the user's PATH from the login shell
 * and joins it after the office's own, in the server's own environment (src/config/the-users-own-path.mjs). After that
 * the four readers of tests/a-tool-on-the-terminals-path-is-installed-on-every-reader.test.ts find the tool, with no
 * PATH set by this test: the terminal page's list, the signed-in reading, Settings' key reading and the worker
 * launcher. The list answers the reading beside the tools: not read before the start, then read from the shell, with
 * how many entries were added and no entry named.
 *
 * WHAT IS MADE UP. The office's own PATH is one empty folder in this test's temp folder. The login shell is a /bin/sh
 * script there (tests/made-up-login-shells.ts) whose PATH is a folder holding a made-up codex that is signed in
 * (tests/made-up-agent-tools.ts). No real login shell runs and no real tool is found, and the newest versions are read
 * from the stand-in registry in this process (tests/harness-stand-ins.ts). The start itself does not run: this test
 * calls what it calls, as a start outside a sandbox and not started by a test.
 */

import { randomBytes } from 'node:crypto'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { IN_A_SANDBOX } from '../src/config/run-permissions.mjs'
import { THE_PERSON } from '../src/shared/person.ts'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { aStandInRegistry, type StandInRegistry } from './harness-stand-ins.ts'
import { THE_VERSIONS, writeTheMadeUpTools, type MadeUpTools } from './made-up-agent-tools.ts'
import { writeAMadeUpLoginShell, type AMadeUpLoginShell } from './made-up-login-shells.ts'

let t: TestDb
let app: FastifyInstance
let tools: MadeUpTools
let shell: AMadeUpLoginShell
let registry: StandInRegistry
let own = ''
let res: typeof import('../src/server/lib/resources.ts')
let launcher: typeof import('../src/worker/runtimes/os.ts')
let terminals: typeof import('../src/server/lib/terminals.ts')
let thePath: typeof import('../src/config/the-users-own-path.mjs')
const before = { PATH: process.env['PATH'], registry: process.env['MOLE_OFFICE_HARNESS_REGISTRY'], sandbox: process.env[IN_A_SANDBOX] }

const PERSON = {
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

interface Listed {
  id: string
  installed: { path: string | null; version: string; versionWasRead: boolean }
}

async function call(url: string): Promise<{ status: number; body: Record<string, unknown>; raw: string }> {
  const reply = await app.inject({ method: 'GET', url, headers: PERSON })
  return { status: reply.statusCode, body: reply.json() as Record<string, unknown>, raw: reply.body }
}

async function theList(): Promise<{ byId: Record<string, Listed>; usersPath: unknown }> {
  const listed = await call('/api/harnesses')
  expect(listed.status, listed.raw).toBe(200)
  return { byId: Object.fromEntries((listed.body['harnesses'] as Listed[]).map((one) => [one.id, one])), usersPath: listed.body['usersPath'] }
}

beforeAll(async () => {
  t = await freshDb()
  writeFileSync(join(dirname(t.file), 'keys.json'), `${JSON.stringify({ person: randomBytes(32).toString('hex'), office: randomBytes(32).toString('hex'), providers: {} }, null, 2)}\n`, { mode: 0o600 })
  app = (await apiApp()).app
  await app.ready()
  // AFTER freshDb, so these are the copies the server loaded and not a second copy with its own state.
  res = await import('../src/server/lib/resources.ts')
  launcher = await import('../src/worker/runtimes/os.ts')
  terminals = await import('../src/server/lib/terminals.ts')
  thePath = await import('../src/config/the-users-own-path.mjs')
  tools = writeTheMadeUpTools(join(dirname(t.file), 'made-up-users-tools'), { programs: ['codex'] })
  tools.signedIn('codex', true)
  shell = writeAMadeUpLoginShell(join(dirname(t.file), 'made-up-shell'), [tools.dir])
  own = join(dirname(t.file), 'the-offices-own-bin')
  mkdirSync(own, { recursive: true })
  registry = await aStandInRegistry()
  process.env['MOLE_OFFICE_HARNESS_REGISTRY'] = registry.at
  process.env['PATH'] = own
}, 60_000)

afterAll(async () => {
  if (before.PATH === undefined) delete process.env['PATH']
  else process.env['PATH'] = before.PATH
  if (before.registry === undefined) delete process.env['MOLE_OFFICE_HARNESS_REGISTRY']
  else process.env['MOLE_OFFICE_HARNESS_REGISTRY'] = before.registry
  await registry?.close()
  await app?.close()
  t?.close()
})

describe("before the start reads the user's PATH", () => {
  it('the list says the reading has not been made, and codex is not installed', async () => {
    const { byId, usersPath } = await theList()
    expect(usersPath).toMatchObject({ read: false, from: null, shell: null, code: 'notReadAtThisStart' })
    expect(byId['codex']?.installed).toMatchObject({ path: null, versionWasRead: false })
  })
})

describe("after the start has read the user's PATH from the login shell", () => {
  beforeAll(async () => {
    // This test may itself run in a sandbox; the start it stands for does not.
    delete process.env[IN_A_SANDBOX]
    try {
      await thePath.giveTheOfficeTheUsersPath({ shell: shell.program, shellEnvironment: terminals.theEnvironmentATerminalGets(), aTestStartedThis: false })
    } finally {
      if (before.sandbox !== undefined) process.env[IN_A_SANDBOX] = before.sandbox
    }
  }, 30_000)

  it("the server's PATH is the office's own with the shell's entries after it", () => {
    expect(process.env['PATH']).toBe([own, ...shell.path].join(':'))
  })

  it('the list says the PATH was read from the login shell and how many entries were added, and names none', async () => {
    const listed = await call('/api/harnesses?part=list')
    expect(listed.status, listed.raw).toBe(200)
    expect(listed.body['usersPath']).toEqual({ read: true, from: 'loginShell', shell: shell.program, added: 2 })
    expect(JSON.stringify(listed.body['usersPath'])).not.toContain(tools.dir)
  })

  it('the terminal page lists codex with its path and version', async () => {
    const { byId, usersPath } = await theList()
    expect(usersPath).toEqual({ read: true, from: 'loginShell', shell: shell.program, added: 2 })
    expect(byId['codex']?.installed).toMatchObject({ path: join(tools.dir, 'codex'), version: THE_VERSIONS.codex, versionWasRead: true })
  })

  it("the signed-in reading runs codex's own status", async () => {
    const codex = await call('/api/harnesses/codex/signed-in')
    expect(codex.status, codex.raw).toBe(200)
    expect(codex.body['signedIn']).toEqual({ answer: 'yes', asked: 'codex login status' })
  })

  it("Settings' key reading runs codex", () => {
    const probe = res.theProbeForThisPlatform(process.platform)
    expect(probe.whatAnAgentToolSaysAboutItsKey!('codex')).toEqual({ state: 'set', says: 'Codex says it has a login.', asked: 'codex login status' })
  })

  it("the worker launcher finds codex with its path and version on a worker's environment", () => {
    expect(launcher.theProgramThatRan('codex', { ...process.env })).toMatchObject({ path: join(tools.dir, 'codex'), version: THE_VERSIONS.codex, versionWasRead: true })
  })
})
