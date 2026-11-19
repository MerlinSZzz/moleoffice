// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE MESSAGE WORKER'S PROBE ON WINDOWS, READ ON LINUX WITH POWERSHELL STOOD IN. Wave 13t, round W4, item 5.
 *
 * src/server/lib/windows-probe.ts is the OsProbe that `theProbeForThisPlatform('win32')` gives. It reads one process
 * through the Windows reader of the system layer (src/config/systems/windows-processes.mjs), and hands the methods
 * that do not read processes on to a Linux probe allowed to run on Windows, as the Mac's probe does. The server starts
 * its message worker through that probe and records the worker in the ledger by reading it back (criteria W1 and W8
 * of design/window/ACCEPTANCE.md, which apply to Windows as written).
 *
 * NOTHING HERE IS PROVED ON WINDOWS. Each PowerShell answer below is what the reader's script would print, handed
 * back by a stand-in. This file checks how the probe reads those answers and how it refuses. It runs no PowerShell
 * and starts no process, except in case 11. The probe runs on Windows for the first time on the owner's machine.
 *
 *   1-3: one process, with one script (round W10, item 2). Its number, its parent, no group (0, as the reader gives
 *        it), its command line and its start; a process whose command line Windows did not give is shown by its name
 *        in brackets; no row is no process.
 *   4-5: a process whose start Windows did not give, and a look that failed, are each a 500 that does not call the
 *        process gone.
 *   6: what Windows cannot answer yet is a 501 in words, and no PowerShell is run for it: the processes of a group,
 *      the server's own group and the listening ports.
 *   7: a group stop on Windows refuses SIGTERM in words before it reaches the layer, because no signal asks a Job
 *      Object to stop, and hands SIGKILL to the layer, which ends the Job Object.
 *   8: every other method is handed on, and the ones Windows cannot answer are left out, so a caller says so.
 *   9: the probe chosen for 'win32' is this one, over the layer's reader, and its worker start is not refused.
 *   10: W8. A worker registered while this probe is installed is stored with group 0, its start and its command line.
 *   11: the worker is started as the layer starts a program in its own group, on Windows and on Linux, and the group
 *       it is said to be in is the number of the process started. On Windows that process is the layer's starter,
 *       and its number names the Job Object (tests/the-start-in-a-group-on-windows.test.ts, case 5). This case starts
 *       a short-lived Node in place of the worker, and stops it by its group.
 *       The worker is given this process's environment and what the declaration says its start adds (`howToStart`
 *       in src/config/settings.mjs).
 *
 * Mutations, in the commit message that added the code.
 */
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

import { WINDOWS_HAS_NO_PROCESS_GROUPS } from '../src/config/process-reader.mjs'
import { WINDOWS_STOPS_A_GROUP_ONLY_AT_ONCE } from '../src/config/systems/windows-groups.mjs'
import { windowsProcessReader } from '../src/config/systems/windows-processes.mjs'
import { clockStamp } from '../src/shared/time.ts'
import { freshDb, type TestDb } from './helpers.ts'

type SharedWithLinux = import('../src/server/lib/darwin-probe.ts').SharedWithLinux
type OsProbe = import('../src/server/lib/resources.ts').OsProbe
type WindowsProcessReader = import('../src/server/lib/windows-probe.ts').WindowsProcessReader
type Did =
  | { command: string; ran: true; status: number; stdout: string; stderr: string }
  | { command: string; ran: false; reason: string }

// The server's modules open a database when they load, so they are loaded after a throwaway one is named. The layer
// is loaded after them too, so a spy on it is a spy on the copy lib/resources.ts reads.
let t: TestDb
let res: typeof import('../src/server/lib/resources.ts')
let windows: typeof import('../src/server/lib/windows-probe.ts')
let layer: typeof import('../src/config/systems/the-system.mjs')
let settings: typeof import('../src/config/settings.mjs')
beforeAll(async () => {
  t = await freshDb()
  res = await import('../src/server/lib/resources.ts')
  windows = await import('../src/server/lib/windows-probe.ts')
  layer = await import('../src/config/systems/the-system.mjs')
  settings = await import('../src/config/settings.mjs')
}, 60_000)
afterAll(() => {
  t.close()
})
afterEach(() => {
  vi.restoreAllMocks()
})

