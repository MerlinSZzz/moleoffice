// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * NO TERMINAL AND NO AGENT IS GIVEN ELECTRON_RUN_AS_NODE, even when the office's own programs were started with it.
 *
 * On Linux an installed office's server, worker and terminal holder run on the app's own program with that variable
 * (`theInstallsNode` in src/config/settings.mjs). A shell or an agent's program given it would carry it into every
 * Electron app the person starts from there, and each would run as Node and never open. Each office program takes it
 * out of its own environment as it starts (src/config/settings.mjs, which they all import), and a terminal is given
 * only the names its system lists (`theEnvironmentATerminalGets` in src/server/lib/terminals.ts).
 *
 *   1. The names a terminal is given leave the variable out, on Linux, on Windows and on the Mac.
 *   2. A real holder and a real scratch server, each started with the variable, which their own starting environment
 *      still shows: a shell the person opens prints that it was not given it, and the terminal's list of names lacks it.
 *   3. An agent opened in one of those terminals, a stand-in named claude, prints that it was not given it, and its
 *      terminal's list of names lacks it.
 *   4. A worker's agent run: a process started with the variable that loads src/worker/runtimes/adapter.ts no longer
 *      has it, and the environment `envFor` makes for a run from that process's own lacks it.
 *
 * NO REAL AGENT PROGRAM IS STARTED. The holder and the server run on a database in the test's own folder
 * (tests/terminal-holder-stand.ts), on the Node that runs this test, which reads nothing in the variable.
 */

