// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * NO WINDOWS PROCESS READING HOLDS THE SERVER'S THREAD. Wave 13t, round W11, item 2 (a).
 *
 * On Windows each reading of a process, and each reading of a Job Object, is one PowerShell script. On a Windows 11
 * machine (wave 13t, round W10, run F) each took about a second, and the server ran each one with spawnSync. So for that
 * second nothing else the server served moved: no other request was answered and no timer ran. The run's trace counted
 * those readings on the start, on GET /api/resources, on GET /api/worker/runs, on POST /api/resources, on the PATCH of a
 * run's record that ends it, on the minute pass and on shutdown. Now each reading on those acts starts PowerShell and
 * waits for it while the thread goes on. A reading that a write inside a database transaction needs is made before the
 * transaction, and the write reads it from there.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS CLAIMED
 * ---------------------------------------------------------------------------------------
 *
 * With the Windows probe over a stand-in for PowerShell, which answers both ways and counts each script it is given,
 * each act below runs no script in the way that holds the thread, and at least one in the way that does not:
 *
 *   1. GET /api/resources, about a run whose starter has ended and whose program runs in the starter's Job Object.
 *   2. GET /api/worker/runs, about the same run.
 *   2b. GET /api/worker/runs, about an inspection start with no process row of its own, whose parent run holds one. The
 *      reading of whether the parent has ended asks the parent's process (round W12).
 *   3. POST /api/resources: a run of the message worker this server started, sent over the listener by a caller the
 *      office cannot place, and a row sent from the office's own process.
 *   4. The PATCH of a run's record that ends the run.
 *   5. The minute pass, about a row of the office's own parts.
 *   6. Shutdown: the reading of whether the message worker has stopped, and the line on the server's own row.
 *   7. The start: the reading of the group this server was started in and the service lock, the server's rows in the
 *      ledger, with a run going in this project and one in another, the restart manager, and the message worker's row.
 *   8. Two of the session hook's first reads (round W45). On a Windows 11 machine on 7 November 2026, all five of the
 *      reads the hook sends together timed out at its limit of 3 seconds, and these two ran scripts that held the thread:
 *      (a) GET /api/resources/orphans, about a run whose starter has ended;
 *      (b) GET /api/sessions?only=running, about an own row whose process has ended and two conversations of Claude
 *          Code, one whose claude.exe runs and one whose process has ended. One reading of every process answers all
 *          three, and the answer says of each what that reading holds.
 *      (c) GET /api/resources/orphans, about two processes the GPU lists that no row claims, one running and one ended.
 *          On the same machine, later that day, the sweep of the GPU held the thread for 47 of the 84 seconds that
 *          readings of processes held it, one process after another. One reading of every process, made by the way
 *          that waits, answers both (round W45). The case asks in a project of its own, which has no rows. On Windows
 *          every process is in group 0, and the sweep counts a row's group of 0 as a claim on every process, so any row
 *          of the project would hide the running process. That fault was found in round W45 and is not fixed.
 *      In (a) and (c) the GPU's list (nvidia-smi) and the list of running containers (docker) count as readings too, and
 *      the door reads both by the way that waits (round W48). On the same machine on 8 November 2026, the first
 *      GET /api/resources/orphans after a restart held the thread for 6.92 s in the sweep of the containers, in one call
 *      of docker that took 7.2 s, and for 0.95 s in the sweep of the GPU.
 *   9. While the first script one of those two reads runs takes longer than the hook's shortest limit, the hook's
 *      GET /api/where-you-stand and GET /api/handles, sent meanwhile over the listener, each answer within that limit.
 *  10. WHAT STILL HOLDS THE THREAD, COUNTED (round W45). The look at whether a conversation's recorded process still
 *      runs (`whetherTheRecordedProcessRuns`), and the probe's reading of the same process in the same run of the
 *      thread, hold it for one script, where they held five. Code that cannot wait makes that look: the presence pass,
 *      the stream's open and close, the handle's hold, and the requests that ask who answers as an agent. On that
 *      Windows 11 machine those paths held the thread for 31 of the 84 seconds, four or five scripts at a time. In a
 *      later run of the thread the process is read again, because it may have ended.
 *  11. THE LOOKS AT WHO IS THERE AND WHO ANSWERS, AND THE READS THAT ASK WHO ANSWERS (round W46). In a CPU profile of
 *      66.5 s of the office on a Windows 11 machine, scripts held the thread for 15.4 s: the reading of a session's
 *      recorded process for 5.9 s, the process rows for 3.1 s, the runtime record for 2.9 s, the record of the terminal
 *      holder for 1.1 s and the record of a session's own process for 0.8 s. With a person's page open:
 *      (a) the handle's hold, and the look at who answers that it asks for;
 *      (b) the-worker's stream, opened and closed, and the looks at who is there that each asks for;
 *      (c) the presence clock's look, after the process of the session that answers has ended;
 *      (d) GET /api/runtime and GET /api/runtime/freshness;
 *      (e) the record of the terminal holder in the ledger, when the server first hears from it;
 *      (f) POST /api/handles/:handle/process, about the session's own process;
 *      (g) GET /api/handles/:handle, which says who answers as the agent;
 *      (h) GET /api/onboarding about an agent's start folder, which says whether the agent answers already.
 *      AND THE TWO READS RUN NO SCRIPT AT ALL WHEN WHO ANSWERS ASKS ABOUT NO PROCESS (round W49). Each made one reading
 *      of every process, which took about 0.9 s on the same machine on 8 November 2026, though nothing then asked it.
 *      The reading of who answers asks about a process only for a hold of a session that is not a run's, or for a run
 *      record that says it is running for the agent. So:
 *      (i) GET /api/handles/the-worker, when nothing holds the handle and no run is running for the agent;
 *      (j) GET /api/onboarding about the-worker's start folder, when nothing holds the handle;
 *      (k) GET /api/handles/the-worker, when a run the office started for the agent holds the handle.
 *      And the read still reads first when who answers asks about a process that is not a hold's:
 *      (l) GET /api/handles/the-worker, when nothing holds the handle and a run record says it is running for the agent.
 *      AND THE LOOK AT WHO ANSWERS THAT THE WRITE OF A RUN'S RECORD ASKS FOR is made on one reading of every process,
 *      by the way that waits, as the look the hold asks for in (a) is:
 *      (m) a write of the record of a run that is running for the-worker, whose own process is alive.
 *      Not claimed: the install of the entry, and the other reads that ask who answers as an agent: a participant's own
 *      read, the send of a message to an agent, the read after a compaction and the reconciling of the agents in the
 *      office's terminals.
 *  12. THE GPU'S LIST AND THE CONTAINERS' LIST, BY THE WAY THAT WAITS (round W48). The Windows probe the server makes
 *      reads each list by the way that waits, through the Linux probe it borrows both from, with the same answer as by
 *      the way that holds the thread: (a) a list from each, (b) neither program installed, (c) each program exits with a
 *      failure, (d) a line of each that is not the shape asked for. (e) While each list is read, the thread goes on.
 *      Here nvidia-smi and docker are made-up scripts first on the PATH, and in (b) the PATH holds only an empty folder.
 *  13. THE TERMINAL HOLDER'S RESTART. The process reader gives every process on Windows group 0. The holder's
 *      group is the number of the starter that started it, whose Job Object holds it. So:
 *      (a) the holder's row in the ledger records that group when the Job Object holds the holder, read by the way that
 *          waits;
 *      (b) the row records the reader's 0 when the Job Object does not hold the holder, or Windows cannot say;
 *      (c) the release of the row asks the group's pipe to stop, because Windows has no SIGTERM. It sends no signal, and
 *          no reading on its way holds the thread;
 *      (d) the release refuses when the Job Object no longer holds the holder, or Windows cannot say;
 *      (e) the release refuses when the group's Job Object holds this server, or Windows cannot say;
 *      (f) the restart reads no process in the way that holds the thread, from the holder's record to the close of its
 *          row, and stops the holder by its group's pipe. MOLE_OFFICE_TERMINAL_HOLDER is off here, so the restart ends
 *          with no new holder. Its read of a new holder is the read in (a).
 *      The pipe is a socket file the case listens on. Only a run on Windows shows the real pipe and the holder's helper.
 *  14. THE DATA FOLDER DOOR. On a Windows 11 machine on 12 November 2026, GET /api/office/data-folder held the thread
 *      for 1.2 to 2.1 s each time it was asked, about every three and a half seconds. Its look at whether the process
 *      the move's mark names as the mover still runs read that process by the way that holds the thread. So:
 *      (a) the door reads a mover that runs by the way that waits, and says it is alive;
 *      (b) the door says a mover whose process has ended is not alive, and nor is a process with the mover's number
 *          that started at another moment, each read by the way that waits;
 *      (c) the reading that waits answers what the reading that holds the thread answers, for the same movers, on the
 *          stand-in Windows machine and with this machine's own reader.
 *      The door's look in its timer, while a move starts, still holds the thread. It is not claimed here.
 *
 * THE ONE READER. In the server on Windows, the probe reads through the system layer's reader, which is
 * `theProcessReader()` (`theProbeForThisPlatform` in src/server/lib/resources.ts). The sessions read asks both: the probe
 * about the office's own rows, and `theProcessReader()`, through `whetherTheRecordedProcessRuns`, about the process of
 * each other run. So here `theProcessReader()` is the stand-in reader each case gives the probe.
 *
 * NOTHING HERE IS PROVED ON WINDOWS. Each answer is what the script would print, handed back by the stand-in. On a
 * Windows machine the start and shutdown run whole, and the trace of such a run counts the scripts that held the thread.
 * Here the start and shutdown are driven by the steps the server's file runs. A step the server's file does not
 * export is a failure in words.
 *
 * ---------------------------------------------------------------------------------------
 * MUTATIONS, NAMED, EACH AFTER A CONTROL RUN (the commit message that added the code)
 * ---------------------------------------------------------------------------------------
 */

import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createServer, type AddressInfo, type Server } from 'node:net'
import { tmpdir } from 'node:os'
import { delimiter, join } from 'node:path'
import type { FastifyInstance } from 'fastify'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

// THE ONE READER (see the header): while a case runs, `theProcessReader()` is the stand-in reader the case gave the probe.
const THE_READER = vi.hoisted(() => ({ current: null as null | object }))
vi.mock('../src/config/process-reader.mjs', async (importOriginal) => {
  const real = await importOriginal<typeof import('../src/config/process-reader.mjs')>()
  return { ...real, theProcessReader: () => THE_READER.current ?? real.theProcessReader() }
})

// A TERMINAL HOLDER, STOOD IN (cases 11e and 13): while a case sets `hello`, the holder answers its hello with it, and
// while a case sets `terminals`, its list with them. Every other question goes to the real module.
const THE_HOLDER = vi.hoisted(() => ({ hello: null as null | Record<string, unknown>, terminals: null as null | Record<string, unknown>[] }))
vi.mock('../src/config/the-terminal-holder.mjs', async (importOriginal) => {
  const real = await importOriginal<typeof import('../src/config/the-terminal-holder.mjs')>()
  return {
    ...real,
    askTheHolder: (...asked: Parameters<typeof real.askTheHolder>) =>
      THE_HOLDER.hello !== null && asked[1]['op'] === 'hello'
        ? Promise.resolve({ ok: true, ...THE_HOLDER.hello })
        : THE_HOLDER.terminals !== null && asked[1]['op'] === 'list'
          ? Promise.resolve({ ok: true, terminals: THE_HOLDER.terminals })
          : real.askTheHolder(...asked),
  }
})

import type { WhatACommandDid } from '../src/config/process-reader.mjs'
import { THE_STOP_ANSWER, THE_STOP_REQUEST, windowsGroups } from '../src/config/systems/windows-groups.mjs'
import { windowsProcessReader } from '../src/config/systems/windows-processes.mjs'
import { THE_GROUP_VARIABLE } from '../src/config/systems/windows-starts.mjs'
import { THE_SESSION_HOOK_ID } from '../src/shared/participants.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import type { TerminalHolderRestartRefusalCode } from '../src/shared/refusal-codes.ts'
import { wholeRows } from '../src/shared/sessions-said-once.ts'
import { localStamp } from '../src/shared/time.ts'
import { apiApp, freshDb, type TestDb } from './helpers.ts'

