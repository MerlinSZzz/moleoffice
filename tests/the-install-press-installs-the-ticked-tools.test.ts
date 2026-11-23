// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE INSTALL PRESS: THE AGENT TOOLS LIST AND THE ONE TERMINAL THAT INSTALLS THE TICKED ONES. Wave 13u, round 3.
 *
 * The doors are in src/server/api/terminal-harnesses.ts, and the declaration of the tools in
 * src/server/lib/harnesses.ts. A real terminal holder and a real scratch server process run on a database in
 * this file's own folder, as in tests/the-terminal-doors-are-the-persons.test.ts.
 *
 * NO REAL INSTALLER RUNS AND NOTHING REACHES THE NETWORK. The server's PATH, which every terminal it opens gets,
 * holds only two folders this file makes: stand-ins named curl, bash, sh, claude, codex and kimi
 * (tests/harness-stand-ins.ts says what each prints), and links to cat, env, git and getconf, which the stand-ins
 * and the server reach for. MOLE_OFFICE_HARNESS_REGISTRY points the newest-version reads at the stand-in registry
 * in this test's process, which answers as the npm registry and PyPI do, and answers 404 for dsh.
 *
 *   1. The list: each tool's install command as declared, installed or not with the version its program printed,
 *      the newest version from the registry, and "a newer version exists" only where both were read and the
 *      newest is larger. A registry that refuses is 'unknown' with the reason. A second read is answered from
 *      what was kept, without asking the registry again.
 *   2. The press opens one terminal in the person's home, whose screen shows each official command in the
 *      declaration's order, what each stand-in was given, and the sentence telling the person to sign in
 *      themselves. No model key in the server's environment reaches the installers.
 *   3. An agent is refused 403 with its code at both doors, and no terminal opens.
 *   4. A name that is not an agent tool the office runs, a tool with no install command, and an empty tick list
 *      are each refused 400 with its code before anything opens.
 *
 * MUTATIONS (each after a control run; the commit message that added this file has the runs):
 *   - src/server/lib/harnesses.ts, isANewerOneOut: `if (y > x) return { answer: 'yes' }` made `if (y >= x)`:
 *     case 1 goes red, because codex at the newest version reads as having a newer one.
 *   - src/server/api/terminal-harnesses.ts, the install door: its onlyThePerson call removed: case 3 goes red.
 */

import { mkdirSync, symlinkSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  AS_AN_AGENT,
  AS_THE_PERSON,
  aPlace,
  ask,
  groups,
  startAHolder,
  startAServer,
  stopEverything,
  theStreamsScreen,
  until,
  type HeldTerminal,
  type Place,
  type ScratchServer,
} from './terminal-holder-stand.ts'
import { aStandInRegistry, writeTheStandIns, type StandInRegistry } from './harness-stand-ins.ts'

let place: Place
let server: ScratchServer
let registry: StandInRegistry

/** A key only this test writes, put in the server's environment to show it never reaches an installer. */
const A_KEY = 'stand-in-key-that-must-not-reach-a-terminal'

interface Reading {
  id: string
  program: string
  install: { command: string; source: string; read: string } | null
  noInstall: { code: string; says: string } | null
  installed: { path: string | null; version: string; versionWasRead: boolean }
  newest: { read: boolean; version: string | null; why?: string; from: string }
  newer: { answer: string; why?: string }
}

beforeAll(async () => {
  place = aPlace('inst')
  const standIns = join(place.dir, 'bin')
  const system = join(place.dir, 'sys')
  mkdirSync(standIns)
  mkdirSync(system)
  // THE FEW SYSTEM PROGRAMS the stand-ins and the server reach for, linked so nothing else on this machine is on the PATH.
  for (const program of ['cat', 'env', 'git', 'getconf']) {
    for (const where of ['/usr/bin', '/bin']) {
      try {
        symlinkSync(join(where, program), join(system, program))
        break
      } catch {
        // Not in this folder; the next one is tried.
      }
    }
  }
  // OPENCODE AND DSH GET NO STAND-IN, so they read as not installed.
  writeTheStandIns(standIns, { programs: ['claude', 'codex', 'kimi'], shells: true })
  registry = await aStandInRegistry()

  await startAHolder(place)
  // THE SERVER STARTS WITH NO SANDBOX_DIR, because the office refuses every install press inside a sandbox and case 2
  // presses Install. It takes its environment once, at its start, so the variable is put back as soon as it has started.
  const sandbox = process.env['SANDBOX_DIR']
  delete process.env['SANDBOX_DIR']
  try {
    server = await startAServer(place, undefined, {
      PATH: `${standIns}:${system}`,
      MOLE_OFFICE_HARNESS_REGISTRY: registry.at,
      ANTHROPIC_API_KEY: A_KEY,
    })
  } finally {
    if (sandbox !== undefined) process.env['SANDBOX_DIR'] = sandbox
  }
  const registered = await ask(server.api, '/api/agents/started', {
    method: 'POST',
    body: { handle: AS_AN_AGENT['x-mole-office-actor-id'], name: 'Some agent', role: 'worker' },
  })
  if (registered.status !== 201) throw new Error(`The agent could not be registered: ${JSON.stringify(registered.body)}`)
}, 120_000)