/** A stand-in for PowerShell: it notes each script and hands back the answer `answer` makes. */
function aStandIn(answer: Did | ((script: string) => Did)) {
  const scripts: string[] = []
  const powershell = (script: string): Did => {
    scripts.push(script)
    return typeof answer === 'function' ? answer(script) : answer
  }
  // The way that waits for PowerShell answers as the way that holds the thread does.
  const commands = { powershell, startPowerShell: async (script: string): Promise<Did> => powershell(script) }
  return { commands, scripts }
}

const printed = (stdout: string): Did => ({ command: 'powershell.exe', ran: true, status: 0, stdout, stderr: '' })
const rows = (...list: object[]): Did => printed(`${JSON.stringify(list)}\r\n`)

const STARTED = 1_793_350_000_000
const NODE = {
  ProcessId: 1234,
  ParentProcessId: 4,
  CreationDate: STARTED,
  Name: 'node.exe',
  ExecutablePath: 'C:\\Program Files\\nodejs\\node.exe',
  CommandLine: '"C:\\Program Files\\nodejs\\node.exe" worker.js --session 你好',
}

/** The borrowed half, as a record of which methods were handed on. */
function sharedThatRecords(): { calls: string[]; shared: SharedWithLinux } {
  const calls: string[] = []
  const note = (what: string) => {
    calls.push(what)
  }
  const shared: SharedWithLinux = {
    checkout: () => (note('checkout'), { head: null, branch: null, dirty: null, isWorktree: null, couldNotRead: [] }),
    gpu: () => (note('gpu'), { available: false, reason: 'test' }),
    containers: () => (note('containers'), { available: false, reason: 'test' }),
    locks: () => (note('locks'), { files: [], unreadable: [] }),
    machineName: () => (note('machineName'), 'a-windows-machine'),
    ownAddresses: () => (note('ownAddresses'), []),
    whatAnAgentToolSaysAboutItsKey: () => (note('key'), { state: 'nobody-has-looked', says: 'test', asked: 'test' }),
    startTheRestartCommand: () => {
      note('startTheRestartCommand')
      throw new Error('test')
    },
    runAvatarCodec: () => (note('runAvatarCodec'), { status: 0, stdout: Buffer.from(''), stderr: Buffer.from('') }),
    startTheMessageWorker: () => (note('startTheMessageWorker'), { pid: 1, pgid: 1 }),
    tmuxPanes: (format) => (note(`tmuxPanes ${format}`), Promise.resolve({ ok: true, out: '' })),
    killProcessGroup: (pgid, signal) => note(`killProcessGroup ${pgid} ${signal}`),
    stopContainer: (name) => note(`stopContainer ${name}`),
    theVersionOfAProgram: (program) => (note(`theVersionOfAProgram ${program}`), Promise.resolve({ path: null, version: 'test', versionWasRead: false })),
  }
  return { calls, shared }
}

/** A Windows probe over a stand-in for PowerShell, with the borrowed half recorded. */
function aProbe(answer: Did | ((script: string) => Did)) {
  const { commands, scripts } = aStandIn(answer)
  const { calls, shared } = sharedThatRecords()
  return { probe: new windows.WindowsProbe(shared, windowsProcessReader(commands)), scripts, calls }
}

/** What a function threw, or null. */
function thrownBy(run: () => unknown): (Error & { status?: number; code?: string }) | null {
  try {
    run()
  } catch (err) {
    return err as Error & { status?: number; code?: string }
  }
  return null
}

const WILL_NOT = 'Mole Office will not report process 1234 as gone, and will not signal a process it cannot read.'