import { spawnSync } from 'node:child_process'
import { chmodSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import { theSystemFor } from '../src/config/systems/the-system.mjs'
import { freshDb } from './helpers.ts'
import {
  REPO,
  aPlace,
  ask,
  groups,
  startAHolder,
  startAServer,
  stopEverything,
  theStreamsScreen,
  until,
  type Place,
  type ScratchServer,
  type StartedHolder,
} from './terminal-holder-stand.ts'

const THE_VARIABLE = 'ELECTRON_RUN_AS_NODE'

/**
 * What a shell prints for the variable. The word NODE is put in by printf, so the line it prints is output and not the
 * echo of the typing.
 */
const THE_LINE_TYPED = "printf 'RUN-AS-%s:%s\\n' NODE \"${ELECTRON_RUN_AS_NODE-not given}\"\r"
const THE_LINE_PRINTED = 'RUN-AS-NODE:'

let place: Place
let server: ScratchServer
let holder: StartedHolder

/** The environment a process was started with, as the system keeps it. Deleting a variable later does not change it. */
const theStartingEnvironmentOf = (pid: number): string[] => readFileSync(`/proc/${String(pid)}/environ`, 'utf8').split('\0')

/** The terminal's screen, once it shows the line that says what the variable was. */
async function theLineOn(terminal: string): Promise<string> {
  const lines = await until(() => theStreamsScreen(server.api, terminal), (shown) => shown.some((line) => line.startsWith(THE_LINE_PRINTED)), 30_000)
  const line = lines.find((one) => one.startsWith(THE_LINE_PRINTED))
  if (line === undefined) throw new Error(`The terminal never printed what the variable was. Its screen:\n${lines.join('\n')}`)
  return line.trimEnd()
}

beforeAll(async () => {
  place = aPlace('runasnode')
  const bin = join(place.dir, 'b')
  mkdirSync(bin)
  // A STAND-IN CLAUDE: it prints what the variable was, then waits until its group is stopped.
  writeFileSync(join(bin, 'claude'), "#!/bin/sh\nprintf 'RUN-AS-%s:%s\\n' NODE \"${ELECTRON_RUN_AS_NODE-not given}\"\nexec sleep 600\n", 'utf8')
  chmodSync(join(bin, 'claude'), 0o755)
  // The holder is started with this process's environment, so the variable is put there while it starts.
  vi.stubEnv(THE_VARIABLE, '1')
  try {
    holder = await startAHolder(place)
  } finally {
    vi.unstubAllEnvs()
  }
  server = await startAServer(place, undefined, { [THE_VARIABLE]: '1', PATH: `${bin}:${process.env['PATH'] ?? '/usr/bin:/bin'}` })
}, 180_000)

afterAll(stopEverything, 60_000)

describe('the variable that runs the app as Node', () => {
  it('1: the names a terminal is given leave it out, on Linux, on Windows and on the Mac', async () => {
    // src/server/lib/terminals.ts reaches the database as it loads, so it is loaded after a database of this test's own.
    const db = await freshDb()
    try {
      const { theEnvironmentATerminalGets } = await import('../src/server/lib/terminals.ts')
      for (const platform of ['linux', 'win32', 'darwin']) {
        const given = theEnvironmentATerminalGets({ [THE_VARIABLE]: '1', PATH: '/usr/bin', HOME: '/home/someone' }, theSystemFor(platform))
        expect(Object.keys(given), `a terminal on ${platform} is given the variable`).not.toContain(THE_VARIABLE)
        expect(Object.keys(given), `a terminal on ${platform} is not given PATH, so this case reads nothing`).toContain('PATH')
      }
    } finally {
      db.close()
    }
  }, 30_000)

  it('2: a shell the person opens is not given it, though the server and the holder were started with it', async () => {
    // THE CONTROL: both were started with the variable, so a terminal without it is not a terminal of a start without it.
    expect(theStartingEnvironmentOf(server.pid), 'the server was not started with the variable, so this case reads nothing').toContain(`${THE_VARIABLE}=1`)
    expect(theStartingEnvironmentOf(holder.pid), 'the holder was not started with the variable, so this case reads nothing').toContain(`${THE_VARIABLE}=1`)

    const opened = await ask(server.api, '/api/terminals', { method: 'POST', body: { folder: place.dir, command: '/bin/bash', args: ['--noprofile', '--norc'], cols: 100, rows: 30 } })
    expect(opened.status, JSON.stringify(opened.body)).toBe(201)
    const terminal = opened.body['terminal'] as { id: string; pid: number; envNames: string[] }
    groups.add(terminal.pid)
    expect(terminal.envNames, 'the list of names the terminal was given holds the variable').not.toContain(THE_VARIABLE)
    const typed = await ask(server.api, `/api/terminals/${terminal.id}/input`, { method: 'POST', body: { data: THE_LINE_TYPED } })
    expect(typed.status, JSON.stringify(typed.body)).toBe(200)
    expect(await theLineOn(terminal.id), "the person's shell was given the variable").toBe(`${THE_LINE_PRINTED}not given`)
  }, 60_000)

  it("3: an agent opened in a terminal is not given it", async () => {
    const registered = await ask(server.api, '/api/agents/started', { method: 'POST', body: { handle: 'run-as-node-claude', name: 'run-as-node-claude', role: 'worker', runtime: 'claude-code' } })
    expect(registered.status, JSON.stringify(registered.body)).toBe(201)
    const folder = join(place.dir, 'w')
    mkdirSync(folder)
    const set = await ask(server.api, '/api/participants/agent/run-as-node-claude/start-folder', { method: 'POST', body: { startFolder: folder, because: 'the test opens it in a terminal' } })
    expect(set.status, JSON.stringify(set.body)).toBe(200)

    const opened = await ask(server.api, '/api/terminals/agents', { method: 'POST', body: { agent: 'run-as-node-claude', cols: 200, rows: 40 } })
    const terminal = opened.body['terminal'] as { id: string; pid: number; command: string; envNames: string[] } | undefined
    if (typeof terminal?.pid === 'number') groups.add(terminal.pid)
    expect(opened.status, JSON.stringify(opened.body)).toBe(201)
    expect(terminal?.command, 'the agent was not opened with the stand-in').toBe(join(place.dir, 'b', 'claude'))
    expect(terminal?.envNames, "the list of names the agent's terminal was given holds the variable").not.toContain(THE_VARIABLE)
    expect(await theLineOn(String(terminal?.id)), "the agent's program was given the variable").toBe(`${THE_LINE_PRINTED}not given`)
  }, 60_000)

  it("4: a worker's agent run is not given it", () => {
    const program = [
      'const before = String(process.env.ELECTRON_RUN_AS_NODE)',
      `const { envFor } = await import(${JSON.stringify(pathToFileURL(join(REPO, 'src', 'worker', 'runtimes', 'adapter.ts')).href)})`,
      "const given = envFor({ cwd: process.cwd(), api: 'http://127.0.0.1:9', workspace: 'default' }, process.env)",
      "process.stdout.write(JSON.stringify({ before, given: Object.keys(given).includes('ELECTRON_RUN_AS_NODE'), path: typeof given.PATH }))",
    ].join('\n')
    const ran = spawnSync(process.execPath, ['--import', 'tsx', '--input-type=module', '-e', program], {
      cwd: REPO,
      encoding: 'utf8',
      env: { ...process.env, [THE_VARIABLE]: '1' },
      timeout: 60_000,
    })
    expect(ran.status, ran.stderr).toBe(0)
    expect(JSON.parse(ran.stdout), "a worker's agent run is given the variable, or the worker was not started with it").toEqual({ before: '1', given: false, path: 'string' })
  }, 90_000)
})
