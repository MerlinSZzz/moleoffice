// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * OFF LINUX, A START'S TEST CHECK READS THE SERVER'S OWN ENVIRONMENT, AND NO PROCESS TABLE.
 *
 * A server that carries neither VITEST nor the suite's mark asks whether a test runner is behind it
 * (`aTestRunnerIsBehindThisProcess` in src/server/lib/runtime.ts), and refuses to start when one is
 * (`whyATestsServerMayNotStart`). On Linux it walks up its parents and reads the environment each was
 * started with. Only Linux can read that (`startingEnvironmentValue` in src/server/lib/resources.ts).
 *
 * Off Linux the walk used to run as well. Each step read two processes from the process table and then
 * could not read the environment, so the walk could only answer no, and nothing was ever refused there.
 * On Windows one read of one process runs PowerShell twice. The bundled server's first start on a Windows
 * 11 machine was up 37 seconds after its process began, and 31 of them were this check. Each of the four
 * starts of that run spent 29 to 31 seconds in it (wave 13t, round W9, the first label).
 *
 * Off Linux the check now reads what a test runner hands down to what it starts, in the server's own
 * environment: VITEST_POOL_ID, VITEST_MODE, and NODE_ENV set to test. A server that carries one of them,
 * but neither VITEST nor the mark, is refused, as Linux refuses one whose parent carries VITEST.
 *
 * WHAT THIS FILE MEASURES, with VITEST, VITEST_WORKER_ID and the suite's mark removed from this process:
 *   1. on Windows, stood in: a start with NODE_ENV=test is refused in words that name it;
 *   2. on Windows, stood in: a start with none of the three goes on;
 *   3. and 4. the same on a Mac, stood in, with VITEST_POOL_ID;
 *   5. in cases 1 to 4 the process table is asked nothing;
 *   6. on Linux the walk still runs: a parent started with VITEST is found, and the start is refused;
 *   7. on Linux, a start whose parents carry no VITEST goes on, whatever its own environment carries.
 * Windows and the Mac are stood in through a process table of two processes, and through process.platform
 * for the length of one synchronous call, after every module has loaded. The real process.platform is put
 * back before anything else runs. Setting process.platform while modules load is not possible: better-sqlite3
 * would load the binary of the platform named (tests/a-server-a-test-started-knows-it-on-a-mac.test.ts).
 *
 * MUTATIONS, each after a control run:
 *   - the walk runs on every platform again, as before this file: cases 1 to 4 go red;
 *   - off Linux the check reads nothing and answers no: cases 1 and 3 go red;
 *   - the walk runs on no platform: case 6 goes red;
 *   - the own-environment check runs on Linux too: case 7 goes red.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { freshDb, type TestDb } from './helpers.ts'
import { THE_TEST_MARK } from '../src/config/the-test-mark.mjs'
import type { OsProbe, OsProcess } from '../src/server/lib/resources.ts'

/** What says outright that a test started this process. Removed in every case. */
const MARKS = ['VITEST', 'VITEST_WORKER_ID', THE_TEST_MARK] as const
/** What the runner hands down besides. Each case puts back only what it names. */
const HANDED_DOWN = ['VITEST_POOL_ID', 'VITEST_MODE', 'NODE_ENV'] as const

/** A machine of two processes, this one and a worker above it, which counts each process it is asked for. */
function aMachine(platform: string, worker: OsProcess): { probe: OsProbe; asked: number[] } {
  const asked: number[] = []
  const me: OsProcess = { pid: process.pid, pgid: process.pid, ppid: worker.pid, command: 'node server', startedAt: '2026-10-31 09:00:00' }
  const nothing = (): never => {
    throw new Error('this stood-in machine answers only who a process is')
  }
  const probe: OsProbe = {
    platform,
    processById: (pid) => {
      asked.push(pid)
      return pid === me.pid ? me : pid === worker.pid ? worker : null
    },
    processesInGroup: nothing,
    listeningPorts: nothing,
    gpu: nothing,
    containers: nothing,
    locks: nothing,
    ownProcessGroup: nothing,
    killProcessGroup: nothing,
    stopContainer: nothing,
  }
  return { probe, asked }
}

/** Run `ask` with process.platform reading `platform`, and put the real one back however `ask` ends. */
function withPlatform<T>(platform: string, ask: () => T): T {
  const real = Object.getOwnPropertyDescriptor(process, 'platform')
  if (real === undefined) throw new Error('process.platform has no descriptor to put back, so it is not stood in')
  Object.defineProperty(process, 'platform', { ...real, value: platform })
  try {
    return ask()
  } finally {
    Object.defineProperty(process, 'platform', real)
  }
}

