// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A TEST RUNNER BEHIND A PROCESS IS READ FROM THE RUNNER'S OWN MARK, NOT FROM A WORD. Problem
 * `fQYGHPixJR_7`.
 *
 * `aTestRunnerIsBehindThisProcess` in src/server/lib/runtime.ts decides whether a server was started
 * by the test suite. When it says yes, the server does not report its world to the office. Some tests
 * remove `VITEST` from the servers they spawn, so the function also walks up the process's parents
 * (problem `JTdajUUs23_M`).
 *
 * The walk used to answer yes when any parent's command line held the word vitest. An agent whose
 * brief mentions vitest carries that word in its own command line, so a world the agent started
 * never reached the office. The walk now answers yes only when a parent was started with `VITEST`
 * in its environment, which the runner sets on every worker it starts.
 *
 * WHAT THIS FILE MEASURES:
 *   1. a parent whose command line holds the word vitest, started without `VITEST`, is not a test
 *      runner;
 *   2. a parent started with `VITEST` is one, whatever its command line says;
 *   3. the Linux environment reader reads the environment this worker was started with: `VITEST` is there,
 *      because the runner set it when it started the worker, and a variable set later is not.
 * The case of a real server spawned with `VITEST` removed is measured end to end in
 * tests/a-server-a-test-started-knows-it-on-a-mac.test.ts ("on Linux, a real server", the case
 * "says a test runner started it from the mark alone, when the walk up its parents finds nothing").
 *
 * MUTATIONS, each after a control run:
 *   - make the walk read the word vitest in the parent's command line again: cases 1 and 2 go red;
 *   - make `startingEnvironmentValue` answer null: case 3 goes red.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { freshDb, type TestDb } from './helpers.ts'
import type { OsProbe, OsProcess } from '../src/server/lib/resources.ts'
import { THE_TEST_MARK } from '../src/config/the-test-mark.mjs'

/** A machine of two processes: this one, and a parent with the given command line and environment. */
function aParent(command: string, environment: Record<string, string>): OsProbe {
  vi.spyOn(resourcesForThisCase, 'startingEnvironmentValue').mockImplementation((pid, name) => pid === 4_000_001 ? environment[name] ?? null : null)
  const parentPid = 4_000_001
  const me: OsProcess = { pid: process.pid, pgid: process.pid, ppid: parentPid, command: 'node server', startedAt: '2026-09-30 09:00:00' }
  const parent: OsProcess = { pid: parentPid, pgid: parentPid, ppid: 1, command, startedAt: '2026-09-30 08:00:00' }
  const nothing = (): never => {
    throw new Error('this fake machine answers only who a process is and what it was started with')
  }
  return {
    platform: 'fake',
    processById: (pid) => (pid === me.pid ? me : pid === parent.pid ? parent : null),
    processesInGroup: nothing,
    listeningPorts: nothing,
    gpu: nothing,
    containers: nothing,
    locks: nothing,
    ownProcessGroup: nothing,
    killProcessGroup: nothing,
    stopContainer: nothing,
  }
}

let resourcesForThisCase: typeof import('../src/server/lib/resources.ts')

describe('whether a test runner is behind this process', () => {
  let t: TestDb
  const kept = { VITEST: process.env['VITEST'], VITEST_WORKER_ID: process.env['VITEST_WORKER_ID'], [THE_TEST_MARK]: process.env[THE_TEST_MARK] }
  /** Put this worker's own marks back as they were. Setting undefined would store the word "undefined". */
  const putBack = (): void => {
    for (const [name, value] of Object.entries(kept)) {
      if (value === undefined) delete process.env[name]
      else process.env[name] = value
    }
  }

  beforeEach(async () => {
    // A fresh set of modules, so the answer runtime.ts keeps once per process is worked out again.
    t = await freshDb()
    resourcesForThisCase = await import('../src/server/lib/resources.ts')
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
   * The answer for this process on the given machine, with this worker's own marks removed: VITEST,
   * and the suite's mark, which tests/a-server-a-test-started-knows-it-on-a-mac.test.ts measures. With
   * the suite's mark kept the answer would be yes before the walk was asked.
   */
  async function answerOn(probe: OsProbe): Promise<boolean> {
    const resources = await import('../src/server/lib/resources.ts')
    const runtime = await import('../src/server/lib/runtime.ts')
    resources.useOsProbe(probe)
    delete process.env['VITEST']
    delete process.env['VITEST_WORKER_ID']
    delete process.env[THE_TEST_MARK]
    try {
      return runtime.aTestRunnerIsBehindThisProcess()
    } finally {
      putBack()
    }
  }

  it('does not take the word vitest in a parent command line for a test runner', async () => {
    const agent = aParent('dsh run --brief "run npx vitest run tests/one.test.ts and report"', { PATH: '/usr/bin' })
    expect(await answerOn(agent)).toBe(false)
  })

  it('takes a parent started with VITEST for a test runner', async () => {
    const worker = aParent('node /somewhere/forks.js', { VITEST: 'true' })
    expect(await answerOn(worker)).toBe(true)
  })

  it('reads the environment this worker was started with, and not a variable set later', async () => {
    const { startingEnvironmentValue } = await import('../src/server/lib/resources.ts')
    expect(startingEnvironmentValue(process.pid, 'VITEST')).toBe('true')
    process.env['MOLE_OFFICE_SET_AFTER_START'] = 'yes'
    try {
      expect(startingEnvironmentValue(process.pid, 'MOLE_OFFICE_SET_AFTER_START')).toBeNull()
    } finally {
      delete process.env['MOLE_OFFICE_SET_AFTER_START']
    }
  })
})