type ResourcesLib = typeof import('../src/server/lib/resources.ts')
type WorkerLib = typeof import('../src/server/lib/worker.ts')
type WindowsProbeLib = typeof import('../src/server/lib/windows-probe.ts')
type OsGpu = import('../src/server/lib/resources.ts').OsGpu
type OsContainers = import('../src/server/lib/resources.ts').OsContainers
/** What the Windows probe borrows from the Linux probe. */
type SharedWithLinux = ConstructorParameters<WindowsProbeLib['WindowsProbe']>[0]
type TheSystemLib = typeof import('../src/config/systems/the-system.mjs')
type SettingsLib = typeof import('../src/config/settings.mjs')

let t: TestDb
let app: FastifyInstance
let api = ''
let key = ''
/** The registry id of the agent registered as `the-worker`. */
let theWorkersId = ''
let res: ResourcesLib
let worker: WorkerLib
let windows: WindowsProbeLib
let theSystem: TheSystemLib
let settingsLib: SettingsLib
let scratch = ''

const AS_THE_PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}
const THE_SERVERS_ACTOR = { type: 'agent', id: 'mole-office/the-api-server' } as const

// ---------------------------------------------------------------------------- the stand-in Windows machine

/** The process that started this server, whose number names the group the server runs in. */
const THE_SERVERS_STARTER = 6000
/** The message worker's starter, which this server records as the worker's pid and group, and the worker. */
const THE_WORKERS_STARTER = 7000
const THE_WORKER = 7001
/** A run's starter, which has ended, and the run's program, which runs on in the starter's Job Object. */
const STARTER = 7100
const PROGRAM = 7200
/** The same for a run in another project. */
const ANOTHER_PROJECT = 'a-made-up-second-project'
const ANOTHER_STARTER = 7500
const ANOTHER_PROGRAM = 7600
/** A project with no rows in the ledger, for case 8c. */
const A_PROJECT_WITH_NO_ROWS = 'a-made-up-project-with-no-rows'
/** A run of the message worker that the worker registers: the run's starter, a child of the worker. */
const THE_WORKERS_RUN = 7300
/** A process that has ended. */
const GONE = 7400
/** The process of the run that started an inspection, still running. */
const THE_INSPECTIONS_PARENT = 7800
/** A process the GPU lists that is running, and one it lists that has ended, neither claimed by a row. */
const A_GPU_PROCESS = 8100
const A_GPU_PROCESS_THAT_ENDED = 8150

/** One row as the reader's script prints it. */
interface ARow {
  ProcessId: number
  ParentProcessId: number
  CreationDate: number | null
  Name: string
  ExecutablePath: string
  CommandLine: string | null
}

/** The processes running, by number, and the processes each starter's Job Object holds. */
const machine = new Map<number, ARow>()
const jobObjects = new Map<number, number[]>()
/**
 * What the script that asks whether a group's Job Object holds a process prints, by `<group> <pid>`, when a case says
 * (claim 13). Otherwise it prints that the Job Object holds it.
 */
const jobObjectsSay = new Map<string, string>()
const HOLDS = '{"holds":true,"marked":true}'
const DOES_NOT_HOLD = '{"holds":false}'
const CANNOT_SAY = '{"job":"refused"}'

function aRow(pid: number, ppid: number, startedMs: number, commandLine: string): ARow {
  return { ProcessId: pid, ParentProcessId: ppid, CreationDate: startedMs, Name: 'node.exe', ExecutablePath: 'C:\\node.exe', CommandLine: commandLine }
}

/** The moment a stamp in this machine's local time names, in whole seconds as the ledger keeps it. */
const msOf = (stamp: string): number => new Date(stamp.replace(' ', 'T')).getTime()

const AN_HOUR_AGO = Math.floor((Date.now() - 3_600_000) / 1000) * 1000

const printed = (stdout: string): WhatACommandDid => ({ command: 'powershell.exe', ran: true, status: 0, stdout, stderr: '' })

/** What one script asks, in words, and what it prints on this machine. */
function whatAScriptAsks(script: string): { asks: string; answer: WhatACommandDid } {
  const holding = /\[MoleOfficeHolding\]::Holds\('[^']*?(\d+)', (\d+)\)/u.exec(script)
  if (holding !== null) {
    const said = jobObjectsSay.get(`${String(holding[1])} ${String(holding[2])}`) ?? HOLDS
    return { asks: `whether a Job Object holds process ${String(holding[2])}`, answer: printed(`${said}\r\n`) }
  }
  if (script.includes('[MoleOfficeJobList]::Pids(')) {
    const starter = Number(/-Filter "ParentProcessId = (\d+)"/u.exec(script)?.[1])
    const held = jobObjects.get(starter)
    const children = [...machine.values()].filter((row) => row.ParentProcessId === starter)
    return {
      asks: `the Job Object of starter ${String(starter)}`,
      answer: printed(held === undefined ? '{"job":"missing"}\r\n' : `{"job":"there","pids":[${held.join(',')}]}\r\n${JSON.stringify(children)}\r\n`),
    }
  }
  const one = /-Filter "ProcessId = (\d+)"/u.exec(script)
  if (one !== null) {
    const row = machine.get(Number(one[1]))
    return { asks: `process ${one[1]}`, answer: printed(`${JSON.stringify(row === undefined ? [] : [row])}\r\n`) }
  }
  // Every process, with every field a row has. The script that lists only the command lines prints no name.
  if (script.includes('Get-CimInstance -ClassName Win32_Process |') && script.includes('Name = $_.Name')) {
    return { asks: 'every process', answer: printed(`${JSON.stringify([...machine.values()])}\r\n`) }
  }
  throw new Error(`This stand-in for PowerShell does not know the script that begins ${JSON.stringify(script.slice(0, 160))}.`)
}

/** What each script asked: run in the way that holds the thread, and run in the way that waits for it. */
const held: string[] = []
const waited: string[] = []

/**
 * When a case sets it, the next script takes this many milliseconds, as a script took about a second on Windows, and
 * does what the case gives it as the script starts. Run the way that holds the thread, nothing else moves for that time.
 */
let theNextScriptIsSlow: { ms: number; asItStarts: () => void } | null = null

function theSlowScript(): { ms: number; asItStarts: () => void } | null {
  const slow = theNextScriptIsSlow
  theNextScriptIsSlow = null
  slow?.asItStarts()
  return slow
}

/** PowerShell, stood in, both ways. The way that waits answers on a later turn of the event loop, as a process does. */
const commands = {
  powershell: (script: string): WhatACommandDid => {
    const { asks, answer } = whatAScriptAsks(script)
    held.push(asks)
    const slow = theSlowScript()
    if (slow !== null) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, slow.ms)
    return answer
  },
  startPowerShell: async (script: string): Promise<WhatACommandDid> => {
    const { asks, answer } = whatAScriptAsks(script)
    waited.push(asks)
    const slow = theSlowScript()
    scriptsRunning += 1
    try {
      await new Promise((later) => (slow === null ? setImmediate(later) : setTimeout(later, slow.ms)))
    } finally {
      scriptsRunning -= 1
    }
    return answer
  },
}

/** How many scripts run now in the way that waits. */
let scriptsRunning = 0

/**
 * Wait until no script runs in the way that waits, on two turns of the event loop in a row. A look the server makes
 * after it has answered runs after a script of its own, so a case that counts the look's readings waits for it here.
 */
async function untilNoScriptRuns(): Promise<void> {
  const until = Date.now() + 10_000
  for (let quiet = 0; quiet < 2; ) {
    await new Promise((later) => setImmediate(later))
    quiet = scriptsRunning === 0 ? quiet + 1 : 0
    expect(Date.now() < until, 'a script in the way that waits was still running after ten seconds').toBe(true)
  }
}

/** The processes the GPU lists, when a case gives some. Otherwise the stand-in machine has no GPU. */
let theGpuLists: { pid: number; usedMib: number; name: string }[] | null = null

/** What the GPU lists on the stand-in machine. */
function theGpusList(): OsGpu {
  return theGpuLists === null ? { available: false, reason: 'a stand-in Windows machine has no GPU' } : { available: true, processes: theGpuLists }
}

const NO_DOCKER: OsContainers = { available: false, reason: 'a stand-in Windows machine has no docker' }

/**
 * The borrowed half of the Windows probe. Nothing here asks it about a process. Its two lists of the machine, the GPU's
 * and the running containers, count as readings, each in the way it is read: nvidia-smi and docker, run by spawnSync,
 * hold the thread as a script does (claim 8).
 */
function theBorrowedHalf(): SharedWithLinux {
  const notAsked = (what: string) => (): never => {
    throw new Error(`this test does not ask the probe's ${what}`)
  }
  return {
    checkout: () => ({ head: null, branch: null, dirty: null, isWorktree: null, couldNotRead: [] }),
    gpu: () => (held.push("the GPU's list"), theGpusList()),
    readGpu: async () => {
      waited.push("the GPU's list")
      await new Promise((later) => setImmediate(later))
      return theGpusList()
    },
    containers: () => (held.push("the containers' list"), NO_DOCKER),
    readContainers: async () => {
      waited.push("the containers' list")
      await new Promise((later) => setImmediate(later))
      return NO_DOCKER
    },
    locks: () => ({ files: [], unreadable: [] }),
    machineName: () => 'a-windows-machine',
    ownAddresses: () => [],
    whatAnAgentToolSaysAboutItsKey: () => ({ state: 'nobody-has-looked', says: 'test', asked: 'test' }),
    startTheRestartCommand: notAsked('restart command'),
    runAvatarCodec: notAsked('avatar codec'),
    startTheMessageWorker: notAsked('worker start'),
    tmuxPanes: () => Promise.resolve({ ok: true, out: '' }),
    killProcessGroup: (pgid, signal) => void signalled.push(`${signal} to group ${String(pgid)}`),
    stopContainer: notAsked('container stop'),
    theVersionOfAProgram: () => Promise.resolve({ path: null, version: 'test', versionWasRead: false }),
  }
}

/** Each group stop the probe was asked for, by its signal and group (claim 13). */
const signalled: string[] = []

/** A group's stop pipe on the stand-in machine: a socket file, as a test on Linux hands one in (claim 13). */
const theStopAddressOf = (group: number): string => join(scratch, `stop-${String(group)}.sock`)

/** The server's system layer on the stand-in machine: its reader and its groups, over the same stand-in. */
function theWindowsSystem() {
  return { ...theSystem.theSystemFor('win32'), processes: windowsProcessReader(commands), groups: windowsGroups(commands) }
}

/** Install the Windows probe over the stand-in, with a reader of its own, so nothing a case read is kept for the next. */
function installTheWindowsProbe(): void {
  const reader = windowsProcessReader(commands)
  THE_READER.current = reader
  res.useOsProbe(new windows.WindowsProbe(theBorrowedHalf(), reader, commands, undefined, windowsGroups(commands, theStopAddressOf)))
}

/** Run an act, and say what its readings were. The counts start at the act, after the case has set things up. */
async function theReadingsOf(act: () => unknown): Promise<{ held: string[]; waited: string[] }> {
  held.length = 0
  waited.length = 0
  await act()
  return { held: [...held], waited: [...waited] }
}

function expectNoReadingHeldTheThread(read: { held: string[]; waited: string[] }, act: string): void {
  expect(read.held, `${act}: these readings held the server's thread`).toEqual([])
  expect(read.waited.length, `${act}: no reading was made at all, so this case shows nothing`).toBeGreaterThan(0)
}

/** A step the server's file must export for this test to drive it. */
function theStep<T>(lib: Record<string, unknown>, name: string, where: string): T {
  expect(typeof lib[name], `${where} exports no ${name}, so this step of the act cannot be driven`).toBe('function')
  return lib[name] as T
}

// ---------------------------------------------------------------------------- the rows the acts read

/** A registry row for an agent, written straight into the throwaway database. */
function anAgent(id: string): void {
  t.client.sqlite
    .prepare(
      'INSERT INTO assets (id, kind, origin, path, mime, bytes, created_at, created_by_kind, created_by_id, ' +
        "licence_source) VALUES (?, 'avatar', 'default', NULL, 'image/svg+xml', NULL, ?, NULL, NULL, 'generated') ON CONFLICT(id) DO NOTHING",
    )
    .run(`avatar-default-agent-${id}`, '2026-09-01 08:00:00')
  t.client.sqlite
    .prepare('INSERT INTO agents (id, name, handle, avatar_asset_id, retired, retired_at, created_at) VALUES (?,?,?,?,0,NULL,?) ON CONFLICT(id) DO NOTHING')
    .run(id, id, id, `avatar-default-agent-${id}`, '2026-09-01 08:00:00')
}

/**
 * A run of the message worker, running, with the row of its starter. The row was registered while the starter ran, as
 * the worker registers it. The starter has ended since, and the run's program runs on in the starter's Job Object.
 */