describe('one process, read through the Windows reader', () => {
  it('1: reads its number, its parent, no group, its command line and its start', () => {
    const { probe, scripts } = aProbe(rows(NODE))
    const started = clockStamp(() => new Date(STARTED))
    expect(probe.platform).toBe('win32')
    expect(probe.processById(1234)).toEqual({
      pid: 1234,
      ppid: 4,
      pgid: 0,
      command: NODE.CommandLine,
      startedAt: started.stamp,
      startedInstant: started.instant,
    })
    // One script for the process, its start and its command line, about process 1234.
    expect(scripts).toHaveLength(1)
    expect(scripts[0]).toContain('Win32_Process')
    expect(scripts[0]).toContain('ProcessId = 1234')
  })

  it('2: shows a process whose command line Windows did not give by its name in brackets', () => {
    const { probe, scripts } = aProbe(rows({ ...NODE, CommandLine: null }))
    expect(probe.processById(1234)?.command).toBe('[node.exe]')
    // The name comes from the same row.
    expect(scripts).toHaveLength(1)
  })

  it('3: answers no row as no process, after one script', () => {
    const { probe, scripts } = aProbe(printed('[]'))
    expect(probe.processById(1234)).toBeNull()
    expect(scripts).toHaveLength(1)
  })
})

describe('a process that cannot be read is not called gone', () => {
  it('4: refuses a process whose start Windows did not give, with a 500', () => {
    const { probe } = aProbe(rows({ ...NODE, CreationDate: null }))
    expect(thrownBy(() => probe.processById(1234))).toMatchObject({
      status: 500,
      message:
        'Process 1234 is running, but Windows did not say when it started. Without its start, it cannot be told ' +
        `from a process that is given the same number later. ${WILL_NOT}`,
    })
  })

  it('5: refuses a look that failed, with a 500 that says why', () => {
    const notRun = aProbe({ command: 'powershell.exe', ran: false, reason: 'powershell.exe could not be run: spawnSync powershell.exe ENOENT' })
    expect(thrownBy(() => notRun.probe.processById(1234))).toMatchObject({
      status: 500,
      message: `Whether process 1234 is running is unknown: powershell.exe could not be run: spawnSync powershell.exe ENOENT. ${WILL_NOT}`,
    })
    const failed = aProbe({ command: 'powershell.exe', ran: true, status: 1, stdout: '', stderr: 'Access denied.\r\n' })
    expect(thrownBy(() => failed.probe.processById(1234))).toMatchObject({
      status: 500,
      message: `Whether process 1234 is running is unknown: Access denied. ${WILL_NOT}`,
    })
    const notJson = aProbe(printed('WARNING: something else\r\n'))
    expect(thrownBy(() => notJson.probe.processById(1234))).toMatchObject({
      status: 500,
      message: `The answer about process 1234 was not JSON. ${WILL_NOT}`,
    })
    // One look: a second answer, which would fail, is never asked for.
    let asked = 0
    const second = aProbe(() => (asked++ === 0 ? rows(NODE) : printed('not json')))
    expect(second.probe.processById(1234)?.command).toBe(NODE.CommandLine)
    expect(second.scripts).toHaveLength(1)
  })
})

