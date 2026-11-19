// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A STOP ON WINDOWS ENDS THE GROUP AT ONCE, AND SAYS SO WHERE THE RUN IS RECORDED. Wave 13t, round W5, item 6.
 *
 * The worker ends a process group in two places: an agent's run, through `endRun` in src/worker/runtimes/common.ts,
 * which every runtime's `stop` calls, and the take-back's main check in src/worker/index.ts. On Linux and the Mac each
 * asks the group to stop with SIGTERM. Windows has no signal that asks a group to stop, so there each ends the group
 * at once and says so in its own words, so that a run ended this way is never read as one that stopped cleanly.
 *
 * Windows is stood in by this system with the Windows group stop in place of its own, and that stop's signal is spied
 * on, so nothing here runs PowerShell. Nothing here is proved on Windows; that is item 21. This file checks:
 *
 *   1. on Linux and the Mac, a run's stop and the take-back's stop send SIGTERM to the group; the take-back's sends
 *      SIGKILL a second later, and only while the group's first process is still running; neither says anything;
 *   2. with the Windows group stop, a run's stop ends the group at once with SIGKILL, says so in the worker's log and
 *      on the run's handle, and says nothing for a group that had already gone;
 *   3. the run's record: the next pass writes the runtime's sentence and then that one into the record's `doing`, and
 *      the runtime's sentence alone for a run stopped with SIGTERM;
 *   4. the take-back's main check, past its bound with the Windows group stop, is ended at once, with no SIGTERM and
 *      no wait, and its ending and its record both say so;
 *   5. the take-back's main check is started through the layer on each system, not stood in as case 4 stands it in.
 *      On Windows, where the layer refuses a program not named by its whole path, it is started by the whole path of
 *      the node this process runs on, and that is what the starter is handed. On Linux and the Mac it is started by
 *      the bare word the merge tool's adapter declares, as before. No PowerShell runs: the layer's own answer is kept,
 *      and a Node that waits runs in its place, in the environment the layer gave it. That Node is detached, where
 *      the layer's starter is not, so that it is ended by the group it leads.
 *
 * Mutations, in the commit message that added each case.
 */

import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

import * as theSystem from '../src/config/systems/the-system.mjs'
import { howToStartInAJobObject, THE_LINE_VARIABLE, THE_PROGRAM_VARIABLE, theWindowsCommandLine } from '../src/config/systems/windows-starts.mjs'
import { onePass, TAKE_BACK_LIMIT_MS, type WorkerSettings } from '../src/worker/index.ts'
import type { RunHandle } from '../src/worker/runtimes/adapter.ts'
import { ClaudeCodeAdapter } from '../src/worker/runtimes/claude-code.ts'
import { withHowItWasEnded } from '../src/worker/runtimes/common.ts'
import { MergeAdapter } from '../src/worker/runtimes/merge.ts'
import * as os from '../src/worker/runtimes/os.ts'
import { aCheckoutForATestRun } from './a-checkout-for-a-test-run.ts'

const GROUP = 4321
const THE_RUNTIMES_SENTENCE = 'Made up: the person pressed stop on this run.'

let scratch: string
beforeAll(() => {
  scratch = mkdtempSync(join(tmpdir(), 'mole-office-a-stop-at-once-'))
})
afterAll(() => {
  rmSync(scratch, { recursive: true, force: true })
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

const anError = (code: string) => Object.assign(new Error(`made-up ${code}`), { code })

function aHandle(): RunHandle {
  return { runtime: 'claude-code', pid: GROUP, pgid: GROUP, startedAt: '2026-10-31 00:00:00', providerSession: null, outputPath: join(scratch, 'unused') }
}

/** This system, with the Windows group stop in place of its own. Answers the spy on that stop's signal. */
function withTheWindowsGroupStop() {
  const windows = theSystem.theSystemFor('win32').groups
  const signal = vi.spyOn(windows, 'signal').mockImplementation(() => undefined)
  vi.spyOn(theSystem, 'thisSystem').mockReturnValue({ ...theSystem.theSystemFor(process.platform), groups: windows })
  return signal
}

/** Every request a pass makes, answered from `answers` by path, or with an empty object. */
function anOfficeStandIn(answers: Record<string, unknown> = {}) {
  const asked: { path: string; method: string; body: any }[] = []
  vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
    const path = new URL(url).pathname
    const method = init?.method ?? 'GET'
    asked.push({ path, method, body: typeof init?.body === 'string' ? JSON.parse(init.body) : null })
    const answer = answers[`${method} ${path}`] ?? {}
    return new Response(JSON.stringify(answer), { status: 200 })
  })
  return asked
}