function aRunWhoseStarterHasEnded(workspaceId = 'default', starter = STARTER, program = PROGRAM): string {
  anAgent('a-served-agent')
  const filed = t.api.createRecord({
    workspaceId,
    kind: 'session',
    title: 'a run of the message worker',
    data: {
      state: 'running',
      runtime: 'claude-code',
      startedByMoleOffice: true,
      deliveringMessage: 'a-message-this-test-never-wrote',
      servingAgentId: 'a-served-agent',
    },
    actor: t.api.HUMAN,
  })
  const startedMs = msOf(filed.createdAt)
  machine.set(starter, aRow(starter, THE_WORKER, startedMs, "powershell.exe -EncodedCommand the run's starter"))
  res.registerResource({
    workspaceId,
    sessionRecordId: filed.id,
    type: 'process',
    key: String(starter),
    detail: 'a claude-code run answering a message',
    startedByTheProduct: true,
    actor: t.api.HUMAN,
  })
  machine.delete(starter)
  machine.set(program, aRow(program, starter, startedMs + 100, 'node.exe the-run.mjs'))
  jobObjects.set(starter, [program])
  return filed.id
}

/** Where the installer of Claude Code puts its program on Windows. */
const CLAUDE_ON_WINDOWS = 'C:\\Users\\a\\.local\\bin\\claude.exe'
/** A conversation of Claude Code whose process runs, and one whose process has ended. */
const A_CLAUDE_THAT_RUNS = 7900
const A_CLAUDE_THAT_ENDED = 7950

/** A run of Claude Code, filed by its hook with its process: claude.exe as `pid`, running or ended. */
function aClaudeRun(pid: number, runs: boolean): string {
  const filed = t.api.createRecord({
    workspaceId: 'default',
    kind: 'session',
    title: `a conversation of Claude Code, process ${String(pid)}`,
    data: { state: 'running', runtime: 'claude-code', extra: { discovered: { pid, pidStartedAt: localStamp(new Date(AN_HOUR_AGO)) } } },
    actor: t.api.HUMAN,
  })
  if (runs) machine.set(pid, { ...aRow(pid, 4, AN_HOUR_AGO, `"${CLAUDE_ON_WINDOWS}" --resume`), Name: 'claude.exe', ExecutablePath: CLAUDE_ON_WINDOWS })
  return filed.id
}

/** A row of one of the office's own parts, still going, whose recorded process has ended. */
function anOwnRowWhoseProcessHasEnded(role: 'The API server' | 'The message worker', port: number, checkout: string): string {
  return t.api.createRecord({
    workspaceId: 'default',
    kind: 'session',
    title: role,
    data: {
      state: 'running',
      runtime: 'mole-office',
      workingDirectory: checkout,
      extra: { ownPart: { role, port, checkout }, discovered: { pid: GONE, pidStartedAt: localStamp(new Date(AN_HOUR_AGO)) } },
    },
    actor: THE_SERVERS_ACTOR,
  }).id
}

// ---------------------------------------------------------------------------- set up

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  res = await import('../src/server/lib/resources.ts')
  worker = await import('../src/server/lib/worker.ts')
  windows = await import('../src/server/lib/windows-probe.ts')
  theSystem = await import('../src/config/systems/the-system.mjs')
  settingsLib = await import('../src/config/settings.mjs')
  await app.listen({ host: '127.0.0.1', port: 0 })
  api = `http://127.0.0.1:${String((app.server.address() as AddressInfo).port)}`
  const started = await app.inject({ method: 'POST', url: '/api/agents/started', headers: AS_THE_PERSON, payload: { handle: 'the-worker', name: 'The worker', role: 'supervisor' } })
  expect(started.statusCode, started.body.slice(0, 300)).toBe(201)
  const registered = started.json() as { whatToGiveIt?: { key?: string }; agent?: { id?: string } }
  key = String(registered.whatToGiveIt?.key ?? '')
  expect(key, 'the registration answered no key').toMatch(/^[0-9a-f]{64}$/)
  theWorkersId = String(registered.agent?.id ?? '')
  expect(theWorkersId, 'the registration answered no agent id').not.toBe('')
  scratch = mkdtempSync(join(tmpdir(), 'mole-office-no-reading-holds-the-thread-'))
}, 60_000)

beforeEach(() => {
  machine.clear()
  jobObjects.clear()
  jobObjectsSay.clear()
  signalled.length = 0
  machine.set(process.pid, aRow(process.pid, THE_SERVERS_STARTER, AN_HOUR_AGO, 'node.exe src/server/index.ts'))
  machine.set(THE_SERVERS_STARTER, aRow(THE_SERVERS_STARTER, process.ppid, AN_HOUR_AGO, "powershell.exe -EncodedCommand the server's starter"))
  machine.set(process.ppid, aRow(process.ppid, 4, AN_HOUR_AGO, 'node.exe the-supervisor.mjs'))
  machine.set(THE_WORKERS_STARTER, aRow(THE_WORKERS_STARTER, process.pid, AN_HOUR_AGO, "powershell.exe -EncodedCommand the worker's starter"))
  machine.set(THE_WORKER, aRow(THE_WORKER, THE_WORKERS_STARTER, AN_HOUR_AGO, 'node.exe src/worker/index.ts'))
  installTheWindowsProbe()
})

afterEach(() => {
  res.useOsProbe(res.LINUX_PROBE)
  THE_READER.current = null
  theNextScriptIsSlow = null
  theGpuLists = null
  worker.forgetTheWorker()
  delete process.env[THE_GROUP_VARIABLE]
})

// THE HELD-VISIT RETRY THE LEDGER WRITE STARTS (case 7c). The server never stops it, because it ends with its process, so
// this file stops it at its end, as the end of a process of its own would. In a process that later files share, it would
// go on firing on this file's closed database, and each firing would be an unhandled rejection in a later file. Such a
// process keeps a module mock too, so the wrapper is taken away with it.
const theHeldVisitRetries: (() => void)[] = []
// THE ORIGIN WATCHER THE WRITE STARTS TOO, kept and stopped for the same reason. Its minute tick throws on a closed
// database. vitest does not report that throw, because the test process has a handler of its own for it, and that
// handler stops every server and removes every test folder: in a later file, those of the case that is running.
const theOriginWatchers: NodeJS.Timeout[] = []

afterAll(async () => {
  for (const stop of theHeldVisitRetries) stop()
  vi.doUnmock('../src/server/lib/visits.ts')
  for (const watch of theOriginWatchers) clearInterval(watch)
  vi.doUnmock('../src/server/lib/residents.ts')
  await app.close()
  t.close()
  rmSync(scratch, { recursive: true, force: true })
})

// ---------------------------------------------------------------------------- the requests

describe('a request on Windows reads no process in the way that holds the thread', () => {
  it('1: GET /api/resources', async () => {
    const run = aRunWhoseStarterHasEnded()
    let status = 0
    let body = ''
    const read = await theReadingsOf(async () => {
      const reply = await app.inject({ method: 'GET', url: `/api/resources?sessionRecordId=${run}`, headers: AS_THE_PERSON })
      status = reply.statusCode
      body = reply.body
    })
    expect(status, body.slice(0, 400)).toBe(200)
    expectNoReadingHeldTheThread(read, 'GET /api/resources')
    // The reading is the one the listing makes: the starter, and its Job Object, which holds the run's program.
    const [row] = (JSON.parse(body) as { resources: { liveness: { state: string; detail?: string } }[] }).resources
    expect(row?.liveness.state, body.slice(0, 400)).toBe('alive')
    expect(row?.liveness.detail).toContain(`pid ${String(PROGRAM)}`)
  })

  it('2: GET /api/worker/runs', async () => {
    aRunWhoseStarterHasEnded()
    let status = 0
    let body = ''
    const read = await theReadingsOf(async () => {
      const reply = await app.inject({ method: 'GET', url: '/api/worker/runs', headers: AS_THE_PERSON })
      status = reply.statusCode
      body = reply.body
    })
    expect(status, body.slice(0, 400)).toBe(200)
    expectNoReadingHeldTheThread(read, 'GET /api/worker/runs')
    expect(read.waited).toContain(`process ${String(STARTER)}`)
    expect(read.waited).toContain(`the Job Object of starter ${String(STARTER)}`)
  })

  it('2b: GET /api/worker/runs, about an inspection start whose parent run has a process row', async () => {
    anAgent('a-served-agent')
    // The parent: a run the pick-up does not read for itself, as it was not started for a message, with a process row.
    const parent = t.api.createRecord({
      workspaceId: 'default',
      kind: 'session',
      title: 'the run that started an inspection',
      data: { state: 'running', runtime: 'claude-code' },
      actor: t.api.HUMAN,
    })
    machine.set(THE_INSPECTIONS_PARENT, aRow(THE_INSPECTIONS_PARENT, THE_WORKER, msOf(parent.createdAt), 'node.exe the-parent-run.mjs'))
    res.registerResource({
      workspaceId: 'default',
      sessionRecordId: parent.id,
      type: 'process',
      key: String(THE_INSPECTIONS_PARENT),
      detail: 'the run that started an inspection',
      startedByTheProduct: true,
      actor: t.api.HUMAN,
    })
    // The inspection start, with no process row of its own, so the pick-up asks whether its parent has ended.
    t.api.createRecord({
      workspaceId: 'default',
      kind: 'session',
      title: 'an inspection start',
      data: {
        state: 'running',
        runtime: 'inspection-tool',
        startedByMoleOffice: true,
        deliveringMessage: 'a-message-this-test-never-wrote',
        servingAgentId: 'a-served-agent',
        parentAttachment: parent.id,
        extra: { inspectionRun: 'an-inspection-this-test-never-ran' },
      },
      actor: t.api.HUMAN,
    })
    let status = 0
    let body = ''
    const read = await theReadingsOf(async () => {
      const reply = await app.inject({ method: 'GET', url: '/api/worker/runs', headers: AS_THE_PERSON })
      status = reply.statusCode
      body = reply.body
    })
    expect(status, body.slice(0, 400)).toBe(200)
    expectNoReadingHeldTheThread(read, 'GET /api/worker/runs, about an inspection start')
    expect(read.waited, "the parent's process was not read").toContain(`process ${String(THE_INSPECTIONS_PARENT)}`)
  })

  it('3a: POST /api/resources, a run of the worker this server started, from a caller the office cannot place', async () => {
    worker.noteTheWorker({ ...worker.theWorkerWeStarted(), started: true, pid: THE_WORKERS_STARTER, pgid: THE_WORKERS_STARTER })
    const session = t.api.createRecord({
      workspaceId: 'default',
      kind: 'session',
      title: 'a run the worker registers',
      data: { state: 'running', runtime: 'claude-code' },
      actor: t.api.HUMAN,
    })
    machine.set(THE_WORKERS_RUN, aRow(THE_WORKERS_RUN, THE_WORKER, msOf(session.createdAt), "powershell.exe -EncodedCommand the run's starter"))
    let status = 0
    let text = ''
    const read = await theReadingsOf(async () => {
      const reply = await fetch(`${api}/api/resources`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-mole-office-workspace': 'default', 'x-mole-office-key': key },
        body: JSON.stringify({ sessionRecordId: session.id, type: 'process', key: String(THE_WORKERS_RUN) }),
      })
      status = reply.status
      text = await reply.text()
    })
    expect(status, text.slice(0, 400)).toBe(201)
    expectNoReadingHeldTheThread(read, 'POST /api/resources from the worker')
    // The door reads the run and its parent, and the registration takes the door's reading of the run.
    expect(read.waited).toEqual([`process ${String(THE_WORKERS_RUN)}`, `process ${String(THE_WORKER)}`])
  })

  it("3b: POST /api/resources, a row sent from the office's own process", async () => {
    const session = t.api.createRecord({
      workspaceId: 'default',
      kind: 'session',
      title: 'a run the office registers',
      data: { state: 'running', runtime: 'claude-code' },
      actor: t.api.HUMAN,
    })
    machine.set(THE_WORKERS_RUN, aRow(THE_WORKERS_RUN, THE_WORKER, msOf(session.createdAt), 'node.exe a-run.mjs'))
    let status = 0
    let body = ''
    const read = await theReadingsOf(async () => {
      const reply = await app.inject({
        method: 'POST',
        url: '/api/resources',
        headers: AS_THE_PERSON,
        payload: { sessionRecordId: session.id, type: 'process', key: String(THE_WORKERS_RUN) },
      })
      status = reply.statusCode
      body = reply.body
    })
    expect(status, body.slice(0, 400)).toBe(201)
    expectNoReadingHeldTheThread(read, "POST /api/resources from the office's own process")
  })

  it("4: the PATCH of a run's record that ends the run", async () => {
    const run = aRunWhoseStarterHasEnded()
    jobObjects.delete(STARTER)
    let status = 0
    let body = ''
    const read = await theReadingsOf(async () => {
      const reply = await app.inject({ method: 'PATCH', url: `/api/records/${run}`, headers: AS_THE_PERSON, payload: { dataPatch: { state: 'crashed' } } })
      status = reply.statusCode
      body = reply.body
    })
    expect(status, body.slice(0, 400)).toBe(200)
    expectNoReadingHeldTheThread(read, "the PATCH that ends a run")
    // The run's process row is closed, as its process is gone, by the reading made before the write.
    const rows = res.listResources({ workspaceId: 'default', sessionRecordId: run, includeReleased: true })
    expect(rows.map((row) => row.releasedAt === null)).toEqual([false])
  })
})

