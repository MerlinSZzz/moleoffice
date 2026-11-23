// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE WINDOWS PROBE: the OsProbe chosen when this server runs on Windows.
 *
 * `theProbeForThisPlatform` in lib/resources.ts builds it, and only for the platform 'win32'. On Linux and the Mac
 * nothing here runs.
 *
 * ITS TESTS STAND IN FOR POWERSHELL (tests/the-message-workers-probe-on-windows.test.ts and
 * tests/a-run-whose-starter-ended-is-alive-while-its-program-runs-in-the-job-object.test.ts) and hand back what a
 * script would print. It read one process on a Windows 11 machine in wave 13t, round W9.
 *
 * WHAT IT IS FOR. The server starts its message worker through the probe and records the worker in the ledger by
 * reading the new process back (`registerResource`). On Windows the Linux probe refused both, so the worker did not
 * start. This probe reads one process, and hands the start on.
 *
 * WHAT IT READS ITSELF. One process, through the Windows reader of the system layer
 * (src/config/systems/windows-processes.mjs), with one PowerShell script: the process, its start, its command line
 * and its name come from the same row. Windows gives no command line for some processes, another user's among them,
 * and then the name is shown. In wave 13t, round W9, the reader ran one script for each of those questions, two or
 * three for each process. Each took about 1.2 seconds on a Windows 11 machine, and the server waited for each. The
 * reader reads this server's own process once, and answers every later question about it from that row.
 *
 * TWO WAYS TO READ. `processById` and `programsOfAnEndedStarter` hold the server's thread until PowerShell answers.
 * `readProcessById` and `readProgramsOfAnEndedStarter` run the same scripts by the way that waits without holding it,
 * and give the same answers. A request reads what it will ask about by the second way first, and its body is then
 * answered from those readings (`readFirst` in lib/resources.ts). A request that also asks about processes it cannot
 * name first reads every process once by the way that waits, and its body is answered from that reading
 * (`readEveryProcessFirst`).
 *
 * WHAT A STARTER LEFT RUNNING. A row of a program this office started records the starter's pid, and the starter ends
 * before the program can. `programsOfAnEndedStarter` reads the starter's Job Object through the system layer
 * (`jobObjects.programsOfAStarter` in src/config/systems/windows-groups.mjs) with one more script, which lists the
 * processes the Job Object holds and the starter's children, and keeps the children it holds.
 *
 * WHAT WINDOWS DOES NOT HAVE, SAID AS IT IS:
 *   - no process groups. So `pgid` is 0, as the reader gives it, which means no group. The message worker is started
 *     in a Job Object named after the process started, through the system layer, and that number is its group;
 *   - no signal that asks a group to stop. So the group stop refuses SIGTERM in words, and SIGKILL ends the Job Object.
 *     A release of a row asks instead: it sends the stop request on the group's pipe, through `groups` below, once the
 *     group's Job Object has said that it holds the row's process and does not hold this server (lib/resources.ts);
 *   - no reparenting. A process whose parent ended keeps the parent's number. So on Windows a `ppid` of 1 does not
 *     mean the process was left behind, as it does on Linux, and nothing here says that it does.
 *
 * WHO SENT A CONNECTION, INSIDE THE INSTALLED APP ONLY, by the Mac's rule (lib/darwin-probe.ts). The office is installed
 * when it runs from a bundle in resources\office beside the app's own mole-office.exe. There `readSenderOfAConnection`
 * recognises only the app's own window. One script reads, through Windows' own calls, the rows from the far end's port
 * to this server's port, each row's owner and the owner's parent, with their programs, their starts and the SIDs of the
 * users they run as (`readWhoHoldsAConnection` in src/config/systems/windows-processes.mjs). Readings that wait are read
 * together in one script, and each is judged here alone. The window sent it only when all of these hold:
 *   - both ends are loopback, and exactly one row is that exact connection;
 *   - its owner runs as the user this server runs as. A SID Windows will not give means the owner was not found;
 *   - its owner's program is the app's own mole-office.exe, and so is its parent's;
 *   - the parent started no later than the owner. A parent that started later has a number Windows gave out again;
 *   - the same script reads the connection again at its end and finds the same one row and the same owner.
 * Paths are compared as Windows compares them: either separator, any case, no backslash at the end. The installer's
 * question spells a path in the same way, and both read the one spelling (`theWindowsSpelling` in
 * src/config/systems/the-installer-of-a-folder.mjs). Any other answer is null, and a failure to look throws. Outside the
 * installed app the method is left out, as on the Mac.
 *
 * ONLY BY THE WAY THAT WAITS. The script takes about a second, and the server answers nothing else while a reading
 * holds its thread. So this probe has `readSenderOfAConnection`, which waits for PowerShell without holding the thread,
 * and no `senderOfAConnection`. A request is read that way before its handler wherever the window would count it
 * (`readWhoSentAClaimToBeThemFirst` in lib/http.ts), and the answer is kept on the socket. A question on the thread that
 * finds no answer kept is refused in words (lib/from-a-sandbox.ts). `findsOnlyTheAppsOwnWindow` says, for the sentence
 * about pairing, that a browser on this computer is never recognised here.
 *
 * ONE LINE IN THE LOG FOR EACH READING (`theReadingLine`). It says how long the reading took and where the time went:
 * waiting behind other readings, waiting for PowerShell to start, and the script, with each of the script's four steps
 * as PowerShell timed them. Readings read together have the same four steps, those of their one script, and each its
 * own wait. A reading that failed is a line that says why, and the failure still throws.
 * tests/installed/time-the-sender-reading.mjs reads these lines from the log of an installed office.
 *
 * This was read on Linux with stand-ins for PowerShell (tests/the-windows-window-is-the-person.test.ts). Whether a real
 * Windows lists the window's connection this way, and whether Electron's network process owns it, has not been seen.
 *
 * WHAT IT REFUSES IN WORDS, with a 501: the processes of a group, this server's own group and the listening ports.
 *
 * WHAT IT BORROWS. Every method that reads no process answers on Windows as it does on Linux (git, docker, the GPU,
 * lock files, the machine's name and addresses, the agent tools' keys, starting the restart command and the message
 * worker, tmux, the group stop, stopping a container, a program's version). So it is handed to the Linux probe's
 * own method, as the Mac's probe hands it (lib/darwin-probe.ts). `theProbeForThisPlatform` passes in a Linux probe
 * that is allowed to run on Windows for that purpose. The restart command refuses there in its own words, because
 * Windows has no process groups, and the group stop refuses SIGTERM there, as above.
 *
 * WHAT IT LEAVES OUT, ON PURPOSE. A caller then refuses in words naming this probe: the whole process table, one
 * process's facts, its program and arguments and its cgroup, the sender of a connection read on the server's thread
 * (and outside the installed app the sender of a connection at all), the listeners on one port, a container's first
 * process and its state, pid namespaces, the machine's load and free memory, and the sweep of check worktrees. Each
 * reads /proc on Linux, or `ps` and `lsof` on the Mac, or a docker that runs Linux containers.
 */

import { win32 } from 'node:path'
import { clockStamp } from '@shared/time.ts'
import { WINDOWS_HAS_NO_PROCESS_GROUPS } from '../../config/process-reader.mjs'
import { THE_INSTALL } from '../../config/settings.mjs'
import type { TheSystem } from '../../config/runtimes.mjs'
import { THE_OFFICE_IN_THE_INSTALLED_FOLDER, theWindowsSpelling } from '../../config/systems/the-installer-of-a-folder.mjs'
import { theRealWindowsCommands, type WindowsCommands } from '../../config/systems/windows-commands.mjs'
import { windowsGroups } from '../../config/systems/windows-groups.mjs'
import {
  THE_WINDOWS_APPS_PROGRAM,
  type WhoHoldsAConnection,
  type WhoHoldsAConnectionAndTheTime,
  type windowsProcessReader,
} from '../../config/systems/windows-processes.mjs'
import type { SharedWithLinux } from './darwin-probe.ts'
import { PanelError } from './panel-error.ts'
// Type-only, and so erased: lib/resources.ts imports this file to build the probe.
import type { OsPort, OsProbe, OsProcess, OsSender } from './resources.ts'

/** The Windows reader, with its reading of one process and its command line from one script. */
export type WindowsProcessReader = ReturnType<typeof windowsProcessReader>

/** A message that ends as a sentence, so that a second sentence can follow it. */
function asASentence(message: string): string {
  return /[.!?]$/.test(message) ? message : `${message}.`
}

type ProcessWithItsCommandLine = ReturnType<WindowsProcessReader['processWithItsCommandLine']>
type WhatAStarterLeft = ReturnType<NonNullable<ReturnType<typeof windowsGroups>['jobObjects']>['programsOfAStarter']>

/** What the probe's reading of one process answers, from the reader's row. */
function theProcessIn(pid: number, at: ProcessWithItsCommandLine): OsProcess | null {
  if (!at.here) return null
  if (at.unreadable !== undefined) {
    throw new PanelError(
      `${asASentence(at.unreadable)} Without its start, it cannot be told from a process that is given the same ` +
        `number later. ${theProbeWillNot(pid)}`,
      500,
    )
  }
  // Windows gives no command line for some processes, another user's among them. Then the name is shown in
  // brackets, as ps and the Linux probe show a process with no command line.
  const command = at.commandLine ?? `[${at.name ?? ''}]`
  const started = clockStamp(() => at.startedAt)
  return { pid: at.pid, pgid: at.pgid, ppid: at.ppid, command, startedAt: started.stamp, startedInstant: started.instant }
}

function theProbeWillNot(pid: number): string {
  return `Mole Office will not report process ${pid} as gone, and will not signal a process it cannot read.`
}

/** A reading that failed, said as the probe's refusal. */
function theRefusalAbout(pid: number, err: unknown): PanelError {
  if (err instanceof PanelError) return err
  return new PanelError(`${asASentence((err as Error).message)} ${theProbeWillNot(pid)}`, 500)
}

/** The programs a starter's Job Object holds, as the probe's processes. */
function theProgramsIn(read: WhatAStarterLeft): { read: true; programs: OsProcess[] } | { read: false; reason: string } {
  if (!read.read) return read
  return {
    read: true,
    programs: read.programs.map((one) => {
      const started = clockStamp(() => one.startedAt)
      return { pid: one.pid, pgid: 0, ppid: one.ppid, command: one.command, startedAt: started.stamp, startedInstant: started.instant }
    }),
  }
}

/**
 * THE INSTALLED APP'S FOLDER, when the office runs from a bundle in resources\office inside it, or null. A checkout, and
 * a bundle anywhere else, has no window this probe can recognise.
 */
function theAppsFolder(install: Pick<typeof THE_INSTALL, 'from' | 'root'>): string | null {
  if (install.from !== 'bundle') return null
  const root = win32.normalize(install.root).replace(/\\+$/u, '')
  if (!win32.isAbsolute(root)) return null
  const folder = win32.dirname(win32.dirname(root))
  return theWindowsSpelling(win32.join(folder, ...THE_OFFICE_IN_THE_INSTALLED_FOLDER)) === theWindowsSpelling(root) ? folder : null
}

/** A connection's two ends, as this server's socket gives them, with the IPv4 address inside an IPv6 one taken out. */
type TheEnds = { peer: { address: string; port: number }; ours: { address: string; port: number } }

const bare = (address: string): string => (address.startsWith('::ffff:') ? address.slice(7) : address)
const isLoopback = (address: string): boolean => address === '127.0.0.1' || address === '::1'
const isAPort = (port: number): boolean => Number.isInteger(port) && port > 0 && port <= 65535

/** The two ends to ask about, or null when one is not loopback or a port is no port. Null starts no PowerShell. */
function theEndsToAskAbout(peer: { address: string; port: number }, ours: { address: string; port: number }): TheEnds | null {
  const ends = { peer: { address: bare(peer.address), port: peer.port }, ours: { address: bare(ours.address), port: ours.port } }
  if (!isLoopback(ends.peer.address) || !isLoopback(ends.ours.address)) return null
  if (!isAPort(ends.peer.port) || !isAPort(ends.ours.port)) return null
  return ends
}

/**
 * THE RULE: whether what the script read is the installed app's own window, and the sender when it is. See the header.
 */
function theWindowIn(read: WhoHoldsAConnection, ends: TheEnds, folder: string): OsSender | null {
  const isTheConnection = (row: WhoHoldsAConnection['Before'][number]): boolean =>
    bare(row.LocalAddress) === ends.peer.address &&
    row.LocalPort === ends.peer.port &&
    bare(row.RemoteAddress) === ends.ours.address &&
    row.RemotePort === ends.ours.port
  const before = read.Before.filter(isTheConnection)
  if (before.length !== 1) return null
  const owner = before[0]!.OwningProcess
  const held = read.Holders.find((one) => one.ProcessId === owner)
  const holder = held?.Holder ?? null
  if (held === undefined || holder === null || holder.ProcessId !== owner) return null
  // THE SAME USER. A SID Windows would not give is not read as anybody's.
  const server = read.Server
  if (server === null || server.ProcessId !== process.pid) return null
  if (typeof holder.Sid !== 'string' || holder.Sid === '' || typeof server.Sid !== 'string' || server.Sid === '') return null
  if (holder.Sid !== server.Sid) return null
  // THE APP'S OWN PROGRAM, for the owner and for its parent.
  const theApp = theWindowsSpelling(win32.join(folder, THE_WINDOWS_APPS_PROGRAM))
  const isTheApp = (path: string | null): boolean => typeof path === 'string' && theWindowsSpelling(path) === theApp
  if (!isTheApp(holder.ExecutablePath)) return null
  const parent = held.Parent
  if (parent === null || parent.ProcessId !== holder.ParentProcessId || !isTheApp(parent.ExecutablePath)) return null
  // A PARENT THAT STARTED AFTER ITS CHILD holds a number Windows gave out again, and is not the window's main program.
  if (typeof parent.CreationDate !== 'number' || typeof holder.CreationDate !== 'number') return null
  if (parent.CreationDate > holder.CreationDate) return null
  // AND THE CONNECTION IS STILL THE SAME ONE, with the same owner, after the processes were read.
  const after = read.After.filter(isTheConnection)
  if (after.length !== 1 || after[0]!.OwningProcess !== owner) return null
  return { sid: holder.Sid, serversSid: server.Sid, pid: owner, inAnotherContainer: false }
}

/** A number of milliseconds, whole, as the log's lines about a reading write it. */
const ms = (n: number): string => `${String(Math.round(n))} ms`

/** The connection a line about a reading is about. */
const theConnection = (ends: TheEnds): string =>
  `the connection from port ${String(ends.peer.port)} to port ${String(ends.ours.port)}`

/** The script's four steps as PowerShell timed them, or null when it did not say them as four numbers. */
function theStepsOf(took: unknown): { Before: number; Holders: number; Server: number; After: number } | null {
  if (took === null || typeof took !== 'object') return null
  const steps = took as Record<string, unknown>
  const each = [steps['Before'], steps['Holders'], steps['Server'], steps['After']]
  if (!each.every((one) => typeof one === 'number' && Number.isFinite(one))) return null
  return took as { Before: number; Holders: number; Server: number; After: number }
}

/**
 * THE LOG'S LINE ABOUT ONE READING of who holds a connection: how long it took, where the time went, and what the rule
 * found. A reading run in a PowerShell started for it has no time but its whole.
 */
function theReadingLine(ends: TheEnds, took: number, read: WhoHoldsAConnectionAndTheTime, theWindow: boolean): string {
  const it = read.took
  const where =
    it === null
      ? 'in a PowerShell started for it'
      : `${ms(it.queuedMs)} waiting behind other readings, ${ms(it.startingMs)} waiting for PowerShell to start, ` +
        `${ms(it.ranMs)} from the script's turn to its answer`
  const steps = theStepsOf(read.Took)
  const inPowerShell =
    steps === null
      ? 'PowerShell did not say how long each step took'
      : `in PowerShell, ${ms(steps.Before)} reading the connection, ${ms(steps.Holders)} its owners and their parents, ` +
        `${ms(steps.Server)} this server and ${ms(steps.After)} the connection again`
  const found = theWindow ? "It is the installed app's own window." : "It is not the installed app's own window."
  return `Windows said who holds ${theConnection(ends)} in ${ms(took)}: ${where}; ${inPowerShell}. ${found}`
}

/** The log's line about a reading of who holds a connection that failed, with why. */
function theFailedReadingLine(ends: TheEnds, took: number, why: unknown): string {
  const words = why instanceof Error ? why.message : String(why)
  return `Windows did not say who holds ${theConnection(ends)}, after ${ms(took)}: ${words}`
}

/** What this probe borrows from the Linux probe: what the Mac's probe borrows, and the two lists by the way that waits. */
type BorrowedFromLinux = SharedWithLinux & Pick<OsProbe, 'readGpu' | 'readContainers'>

/**
 * The words a request is refused in when Windows cannot list the processes of a group.
 * @param pgid The group whose processes cannot be listed.
 * @returns The refusal.
 */
export function theGroupsProcessesCannotBeListedWords(pgid: number): string {
  return `${WINDOWS_HAS_NO_PROCESS_GROUPS} So the processes of group ${pgid} cannot be listed.`
}

/** The words a request is refused in when this server has no process group of its own to name on Windows. */
export const THIS_SERVER_HAS_NO_GROUP_TO_NAME = `${WINDOWS_HAS_NO_PROCESS_GROUPS} So this server has no process group of its own to name.`

/** The words a request is refused in when the listening ports are asked about on Windows, where there is no list to read. */
export const THE_PORTS_ARE_NOT_READ_ON_WINDOWS =
  "The listening ports are not read on Windows yet. Linux's probe reads them from /proc, and the Mac's from lsof. " +
  'Windows has neither, and Mole Office does not yet read the list of sockets that Windows keeps.'

export class WindowsProbe implements OsProbe {
  readonly platform = 'win32'

  readonly readSenderOfAConnection?: OsProbe['readSenderOfAConnection']
  readonly findsOnlyTheAppsOwnWindow?: true

  constructor(
    private readonly shared: BorrowedFromLinux,
    private readonly reader: WindowsProcessReader,
    commands: WindowsCommands = theRealWindowsCommands(),
    install: Pick<typeof THE_INSTALL, 'from' | 'root'> = THE_INSTALL,
    /** The groups a release stops through, over the same PowerShell. A test on Linux hands in their stop pipe. */
    readonly groups: ReturnType<typeof windowsGroups> = windowsGroups(commands),
  ) {
    const folder = theAppsFolder(install)
    // Only the installed app's layout has a window this probe can recognise. Anywhere else the method stays left out,
    // and a program of the same user is not taken for the person. There is no way that holds the thread: see the header.
    if (folder !== null) {
      this.readSenderOfAConnection = async (peer, ours) => {
        const ends = theEndsToAskAbout(peer, ours)
        if (ends === null) return null
        const began = performance.now()
        let read: WhoHoldsAConnectionAndTheTime
        try {
          read = await this.reader.readWhoHoldsAConnection(ends.peer.port, ends.ours.port, process.pid)
        } catch (err) {
          console.warn(theFailedReadingLine(ends, performance.now() - began, err))
          throw err
        }
        const sender = theWindowIn(read, ends, folder)
        console.log(theReadingLine(ends, performance.now() - began, read, sender !== null))
        return sender
      }
      this.findsOnlyTheAppsOwnWindow = true
    }
  }

  processById(pid: number): OsProcess | null {
    try {
      return theProcessIn(pid, this.reader.processWithItsCommandLine(pid))
    } catch (err) {
      throw theRefusalAbout(pid, err)
    }
  }

  /** The same reading, by the script that waits for PowerShell without holding the server's thread. */
  async readProcessById(pid: number): Promise<OsProcess | null> {
    try {
      return theProcessIn(pid, await this.reader.readProcessWithItsCommandLine(pid))
    } catch (err) {
      throw theRefusalAbout(pid, err)
    }
  }

  programsOfAnEndedStarter(starter: number): { read: true; programs: OsProcess[] } | { read: false; reason: string } {
    return theProgramsIn(this.groups.jobObjects!.programsOfAStarter(starter))
  }

  /** The same reading, by the script that waits for PowerShell without holding the server's thread. */
  async readProgramsOfAnEndedStarter(starter: number): Promise<{ read: true; programs: OsProcess[] } | { read: false; reason: string }> {
    return theProgramsIn(await this.groups.jobObjects!.readProgramsOfAStarter(starter))
  }

  /** One reading of every process, by the script that waits, which answers the act's questions about processes while it runs. */
  readEveryProcessFirst<T>(act: () => T): Promise<T> {
    return this.reader.readEveryProcessFirst(act)
  }

  processesInGroup(pgid: number): OsProcess[] {
    throw new PanelError(theGroupsProcessesCannotBeListedWords(pgid), 501)
  }

  ownProcessGroup(): number {
    throw new PanelError(THIS_SERVER_HAS_NO_GROUP_TO_NAME, 501)
  }

  listeningPorts(): OsPort[] {
    throw new PanelError(THE_PORTS_ARE_NOT_READ_ON_WINDOWS, 501)
  }

  // ---------------------------------------------------------------- handed to the Linux probe

  checkout(root: string) {
    return this.shared.checkout(root)
  }
  gpu() {
    return this.shared.gpu()
  }
  containers() {
    return this.shared.containers()
  }
  readGpu() {
    if (this.shared.readGpu === undefined) throw new Error("The Windows probe has no way that waits to read the GPU's list.")
    return this.shared.readGpu()
  }
  readContainers() {
    if (this.shared.readContainers === undefined) throw new Error('The Windows probe has no way that waits to read the running containers.')
    return this.shared.readContainers()
  }
  locks(paths: readonly string[]) {
    return this.shared.locks(paths)
  }
  machineName() {
    return this.shared.machineName()
  }
  ownAddresses() {
    return this.shared.ownAddresses()
  }
  whatAnAgentToolSaysAboutItsKey(which: 'claude-code' | 'codex' | 'opencode', system?: TheSystem) {
    return this.shared.whatAnAgentToolSaysAboutItsKey(which, system)
  }
  startTheRestartCommand(input: { cwd: string; logPath: string; env: NodeJS.ProcessEnv }) {
    if (!this.shared.startTheRestartCommand) throw new Error('The Windows probe has no service restart command door.')
    return this.shared.startTheRestartCommand(input)
  }
  /** The data folder mover starts through the system layer's group start, which on Windows is a Job Object of its own. */
  startTheDataFolderMover(input: { to: string; cwd: string; logPath: string; env: NodeJS.ProcessEnv }) {
    if (!this.shared.startTheDataFolderMover) throw new Error('The Windows probe has no data folder mover door.')
    return this.shared.startTheDataFolderMover(input)
  }
  runAvatarCodec(input: Parameters<NonNullable<OsProbe['runAvatarCodec']>>[0]) {
    if (this.shared.runAvatarCodec === undefined) throw new Error('The installed OS probe cannot run the avatar codec.')
    return this.shared.runAvatarCodec(input)
  }
  startTheMessageWorker(input: { args: readonly string[]; cwd: string; logPath: string }) {
    return this.shared.startTheMessageWorker(input)
  }
  tmuxPanes(format: string) {
    return this.shared.tmuxPanes(format)
  }
  killProcessGroup(pgid: number, signal: 'SIGTERM' | 'SIGKILL'): void {
    this.shared.killProcessGroup(pgid, signal)
  }
  stopContainer(name: string): void {
    this.shared.stopContainer(name)
  }
  theVersionOfAProgram(program: string, env: Readonly<Record<string, string>>) {
    return this.shared.theVersionOfAProgram(program, env)
  }
}