describe('what Windows cannot answer yet', () => {
  it('6: refuses the processes of a group, its own group and the listening ports in words, and runs nothing', () => {
    const { probe, scripts } = aProbe(rows(NODE))
    expect(thrownBy(() => probe.processesInGroup(4321))).toMatchObject({
      status: 501,
      message: `${WINDOWS_HAS_NO_PROCESS_GROUPS} So the processes of group 4321 cannot be listed.`,
    })
    expect(thrownBy(() => probe.ownProcessGroup())).toMatchObject({
      status: 501,
      message: `${WINDOWS_HAS_NO_PROCESS_GROUPS} So this server has no process group of its own to name.`,
    })
    expect(thrownBy(() => probe.listeningPorts())).toMatchObject({
      status: 501,
      message:
        "The listening ports are not read on Windows yet. Linux's probe reads them from /proc, and the Mac's from lsof. " +
        'Windows has neither, and Mole Office does not yet read the list of sockets that Windows keeps.',
    })
    expect(scripts).toEqual([])
  })

  it('7: refuses SIGTERM to a group in words before it reaches the layer, and hands SIGKILL to the layer', () => {
    const signal = vi.spyOn(layer.theSystemFor('win32').groups, 'signal').mockImplementation(() => undefined)
    const probe = res.theProbeForThisPlatform('win32')
    expect(thrownBy(() => probe.killProcessGroup(4321, 'SIGTERM'))).toMatchObject({
      status: 501,
      message: `${WINDOWS_STOPS_A_GROUP_ONLY_AT_ONCE} Process group 4321 was not stopped.`,
    })
    expect(signal).not.toHaveBeenCalled()
    probe.killProcessGroup(4321, 'SIGKILL')
    expect(signal.mock.calls).toEqual([[4321, 'SIGKILL']])
  })
})

describe('the methods handed on, and the ones left out', () => {
  it('8: hands every method that reads no process to the Linux probe, and leaves out what Windows cannot answer', async () => {
    const { probe, calls, scripts } = aProbe(rows(NODE))
    probe.checkout('C:\\office')
    probe.gpu()
    probe.containers()
    probe.locks([])
    probe.machineName()
    probe.ownAddresses()
    probe.whatAnAgentToolSaysAboutItsKey('codex')
    expect(() => probe.startTheRestartCommand({ cwd: 'C:\\office', logPath: 'C:\\office\\restart.log', env: {} })).toThrow('test')
    probe.runAvatarCodec({ entry: 'codec.mjs', bytes: Buffer.from(''), side: 1, pixels: 1, format: 'webp', dispositions: [], timeoutMs: 1, maxBufferBytes: 1 } as never)
    expect(probe.startTheMessageWorker({ args: [], cwd: 'C:\\office', logPath: 'C:\\office\\worker.log' })).toEqual({ pid: 1, pgid: 1 })
    await probe.tmuxPanes('#{pane_id}')
    probe.killProcessGroup(4321, 'SIGTERM')
    probe.stopContainer('a-container')
    await probe.theVersionOfAProgram('codex', {})
    expect(calls).toEqual([
      'checkout',
      'gpu',
      'containers',
      'locks',
      'machineName',
      'ownAddresses',
      'key',
      'startTheRestartCommand',
      'runAvatarCodec',
      'startTheMessageWorker',
      'tmuxPanes #{pane_id}',
      'killProcessGroup 4321 SIGTERM',
      'stopContainer a-container',
      'theVersionOfAProgram codex',
    ])
    expect(scripts).toEqual([])
    const asAnyProbe: OsProbe = probe
    for (const leftOut of [
      'processTable',
      'processFacts',
      'programAndArguments',
      'cgroupOf',
      'senderOfAConnection',
      'listeningOn',
      'containerFirstProcess',
      'containerState',
      'pidNamespaceOf',
      'machineNow',
      'sweepCheckWorktrees',
    ] as const) {
      expect(asAnyProbe[leftOut], leftOut).toBeUndefined()
    }
  })
})