// ---------------------------------------------------------------------------- the session hook's first reads

/** The headers the session hook's first reads carry (`ask` in for-agents/session-hook.mjs), here with no key. */
const AS_THE_HOOK = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': THE_SESSION_HOOK_ID,
}

/** The shortest time the hook gives one of its first reads: the limit `ask` gives a read that names none. */
function theHooksShortestLimit(): number {
  const said = /timeLimitMs = hookMs\((\d[\d_]*)\)/u.exec(readFileSync(new URL('../for-agents/session-hook.mjs', import.meta.url), 'utf8'))
  expect(said, 'for-agents/session-hook.mjs gives `ask` no default limit this test can read').not.toBeNull()
  return Number(said?.[1]?.replaceAll('_', ''))
}

/**
 * A read the hook sends, whose first script takes the hook's shortest limit and half a second more. As that script
 * starts, the hook's GET /api/where-you-stand and GET /api/handles are sent over the listener, as the hook sends them
 * beside it, and each is timed from its send to the last byte of its answer.
 */
async function whileTheFirstScriptOf(path: string): Promise<{ slow: { status: number; body: string }; others: { path: string; status: number; ms: number }[] }> {
  // EACH OF THE TWO READS IS SENT ONCE BEFORE, AND ONLY THE SECOND IS TIMED. The first GET /api/where-you-stand of a
  // server starts its attention thread, which loads TypeScript in a test and took about three seconds there. That
  // start is not what this case measures.
  for (const other of ['/api/where-you-stand', '/api/handles']) {
    const before = await fetch(`${api}${other}`, { headers: AS_THE_HOOK })
    expect(before.status, `${other}, sent once before: ${(await before.text()).slice(0, 400)}`).toBe(200)
  }
  const others: Promise<{ path: string; status: number; ms: number }>[] = []
  theNextScriptIsSlow = {
    ms: theHooksShortestLimit() + 500,
    asItStarts: () => {
      for (const other of ['/api/where-you-stand', '/api/handles']) {
        const sent = performance.now()
        others.push(
          fetch(`${api}${other}`, { headers: AS_THE_HOOK }).then(async (answer) => {
            await answer.text()
            return { path: other, status: answer.status, ms: performance.now() - sent }
          }),
        )
      }
    },
  }
  const answer = await fetch(`${api}${path}`, { headers: AS_THE_HOOK })
  const slow = { status: answer.status, body: await answer.text() }
  expect(theNextScriptIsSlow, `${path} ran no script, so this case shows nothing`).toBeNull()
  return { slow, others: await Promise.all(others) }
}

function expectEachAnsweredWithinTheHooksLimit(others: { path: string; status: number; ms: number }[], path: string): void {
  expect(others.map((other) => other.path)).toEqual(['/api/where-you-stand', '/api/handles'])
  for (const other of others) {
    expect(other.status, other.path).toBe(200)
    expect(other.ms, `${other.path} answered ${String(Math.round(other.ms))} ms after it was sent, while ${path} read a process`).toBeLessThan(theHooksShortestLimit())
  }
}

describe("the session hook's first reads on Windows read no process in the way that holds the thread", () => {
  it('8a: GET /api/resources/orphans, about a run whose starter has ended', async () => {
    aRunWhoseStarterHasEnded()
    let status = 0
    let body = ''
    const read = await theReadingsOf(async () => {
      const reply = await app.inject({ method: 'GET', url: '/api/resources/orphans', headers: AS_THE_HOOK })
      status = reply.statusCode
      body = reply.body
    })
    expect(status, body.slice(0, 400)).toBe(200)
    expectNoReadingHeldTheThread(read, 'GET /api/resources/orphans')
    expect(read.waited).toContain(`process ${String(STARTER)}`)
    expect(read.waited).toContain(`the Job Object of starter ${String(STARTER)}`)
    // The sweep's two lists of the machine, each read once (claim 8).
    expect(read.waited.filter((one) => one.endsWith(' list')).sort()).toEqual(["the GPU's list", "the containers' list"])
  })

  it('8b: GET /api/sessions?only=running, about an own row whose process has ended and two conversations of Claude Code', async () => {
    const own = anOwnRowWhoseProcessHasEnded('The message worker', 1, 'C:\\an-old-checkout')
    const runs = aClaudeRun(A_CLAUDE_THAT_RUNS, true)
    const ended = aClaudeRun(A_CLAUDE_THAT_ENDED, false)
    let status = 0
    let body = ''
    const read = await theReadingsOf(async () => {
      const reply = await app.inject({ method: 'GET', url: '/api/sessions?only=running', headers: AS_THE_HOOK })
      status = reply.statusCode
      body = reply.body
    })
    expect(status, body.slice(0, 400)).toBe(200)
    expectNoReadingHeldTheThread(read, 'GET /api/sessions?only=running')
    // One reading of every process answers the own row and both conversations, and each says what that reading holds.
    expect(read.waited).toEqual(['every process'])
    // The answer is narrowed, so what its rows say alike is said once in saidOnce; each row is made whole before it is read.
    const parsed = JSON.parse(body) as { sessions: unknown[]; saidOnce?: unknown }
    const rows = wholeRows(parsed.sessions, parsed.saidOnce) as { recordId: string | null; itsProcess: { seen: string } | null }[]
    const seen = new Map(rows.map((row) => [row.recordId, row.itsProcess?.seen]))
    expect([seen.get(own), seen.get(runs), seen.get(ended)], 'the own row, the conversation that runs, the one that ended').toEqual(['none', 'running', 'none'])
  })

  it('8c: GET /api/resources/orphans, about two processes the GPU lists that no row claims, one running and one ended', async () => {
    // A project with no rows, because a row's group of 0 would claim the running process (the header, claim 8c).
    const { createWorkspace } = await import('../src/server/lib/workspaces.ts')
    createWorkspace({ id: A_PROJECT_WITH_NO_ROWS, title: 'A made-up project with no rows' })
    machine.set(A_GPU_PROCESS, aRow(A_GPU_PROCESS, 4, AN_HOUR_AGO, 'python.exe train.py'))
    theGpuLists = [
      { pid: A_GPU_PROCESS, usedMib: 2048, name: 'python.exe' },
      { pid: A_GPU_PROCESS_THAT_ENDED, usedMib: 512, name: 'an-ended-program.exe' },
    ]
    let status = 0
    let body = ''
    const read = await theReadingsOf(async () => {
      const reply = await app.inject({
        method: 'GET',
        url: '/api/resources/orphans',
        headers: { ...AS_THE_HOOK, 'x-mole-office-workspace': A_PROJECT_WITH_NO_ROWS },
      })
      status = reply.statusCode
      body = reply.body
    })
    expect(status, body.slice(0, 400)).toBe(200)
    expectNoReadingHeldTheThread(read, 'GET /api/resources/orphans, with processes the GPU lists')
    expect(read.waited).toContain('every process')
    // The sweep's two lists of the machine, each read once (claim 8).
    expect(read.waited.filter((one) => one.endsWith(' list')).sort()).toEqual(["the GPU's list", "the containers' list"])
    // The reading answered both: the running one with its command line, and the ended one as no process.
    const unclaimed = (JSON.parse(body) as { unclaimed: { resources: { type: string; key: string; detail: string; holder: { pid: number } | null }[] } }).unclaimed
    expect(unclaimed.resources.filter((one) => one.type === 'gpu').map((one) => [one.key, one.holder?.pid ?? null, one.detail])).toEqual([
      [String(A_GPU_PROCESS), A_GPU_PROCESS, 'python.exe train.py — holding 2048 MiB of GPU memory'],
      [String(A_GPU_PROCESS_THAT_ENDED), null, 'an-ended-program.exe — holding 512 MiB of GPU memory'],
    ])
  })

  it("9a: while GET /api/resources/orphans reads a process, the hook's other first reads answer within its limit", async () => {
    aRunWhoseStarterHasEnded()
    const { slow, others } = await whileTheFirstScriptOf('/api/resources/orphans')
    expect(slow.status, slow.body.slice(0, 400)).toBe(200)
    expectEachAnsweredWithinTheHooksLimit(others, 'GET /api/resources/orphans')
    // The first script takes longer than the hook's limit on purpose, and the case waits for it, so it gets longer than five seconds.
  }, 20_000)

  it("9b: while GET /api/sessions?only=running reads a process, the hook's other first reads answer within its limit", async () => {
    aClaudeRun(A_CLAUDE_THAT_RUNS, true)
    const { slow, others } = await whileTheFirstScriptOf('/api/sessions?only=running')
    expect(slow.status, slow.body.slice(0, 400)).toBe(200)
    expectEachAnsweredWithinTheHooksLimit(others, 'GET /api/sessions?only=running')
    // The first script takes longer than the hook's limit on purpose, and the case waits for it, so it gets longer than five seconds.
  }, 20_000)
})

// ---------------------------------------------------------------------------- what still holds the thread, counted

describe('what still holds the thread on Windows, counted', () => {
  it("10: the look at a conversation's recorded process, and the probe's reading of it, hold the thread for one script in one run", async () => {
    aClaudeRun(A_CLAUDE_THAT_RUNS, true)
    const { whetherTheRecordedProcessRuns } = await import('../src/config/session-process.mjs')
    const recorded = localStamp(new Date(AN_HOUR_AGO))
    const theLook = (): void => {
      expect(whetherTheRecordedProcessRuns(A_CLAUDE_THAT_RUNS, recorded).runs).toBe('yes')
      expect(res.osProbe().processById(A_CLAUDE_THAT_RUNS)?.pid).toBe(A_CLAUDE_THAT_RUNS)
    }
    const one = await theReadingsOf(theLook)
    expect(one.held, "the scripts that held the server's thread in one run").toEqual([`process ${String(A_CLAUDE_THAT_RUNS)}`])
    // A later run of the thread reads the process again, because it may have ended.
    await new Promise((later) => setImmediate(later))
    const later = await theReadingsOf(theLook)
    expect(later.held, 'the scripts that held the thread in a later run').toEqual([`process ${String(A_CLAUDE_THAT_RUNS)}`])
  })
})

// ---------------------------------------------------------------------------- the looks, and the reads that ask who answers

/** The conversation of Claude Code the-worker answers in, as its claude.exe was started to resume it. */
const THE_WORKERS_CONVERSATION = '6f1c2a40-3b7d-4e8a-9c21-5d0e7a9b4f13'
/** A terminal holder's process, for case 11e. */
const A_TERMINAL_HOLDER = 8200
/** The process of a run started for the-worker outside the message worker, for case 11l. */
const A_RUN_FOR_THE_WORKER = 8250

/** The headers the-worker's own requests carry: its key. */
function asTheWorker(): Record<string, string> {
  return { 'content-type': 'application/json', 'x-mole-office-workspace': 'default', 'x-mole-office-key': key }
}