afterAll(async () => {
  await registry.close()
  await stopEverything()
}, 60_000)

/** The terminals the holder holds now, as the person lists them. */
async function theTerminals(): Promise<HeldTerminal[]> {
  const listed = await ask(server.api, '/api/terminals')
  expect(listed.status, JSON.stringify(listed.body)).toBe(200)
  return (listed.body['terminals'] ?? []) as HeldTerminal[]
}

/** Text with every space and line break taken out, so a line the terminal wrapped still reads as one. */
const squeezed = (text: string): string => text.replace(/\s+/g, '')

describe('the install press', () => {
  it('1: lists each tool, its installed and newest versions, and a newer one only where both were read and compare', async () => {
    const listed = await ask(server.api, '/api/harnesses')
    expect(listed.status, JSON.stringify(listed.body)).toBe(200)
    const all = listed.body['harnesses'] as Reading[]
    expect(all.map((one) => one.id)).toEqual(['claude-code', 'codex', 'opencode', 'kimi', 'dsh'])
    const byId = Object.fromEntries(all.map((one) => [one.id, one]))

    expect(byId['claude-code']?.install?.command).toBe('curl -fsSL https://claude.ai/install.sh | bash')
    expect(byId['claude-code']?.install?.source).toBe('https://code.claude.com/docs/en/setup')
    expect(byId['codex']?.install?.command).toBe('curl -fsSL https://chatgpt.com/codex/install.sh | sh')
    expect(byId['opencode']?.install?.command).toBe('curl -fsSL https://opencode.ai/install | bash')
    expect(byId['kimi']?.install).toBeNull()
    expect(byId['kimi']?.noInstall?.code).toBe('vendorArchivedIt')
    expect(byId['dsh']?.install).toBeNull()
    expect(byId['dsh']?.noInstall?.code).toBe('installedSeparately')

    // CLAUDE: installed at 2.1.200, newest 2.1.289, so a newer one exists.
    expect(byId['claude-code']?.installed).toMatchObject({ version: '2.1.200 (Claude Code)', versionWasRead: true })
    expect(byId['claude-code']?.newest).toMatchObject({ read: true, version: '2.1.289' })
    expect(byId['claude-code']?.newer).toEqual({ answer: 'yes' })
    // CODEX: installed at the newest, so none is newer.
    expect(byId['codex']?.installed).toMatchObject({ version: 'codex-cli 0.160.0', versionWasRead: true })
    expect(byId['codex']?.newer).toEqual({ answer: 'no' })
    // OPENCODE: not on the PATH, so nothing is said about a newer one, though the newest was read.
    expect(byId['opencode']?.installed).toMatchObject({ path: null, versionWasRead: false })
    expect(byId['opencode']?.newest).toMatchObject({ read: true, version: '1.18.34' })
    expect(byId['opencode']?.newer).toEqual({ answer: 'unknown', why: 'notInstalled' })
    // KIMI: its newest from PyPI's answer.
    expect(byId['kimi']?.newest).toMatchObject({ read: true, version: '1.52.0' })
    expect(byId['kimi']?.newer).toEqual({ answer: 'yes' })
    // DSH: the registry refused, so the newest is unknown with the reason, and nothing is guessed.
    expect(byId['dsh']?.newest.read).toBe(false)
    expect(byId['dsh']?.newest.version).toBeNull()
    expect(String(byId['dsh']?.newest.why)).toContain('answered 404')
    expect(byId['dsh']?.newer).toEqual({ answer: 'unknown', why: 'notInstalled' })

    // A SECOND READ IS ANSWERED FROM WHAT WAS KEPT, and the registry is not asked again.
    const before = registry.asked.length
    expect(before).toBe(5)
    const again = await ask(server.api, '/api/harnesses')
    expect(again.status).toBe(200)
    expect(registry.asked.length).toBe(before)
  })

  it("2: the press opens one terminal in the person's home that runs each official installer in order, then says to sign in", async () => {
    const before = await theTerminals()
    const pressed = await ask(server.api, '/api/harnesses/install', { method: 'POST', body: { harnesses: ['opencode', 'claude-code', 'codex'] } })
    expect(pressed.status, JSON.stringify(pressed.body)).toBe(201)
    expect(pressed.body['installing']).toEqual(['claude-code', 'codex', 'opencode'])
    const terminal = pressed.body['terminal'] as HeldTerminal & { folder: string; command: string }
    groups.add(terminal.pid)
    expect(terminal.folder).toBe(place.home)
    expect(terminal.command).toBe('/bin/sh')

    const after = await theTerminals()
    expect(after.length).toBe(before.length + 1)

    const lines = await until(
      () => theStreamsScreen(server.api, terminal.id),
      (screen) => squeezed(screen.join('')).includes(squeezed('Sign in yourself')),
    )
    const text = squeezed(lines.join(''))
    const at = (words: string): number => text.indexOf(squeezed(words))
    const claude = at('curl -fsSL https://claude.ai/install.sh | bash')
    const codex = at('curl -fsSL https://chatgpt.com/codex/install.sh | sh')
    const opencode = at('curl -fsSL https://opencode.ai/install | bash')
    const signIn = at('Sign in yourself. Start each program in a terminal, and it asks you to sign in with your own account')
    expect(claude, lines.join('\n')).toBeGreaterThan(-1)
    expect(codex).toBeGreaterThan(claude)
    expect(opencode).toBeGreaterThan(codex)
    expect(signIn).toBeGreaterThan(opencode)
    // A LINE BEFORE EACH, and each stand-in was given what its vendor's command hands it.
    expect(at('== Mole Office: installing Claude Code (1 of 3)')).toBeGreaterThan(-1)
    expect(at('stand-in bash was given: echo the installer script fetched from https://claude.ai/install.sh')).toBeGreaterThan(claude)
    expect(at('stand-in sh was given: echo the installer script fetched from https://chatgpt.com/codex/install.sh')).toBeGreaterThan(codex)
    expect(at('stand-in bash was given: echo the installer script fetched from https://opencode.ai/install')).toBeGreaterThan(opencode)
    expect(at('== Claude Code: the installer finished.')).toBeGreaterThan(claude)
    // NO KEY REACHED AN INSTALLER, though the server holds one.
    expect(text).not.toContain(A_KEY)
    expect(at('stand-in bash saw the key: none')).toBeGreaterThan(-1)
  })

  it('3: refuses an agent at both doors with its code, and opens nothing', async () => {
    const before = await theTerminals()
    const listed = await ask(server.api, '/api/harnesses', { headers: AS_AN_AGENT })
    expect(listed.status, JSON.stringify(listed.body)).toBe(403)
    expect(listed.body['code']).toBe('harnessesOnlyThePerson')
    expect(listed.body['harnesses']).toBeUndefined()
    const pressed = await ask(server.api, '/api/harnesses/install', { method: 'POST', headers: AS_AN_AGENT, body: { harnesses: ['claude-code'] } })
    expect(pressed.status, JSON.stringify(pressed.body)).toBe(403)
    expect(pressed.body['code']).toBe('harnessesOnlyThePerson')
    expect(String(pressed.body['error'])).toContain("Only the person or a secretary holding the person's grant may read or install the agent tools the office runs.")
    expect((await theTerminals()).length).toBe(before.length)
  })

  it('4: refuses an unknown name, a tool with no installer and an empty tick list before anything opens', async () => {
    const before = await theTerminals()
    const unknown = await ask(server.api, '/api/harnesses/install', { method: 'POST', headers: AS_THE_PERSON, body: { harnesses: ['claude-code', 'rm -rf ~'] } })
    expect(unknown.status, JSON.stringify(unknown.body)).toBe(400)
    expect(unknown.body['code']).toBe('harnessUnknown')
    const archived = await ask(server.api, '/api/harnesses/install', { method: 'POST', body: { harnesses: ['kimi'] } })
    expect(archived.status, JSON.stringify(archived.body)).toBe(400)
    expect(archived.body['code']).toBe('harnessHasNoInstaller')
    const none = await ask(server.api, '/api/harnesses/install', { method: 'POST', body: { harnesses: [] } })
    expect(none.status, JSON.stringify(none.body)).toBe(400)
    expect(none.body['code']).toBe('harnessNoneTicked')
    expect((await theTerminals()).length).toBe(before.length)
  })
})
