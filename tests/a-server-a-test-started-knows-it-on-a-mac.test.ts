// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A SERVER A TEST STARTED KNOWS IT, ON A MAC AS ON LINUX. Problem `mZdrckWiS8hc`.
 *
 * Some tests start their servers with `VITEST` and `VITEST_WORKER_ID` removed. On Linux such a server
 * still finds the runner, because it reads its parents' starting environments in /proc. On a Mac it
 * cannot read them, so before this file it answered that no test was behind it, and could report its
 * world to the office the declaration names (problem `JTdajUUs23_M`).
 *
 * The runner now leaves a mark of its own in every process it starts (src/config/the-test-mark.mjs,
 * set by vitest.config.ts), and `aTestRunnerIsBehindThisProcess` reads it in the server's own
 * environment. On Linux a server a test started without the mark is refused at start, so every test
 * that starts a server has to carry the mark, and a Mac is covered by tests that run on Linux.
 *
 * WHAT THIS FILE MEASURES:
 *   1. darwin stood in: a process with VITEST removed and the mark kept answers yes, although a
 *      Mac cannot read the parent that carries VITEST;
 *   2. darwin stood in: with the mark removed as well, and VITEST_POOL_ID, VITEST_MODE and NODE_ENV,
 *      which the runner also hands down, it answers no, and nothing refuses it. That is the limit the
 *      Linux refusal exists for. A Mac refuses a start that keeps one of those three, which
 *      tests/off-linux-the-test-check-reads-its-own-environment.test.ts measures;
 *   3. on Linux: a real server a test started with VITEST removed, whose parents were made unreadable
 *      to the walk by starting it from a shell that has already ended, says a test runner started it;
 *   4. on Linux: a real server a test started with VITEST and the mark both removed refuses to start,
 *      in words that name the mark.
 * Darwin is stood in through the process table and the environment reader, not through
 * process.platform: with process.platform set to darwin, better-sqlite3 loads its darwin binary and
 * the module cannot load at all (attempt a-guard-stood-in on the problem).
 *
 * MUTATIONS, each after a control run:
 *   - `aTestRunnerIsBehindThisProcess` does not read the mark: cases 1 and 3 go red;
 *   - `whyATestsServerMayNotStart` always answers null: case 4 goes red;
 *   - vitest.config.ts does not call `markEveryProcessAsTheSuites`: cases 1 and 3 go red.
 */

import { spawn } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { apiServerArguments, freshDb, type TestDb } from './helpers.ts'
import { THE_TEST_MARK } from '../src/config/the-test-mark.mjs'
import type { OsProbe, OsProcess } from '../src/server/lib/resources.ts'

const REPO = fileURLToPath(new URL('..', import.meta.url))
const TSX = join(REPO, 'node_modules/.bin/tsx')

/** A port that was free a moment ago. */
function freePort(): Promise<number> {
  return new Promise((resolvePort, reject) => {
    const probe = createServer()
    probe.once('error', reject)
    probe.listen(0, '127.0.0.1', () => {
      const address = probe.address()
      probe.close(() => (typeof address === 'object' && address !== null ? resolvePort(address.port) : reject(new Error('no port'))))
    })
  })
}

/** Stop a group this file started, by the pgid it recorded. Already gone is already stopped. */
function stopTheGroup(pgid: number | undefined): void {
  if (pgid === undefined) return
  try {
    process.kill(-pgid, 'SIGTERM')
  } catch {
    // already gone
  }
}