describe('the looks at who is there and who answers, and the reads that ask who answers, on Windows', () => {
  type EventsLib = typeof import('../src/server/lib/events.ts')
  type EventsApi = typeof import('../src/server/api/events.ts')
  type AnsweringTold = typeof import('../src/server/lib/answering-told.ts')
  let eventsLib: EventsLib
  let eventsApi: EventsApi
  let answeringTold: AnsweringTold
  /** The session record the-worker answers in, filed by the first case. */
  let session = ''
  /** The person's page, open while each case runs, and what it was told. */
  let page = -1
  const told: { name: string; who?: { kind: string; id: string } }[] = []

  /** The-worker holds its handle for its session, and the look that asks for is waited for. */
  async function theWorkerHolds(): Promise<void> {
    const reply = await app.inject({ method: 'POST', url: '/api/handles/the-worker/hold', headers: asTheWorker(), payload: { session, runtime: 'claude-code' } })
    expect(reply.statusCode, reply.body.slice(0, 400)).toBe(201)
    await untilNoScriptRuns()
  }

  beforeEach(async () => {
    eventsLib = await import('../src/server/lib/events.ts')
    eventsApi = await import('../src/server/api/events.ts')
    answeringTold = await import('../src/server/lib/answering-told.ts')
    // The-worker's claude.exe, started an hour ago to resume its conversation.
    machine.set(A_CLAUDE_THAT_RUNS, {
      ...aRow(A_CLAUDE_THAT_RUNS, 4, AN_HOUR_AGO, `"${CLAUDE_ON_WINDOWS}" --resume ${THE_WORKERS_CONVERSATION}`),
      Name: 'claude.exe',
      ExecutablePath: CLAUDE_ON_WINDOWS,
    })
    if (session === '') {
      session = t.api.createRecord({
        workspaceId: 'default',
        kind: 'session',
        title: "the-worker's conversation of Claude Code",
        data: {
          state: 'running',
          runtime: 'claude-code',
          extra: {
            discovered: {
              tool: 'claude-code',
              externalId: THE_WORKERS_CONVERSATION,
              logPath: join(scratch, `${THE_WORKERS_CONVERSATION}.jsonl`),
              pid: A_CLAUDE_THAT_RUNS,
              pidStartedAt: localStamp(new Date(AN_HOUR_AGO)),
            },
          },
        },
        actor: t.api.HUMAN,
      }).id
      // And a row of the ledger for the same process, as the looks read the process rows of a session too.
      res.registerResource({ workspaceId: 'default', sessionRecordId: session, type: 'process', key: String(A_CLAUDE_THAT_RUNS), detail: "the-worker's claude.exe", actor: t.api.HUMAN })
    }
    // The person's page is open, and the first looks for it are taken, which only remember (lib/answering-told.ts).
    told.length = 0
    page = eventsLib.pageOpened({ workspaceId: 'default', who: { kind: 'person', id: THE_PERSON }, send: (one) => told.push(one.event as (typeof told)[number]) })
    eventsApi.presenceMayHaveChanged([])
    answeringTold.answeringLookNow([])
  })

  afterEach(async () => {
    await untilNoScriptRuns()
    eventsLib.pageClosed(page)
    // The hold is let go with no page open, so the look it asks for reads nothing.
    await app.inject({ method: 'POST', url: '/api/handles/the-worker/release', headers: asTheWorker(), payload: { session, because: 'the case is over' } })
    eventsApi.forgetWhatPagesWereToldOfPresence()
    answeringTold.forgetWhatPagesWereToldOfAnswering()
    THE_HOLDER.hello = null
  })

  it("11a: the handle's hold, and the look at who answers that it asks for", async () => {
    const read = await theReadingsOf(async () => {
      const reply = await app.inject({ method: 'POST', url: '/api/handles/the-worker/hold', headers: asTheWorker(), payload: { session, runtime: 'claude-code' } })
      expect(reply.statusCode, reply.body.slice(0, 400)).toBe(201)
      await untilNoScriptRuns()
    })
    expectNoReadingHeldTheThread(read, "the handle's hold")
    // The look read the hold, and told the person's page that the-worker now answers.
    expect(told.filter((one) => one.name === 'answering.changed').map((one) => one.who?.id)).toEqual([theWorkersId])
  })

  it("11b: the-worker's stream, opened and closed, and the looks at who is there that each asks for", async () => {
    await theWorkerHolds()
    const read = await theReadingsOf(async () => {
      const stop = new AbortController()
      const answer = await fetch(`${api}/api/events`, { headers: asTheWorker(), signal: stop.signal })
      expect(answer.status).toBe(200)
      const lines = answer.body?.getReader()
      let said = ''
      while (!said.includes(': counted')) {
        const part = await lines?.read()
        if (part === undefined || part.done) break
        said += new TextDecoder().decode(part.value)
      }
      expect(said, 'the stream never said it was counted').toContain(': counted')
      stop.abort()
      const until = Date.now() + 10_000
      while (eventsLib.pagesOpen() > 1 && Date.now() < until) await new Promise((later) => setTimeout(later, 20))
      expect(eventsLib.pagesOpen(), "the-worker's stream was not closed").toBe(1)
      await untilNoScriptRuns()
    })
    expectNoReadingHeldTheThread(read, "the-worker's stream")
  })

  it('11c: the presence clock, after the process of the session that answers has ended', async () => {
    await theWorkerHolds()
    machine.delete(A_CLAUDE_THAT_RUNS)
    const theClocksLook = theStep<(log: (line: string) => void) => void>(eventsApi, 'thePresenceClocksLook', 'src/server/api/events.ts')
    const said: string[] = []
    const read = await theReadingsOf(async () => {
      theClocksLook((line) => said.push(line))
      await untilNoScriptRuns()
    })
    expectNoReadingHeldTheThread(read, 'the presence clock')
    expect(said, 'the look logged').toEqual([])
    // The look read the machine as it is now: the-worker's process has ended, and the person's page is told so.
    expect(told.filter((one) => one.who?.id === theWorkersId).map((one) => one.name), JSON.stringify(told)).not.toEqual([])
  })

  it('11d: GET /api/runtime and GET /api/runtime/freshness', async () => {
    for (const url of ['/api/runtime', '/api/runtime/freshness']) {
      let status = 0
      let body = ''
      const read = await theReadingsOf(async () => {
        const reply = await app.inject({ method: 'GET', url, headers: AS_THE_PERSON })
        status = reply.statusCode
        body = reply.body
      })
      expect(status, body.slice(0, 400)).toBe(200)
      expectNoReadingHeldTheThread(read, `GET ${url}`)
    }
  })

  it('11e: the terminal holder, recorded in the ledger when the server first hears from it', async () => {
    const terminals = await import('../src/server/lib/terminals.ts')
    terminals.forgetTheRecordedHolder()
    machine.set(A_TERMINAL_HOLDER, aRow(A_TERMINAL_HOLDER, 4, AN_HOUR_AGO, 'node.exe src/holder/index.mjs'))
    THE_HOLDER.hello = { protocol: 1, pid: A_TERMINAL_HOLDER, startedAt: localStamp(new Date(AN_HOUR_AGO)), database: settingsLib.settings().databasePath }
    const read = await theReadingsOf(async () => {
      await terminals.theHolder()
      await untilNoScriptRuns()
    })
    expectNoReadingHeldTheThread(read, 'the record of the terminal holder')
    const rows = res.listResources({ workspaceId: settingsLib.settings().workspace, type: 'process' }).filter((one) => one.key === String(A_TERMINAL_HOLDER))
    expect(rows.length, 'the holder was not recorded').toBe(1)
  })

  it("11f: POST /api/handles/the-worker/process, the session's own process", async () => {
    await theWorkerHolds()
    let status = 0
    let body = ''
    const read = await theReadingsOf(async () => {
      const reply = await app.inject({
        method: 'POST',
        url: '/api/handles/the-worker/process',
        headers: asTheWorker(),
        payload: { session, pid: A_CLAUDE_THAT_RUNS, pidStartedAt: localStamp(new Date(AN_HOUR_AGO)), conversation: THE_WORKERS_CONVERSATION },
      })
      status = reply.statusCode
      body = reply.body
      await untilNoScriptRuns()
    })
    expect(status, body.slice(0, 400)).toBe(200)
    expectNoReadingHeldTheThread(read, 'POST /api/handles/the-worker/process')
    expect((JSON.parse(body) as { tiedBy?: unknown }).tiedBy, body.slice(0, 400)).toBe('its command line')
  })

  it('11g: GET /api/handles/the-worker, which says who answers as it', async () => {
    await theWorkerHolds()
    let status = 0
    let body = ''
    const read = await theReadingsOf(async () => {
      const reply = await app.inject({ method: 'GET', url: '/api/handles/the-worker', headers: asTheWorker() })
      status = reply.statusCode
      body = reply.body
    })
    expect(status, body.slice(0, 400)).toBe(200)
    expectNoReadingHeldTheThread(read, 'GET /api/handles/the-worker')
  })

  it("11h: GET /api/onboarding about the-worker's start folder, which says whether it answers already", async () => {
    const folder = join(scratch, 'the-workers-start-folder')
    mkdirSync(folder, { recursive: true })
    const set = await app.inject({
      method: 'POST',
      url: `/api/participants/agent/${theWorkersId}/start-folder`,
      headers: AS_THE_PERSON,
      payload: { startFolder: folder, because: 'case 11h asks about it' },
    })
    expect(set.statusCode, set.body.slice(0, 400)).toBe(200)
    await theWorkerHolds()
    let status = 0
    let body = ''
    const read = await theReadingsOf(async () => {
      const reply = await app.inject({ method: 'GET', url: `/api/onboarding?directory=${encodeURIComponent(folder)}`, headers: AS_THE_HOOK })
      status = reply.statusCode
      body = reply.body
    })
    expect(status, body.slice(0, 400)).toBe(200)
    expectNoReadingHeldTheThread(read, 'GET /api/onboarding')
    const agents = (JSON.parse(body) as { startFolder?: { agents?: { handle: string; answeringIn: string | null }[] } }).startFolder?.agents
    expect(agents, body.slice(0, 600)).toEqual([{ handle: 'the-worker', answeringIn: session }])
  })

  /** A read whose reading of who answers asks about no process runs no script, either way (claim 11, i to k). */
  function expectNoScriptAtAll(read: { held: string[]; waited: string[] }, act: string): void {
    expect(read, `${act} ran these scripts, though who answers asked about no process`).toEqual({ held: [], waited: [] })
  }

  /** GET /api/handles/the-worker, with what it says of who answers. */
  async function theHandleRead(): Promise<{ read: { held: string[]; waited: string[] }; answering: { how?: string; session?: string | null } | undefined }> {
    let status = 0
    let body = ''
    const read = await theReadingsOf(async () => {
      const reply = await app.inject({ method: 'GET', url: '/api/handles/the-worker', headers: asTheWorker() })
      status = reply.statusCode
      body = reply.body
    })
    expect(status, body.slice(0, 400)).toBe(200)
    return { read, answering: (JSON.parse(body) as { answering?: { how?: string; session?: string | null } }).answering }
  }

  it('11i: GET /api/handles/the-worker, when nothing holds the handle and no run is running for it', async () => {
    const { read, answering } = await theHandleRead()
    expectNoScriptAtAll(read, 'GET /api/handles/the-worker')
    expect(answering?.how, JSON.stringify(answering)).toBe('nobody')
  })

  it("11j: GET /api/onboarding about the-worker's start folder, when nothing holds the handle", async () => {
    const folder = join(scratch, 'the-workers-start-folder')
    mkdirSync(folder, { recursive: true })
    const set = await app.inject({
      method: 'POST',
      url: `/api/participants/agent/${theWorkersId}/start-folder`,
      headers: AS_THE_PERSON,
      payload: { startFolder: folder, because: 'case 11j asks about it' },
    })
    expect(set.statusCode, set.body.slice(0, 400)).toBe(200)
    let status = 0
    let body = ''
    const read = await theReadingsOf(async () => {
      const reply = await app.inject({ method: 'GET', url: `/api/onboarding?directory=${encodeURIComponent(folder)}`, headers: AS_THE_HOOK })
      status = reply.statusCode
      body = reply.body
    })
    expect(status, body.slice(0, 400)).toBe(200)
    expectNoScriptAtAll(read, 'GET /api/onboarding')
    const agents = (JSON.parse(body) as { startFolder?: { agents?: { handle: string; answeringIn: string | null }[] } }).startFolder?.agents
    expect(agents, body.slice(0, 600)).toEqual([{ handle: 'the-worker', answeringIn: null }])
  })

  it('11k: GET /api/handles/the-worker, when a run the office started for it holds the handle', async () => {
    // The run's record, as the message worker files it: it names the agent by its handle and by its registry id.
    const run = t.api.createRecord({
      workspaceId: 'default',
      kind: 'session',
      title: 'a run the office started for the-worker',
      data: { state: 'running', runtime: 'claude-code', startedByMoleOffice: true, servingAgent: 'the-worker', servingAgentId: theWorkersId },
      actor: t.api.HUMAN,
    }).id
    const hold = await app.inject({ method: 'POST', url: '/api/handles/the-worker/hold', headers: asTheWorker(), payload: { session: run, runtime: 'claude-code' } })
    expect(hold.statusCode, hold.body.slice(0, 400)).toBe(201)
    await untilNoScriptRuns()
    try {
      const { read, answering } = await theHandleRead()
      expectNoScriptAtAll(read, 'GET /api/handles/the-worker')
      expect([answering?.how, answering?.session], JSON.stringify(answering)).toEqual(['a run', run])
    } finally {
      // The run lets go and ends, so no later case finds it running for the-worker. It ends as crashed: a finished run
      // must say what it submits.
      await app.inject({ method: 'POST', url: '/api/handles/the-worker/release', headers: asTheWorker(), payload: { session: run, because: 'the case is over' } })
      t.api.patchRecord(run, { dataPatch: { state: 'crashed' } }, t.api.HUMAN)
      await untilNoScriptRuns()
    }
  })

  it('11l: GET /api/handles/the-worker, when nothing holds the handle and a run record says it is running for it', async () => {
    // A run started outside the message worker, as `tools/sandbox.mjs exec` starts one. It counts as going while any
    // process row of its own is alive, so who answers asks about that process.
    const run = t.api.createRecord({
      workspaceId: 'default',
      kind: 'session',
      title: 'a run started for the-worker outside the message worker',
      data: { state: 'running', runtime: 'claude-code', servingAgent: 'the-worker', servingAgentId: theWorkersId },
      actor: t.api.HUMAN,
    }).id
    machine.set(A_RUN_FOR_THE_WORKER, aRow(A_RUN_FOR_THE_WORKER, 4, AN_HOUR_AGO, 'node.exe the-run.mjs'))
    res.registerResource({ workspaceId: 'default', sessionRecordId: run, type: 'process', key: String(A_RUN_FOR_THE_WORKER), detail: "the run's process", actor: t.api.HUMAN })
    try {
      const { read, answering } = await theHandleRead()
      expectNoReadingHeldTheThread(read, 'GET /api/handles/the-worker')
      expect([answering?.how, answering?.session], JSON.stringify(answering)).toEqual(['a run', run])
    } finally {
      // The run's process ends and the run with it, so no later case finds it running for the-worker.
      machine.delete(A_RUN_FOR_THE_WORKER)
      t.api.patchRecord(run, { dataPatch: { state: 'crashed' } }, t.api.HUMAN)
      await untilNoScriptRuns()
    }
  })

  it("11m: the look at who answers that the write of a run's record asks for", async () => {
    // A run started for the-worker outside the message worker, as in 11l. Filed before its process row is, it is not
    // yet going, so the look its filing asks for finds that nobody answers. That look is waited for before the row is
    // registered, so the write below is the first look to find the run going.
    const run = t.api.createRecord({
      workspaceId: 'default',
      kind: 'session',
      title: 'a run started for the-worker outside the message worker',
      data: { state: 'running', runtime: 'claude-code', servingAgent: 'the-worker', servingAgentId: theWorkersId },
      actor: t.api.HUMAN,
    }).id
    await untilNoScriptRuns()
    machine.set(A_RUN_FOR_THE_WORKER, aRow(A_RUN_FOR_THE_WORKER, 4, AN_HOUR_AGO, 'node.exe the-run.mjs'))
    res.registerResource({ workspaceId: 'default', sessionRecordId: run, type: 'process', key: String(A_RUN_FOR_THE_WORKER), detail: "the run's process", actor: t.api.HUMAN })
    await untilNoScriptRuns()
    told.length = 0
    try {
      const read = await theReadingsOf(async () => {
        t.api.patchRecord(run, { dataPatch: { doing: 'case 11m writes it' } }, t.api.HUMAN)
        await untilNoScriptRuns()
      })
      expectNoReadingHeldTheThread(read, "the write of a run's record")
      // The look read the run's process, alive, and told the person's page that the-worker now answers in the run.
      expect(told.filter((one) => one.name === 'answering.changed').map((one) => one.who?.id), JSON.stringify(told)).toEqual([theWorkersId])
    } finally {
      machine.delete(A_RUN_FOR_THE_WORKER)
      t.api.patchRecord(run, { dataPatch: { state: 'crashed' } }, t.api.HUMAN)
      await untilNoScriptRuns()
    }
  })
})