const theDoingOf = (asked: ReturnType<typeof anOfficeStandIn>, session: string) =>
  asked.filter((one) => one.method === 'PATCH' && one.path === `/api/records/${session}`).map((one) => one.body?.dataPatch?.doing)

describe('a stop that ends a group', () => {
  it('1: on Linux and the Mac sends SIGTERM, then SIGKILL a second later only while the first process runs, and says nothing', async () => {
    const said = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const kill = vi.spyOn(process, 'kill').mockImplementation(() => true)
    const handle = aHandle()
    new ClaudeCodeAdapter({}).stop(handle, THE_RUNTIMES_SENTENCE)
    expect(handle.endedAtOnce).toBeUndefined()
    expect(withHowItWasEnded(THE_RUNTIMES_SENTENCE, handle)).toBe(THE_RUNTIMES_SENTENCE)
    for (const platform of ['linux', 'darwin']) {
      expect(os.endGroupAsGentlyAsItCan(GROUP, platform), platform).toEqual({ ended: true, atOnce: null })
    }
    expect(kill.mock.calls).toEqual([
      [-GROUP, 'SIGTERM'],
      [-GROUP, 'SIGTERM'],
      [-GROUP, 'SIGTERM'],
    ])

    kill.mockClear()
    vi.useFakeTimers()
    const stillGoing = os.endGroupWithinASecond({ pid: GROUP + 1, pgid: GROUP })
    expect(kill.mock.calls).toEqual([[-GROUP, 'SIGTERM']])
    await vi.advanceTimersByTimeAsync(999)
    expect(kill.mock.calls).toHaveLength(1)
    await vi.advanceTimersByTimeAsync(1)
    expect(await stillGoing).toBeNull()
    expect(kill.mock.calls).toEqual([
      [-GROUP, 'SIGTERM'],
      [GROUP + 1, 0],
      [-GROUP, 'SIGKILL'],
    ])

    kill.mockClear()
    kill.mockImplementation((pid, signal) => {
      if (signal === 0) throw anError('ESRCH')
      return true
    })
    const gone = os.endGroupWithinASecond({ pid: GROUP + 1, pgid: GROUP })
    await vi.advanceTimersByTimeAsync(1_000)
    expect(await gone).toBeNull()
    expect(kill.mock.calls).toEqual([
      [-GROUP, 'SIGTERM'],
      [GROUP + 1, 0],
    ])
    expect(said).not.toHaveBeenCalled()
  })

  it('2: with the Windows group stop, ends a run at once with SIGKILL and says so, and says nothing for a group already gone', () => {
    const said = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const kill = vi.spyOn(process, 'kill')
    const signal = withTheWindowsGroupStop()
    const theWords = `Windows has no gentle stop for a process group, so process group ${String(GROUP)} was ended at once, with everything it had started, and had no chance to finish.`
    expect(os.theEndAtOnce(GROUP)).toBe(theWords)

    const handle = aHandle()
    new ClaudeCodeAdapter({}).stop(handle, THE_RUNTIMES_SENTENCE)
    expect(signal.mock.calls).toEqual([[GROUP, 'SIGKILL']])
    expect(handle.endedAtOnce).toBe(theWords)
    expect(said.mock.calls).toEqual([[theWords]])
    expect(withHowItWasEnded(THE_RUNTIMES_SENTENCE, handle)).toBe(`${THE_RUNTIMES_SENTENCE} ${theWords}`)

    signal.mockImplementation(() => {
      throw anError('ESRCH')
    })
    const gone = aHandle()
    new ClaudeCodeAdapter({}).stop(gone, THE_RUNTIMES_SENTENCE)
    expect(gone.endedAtOnce).toBeUndefined()
    expect(os.endGroupAsGentlyAsItCan(GROUP)).toEqual({ ended: false, atOnce: null })
    expect(said).toHaveBeenCalledTimes(1)
    expect(kill).not.toHaveBeenCalled()
  })

  it("3: writes the sentence of an end at once into the run's record after the runtime's own, and nothing more after SIGTERM", async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
    const settings: WorkerSettings = {
      api: 'http://fixture.invalid', workspace: 'default', session: null, stopWithPid: null,
      checkout: aCheckoutForATestRun(), runs: 0, hops: 3, outputRoot: scratch, env: {},
    }
    const aStoppedRun = (session: string) => {
      const adapter = new ClaudeCodeAdapter({})
      adapter.alive = () => false
      adapter.readResult = () => ({ text: 'Made up: half an answer.', endedHow: 'stopped', providerSession: null, because: THE_RUNTIMES_SENTENCE })
      const handle = aHandle()
      adapter.stop(handle, THE_RUNTIMES_SENTENCE)
      return { adapter, handle, session, messageId: `${session}-message`, agentId: 'made-up-agent', handleName: 'made-up-agent', ledgerRow: null, lastSaid: '', tryAgainAt: Date.now() + 3_600_000 }
    }

    const kill = vi.spyOn(process, 'kill').mockImplementation(() => true)
    const gently = aStoppedRun('made-up-run-stopped-gently')
    expect(kill.mock.calls).toEqual([[-GROUP, 'SIGTERM']])
    let asked = anOfficeStandIn()
    await onePass(settings, [gently])
    expect(theDoingOf(asked, gently.session)).toEqual([THE_RUNTIMES_SENTENCE])

    withTheWindowsGroupStop()
    const atOnce = aStoppedRun('made-up-run-ended-at-once')
    asked = anOfficeStandIn()
    await onePass(settings, [atOnce])
    expect(theDoingOf(asked, atOnce.session)).toEqual([`${THE_RUNTIMES_SENTENCE} ${os.theEndAtOnce(GROUP)}`])
  })

  it('4: ends a take-back past its bound at once with the Windows group stop, without a wait, and its ending and record say so', async () => {
    const tool = join(scratch, 'made-up-merge-tool.mjs')
    writeFileSync(tool, '// Never run: the start is stood in.\n')
    const settings: WorkerSettings = {
      api: 'http://fixture.invalid', workspace: 'default', session: null, stopWithPid: null, checkout: aCheckoutForATestRun(),
      runs: 1, hops: 3, outputRoot: scratch, env: { PATH: process.env['PATH'], MOLE_OFFICE_FAKE_MERGE_TOOL: tool }, mergesOnly: true,
    }
    const child = { pid: 900_001, pgid: 900_002, exitCodePath: join(scratch, 'no-take-back-exit') }
    vi.spyOn(os, 'startInItsOwnGroup').mockReturnValue(child)
    vi.spyOn(os, 'stillRunning').mockReturnValue(true)
    const kill = vi.spyOn(process, 'kill')
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const signal = withTheWindowsGroupStop()
    const asked = anOfficeStandIn({
      'GET /api/worker/merges': { wanted: [], going: [], takeBacksDue: [{ problem: 'made-up-overlong' }] },
      'POST /api/records': { record: { id: 'made-up-take-back-session' } },
    })
    vi.useFakeTimers()

    await onePass(settings, [], [], [])
    expect(signal).not.toHaveBeenCalled()
    vi.setSystemTime(Date.now() + TAKE_BACK_LIMIT_MS)
    const result = await onePass(settings, [], [], [])
    expect(vi.getTimerCount()).toBe(0)

    const theWords = os.theEndAtOnce(child.pgid)
    expect(signal.mock.calls).toEqual([[child.pgid, 'SIGKILL']])
    expect(kill).not.toHaveBeenCalled()
    expect(result.merges.takeBackFailed).toEqual([
      { problem: 'made-up-overlong', says: expect.stringContaining(`process group ${String(child.pgid)} was ended. ${theWords} Log: `) },
    ])
    expect(theDoingOf(asked, 'made-up-take-back-session').at(-1)).toContain(theWords)
  })

  it("5: starts a take-back through the layer, on Windows by the whole path of the node it runs on, and on Linux and the Mac by the bare word as before", async () => {
    const tool = join(scratch, 'made-up-merge-tool-that-ends-at-once.mjs')
    writeFileSync(tool, '// Ends at once: no merge tool runs here.\n')
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const theBareWord = new MergeAdapter('made-up-problem', {}).command
    expect(theBareWord).toBe('node')
    const windows = theSystem.theSystemFor('win32')
    // THE WINDOWS LAYER'S OWN ANSWER IS KEPT, AND A NODE THAT WAITS RUNS IN ITS PLACE, in the environment the layer
    // gave it, because no PowerShell runs here. A bare name is refused as the layer refuses it. The layer's starter is
    // not detached. The node in its place is, so that it leads a group of its own and the end below finds it by that
    // group: here, on Linux, a child that is not detached stays in this test's own group.
    const waits = ['-e', 'setTimeout(() => {}, 10_000) // stands in for the starter']
    const theStarters: ReturnType<typeof howToStartInAJobObject>[] = []
    vi.spyOn(windows.groups, 'howToStartInItsOwnGroup').mockImplementation((way) => {
      const starter = howToStartInAJobObject(way)
      theStarters.push(starter)
      return { ...starter, command: process.execPath, args: waits, detached: true }
    })
    expect(() => windows.groups.howToStartInItsOwnGroup({ command: theBareWord, args: [], windowsVerbatimArguments: false, env: {} })).toThrow(theBareWord)
    expect(theStarters).toEqual([])

    const started: { pid: number; exitCodePath: string }[] = []
    try {
      for (const platform of ['win32', 'linux', 'darwin']) {
        const system = theSystem.theSystemFor(platform)
        const theLayer = platform === 'win32' ? vi.mocked(windows.groups.howToStartInItsOwnGroup) : vi.spyOn(system.groups, 'howToStartInItsOwnGroup')
        theLayer.mockClear()
        vi.spyOn(theSystem, 'thisSystem').mockReturnValue(system)
        const theStart = vi.spyOn(os, 'startInItsOwnGroup')
        theStart.mockClear()
        const settings: WorkerSettings = {
          api: 'http://fixture.invalid', workspace: 'default', session: null, stopWithPid: null, checkout: aCheckoutForATestRun(),
          runs: 1, hops: 3, outputRoot: scratch, env: { PATH: process.env['PATH'], MOLE_OFFICE_FAKE_MERGE_TOOL: tool }, mergesOnly: true,
        }
        const asked = anOfficeStandIn({
          'GET /api/worker/merges': { wanted: [], going: [], takeBacksDue: [{ problem: 'made-up-problem' }] },
          'POST /api/records': { record: { id: `made-up-take-back-on-${platform}` } },
        })
        const result = await onePass(settings, [], [], [])
        for (const one of theStart.mock.results) if (one.type === 'return') started.push(one.value)
        const held = asked.find((one) => one.method === 'POST' && one.path === '/api/resources')
        expect(result.merges.takeBackFailed, platform).toEqual([])

        expect(theStart.mock.calls, platform).toHaveLength(1)
        const [asking] = theStart.mock.calls[0]!
        expect(asking.command, platform).toBe(theBareWord)
        expect(asking.args, platform).toContain(tool)
        const theProgram = platform === 'win32' ? process.execPath : theBareWord
        expect(theLayer.mock.calls, platform).toEqual([[{ command: theProgram, args: asking.args, windowsVerbatimArguments: false, env: asking.env }]])
        const pid = theStart.mock.results[0]!.value.pid as number
        expect(held?.body.key, platform).toBe(String(pid))
        if (platform !== 'win32') continue

        // What runs was handed the starter's program and command line: the whole path, and the take-back's words.
        expect(theStarters, platform).toHaveLength(1)
        const environment = readFileSync(`/proc/${String(pid)}/environ`, 'utf8').split('\0')
        expect(environment).toContain(`${THE_PROGRAM_VARIABLE}=${process.execPath}`)
        expect(environment).toContain(`${THE_LINE_VARIABLE}=${theWindowsCommandLine([process.execPath, ...asking.args], false)}`)
      }
    } finally {
      for (const { pid } of started) {
        try {
          process.kill(-pid, 'SIGKILL')
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error
        }
      }
      // Each start writes its exit code beside its output when it ends, so the scratch folder outlives every one.
      const until = Date.now() + 5_000
      while (started.some((one) => !existsSync(one.exitCodePath)) && Date.now() < until) await new Promise((done) => setTimeout(done, 20))
    }
    expect(started).toHaveLength(3)
    expect(started.filter((one) => !existsSync(one.exitCodePath))).toEqual([])
  })
})