describe('the test check of a start', () => {
  let t: TestDb
  const kept = Object.fromEntries([...MARKS, ...HANDED_DOWN].map((name) => [name, process.env[name]]))
  /** Put this worker's own environment back as it was. Setting undefined would store the word "undefined". */
  const putBack = (): void => {
    for (const [name, value] of Object.entries(kept)) {
      if (value === undefined) delete process.env[name]
      else process.env[name] = value
    }
  }

  beforeEach(async () => {
    // A fresh set of modules, so the answer runtime.ts keeps once per process is worked out again.
    t = await freshDb()
    // A cold start of the modules a fresh database loads takes more than the ten seconds vitest gives a hook.
  }, 60_000)

  afterEach(async () => {
    putBack()
    vi.restoreAllMocks()
    const resources = await import('../src/server/lib/resources.ts')
    resources.useOsProbe(resources.LINUX_PROBE)
    t.close()
  })

  /**
   * The answers on a machine of the given platform. This process carries only `own` of what the runner hands
   * down. Its parent is a worker, started with VITEST when `parentHasVitest` holds. The environment reader
   * answers for that worker wherever it can read an environment, and refuses as it does elsewhere.
   */
  async function on(
    platform: string,
    own: Partial<Record<(typeof HANDED_DOWN)[number], string>>,
    parentHasVitest: boolean,
  ): Promise<{ behind: boolean; refusal: string | null; asked: number[] }> {
    const resources = await import('../src/server/lib/resources.ts')
    const runtime = await import('../src/server/lib/runtime.ts')
    const worker: OsProcess = { pid: 4_000_001, pgid: 4_000_001, ppid: 1, command: 'node /somewhere/forks.js', startedAt: '2026-10-31 08:00:00' }
    const real = resources.startingEnvironmentValue
    vi.spyOn(resources, 'startingEnvironmentValue').mockImplementation((pid, name, at = process.platform) => {
      // The real reader is asked about this process first, so a platform it cannot read on is refused in its
      // own words, as it would be there.
      real(process.pid, name, at)
      return parentHasVitest && pid === worker.pid && name === 'VITEST' ? 'true' : null
    })
    const machine = aMachine(platform, worker)
    resources.useOsProbe(machine.probe)
    for (const name of [...MARKS, ...HANDED_DOWN]) delete process.env[name]
    Object.assign(process.env, own)
    try {
      const answers = withPlatform(platform, () => ({
        behind: runtime.aTestRunnerIsBehindThisProcess(),
        refusal: runtime.whyATestsServerMayNotStart(),
      }))
      return { ...answers, asked: machine.asked }
    } finally {
      putBack()
    }
  }

  it('on Windows, refuses a start that carries NODE_ENV=test, and names it', async () => {
    const answers = await on('win32', { NODE_ENV: 'test' }, true)
    expect(answers.behind).toBe(true)
    expect(answers.refusal).toContain('REFUSING TO START')
    expect(answers.refusal).toContain('NODE_ENV=test')
    expect(answers.refusal).toContain(THE_TEST_MARK)
    expect(answers.asked, 'the process table was asked').toEqual([])
  })

  it('on Windows, lets a start that carries none of them go on', async () => {
    expect(await on('win32', { NODE_ENV: 'production' }, true)).toEqual({ behind: false, refusal: null, asked: [] })
  })

  it('on a Mac, refuses a start that carries VITEST_POOL_ID, and names it', async () => {
    const answers = await on('darwin', { VITEST_POOL_ID: '1' }, true)
    expect(answers.behind).toBe(true)
    expect(answers.refusal).toContain('REFUSING TO START')
    expect(answers.refusal).toContain('VITEST_POOL_ID')
    expect(answers.asked, 'the process table was asked').toEqual([])
  })

  it('on a Mac, lets a start that carries none of them go on', async () => {
    expect(await on('darwin', {}, true)).toEqual({ behind: false, refusal: null, asked: [] })
  })

  it('on Linux, still walks, finds the parent started with VITEST, and refuses the start', async () => {
    const answers = await on('linux', {}, true)
    expect(answers.behind).toBe(true)
    expect(answers.refusal).toContain('REFUSING TO START')
    expect(answers.asked).toEqual([process.pid, 4_000_001])
  })

  it('on Linux, lets a start go on when no parent carries VITEST, whatever its own environment carries', async () => {
    const answers = await on('linux', { NODE_ENV: 'test', VITEST_POOL_ID: '1', VITEST_MODE: 'RUN' }, false)
    expect(answers.behind).toBe(false)
    expect(answers.refusal).toBeNull()
  })
})