// ---------------------------------------------------------------------------- the GPU's list and the containers' list

describe("the GPU's list and the containers' list on Windows, by the way that waits", () => {
  /** Made-up programs, each a shell script, in a folder first on the PATH while `act` runs, or alone on it. */
  async function withTheseOnThePath<T>(programs: Record<string, string>, act: () => Promise<T>, { alone = false }: { alone?: boolean } = {}): Promise<T> {
    const folder = mkdtempSync(join(scratch, 'made-up-programs-'))
    for (const [name, body] of Object.entries(programs)) writeFileSync(join(folder, name), `#!/bin/sh\n${body}\n`, { mode: 0o755 })
    const before = process.env['PATH']
    process.env['PATH'] = alone || before === undefined ? folder : `${folder}${delimiter}${before}`
    try {
      return await act()
    } finally {
      if (before === undefined) delete process.env['PATH']
      else process.env['PATH'] = before
    }
  }

  /** The Windows probe as the server makes it, over the Linux probe it borrows from. */
  function theWindowsProbe() {
    const probe = res.theProbeForThisPlatform('win32')
    const { readGpu, readContainers } = probe
    expect(typeof readGpu, "the Windows probe has no way that waits to read the GPU's list").toBe('function')
    expect(typeof readContainers, 'the Windows probe has no way that waits to read the running containers').toBe('function')
    return { probe, readGpu: readGpu!.bind(probe), readContainers: readContainers!.bind(probe) }
  }

  /** Each list, read by the way that waits and by the way that holds the thread. */
  async function eachListBothWays() {
    const { probe, readGpu, readContainers } = theWindowsProbe()
    return {
      gpu: { waited: await readGpu(), held: probe.gpu() },
      containers: { waited: await readContainers(), held: probe.containers() },
    }
  }

  it('12a: a list from each', async () => {
    const { gpu, containers } = await withTheseOnThePath(
      {
        'nvidia-smi': "printf '4242, 2048, python.exe\\n4343, 512, a, b\\n'",
        docker: "printf 'c0ffee\\tthe-db\\tpostgres:16\\tUp 2 hours\\n'",
      },
      eachListBothWays,
    )
    expect(gpu.waited).toEqual({
      available: true,
      processes: [
        { pid: 4242, usedMib: 2048, name: 'python.exe' },
        { pid: 4343, usedMib: 512, name: 'a, b' },
      ],
    })
    expect(gpu.waited).toEqual(gpu.held)
    expect(containers.waited).toEqual({ available: true, containers: [{ id: 'c0ffee', name: 'the-db', image: 'postgres:16', status: 'Up 2 hours' }] })
    expect(containers.waited).toEqual(containers.held)
  })

  it('12b: neither program installed', async () => {
    const { gpu, containers } = await withTheseOnThePath({}, eachListBothWays, { alone: true })
    expect([gpu.waited.available, containers.waited.available]).toEqual([false, false])
    expect(gpu.waited).toEqual(gpu.held)
    expect(containers.waited).toEqual(containers.held)
  })

  it('12c: each program exits with a failure', async () => {
    const { gpu, containers } = await withTheseOnThePath(
      {
        'nvidia-smi': "echo 'a made-up failure of the driver' >&2; exit 9",
        docker: "echo 'a made-up daemon that does not answer' >&2; exit 9",
      },
      eachListBothWays,
    )
    expect([gpu.waited.available, containers.waited.available]).toEqual([false, false])
    expect(gpu.waited).toEqual(gpu.held)
    expect(containers.waited).toEqual(containers.held)
  })

  it('12d: a line of each that is not the shape asked for', async () => {
    const { gpu, containers } = await withTheseOnThePath(
      { 'nvidia-smi': "printf 'not-a-pid, 1, x\\n'", docker: "printf 'c0ffee\\tthe-db\\n'" },
      eachListBothWays,
    )
    // nvidia-smi's line names no process, so the GPU's list is empty. docker's line refuses its whole list.
    expect([gpu.waited, containers.waited.available]).toEqual([{ available: true, processes: [] }, false])
    expect(gpu.waited).toEqual(gpu.held)
    expect(containers.waited).toEqual(containers.held)
  })

  it('12e: while each list is read, the thread goes on', async () => {
    const order = await withTheseOnThePath(
      {
        'nvidia-smi': "sleep 0.4; printf '4242, 2048, python.exe\\n'",
        docker: "sleep 0.4; printf 'c0ffee\\tthe-db\\tpostgres:16\\tUp 2 hours\\n'",
      },
      async () => {
        const { readGpu, readContainers } = theWindowsProbe()
        const order: string[] = []
        const lists: [string, () => Promise<unknown>][] = [
          ["the GPU's list", readGpu],
          ["the containers' list", readContainers],
        ]
        for (const [list, read] of lists) {
          const timer = new Promise<void>((done) =>
            setTimeout(() => {
              order.push(`a timer, while ${list} was read`)
              done()
            }, 50),
          )
          await read().then(() => order.push(`${list}, read`))
          await timer
        }
        return order
      },
    )
    expect(order).toEqual([
      "a timer, while the GPU's list was read",
      "the GPU's list, read",
      "a timer, while the containers' list was read",
      "the containers' list, read",
    ])
  })
})

// ---------------------------------------------------------------------------- the terminal holder's restart

/** The starter of the terminal holder in claim 13, whose number is the holder's group on Windows. */
const THE_HOLDERS_STARTER = 8300
const THE_PERSONS_ACTOR = { type: 'human', id: THE_PERSON } as const