describe('the probe the server is given on Windows', () => {
  it("9: is this probe, over the layer's reader, and its worker start is not refused", () => {
    const probe = res.theProbeForThisPlatform('win32')
    expect(probe).toBeInstanceOf(windows.WindowsProbe)
    const reads = vi.spyOn(layer.theSystemFor('win32').processes as WindowsProcessReader, 'processWithItsCommandLine').mockReturnValue({ here: false })
    expect(probe.processById(1234)).toBeNull()
    expect(reads.mock.calls).toEqual([[1234]])
    // The worker's log folder cannot be made under a file. So the start fails at its first step, which comes after the
    // check of the platform, in the file system's words and not in a 501, and nothing is started.
    const scratch = mkdtempSync(join(tmpdir(), 'the-message-workers-probe-on-windows-'))
    try {
      writeFileSync(join(scratch, 'a-file'), '')
      const refused = thrownBy(() => probe.startTheMessageWorker?.({ args: [], cwd: scratch, logPath: join(scratch, 'a-file', 'logs', 'worker.log') }))
      expect(refused?.code).toBe('ENOTDIR')
      expect(refused?.status).toBeUndefined()
    } finally {
      rmSync(scratch, { recursive: true, force: true })
    }
  })

  it('10: W8, a worker registered while it is installed is stored with group 0, its start and its command line', () => {
    const session = t.api.createRecord({
      workspaceId: 'default',
      kind: 'session',
      title: "the session of the made-up office's message worker",
      data: { state: 'running', runtime: 'claude-code' },
      actor: t.api.HUMAN,
    }).id
    const { probe } = aProbe(rows(NODE))
    res.useOsProbe(probe)
    try {
      const row = res.registerResource({
        workspaceId: 'default',
        sessionRecordId: session,
        type: 'process',
        key: '1234',
        detail: 'the Mole Office message worker',
        startedByTheProduct: true,
        actor: t.api.HUMAN,
      })
      expect(row).toMatchObject({
        key: '1234',
        pgid: 0,
        osStartedAt: clockStamp(() => new Date(STARTED)).stamp,
        detail: `the Mole Office message worker — ${NODE.CommandLine}`,
      })
    } finally {
      res.useOsProbe(res.LINUX_PROBE)
    }
  })

  it('11: starts the worker as the layer starts a program in its own group, and says it is in the group of the process started', () => {
    // THE WORKER IS STOOD IN BY A NODE THAT WAITS, so that no message worker can start here, even under a mutation that
    // skips the layer. The layer's answer is a second Node, with its own mark in its arguments and environment, so the
    // process that runs shows whose way it was started.
    const waits = (mark: string) => ['-e', `setTimeout(() => {}, 10_000) // ${mark}`]
    vi.spyOn(settings, 'howToStart').mockReturnValue({ command: process.execPath, args: waits('the declaration'), environment: { MADE_UP_NEED: 'the declaration' } } as never)
    const scratch = mkdtempSync(join(tmpdir(), 'the-message-workers-start-in-a-group-'))
    try {
      for (const platform of ['win32', 'linux']) {
        const theLayers = { command: process.execPath, args: waits(`the layer for ${platform}`), windowsVerbatimArguments: false, env: { ...process.env, MADE_UP_MARK: platform }, detached: true as const }
        const start = vi.spyOn(layer.theSystemFor(platform).groups, 'howToStartInItsOwnGroup').mockReturnValue(theLayers)
        const started = res.theProbeForThisPlatform(platform).startTheMessageWorker!({ args: ['--session', 'made-up'], cwd: scratch, logPath: join(scratch, `${platform}.log`) })
        try {
          expect(start.mock.calls, platform).toHaveLength(1)
          const [way] = start.mock.calls[0]!
          expect(way, platform).toEqual({ command: process.execPath, args: [...waits('the declaration'), '--session', 'made-up'], windowsVerbatimArguments: false, env: { ...process.env, MADE_UP_NEED: 'the declaration' } })
          expect(started.pgid, platform).toBe(started.pid)
          // The process that runs is the layer's, in the layer's environment, and it leads a group of its own.
          expect(readFileSync(`/proc/${String(started.pid)}/cmdline`, 'utf8').split('\0'), platform).toContain(theLayers.args[1])
          expect(readFileSync(`/proc/${String(started.pid)}/environ`, 'utf8').split('\0'), platform).toContain(`MADE_UP_MARK=${platform}`)
          const stat = readFileSync(`/proc/${String(started.pid)}/stat`, 'utf8')
          expect(Number(stat.slice(stat.lastIndexOf(')') + 2).split(' ')[2]), platform).toBe(started.pid)
        } finally {
          process.kill(-started.pgid, 'SIGKILL')
        }
      }
    } finally {
      rmSync(scratch, { recursive: true, force: true })
    }
  })
})
