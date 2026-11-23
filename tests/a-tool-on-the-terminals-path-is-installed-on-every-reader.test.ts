// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A TOOL ON THE PATH THE TERMINALS GET IS INSTALLED ON EVERY READER, AND A TOOL ON NO PATH IS INSTALLED ON NONE. Wave
 * 13u, round 242.
 *
 * Four readers say whether an agent tool is installed on this machine:
 *   - the terminal page's list, GET /api/harnesses, with the tool's path and version (src/server/lib/harnesses.ts);
 *   - the signed-in reading, GET /api/harnesses/:id/signed-in (src/server/lib/setting-up-an-agent-tool.ts), which says
 *     not installed, or runs the tool's own status command;
 *   - Settings' key reading, `whatAnAgentToolSaysAboutItsKey` (src/server/lib/resources.ts), which says not installed,
 *     or runs `codex login status` and reads it with the words the signed-in reading reads;
 *   - the worker launcher's reading of the program a worker runs, `theProgramThatRan` (src/worker/runtimes/os.ts), with
 *     the tool's path and version, on the worker's environment, which is the server's own with the worker's added.
 * Each finds the tool on the PATH the server holds, which is the PATH every terminal and every worker gets. So the four
 * cannot disagree about one tool on one PATH, and this file proves they do not.
 *
 * WHAT IS MADE UP. The PATH is one folder in this test's temp folder, holding a made-up codex that is signed in and
 * nothing else (tests/made-up-agent-tools.ts). So codex is installed and opencode is not. No real tool is found, and the
 * newest versions are read from the stand-in registry in this process (tests/harness-stand-ins.ts).
 *
 * WHAT IT DOES NOT SHOW. The PATH a person's own shell has is not read by any reader, and nothing here reads it. Settings'
 * key reading gives no path or version, so for it "installed" is that it ran the tool.
 */

import { randomBytes } from 'node:crypto'
import { dirname, join } from 'node:path'
import { writeFileSync } from 'node:fs'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { THE_PERSON } from '../src/shared/person.ts'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { aStandInRegistry, type StandInRegistry } from './harness-stand-ins.ts'
import { THE_VERSIONS, withThePath, writeTheMadeUpTools, type MadeUpTools } from './made-up-agent-tools.ts'

let t: TestDb
let app: FastifyInstance
let tools: MadeUpTools
let registry: StandInRegistry
let res: typeof import('../src/server/lib/resources.ts')
let launcher: typeof import('../src/worker/runtimes/os.ts')
const before = { registry: process.env['MOLE_OFFICE_HARNESS_REGISTRY'] }

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

beforeAll(async () => {
  t = await freshDb()
  writeFileSync(join(dirname(t.file), 'keys.json'), `${JSON.stringify({ person: randomBytes(32).toString('hex'), office: randomBytes(32).toString('hex'), providers: {} }, null, 2)}\n`, { mode: 0o600 })
  app = (await apiApp()).app
  await app.ready()
  // AFTER freshDb, so these are the copies the server loaded and not a second copy with its own state.
  res = await import('../src/server/lib/resources.ts')
  launcher = await import('../src/worker/runtimes/os.ts')
  tools = writeTheMadeUpTools(join(dirname(t.file), 'made-up-path'), { programs: ['codex'] })
  tools.signedIn('codex', true)
  registry = await aStandInRegistry()
  process.env['MOLE_OFFICE_HARNESS_REGISTRY'] = registry.at
}, 60_000)

afterAll(async () => {
  if (before.registry === undefined) delete process.env['MOLE_OFFICE_HARNESS_REGISTRY']
  else process.env['MOLE_OFFICE_HARNESS_REGISTRY'] = before.registry
  await registry?.close()
  await app?.close()
  t?.close()
})

describe('one tool, one PATH, one answer on every reader', () => {
  it('the terminal page lists codex with its path and version, and opencode as not installed', async () => {
    const listed = await withThePath(tools.dir, () => call('/api/harnesses'))
    expect(listed.status, listed.raw).toBe(200)
    const byId = Object.fromEntries((listed.body['harnesses'] as Listed[]).map((one) => [one.id, one]))
    expect(byId['codex']?.installed).toMatchObject({ path: join(tools.dir, 'codex'), version: THE_VERSIONS.codex, versionWasRead: true })
    expect(byId['opencode']?.installed).toMatchObject({ path: null, versionWasRead: false })
  })

  it('the signed-in reading runs codex\'s own status, and says opencode is not installed', async () => {
    const codex = await withThePath(tools.dir, () => call('/api/harnesses/codex/signed-in'))
    expect(codex.status, codex.raw).toBe(200)
    expect(codex.body['signedIn']).toEqual({ answer: 'yes', asked: 'codex login status' })
    const opencode = await withThePath(tools.dir, () => call('/api/harnesses/opencode/signed-in'))
    expect(opencode.status, opencode.raw).toBe(200)
    expect(opencode.body['signedIn']).toEqual({ answer: 'notReadable', why: 'notInstalled', asked: 'opencode auth list' })
    expect(tools.runs().filter((one) => one.args.join(' ') === 'login status')).toHaveLength(1)
  })

  it("Settings' key reading runs codex, and says opencode is not installed on this machine", async () => {
    const probe = res.theProbeForThisPlatform(process.platform)
    const [codex, opencode] = await withThePath(tools.dir, () => (['codex', 'opencode'] as const).map((which) => probe.whatAnAgentToolSaysAboutItsKey!(which)))
    expect(codex).toEqual({ state: 'set', says: 'Codex says it has a login.', asked: 'codex login status' })
    expect(opencode).toEqual({ state: 'nobody-has-looked', says: 'Not looked at: opencode is not installed on this machine.', asked: 'opencode auth list' })
  })

  it("the worker launcher finds codex with its path and version on a worker's environment, and no opencode", async () => {
    const [codex, opencode] = await withThePath(tools.dir, () => ['codex', 'opencode'].map((command) => launcher.theProgramThatRan(command, { ...process.env })))
    expect(codex).toMatchObject({ path: join(tools.dir, 'codex'), version: THE_VERSIONS.codex, versionWasRead: true })
    expect(opencode).toMatchObject({ path: null, versionWasRead: false })
  })
})