describe("the terminal holder's restart on Windows", () => {
  let terminals: typeof import('../src/server/lib/terminals.ts')
  /** Each group whose stop pipe heard the stop request. */
  const asked: number[] = []
  let pipe: Server | null = null
  /** The code a restart that stops the holder and starts no new one carries, typed so a renamed code fails to compile. */
  const NOT_STARTED: TerminalHolderRestartRefusalCode = 'terminalHolderRestartNotStarted'
  /** The code a restart whose old holder still runs after the stop request carries. */
  const STILL_RUNS: TerminalHolderRestartRefusalCode = 'terminalHolderRestartStillRuns'

  /** A holder the holder's starter started, which answers its hello as `pid`. The starter's Job Object holds it. */
  function aHolder(pid: number): void {
    machine.set(THE_HOLDERS_STARTER, aRow(THE_HOLDERS_STARTER, process.pid, AN_HOUR_AGO, "powershell.exe -EncodedCommand the holder's starter"))
    machine.set(pid, aRow(pid, THE_HOLDERS_STARTER, AN_HOUR_AGO, 'node.exe src/holder/index.mjs'))
    jobObjectsSay.set(`${String(THE_HOLDERS_STARTER)} ${String(pid)}`, HOLDS)
    jobObjectsSay.set(`${String(THE_HOLDERS_STARTER)} ${String(process.pid)}`, DOES_NOT_HOLD)
    THE_HOLDER.hello = { protocol: 1, pid, startedAt: localStamp(new Date(AN_HOUR_AGO)), database: settingsLib.settings().databasePath }
    THE_HOLDER.terminals = []
  }

  /** The holder's one open row in the ledger. */
  function theRowOf(pid: number): ReturnType<ResourcesLib['listResources']>[number] {
    const rows = res.listResources({ workspaceId: settingsLib.settings().workspace, type: 'process' }).filter((one) => one.key === String(pid) && one.releasedAt === null)
    expect(rows.length, `the holder, process ${String(pid)}, has no open row`).toBe(1)
    return rows[0]!
  }

  const release = (row: { id: string }, note: string) =>
    res.releaseResource(row.id, { force: true, actor: THE_PERSONS_ACTOR, note }, settingsLib.settings().workspace)

  /**
   * REPLACE THE HOLDER'S STOP PIPE with one that answers the stop request and leaves the holder running, as a holder
   * that takes longer than the release's second does (claims 13i and 13j).
   */
  async function aStopPipeThatLeavesTheHolderRunning(): Promise<void> {
    const closing = pipe
    pipe = null
    if (closing !== null) await new Promise<void>((done) => closing.close(() => done()))
    const address = theStopAddressOf(THE_HOLDERS_STARTER)
    rmSync(address, { force: true })
    const listening = createServer((socket) => {
      let line = ''
      socket.setEncoding('utf8')
      socket.on('data', (part: string) => {
        line += part
        const at = line.indexOf('\n')
        if (at === -1) return
        if (line.slice(0, at) !== THE_STOP_REQUEST) return void socket.end()
        asked.push(THE_HOLDERS_STARTER)
        socket.end(`${THE_STOP_ANSWER}\n`)
      })
    })
    await new Promise<void>((done) => listening.listen(address, done))
    pipe = listening
  }

  beforeAll(async () => {
    terminals = await import('../src/server/lib/terminals.ts')
  })

  beforeEach(async () => {
    terminals.forgetTheRecordedHolder()
    asked.length = 0
    // THE HOLDER'S STOP PIPE. On the stop request it answers that it is stopping, and the holder ends, as its stop does.
    const address = theStopAddressOf(THE_HOLDERS_STARTER)
    rmSync(address, { force: true })
    const listening = createServer((socket) => {
      let line = ''
      socket.setEncoding('utf8')
      socket.on('data', (part: string) => {
        line += part
        const at = line.indexOf('\n')
        if (at === -1) return
        if (line.slice(0, at) !== THE_STOP_REQUEST) return void socket.end()
        asked.push(THE_HOLDERS_STARTER)
        for (const [pid, row] of machine) if (row.ParentProcessId === THE_HOLDERS_STARTER) machine.delete(pid)
        socket.end(`${THE_STOP_ANSWER}\n`)
      })
    })
    await new Promise<void>((done) => listening.listen(address, done))
    pipe = listening
  })

  afterEach(async () => {
    await untilNoScriptRuns()
    THE_HOLDER.hello = null
    THE_HOLDER.terminals = null
    const closing = pipe
    pipe = null
    if (closing !== null) await new Promise((done) => closing.close(done))
  })

  it("13a: the holder's row records the group whose Job Object holds it, read by the way that waits", async () => {
    aHolder(8301)
    const read = await theReadingsOf(async () => {
      await terminals.theHolderState()
      await untilNoScriptRuns()
    })
    expectNoReadingHeldTheThread(read, 'the record of the terminal holder')
    expect(read.waited, "the holder's Job Object was not asked").toContain('whether a Job Object holds process 8301')
    expect(theRowOf(8301).pgid, "the row does not record the group whose Job Object holds the holder").toBe(THE_HOLDERS_STARTER)
  })

  it("13b: the holder's row records no group when the Job Object does not hold it, or Windows cannot say", async () => {
    for (const [pid, said] of [[8302, DOES_NOT_HOLD], [8303, CANNOT_SAY]] as const) {
      terminals.forgetTheRecordedHolder()
      aHolder(pid)
      jobObjectsSay.set(`${String(THE_HOLDERS_STARTER)} ${String(pid)}`, said)
      await terminals.theHolderState()
      expect(theRowOf(pid).pgid, `the row names the group when the Job Object says ${said}`).toBe(0)
    }
  })

  it("13c: the release of the holder's row asks its group's pipe to stop, sends no signal and holds no thread", async () => {
    aHolder(8304)
    await terminals.theHolderState()
    const row = theRowOf(8304)
    let outcome = ''
    const read = await theReadingsOf(async () => {
      outcome = (await release(row, 'claim 13c')).outcome
    })
    expect(asked, "the holder's group was not asked to stop").toEqual([THE_HOLDERS_STARTER])
    expect(signalled, 'a group was signalled').toEqual([])
    expect(outcome, 'the outcome does not say the request was answered').toContain(`"${THE_STOP_ANSWER}"`)
    expectNoReadingHeldTheThread(read, "the release of the holder's row")
  })

  it('13d: the release refuses when the Job Object no longer holds the holder, or Windows cannot say', async () => {
    for (const [pid, said, status] of [[8305, DOES_NOT_HOLD, 409], [8306, CANNOT_SAY, 503]] as const) {
      terminals.forgetTheRecordedHolder()
      aHolder(pid)
      await terminals.theHolderState()
      const row = theRowOf(pid)
      jobObjectsSay.set(`${String(THE_HOLDERS_STARTER)} ${String(pid)}`, said)
      await expect(release(row, 'claim 13d'), `released when the Job Object says ${said}`).rejects.toMatchObject({ status })
      theRowOf(pid)
    }
    expect(asked, 'a group was asked to stop').toEqual([])
    expect(signalled, 'a group was signalled').toEqual([])
  })

  it("13e: the release refuses when the group's Job Object holds this server, or Windows cannot say", async () => {
    for (const [pid, said, status] of [[8307, HOLDS, 400], [8308, CANNOT_SAY, 503]] as const) {
      terminals.forgetTheRecordedHolder()
      aHolder(pid)
      await terminals.theHolderState()
      const row = theRowOf(pid)
      jobObjectsSay.set(`${String(THE_HOLDERS_STARTER)} ${String(process.pid)}`, said)
      await expect(release(row, 'claim 13e'), `released when the Job Object says of this server ${said}`).rejects.toMatchObject({
        status,
        message: expect.stringMatching(new RegExp(`\\b${String(process.pid)}\\b`, 'u')) as unknown,
      })
      theRowOf(pid)
    }
    expect(asked, 'a group was asked to stop').toEqual([])
    expect(signalled, 'a group was signalled').toEqual([])
  })

  it("13f: the restart reads no process in the way that holds the thread, and stops the holder by its group's pipe", async () => {
    aHolder(8309)
    await terminals.theHolderState()
    const restart = await import('../src/server/lib/the-holders-restart.ts')
    const before = process.env['MOLE_OFFICE_TERMINAL_HOLDER']
    // A RESTART HERE STARTS NO HOLDER: the setting is off, so the restart ends with no new holder after the stop.
    process.env['MOLE_OFFICE_TERMINAL_HOLDER'] = 'off'
    try {
      let refusal: unknown = null
      const read = await theReadingsOf(async () => {
        refusal = await restart.restartTheHolder({ pid: 8309, startedAt: localStamp(new Date(AN_HOUR_AGO)), terminals: [] }, THE_PERSONS_ACTOR).then(
          () => null,
          (error: unknown) => error,
        )
        await untilNoScriptRuns()
      })
      expect(asked, "the holder's group was not asked to stop").toEqual([THE_HOLDERS_STARTER])
      expect(signalled, 'a group was signalled').toEqual([])
      expect(refusal, 'the restart did not end at the holder it may not start').toMatchObject({ status: 502, code: NOT_STARTED })
      expectNoReadingHeldTheThread(read, "the holder's restart")
    } finally {
      if (before === undefined) delete process.env['MOLE_OFFICE_TERMINAL_HOLDER']
      else process.env['MOLE_OFFICE_TERMINAL_HOLDER'] = before
    }
  })

  it("13g: the release of a gone holder's row reads its starter first and holds no thread", async () => {
    aHolder(8310)
    await terminals.theHolderState()
    const row = theRowOf(8310)
    machine.delete(8310)
    const released: { result: Awaited<ReturnType<ResourcesLib['releaseResource']>> | null } = { result: null }
    const read = await theReadingsOf(async () => {
      released.result = await release(row, 'claim 13g')
    })
    expect(released.result?.acted, 'the release said it stopped something').toBe(false)
    expect(released.result?.stillAlive, 'the release said the holder is still alive').toBe(false)
    expect(asked, 'a group was asked to stop').toEqual([])
    expect(signalled, 'a group was signalled').toEqual([])
    expectNoReadingHeldTheThread(read, "the release of a gone holder's row")
    expect(read.waited, "the reading did not ask what the holder's starter left running").toContain(`the Job Object of starter ${String(8310)}`)
    const stillOpen = res.listResources({ workspaceId: settingsLib.settings().workspace, type: 'process' }).filter((one) => one.id === row.id && one.releasedAt === null)
    expect(stillOpen, "the gone holder's row is still open").toEqual([])
  })

  it('13h: the release refuses a Windows holder row whose group is 0, and asks and signals nothing', async () => {
    aHolder(8311)
    jobObjectsSay.set(`${String(THE_HOLDERS_STARTER)} ${String(8311)}`, DOES_NOT_HOLD)
    await terminals.theHolderState()
    const row = theRowOf(8311)
    expect(row.pgid, 'the holder row records a group, so this case shows nothing').toBe(0)
    await expect(release(row, 'claim 13h')).rejects.toMatchObject({
      status: 400,
      message: expect.stringMatching(/\b8311\b/u) as unknown,
    })
    expect(asked, 'a group was asked to stop').toEqual([])
    expect(signalled, 'a group was signalled').toEqual([])
    theRowOf(8311)
  })

  it('13i: the release says a holder that answered the stop request and still runs is still alive', async () => {
    aHolder(8312)
    await terminals.theHolderState()
    const row = theRowOf(8312)
    await aStopPipeThatLeavesTheHolderRunning()
    const released: { result: Awaited<ReturnType<ResourcesLib['releaseResource']>> | null } = { result: null }
    const read = await theReadingsOf(async () => {
      released.result = await release(row, 'claim 13i')
    })
    expect(asked, "the holder's group was not asked to stop").toEqual([THE_HOLDERS_STARTER])
    expect(signalled, 'a group was signalled').toEqual([])
    expect(released.result?.acted, 'the release said it stopped nothing').toBe(true)
    expect(released.result?.stillAlive, 'the release did not say the holder still runs').toBe(true)
    expect(String(released.result?.outcome), 'the sentence does not name the holder').toMatch(new RegExp(`\\b${String(8312)}\\b`, 'u'))
    expectNoReadingHeldTheThread(read, "the release of a holder that answered and still runs")
  })

  it('13j: the restart ends with the code for an old holder that still runs after the stop request', async () => {
    aHolder(8313)
    await terminals.theHolderState()
    await aStopPipeThatLeavesTheHolderRunning()
    const restart = await import('../src/server/lib/the-holders-restart.ts')
    let refusal: unknown = null
    const read = await theReadingsOf(async () => {
      refusal = await restart.restartTheHolder({ pid: 8313, startedAt: localStamp(new Date(AN_HOUR_AGO)), terminals: [] }, THE_PERSONS_ACTOR).then(
        () => null,
        (error: unknown) => error,
      )
      await untilNoScriptRuns()
    })
    expect(asked, "the holder's group was not asked to stop").toEqual([THE_HOLDERS_STARTER])
    expect(signalled, 'a group was signalled').toEqual([])
    expect(refusal, 'the restart did not end at the old holder that still runs').toMatchObject({ status: 504, code: STILL_RUNS })
    expect(String((refusal as { message?: unknown } | null)?.message ?? refusal), 'the sentence does not name the holder').toMatch(
      new RegExp(`\\b${String(8313)}\\b`, 'u'),
    )
    expectNoReadingHeldTheThread(read, "the restart after a stop request the old holder ignored")
  })
})

// ---------------------------------------------------------------------------- the data folder door