describe('on a Mac, stood in', () => {
  let t: TestDb
  const NAMES = ['VITEST', 'VITEST_WORKER_ID', THE_TEST_MARK, 'VITEST_POOL_ID', 'VITEST_MODE', 'NODE_ENV'] as const
  const kept = Object.fromEntries(NAMES.map((name) => [name, process.env[name]]))
  const putBack = (): void => {
    for (const [name, value] of Object.entries(kept)) {
      if (value === undefined) delete process.env[name]
      else process.env[name] = value
    }
  }

  beforeEach(async () => {
    // A fresh set of modules, so the answer runtime.ts keeps once per process is worked out again.
    t = await freshDb()
  }, 60_000)

  afterEach(async () => {
    putBack()
    vi.restoreAllMocks()
    const resources = await import('../src/server/lib/resources.ts')
    resources.useOsProbe(resources.LINUX_PROBE)
    t.close()
  })

  /**
   * The answers for this process on a Mac whose parent is a vitest worker. The parent carries VITEST,
   * and the environment reader refuses to read it, as it does on darwin.
   */
  async function onAMac(remove: readonly (typeof NAMES)[number][]): Promise<{ behind: boolean; refusal: string | null }> {
    const resources = await import('../src/server/lib/resources.ts')
    const runtime = await import('../src/server/lib/runtime.ts')
    const real = resources.startingEnvironmentValue
    vi.spyOn(resources, 'startingEnvironmentValue').mockImplementation((pid, name) => real(pid, name, 'darwin'))
    const worker: OsProcess = { pid: 4_000_001, pgid: 4_000_001, ppid: 1, command: 'node /somewhere/forks.js', startedAt: '2026-10-06 08:00:00' }
    const me: OsProcess = { pid: process.pid, pgid: process.pid, ppid: worker.pid, command: 'node server', startedAt: '2026-10-06 09:00:00' }
    const nothing = (): never => {
      throw new Error('this stood-in Mac answers only who a process is')
    }
    const mac: OsProbe = {
      platform: 'darwin',
      processById: (pid) => (pid === me.pid ? me : pid === worker.pid ? worker : null),
      processesInGroup: nothing,
      listeningPorts: nothing,
      gpu: nothing,
      containers: nothing,
      locks: nothing,
      ownProcessGroup: nothing,
      killProcessGroup: nothing,
      stopContainer: nothing,
    }
    resources.useOsProbe(mac)
    for (const name of remove) delete process.env[name]
    try {
      return { behind: runtime.aTestRunnerIsBehindThisProcess(), refusal: runtime.whyATestsServerMayNotStart() }
    } finally {
      putBack()
    }
  }

  it('knows a test started it from the mark alone, with VITEST removed', async () => {
    expect(process.env[THE_TEST_MARK], 'the runner did not give this worker the mark').toBeTruthy()
    expect(await onAMac(['VITEST', 'VITEST_WORKER_ID'])).toEqual({ behind: true, refusal: null })
  })

  it('cannot tell without the mark and what the runner hands down, and cannot refuse: that is what the Linux refusal is for', async () => {
    expect(await onAMac(['VITEST', 'VITEST_WORKER_ID', THE_TEST_MARK, 'VITEST_POOL_ID', 'VITEST_MODE', 'NODE_ENV'])).toEqual({ behind: false, refusal: null })
  })
})

describe('on Linux, a real server', () => {
  let dir = ''
  let pgid: number | undefined

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'mole-office-test-mark-'))
  })

  afterEach(() => {
    stopTheGroup(pgid)
    pgid = undefined
    rmSync(dir, { recursive: true, force: true })
  })

  /** The environment of a server of this file's own, on its own port and database. */
  function serverEnvironment(port: number, remove: readonly string[]): NodeJS.ProcessEnv {
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      LOG_LEVEL: 'info',
      MOLE_OFFICE_PORT: String(port),
      MOLE_OFFICE_DB: join(dir, 'mole-office.db'),
      MOLE_OFFICE_WORKSPACE: 'default',
      MOLE_OFFICE_NO_WATCH: '1',
    }
    for (const name of remove) delete env[name]
    return env
  }

  /** Wait until `said()` holds `words`, or the server has ended, or the time is up. */
  async function waitFor(said: () => string, words: readonly string[], ended: () => boolean): Promise<void> {
    for (let tries = 0; tries < 360; tries += 1) {
      if (ended() || words.some((word) => said().includes(word))) return
      await new Promise((ok) => setTimeout(ok, 250))
    }
  }

  it('says a test runner started it from the mark alone, when the walk up its parents finds nothing', async () => {
    const port = await freePort()
    const log = join(dir, 'server.log')
    // THE SHELL ENDS AT ONCE AND THE SERVER IS LEFT WITH NO PARENT A TEST STARTED, so the Linux walk
    // finds no VITEST above it, as on a Mac. The shell is its own group, and the server stays in it.
    const shell = spawn('/bin/sh', ['-c', '"$@" >"$LOG_FILE" 2>&1 </dev/null &', 'sh', TSX, ...apiServerArguments()], {
      cwd: REPO,
      detached: true,
      stdio: 'ignore',
      env: { ...serverEnvironment(port, ['VITEST', 'VITEST_WORKER_ID']), LOG_FILE: log },
    })
    pgid = shell.pid
    const said = (): string => (existsSync(log) ? readFileSync(log, 'utf8') : '')
    await waitFor(said, ['this world is registered as', 'REFUSING TO START'], () => false)
    expect(said(), 'the server never said what it registered').toContain('this world is registered as')
    expect(said()).toContain('not reported to the main world')
    expect(said()).toContain('started by a test runner')
  }, 120_000)

  it('refuses to start when a test removed the mark, and names it', async () => {
    const port = await freePort()
    const child = spawn(TSX, apiServerArguments(), {
      cwd: REPO,
      detached: true,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: serverEnvironment(port, ['VITEST', 'VITEST_WORKER_ID', THE_TEST_MARK]),
    })
    pgid = child.pid
    let said = ''
    let ended = false
    child.stdout?.on('data', (chunk: Buffer) => (said += chunk.toString()))
    child.stderr?.on('data', (chunk: Buffer) => (said += chunk.toString()))
    child.on('exit', () => (ended = true))
    await waitFor(() => said, ['this world is registered as'], () => ended)
    expect(said).not.toContain('this world is registered as')
    expect(said).toContain('REFUSING TO START')
    expect(said).toContain(THE_TEST_MARK)
  }, 120_000)
})