describe('the data folder door on Windows reads the mover by the way that waits', () => {
  type TheDoor = typeof import('../src/server/api/data-folder.ts')
  type TheMove = typeof import('../src/config/the-data-folder-move.mjs')
  type AMover = { pid: number; startedAt: string }
  let door: TheDoor
  let move: TheMove
  let localStampOf: (when: Date) => string
  let markPath = ''
  /** A mover that runs on the stand-in machine. */
  const A_MOVER = 8400

  /** A mark whose mover is the one given, written as the mover writes it. */
  function aMarkOf(mover: AMover): void {
    move.writeTheMoveMark(markPath, {
      from: 'C:\\the-old-place',
      to: 'D:\\the-new-place',
      database: 'C:\\the-old-place\\mole-office.db',
      state: 'stopping',
      mover,
      earlier: [],
      manifest: null,
      says: null,
      at: '2026-01-01 00:00:00',
    } as never)
  }

  /** The door's answer about the mark, and its readings. */
  async function theDoorsAnswer(): Promise<{ read: { held: string[]; waited: string[] }; moverAlive: unknown }> {
    let status = 0
    let body = ''
    const read = await theReadingsOf(async () => {
      const reply = await app.inject({ method: 'GET', url: '/api/office/data-folder', headers: AS_THE_PERSON })
      status = reply.statusCode
      body = reply.body
    })
    expect(status, body.slice(0, 400)).toBe(200)
    const mark = (JSON.parse(body) as { mark: { state: string; moverAlive?: unknown } }).mark
    expect(mark.state, body.slice(0, 400)).toBe('read')
    return { read, moverAlive: mark.moverAlive }
  }

  beforeAll(async () => {
    door = await import('../src/server/api/data-folder.ts')
    move = await import('../src/config/the-data-folder-move.mjs')
    localStampOf = (await import('../src/config/stopped-run-cause.mjs')).localStampOf
    markPath = join(scratch, 'data-folder-move.json')
  })

  beforeEach(() => {
    rmSync(markPath, { force: true })
    const notAsked = (what: string) => (): never => {
      throw new Error(`this test does not ask the data folder door's ${what}`)
    }
    door.thisOfficeMovesItsDataFolderWith({
      session: 'a-made-up-session',
      workspaceId: 'default',
      fromABundle: () => true,
      markPath: () => markPath,
      runsAtWork: () => [],
      whyRefused: () => null,
      startTheMover: notAsked('start of a mover'),
      waitMs: 3_000,
    })
  })

  afterEach(() => {
    door.thisOfficeMovesItsDataFolderWith(null)
    rmSync(markPath, { force: true })
  })

  it('14a: GET /api/office/data-folder, about a mark whose mover runs', async () => {
    machine.set(A_MOVER, aRow(A_MOVER, process.pid, AN_HOUR_AGO, 'node.exe the-data-folder-mover.mjs'))
    aMarkOf({ pid: A_MOVER, startedAt: localStampOf(new Date(AN_HOUR_AGO)) })
    const { read, moverAlive } = await theDoorsAnswer()
    expect(moverAlive, 'the mover that runs was read as gone').toBe(true)
    expectNoReadingHeldTheThread(read, 'GET /api/office/data-folder')
    expect(read.waited, "the mover's process was not read").toContain(`process ${String(A_MOVER)}`)
  })

  it('14b: GET /api/office/data-folder, about a mover that has ended, and a process with its number that started later', async () => {
    aMarkOf({ pid: GONE, startedAt: localStampOf(new Date(AN_HOUR_AGO)) })
    const ended = await theDoorsAnswer()
    expect(ended.moverAlive, 'a mover whose process has ended was read as alive').toBe(false)
    expectNoReadingHeldTheThread(ended.read, 'GET /api/office/data-folder, about a mover that has ended')
    expect(ended.read.waited, "the mover's process was not read").toContain(`process ${String(GONE)}`)

    machine.set(A_MOVER, aRow(A_MOVER, process.pid, AN_HOUR_AGO + 60_000, 'node.exe another-program.mjs'))
    aMarkOf({ pid: A_MOVER, startedAt: localStampOf(new Date(AN_HOUR_AGO)) })
    const another = await theDoorsAnswer()
    expect(another.moverAlive, 'a process that took the mover\'s number later was read as the mover').toBe(false)
    expectNoReadingHeldTheThread(another.read, "GET /api/office/data-folder, about a process with the mover's number")
  })

  it('14c: the reading that waits answers what the reading that holds the thread answers, for the same movers', async () => {
    const readsBothWays = theStep<(mover: AMover) => Promise<boolean>>(move, 'readWhetherTheMoverIsAlive', 'src/config/the-data-folder-move.mjs')
    const bothWays = async (mover: AMover): Promise<{ holding: boolean; waiting: boolean }> => ({
      holding: move.theMoverIsAlive(mover),
      waiting: await readsBothWays(mover),
    })
    machine.set(A_MOVER, aRow(A_MOVER, process.pid, AN_HOUR_AGO, 'node.exe the-data-folder-mover.mjs'))
    const anHourAgo = localStampOf(new Date(AN_HOUR_AGO))
    const onWindows = [
      { pid: A_MOVER, startedAt: anHourAgo },
      { pid: A_MOVER, startedAt: '2026-01-01 00:00:00' },
      { pid: GONE, startedAt: anHourAgo },
      { pid: 0, startedAt: anHourAgo },
    ]
    const answers = []
    for (const mover of onWindows) answers.push(await bothWays(mover))
    expect(answers, 'on the stand-in Windows machine').toEqual([
      { holding: true, waiting: true },
      { holding: false, waiting: false },
      { holding: false, waiting: false },
      { holding: false, waiting: false },
    ])

    // THIS MACHINE'S OWN READER, which a Linux machine reads from /proc. A number above the largest a process can have on
    // Linux names no process.
    res.useOsProbe(res.LINUX_PROBE)
    THE_READER.current = null
    const { theProcessAt } = await import('../src/config/session-process.mjs')
    const mine = theProcessAt(process.pid)
    expect(mine.here && mine.startedAt !== null, "this machine's reader could not read this process's start").toBe(true)
    const myStart = localStampOf(new Date(mine.here && mine.startedAt !== null ? mine.startedAt : 0))
    const onThisMachine = [
      { pid: process.pid, startedAt: myStart },
      { pid: process.pid, startedAt: '2026-01-01 00:00:00' },
      { pid: 4_194_305, startedAt: myStart },
    ]
    const here = []
    for (const mover of onThisMachine) here.push(await bothWays(mover))
    expect(here, `with this machine's reader, on ${process.platform}`).toEqual([
      { holding: true, waiting: true },
      { holding: false, waiting: false },
      { holding: false, waiting: false },
    ])
  })
})

// ---------------------------------------------------------------------------- the timers, the start and the stop

describe("the server's own passes on Windows read no process in the way that holds the thread", () => {
  it('5: the minute pass, about a row of the office’s own parts whose process has ended', async () => {
    const own = anOwnRowWhoseProcessHasEnded('The message worker', 1, 'C:\\an-old-checkout')
    const reminders = await import('../src/server/lib/reminders.ts')
    type ThePass = (workspaceId: string, now: Date, watchingSince: Date, isolatedWorldsFolder?: string) => Promise<unknown>
    const theMinutePass = theStep<ThePass>(reminders, 'theMinutePass', 'src/server/lib/reminders.ts')
    const now = new Date()
    const read = await theReadingsOf(() => theMinutePass('default', now, new Date(now.getTime() - 86_400_000), join(scratch, 'worlds')))
    expectNoReadingHeldTheThread(read, 'the minute pass')
    expect(read.waited).toContain(`process ${String(GONE)}`)
    expect(t.api.getRecord(own)?.data['state']).toBe('finished')
  })

  it("6: shutdown, the reading of whether the worker has stopped and the line on the server's own row", async () => {
    const index = await import('../src/server/index.ts')
    const theWorkerHasStopped = theStep<(pgid: number) => Promise<boolean>>(index, 'theMessageWorkerHasStopped', 'src/server/index.ts')
    const sayHowThisSessionEnded = theStep<(id: string, state: 'finished' | 'crashed', detail: string) => Promise<boolean>>(
      index,
      'sayHowThisSessionEnded',
      'src/server/index.ts',
    )
    let stopped: boolean | null = null
    const theStop = await theReadingsOf(async () => {
      stopped = await theWorkerHasStopped(THE_WORKERS_STARTER)
    })
    expect(stopped).toBe(false)
    expectNoReadingHeldTheThread(theStop, 'the reading of whether the worker has stopped')
    // A row with a process row, as the server's own row and the worker's row each hold one. The line ends the row.
    const run = aRunWhoseStarterHasEnded()
    let said: boolean | null = null
    const theLine = await theReadingsOf(async () => {
      said = await sayHowThisSessionEnded(run, 'finished', 'The API server stopped cleanly.')
    })
    expect(said).toBe(true)
    expectNoReadingHeldTheThread(theLine, "the line on the server's own row")
  })

  it('7a: the start, the reading of the group this server was started in and the service lock', async () => {
    process.env[THE_GROUP_VARIABLE] = String(THE_SERVERS_STARTER)
    const index = await import('../src/server/index.ts')
    type TheLockStep = (
      the: { lockPath: string; databasePath: string; port: number; checkout: string; starter: number | null },
      system: ReturnType<typeof theWindowsSystem>,
    ) => Promise<{ taken: boolean; said: string; lock?: { pgid: number; starter?: unknown } }>
    const takeTheLock = theStep<TheLockStep>(index, 'takeTheServiceLockOfThisServer', 'src/server/index.ts')
    let taken: Awaited<ReturnType<TheLockStep>> | null = null
    const read = await theReadingsOf(async () => {
      taken = await takeTheLock(
        { lockPath: join(scratch, 'the-service.lock'), databasePath: join(scratch, 'a.db'), port: 1, checkout: scratch, starter: THE_SERVERS_STARTER },
        theWindowsSystem(),
      )
    })
    expect(taken, JSON.stringify(taken)).toMatchObject({ taken: true, lock: { pgid: THE_SERVERS_STARTER, starter: { pid: THE_SERVERS_STARTER } } })
    expectNoReadingHeldTheThread(read, 'the group and the service lock')
    expect(read.waited).toContain(`whether a Job Object holds process ${String(process.pid)}`)
  })

  it("7b: the start, the restart manager and the message worker's row", async () => {
    const { installRestartManager } = await import('../src/server/lib/office-restart-manager.ts')
    const theManager = await theReadingsOf(() => installRestartManager(null, 'default'))
    expectNoReadingHeldTheThread(theManager, 'the restart manager')

    const index = await import('../src/server/index.ts')
    type TheWorkersRow = (input: { workspaceId: string; sessionRecordId: string; pid: number }) => Promise<{ key: string; osStartedAt: string | null }>
    const theWorkersRow = theStep<TheWorkersRow>(index, 'registerTheMessageWorkersProcess', 'src/server/index.ts')
    const session = t.api.createRecord({
      workspaceId: 'default',
      kind: 'session',
      title: 'The message worker',
      data: { state: 'running', runtime: 'mole-office', startedByMoleOffice: true },
      actor: THE_SERVERS_ACTOR,
    })
    machine.set(THE_WORKERS_RUN, aRow(THE_WORKERS_RUN, process.pid, msOf(session.createdAt), "powershell.exe -EncodedCommand the worker's starter"))
    let row: Awaited<ReturnType<TheWorkersRow>> | null = null
    const theRow = await theReadingsOf(async () => {
      row = await theWorkersRow({ workspaceId: 'default', sessionRecordId: session.id, pid: THE_WORKERS_RUN })
    })
    expect(row).toMatchObject({ key: String(THE_WORKERS_RUN), osStartedAt: session.createdAt })
    expectNoReadingHeldTheThread(theRow, "the message worker's row")
  })

  // LAST, because the write starts the server's minute timers, and they stay in this process.
  it("7c: the start, the server's rows in the ledger, with an earlier row this start replaces and a run in another project", async () => {
    const port = settingsLib.settings().apiPort
    const checkout = settingsLib.REPO_ROOT.replace(/\/$/u, '')
    const earlier = anOwnRowWhoseProcessHasEnded('The API server', port, checkout)
    anOwnRowWhoseProcessHasEnded('The message worker', 1, 'C:\\an-old-checkout')
    aRunWhoseStarterHasEnded()
    // The runtime record this start writes says which runs are going, in every project.
    const { createWorkspace } = await import('../src/server/lib/workspaces.ts')
    createWorkspace({ id: ANOTHER_PROJECT, title: 'A made-up second project' })
    aRunWhoseStarterHasEnded(ANOTHER_PROJECT, ANOTHER_STARTER, ANOTHER_PROGRAM)
    // The real retry and the real origin watcher, wrapped only so the file can stop them at its end.
    vi.doMock('../src/server/lib/visits.ts', async (importOriginal) => {
      const real = await importOriginal<typeof import('../src/server/lib/visits.ts')>()
      return {
        ...real,
        keepTryingHeldVisits: (...args: Parameters<typeof real.keepTryingHeldVisits>) => {
          const stop = real.keepTryingHeldVisits(...args)
          theHeldVisitRetries.push(stop)
          return stop
        },
      }
    })
    vi.doMock('../src/server/lib/residents.ts', async (importOriginal) => {
      const real = await importOriginal<typeof import('../src/server/lib/residents.ts')>()
      return {
        ...real,
        startTheOriginWatcher: (...args: Parameters<typeof real.startTheOriginWatcher>) => {
          const watch = real.startTheOriginWatcher(...args)
          theOriginWatchers.push(watch)
          return watch
        },
      }
    })
    const index = await import('../src/server/index.ts')
    const read = await theReadingsOf(() => index.writeThisServerIntoTheLedger(app, 'scratch'))
    expectNoReadingHeldTheThread(read, "the server's rows in the ledger")
    expect(read.waited, 'the run in the other project was not read').toContain(`process ${String(ANOTHER_STARTER)}`)
    expect(t.api.getRecord(earlier)?.data['state']).toBe('finished')
    // The server's own process row, read from the machine.
    const mine = res.listResources({ workspaceId: 'default', type: 'process' }).filter((one) => one.key === String(process.pid))
    expect(mine.length, 'the start registered no row of its own process').toBe(1)
  })
})
