// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE ONE PLACE UNDER `src/worker/` THAT TOUCHES THE OPERATING SYSTEM.
 *
 * OS BOUNDARY EXCEPTION: the worker's whole job is to start an agent tool and stop it again, and
 * a decision says it may start processes on this machine (proposal
 * `LVH7c4IrtwIE`, decision `oaJ-pSntZ3m-`). The spawn and the signal are gathered here, in one file
 * of about a hundred lines, so that the three adapters beside it hold command lines and output
 * readers and nothing else.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS IS NOT `OsProbe`
 * ---------------------------------------------------------------------------------------
 *
 * `OsProbe` in src/server/lib/resources.ts is the API server's window onto this machine, and it has
 * no general "run a command" method on purpose: a web server that runs arbitrary commands is a
 * different and much more dangerous product. That argument still holds, and this file does not
 * weaken it — nothing here is reachable from a route. The worker is a separate process the server
 * starts through the one narrow method on `OsProbe`, and what it may start is fixed by the three
 * adapters beside this file.
 *
 * ---------------------------------------------------------------------------------------
 * EVERY RUN IS ITS OWN PROCESS GROUP
 * ---------------------------------------------------------------------------------------
 *
 * `detached: true` makes the child a group leader, so its group id is its pid and everything the
 * agent tool starts in turn is in that group. One signal to the group ends the whole run. That is
 * also the rule CLAUDE.md states for stopping anything at all: stop a process only by the group id
 * you recorded when you started it, never by a command-line pattern.
 *
 * The system layer says how a group is started (src/config/systems/the-system.mjs). On Linux and
 * the Mac it is that `detached: true`. On Windows, which has no process groups, the child is a
 * starter that makes a Job Object named after its own pid and starts the program in it, so the same
 * group id finds it there too.
 */

import { AsyncLocalStorage } from 'node:async_hooks'
import { spawn, spawnSync } from 'node:child_process'
import type { Writable } from 'node:stream'
import { closeSync, constants, fstatSync, mkdirSync, mkdtempSync, openSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { sayInEnglish } from '@shared/i18n.ts'
import { dirname, join } from 'node:path'

import { type ClockStamp, clockStamp, localStamp, parseAnyStamp, parseStoredStamp } from '@shared/time.ts'

import { theVersionItPrinted, theWayToStart, VERSION_MUST_ANSWER_WITHIN_MS, whereIsThisTool } from '../../config/runtimes.mjs'
import { startTimeOf } from '../../config/session-process.mjs'
import { theSystemFor, thisSystem } from '../../config/systems/the-system.mjs'
import { startedByThatStarter } from '../../config/systems/windows-groups.mjs'

/**
 * THE TEMPORARY FOLDER, READ FROM THE ENVIRONMENT RATHER THAN FROM `node:os`.
 *
 * This file may start and signal a process. A second
 * `node:os` access is not allowed, and the temp folder is where a tool keeps a file rather than a fact about what
 * the machine is doing — the same reason the adapters' `homedir()` has its own exception. On Linux and the Mac
 * Node's `tmpdir()` reads TMPDIR, then TMP, then TEMP, then /tmp; on Windows it reads TEMP, then TMP, then the
 * system's own temporary folder. This reads TMPDIR, then TMP, then TEMP, and falls back to /tmp.
 */
function temporaryFolder(): string {
  return process.env['TMPDIR'] || process.env['TMP'] || process.env['TEMP'] || '/tmp'
}

export interface StartupWitness { folder: string; path: string; fd: number; boot: string | null; inode: string | null }

/** A private FIFO whose reader is inherited by a gate before it can start outside code. */
export function makeStartupWitness(root: string): StartupWitness | null {
  if (thisSystem().platform !== 'linux') return null
  mkdirSync(root, { recursive: true })
  const folder = mkdtempSync(join(root, 'startup-'))
  const path = join(folder, 'gate')
  const made = spawnSync('/usr/bin/mkfifo', ['-m', '600', path])
  if (made.status !== 0) {
    rmSync(folder, { recursive: true, force: true })
    throw new Error(sayInEnglish('startupGate.noWitness'))
  }
  let fd: number
  try {
    fd = openSync(path, constants.O_RDONLY | constants.O_NONBLOCK)
  } catch (error) {
    rmSync(folder, { recursive: true, force: true })
    throw error
  }
  let boot: string | null = null
  let inode: string | null = null
  try {
    const id = readFileSync('/proc/sys/kernel/random/boot_id', 'utf8').trim().toLowerCase()
    const stat = fstatSync(fd, { bigint: true })
    if (/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/.test(id) && stat.isFIFO()) {
      boot = id
      inode = `${stat.dev}:${stat.ino}:${stat.ctimeNs}`
    }
  } catch {
    // Without both identities a manual start stays held if its starter is interrupted.
  }
  return { folder, path, fd, boot, inode }
}

export function forgetStartupWitness(witness: StartupWitness, remove = true): void {
  closeSync(witness.fd)
  if (remove) rmSync(witness.folder, { recursive: true, force: true })
}

const startupGate = new AsyncLocalStorage<StartupWitness>()
const gatePipes = new Map<number, { pipe: Writable; witness: StartupWitness; ended: Promise<void> }>()
const gateCommand = 'IFS= read -r answer <&3 || exit 111; [ "$answer" = go ] || exit 111; exec "$@" 3<&- 4<&-'

export function withStartupGate<T>(witness: StartupWitness, start: () => T): T {
  return startupGate.run(witness, start)
}

export function releaseStartupGate(pid: number): void {
  const gate = gatePipes.get(pid)
  if (gate === undefined) throw new Error(sayInEnglish('startupGate.missing'))
  gatePipes.delete(pid)
  gate.pipe.end('go\n')
}

/** Stop only gates this worker started and has not authorized. */
export async function abortStartupGates(witness: StartupWitness): Promise<void> {
  const gates = [...gatePipes].filter(([, gate]) => gate.witness === witness)
  for (const [pid, gate] of gates) {
    gate.pipe.destroy()
    try { thisSystem().groups.signal(pid, 'SIGKILL') } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error
    }
  }
  await Promise.all(gates.map(([, gate]) => gate.ended))
}

/** The registered group contains the timeout and the probe until the probe has ended. */
export async function theGatedProgramThatRan(command: string, path: string | undefined, witness: StartupWitness, recorded: (group: number) => Promise<void>): Promise<TheProgramThatRan> {
  const question = `${command}\u0000${path ?? ''}`
  const remembered = alreadyRead.get(question)
  if (remembered !== undefined) return remembered
  const found = whereItIs(command, path)
  if (found === null) return theVersionItPrinted(null, null)
  const child = spawn('/bin/sh', ['-c', gateCommand, 'gate', '/usr/bin/timeout', '-k', '1s', `${VERSION_MUST_ANSWER_WITHIN_MS / 1000}s`, found, '--version'], {
    detached: true, stdio: ['ignore', 'pipe', 'pipe', 'pipe', witness.fd],
  })
  if (child.pid === undefined) throw new Error(sayInEnglish('startupGate.noProbe'))
  let stdout = '', stderr = ''
  child.stdout!.on('data', (data: Buffer) => { if (stdout.length < 1024 * 1024) stdout += data.toString().slice(0, 1024 * 1024 - stdout.length) })
  child.stderr!.on('data', (data: Buffer) => { if (stderr.length < 1024 * 1024) stderr += data.toString().slice(0, 1024 * 1024 - stderr.length) })
  const result = new Promise<{ status: number | null; signal: NodeJS.Signals | null; error: Error | null }>(resolve => {
    child.once('error', error => resolve({ status: null, signal: null, error }))
    child.once('close', (status, signal) => resolve({ status, signal, error: null }))
  })
  try {
    await recorded(child.pid)
    ;(child.stdio[3] as Writable).end('go\n')
  } catch (error) {
    ;(child.stdio[3] as Writable).destroy()
    await result
    throw error
  }
  const ran = await result
  // A probe can leave another process in its group after the leader exits. Do not clear the
  // recorded group or start a second group until the first one is empty.
  try {
    process.kill(-child.pid, 0)
    throw new Error(`The version probe's process group ${child.pid} still has processes.`)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error
  }
  const answer = theVersionItPrinted(found, { ...ran, stdout, stderr })
  alreadyRead.set(question, answer)
  return answer
}

/** What to start. */
export interface Starting {
  command: string
  args: readonly string[]
  cwd: string
  env: Record<string, string>
  /** Everything the run prints goes here. Its problems go to this path with `.problem` on the end. */
  outputPath: string
  /** Text to give the child on standard input, for a command that reads its prompt there. */
  stdin?: string
}

/** What was started. */
export interface Started {
  pid: number
  pgid: number
  exitCodePath: string
}

/** Where the run's problems are written, given where its output goes. */
export function problemPathOf(outputPath: string): string {
  return `${outputPath}.problem`
}

/** Where this run records its process exit code. */
export function exitCodePathOf(outputPath: string): string {
  return `${outputPath}.exit-code`
}

/**
 * Start one program in its own process group, with its output going to a file.
 *
 * The file rather than a pipe, because the worker outlives no run it starts by accident: a pipe
 * would tie the run's life to the worker's, and a worker restarted mid-run would lose the answer.
 * The file is on disk and `readResult` reads it whenever it likes.
 */
export function startInItsOwnGroup(what: Starting): Started {
  mkdirSync(dirname(what.outputPath), { recursive: true })
  const out = openSync(what.outputPath, 'a')
  const problems = openSync(problemPathOf(what.outputPath), 'a')
  const exitCodePath = exitCodePathOf(what.outputPath)
  let promptFolder: string | null = null
  let promptFile: string | null = null
  let promptOnStandardInput: number | null = null
  try {
    if (what.stdin !== undefined) {
      // A PROMPT IS GIVEN AS A DESCRIPTOR, NEVER AS A PIPE BACK TO THIS WORKER. It goes in a folder and a file only
      // their owner can read, and the child is handed the open file as its standard input. The child keeps its own
      // descriptor, so this worker removes the file and the folder as soon as the child has started; a pipe would tie
      // the run's life to the worker's. The same reason the output is a file and not a pipe.
      promptFolder = mkdtempSync(join(temporaryFolder(), 'mole-office-run-stdin-'))
      promptFile = join(promptFolder, 'prompt')
      writeFileSync(promptFile, what.stdin, { mode: 0o600, flag: 'wx' })
      promptOnStandardInput = openSync(promptFile, 'r')
    }
    // A .cmd on Windows starts through cmd.exe, or is refused in words (theWayToStart, src/config/runtimes.mjs). The
    // layer names the program: on Windows the bare word `node` is the node this process runs on, because a Job Object
    // start takes a program only by its whole path. On Linux and the Mac the word goes on as it came.
    const way = theWayToStart(thisSystem().groups.theProgramToStart(what.command), what.args)
    const how = thisSystem().groups.howToStartInItsOwnGroup({ ...way, env: what.env })
    const gate = startupGate.getStore()
    const child = spawn(gate === undefined ? how.command : '/bin/sh', gate === undefined ? how.args : ['-c', gateCommand, 'gate', how.command, ...how.args], {
      cwd: what.cwd,
      env: how.env,
      detached: how.detached,
      stdio: gate === undefined ? [promptOnStandardInput ?? 'ignore', out, problems] : [promptOnStandardInput ?? 'ignore', out, problems, 'pipe', gate.fd],
      windowsHide: how.windowsHide,
      windowsVerbatimArguments: how.windowsVerbatimArguments,
    })
    if (child.pid === undefined) {
      throw new Error(`${what.command} was asked to start and this process was given no pid for it.`)
    }
    if (gate !== undefined) {
      const ended = new Promise<void>(resolve => child.once('close', () => resolve()))
      gatePipes.set(child.pid, { pipe: child.stdio[3] as Writable, witness: gate, ended })
      child.once('exit', () => gatePipes.delete(child.pid!))
    }
    // AFTER THE GATE OPENS, THE RUN WRITES NO PIPE BACK TO THE WORKER. The exit event writes a third file beside
    // stdout and stderr. If the worker leaves first, the run keeps going and the missing file reads
    // as unknown when a later worker picks it up.
    child.once('exit', (code, signal) => {
      const status = code === null ? `signal:${signal ?? 'unknown'}` : String(code)
      try {
        writeFileSync(exitCodePath, status, 'utf8')
      } catch (error) {
        process.stderr.write(
          `The exit code for ${what.command} could not be written to ${exitCodePath}: ${(error as Error).message}\n`,
        )
      }
    })
    // The worker does not wait for it. The run is a process on this machine now, findable by the
    // group id below, and the worker may be restarted without ending it.
    child.unref()
    return { pid: child.pid, pgid: child.pid, exitCodePath }
  } finally {
    if (promptOnStandardInput !== null) closeSync(promptOnStandardInput)
    if (promptFile !== null) rmSync(promptFile, { force: true })
    if (promptFolder !== null) rmSync(promptFolder, { recursive: true, force: true })
    closeSync(out)
    closeSync(problems)
  }
}

/**
 * Is that process still there?
 *
 * Signal 0 asks the kernel without sending anything. `EPERM` means it is there and belongs to
 * somebody else, which is still there.
 *
 * WHAT THIS CANNOT SEE: a pid that has been given to another program reads as alive. Asking about a
 * run uses `stillTheProcessThatStarted` below, which compares the start time too.
 */
export function stillRunning(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch (err) {
    return (err as NodeJS.ErrnoException).code === 'EPERM'
  }
}

/**
 * HOW FAR APART TWO READINGS OF ONE PROCESS'S START MAY BE, in milliseconds.
 *
 * The kernel's reading (`startTimeOf`) adds the process's age since boot to the boot moment, and
 * /proc/stat gives the boot moment in whole seconds, so it reads early by up to a second. The worker
 * stamps its handle just after the spawn returns, so the handle reads late by the time the spawn
 * took. Measured on 26 September 2026 in sandbox w13k, 1,200 processes started the way `startRun`
 * starts a run: the handle was 629 to 702 ms after the kernel's reading, 630 ms of it the boot
 * moment's lost fraction. The 702 was with every core busy. The ledger's stamp is the kernel's reading
 * cut to whole seconds, 0 to 990 ms before it. Two seconds holds both with room. A pid comes round
 * again only after the machine has handed out every other pid, which does not happen in two seconds.
 */
const ONE_PROCESS_START_READINGS_DIFFER_BY_LESS_THAN_MS = 2000

/**
 * Is the process that started at `startedAt` still running under `pid`?
 *
 * `startedAt` is either an instant carrying its offset, which is what the worker stamps a run it
 * starts with, or a stored local stamp, which is what the ledger wrote for a run the worker picked
 * up. A local stamp is compared with the kernel's reading written the same way, so both sides are
 * read through the same wall clock.
 *
 * A pid that is running a different program since reads as not running. A pid whose start time
 * cannot be read is read again by signal 0: gone then means it ended between the two reads. Still
 * there means it is running and its start cannot be read, which happens when the process table
 * hides other users' processes. It is then answered by the pid alone, as it was before start times
 * were compared, because saying a run has ended with nothing seen to end it would be a guess.
 */
export function stillTheProcessThatStarted(pid: number, startedAt: string): boolean {
  if (!stillRunning(pid)) return false
  const started = startTimeOf(pid)
  if (started === null) return stillRunning(pid)
  const stored = parseStoredStamp(startedAt)
  if (stored !== null) {
    const kernel = parseStoredStamp(localStamp(started)) as number
    return Math.abs(kernel - stored) < ONE_PROCESS_START_READINGS_DIFFER_BY_LESS_THAN_MS
  }
  const instant = parseAnyStamp(startedAt)
  if (instant === null) {
    throw new Error(`A run's start was written as "${startedAt}", which is not a time, so whether pid ${pid} is still that run cannot be told.`)
  }
  return Math.abs(started.getTime() - instant.getTime()) < ONE_PROCESS_START_READINGS_DIFFER_BY_LESS_THAN_MS
}

/**
 * WHERE A RUN A RESTARTED WORKER PICKS UP RUNS NOW, AND WHICH GROUP ENDS IT.
 *
 * On Linux and the Mac the server's list gives the run's own process and group, and they are taken as they are.
 *
 * On Windows the list gives the starter's pid, and group 0, because Windows has no process groups. The starter's pid
 * names the run's Job Object, so it is the run's group, as `startInItsOwnGroup` gives it. The starter ends when the
 * worker that started it ends, and the program goes on in the Job Object. So the starter's Job Object is read, whether
 * the starter has ended or not. A child of the starter in it that `startedByThatStarter` takes is the run's program,
 * and the run is watched by that program's pid and start. `programStarted` is that start, for a handle that carries a
 * start of its own. With no such child, the starter is watched. A Job Object that cannot be read is unknown, with the
 * reason: watching a starter that has ended would read as a run that has ended. This costs one PowerShell on Windows
 * for each run picked up.
 */
export function whereAPickedUpRunRuns(run: { pid: number; pgid: number; startedAt: string }):
  | { pid: number; pgid: number; startedAt: string; programStarted: ClockStamp | null }
  | { unknown: string } {
  const { jobObjects } = thisSystem().groups
  if (jobObjects === null) return { ...run, programStarted: null }
  const starterMs = parseStoredStamp(run.startedAt)
  if (starterMs === null) {
    return { unknown: `The start of starter ${String(run.pid)} was written as "${run.startedAt}", which is not a stamp, so the program it started cannot be told from a later one.` }
  }
  const read = jobObjects.programsOfAStarter(run.pid)
  if (!read.read) return { unknown: read.reason }
  const program = read.programs.find((one) => startedByThatStarter(one.startedAt.getTime(), starterMs))
  if (program === undefined) return { pid: run.pid, pgid: run.pid, startedAt: run.startedAt, programStarted: null }
  const started = clockStamp(() => program.startedAt)
  return { pid: program.pid, pgid: run.pid, startedAt: started.stamp, programStarted: started }
}

/**
 * End a whole process group, and say whether there was anything to end.
 *
 * A group that has already gone answers ESRCH, and that is not a failure: it is the state the
 * caller was asking for. Measured on 4 September 2026 on the scratch stack: a run that answered in
 * a few milliseconds was stopped a moment later by the worker's own tidy-up, ESRCH came back as an
 * exception, and the whole pass fell over with a reply already written on disk.
 *
 * endGroup sends the one signal it is asked for, and never escalates to SIGKILL on a timer; that is
 * a second decision and it is a person's. The one stop that does escalate is the take-back's,
 * `endGroupWithinASecond` below.
 *
 * ON WINDOWS SIGTERM IS REFUSED IN WORDS by the layer, because no signal asks a whole Job Object
 * to stop, and the refusal carries no code, so it is thrown back and nothing is said to have ended.
 * A stop that may end the group at once there asks `endGroupAsGentlyAsItCan` below.
 */
export function endGroup(pgid: number, signal: 'SIGTERM' | 'SIGKILL' = 'SIGTERM', platform?: string): boolean {
  const { groups } = platform === undefined ? thisSystem() : theSystemFor(platform)
  try {
    groups.signal(pgid, signal)
    return true
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ESRCH') return false
    throw err
  }
}

/**
 * END A WHOLE PROCESS GROUP AS GENTLY AS THIS SYSTEM CAN, and say how.
 *
 * Linux and the Mac ask the group to stop with SIGTERM, exactly as `endGroup(pgid, 'SIGTERM')`.
 * Windows has no signal that asks a group to stop, so there the group is ended at once, with
 * everything in it, and `atOnce` is the sentence that says so, for the caller to write where the
 * run is recorded: a run ended this way did not stop cleanly. A group that had already gone gives
 * `ended: false` and no sentence.
 */
export function endGroupAsGentlyAsItCan(pgid: number, platform?: string): { ended: boolean; atOnce: string | null } {
  const { groups } = platform === undefined ? thisSystem() : theSystemFor(platform)
  if (groups.gentleStop !== null) return { ended: endGroup(pgid, groups.gentleStop, platform), atOnce: null }
  const ended = endGroup(pgid, 'SIGKILL', platform)
  return { ended, atOnce: ended ? theEndAtOnce(pgid) : null }
}

/** The sentence of a group ended at once because the system has no gentle stop. */
export function theEndAtOnce(pgid: number): string {
  return `Windows has no gentle stop for a process group, so process group ${String(pgid)} was ended at once, with everything it had started, and had no chance to finish.`
}

/**
 * End a group as gently as this system can, then, a second later, at once if its first process is
 * still running. Answers the sentence of an end at once, or null. On Windows the first end is
 * already at once, so there is no second and no wait.
 *
 * The one-second escalation is the take-back's existing stop, moved here from src/worker/index.ts
 * unchanged. It is not a new decision to escalate.
 */
export async function endGroupWithinASecond(started: { pid: number; pgid: number }): Promise<string | null> {
  const how = endGroupAsGentlyAsItCan(started.pgid)
  if (how.atOnce !== null) return how.atOnce
  await new Promise((resolve) => setTimeout(resolve, 1_000))
  if (stillRunning(started.pid)) endGroup(started.pgid, 'SIGKILL')
  return null
}

/**
 * LISTEN FOR A STOP REQUEST THE WAY THIS SYSTEM SENDS ONE, and call onStop when one comes.
 *
 * On Windows there is no SIGTERM, so the server asks the worker to stop with a request on the worker's
 * group's pipe, and this listens there. On Linux and the Mac the ask is SIGTERM, which the worker's own
 * handler hears, so this listens for nothing.
 */
export function listenForAStopRequest(onStop: () => void, say: (sentence: string) => void): void {
  thisSystem().groups.listenForAStopRequest(onStop, say)
}

/**
 * Where a program is on this machine, or null because it is not installed.
 *
 * It reads `PATH` and looks, rather than running `which`. A missing program is an ordinary answer
 * here — the worker holds the message and says which tool is not installed — so asking the question
 * must not itself cost a process.
 *
 * THE SEARCH ITSELF IS IN src/config/runtimes.mjs, because the API server's runtime page asks the
 * same question about the same machine and may not load a file out of src/worker. One answer, two
 * readers.
 */
export function whereItIs(command: string, path: string | undefined): string | null {
  return whereIsThisTool(command, path)
}

/**
 * WHICH PROGRAM RAN A RUN, AND WHAT VERSION IT SAYS IT IS.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS EXISTS
 * ---------------------------------------------------------------------------------------
 *
 * Problem `cP2qOXQoYRcv`. There were two Codex installations on the owner's machine — a root-owned
 * `/usr/local/bin/codex` at 0.137.0 from 8 June, and `~/.nvm/versions/node/v22.23.2/bin/codex` at
 * 0.147.0 from 17 August — and `whereItIs` above resolves `codex` through `PATH`. So a worker
 * started from a shell that sourced nvm ran a different Codex from one that did not, and nothing on
 * the run said which. A version measured once and written in a comment is a claim about a program
 * nobody checked was the one that ran.
 *
 * THE OWNER REMOVED THE OLDER INSTALL ON 5 SEPTEMBER 2026, and this still belongs here. `PATH` is
 * what decides which program answers, on every machine and for every tool, and a second install
 * appears the next time somebody runs an installer. What this records is not "which of two Codexes"
 * but what actually ran, which is a fact the run should carry whether or not there is a rival for
 * it today.
 *
 * ---------------------------------------------------------------------------------------
 * THE VERSION IS READ ONCE PER WORKER, NOT ONCE PER RUN
 * ---------------------------------------------------------------------------------------
 *
 * Reading it costs a process, and the answer cannot change without somebody installing something on
 * this machine, which does not happen inside one worker's life. So the answer is remembered against
 * the command and the `PATH` it was resolved through. Two different `PATH`s are two different
 * questions and get two different answers, which is the whole point of the problem this fixes.
 *
 * The worker is one process, so remembering it here is "once per worker start". A test that wants a
 * fresh reading gives a fresh `PATH`, as `tests/which-program-ran-this.test.ts` does.
 *
 * ---------------------------------------------------------------------------------------
 * A VERSION THAT COULD NOT BE READ IS SAID, NEVER GUESSED
 * ---------------------------------------------------------------------------------------
 *
 * A program that is not there, refuses `--version`, prints nothing or hangs gets `versionWasRead:
 * false` and a `version` that is the sentence saying which of those it was. Nothing falls back to a
 * version somebody measured earlier: that would be invariant 5 of USER.md broken, and it is exactly
 * the mistake this problem is about.
 */
export interface TheProgramThatRan {
  /** The full path `PATH` resolved to, or null because nothing of that name is installed. */
  path: string | null
  /**
   * What `<path> --version` printed, trimmed to one line — or, when nothing could be read, the
   * sentence saying why. `versionWasRead` beside it says which of the two this is, so a reader is
   * never left deciding whether a string is a version by looking at it.
   */
  version: string
  /** True when `version` is what the program printed. False when it says why nothing could be read. */
  versionWasRead: boolean
}

/** What has already been read, keyed by the command and the `PATH` it was looked up through. */
const alreadyRead = new Map<string, TheProgramThatRan>()

/**
 * Which program `command` resolves to on this `PATH`, and what version it says it is.
 *
 * Read once per command and `PATH` for the life of this process. See the block above.
 */
export function theProgramThatRan(command: string, path: string | undefined): TheProgramThatRan {
  const question = `${command}\u0000${path ?? ''}`
  const remembered = alreadyRead.get(question)
  if (remembered !== undefined) return remembered
  const answer = readTheVersion(whereItIs(command, path))
  alreadyRead.set(question, answer)
  return answer
}

/**
 * Run `<path> --version` once and read what it printed. The running is here, because this is the one
 * file under src/worker/ that may start a process; what the answer means is `theVersionItPrinted` in
 * src/config/runtimes.mjs, which the API server's reading uses too.
 */
function readTheVersion(path: string | null): TheProgramThatRan {
  if (path === null) return theVersionItPrinted(null, null)
  try {
    const way = theWayToStart(path, ['--version'])
    const ran = spawnSync(way.command, way.args, {
      encoding: 'utf8',
      timeout: VERSION_MUST_ANSWER_WITHIN_MS,
      // NO SHELL. A version reader that went through a shell would be a second way to run a command
      // line, which is not what this file is allowed to be. The one exception is a .cmd on Windows, which
      // cannot start any other way and is quoted by theWayToStart.
      shell: false,
      windowsVerbatimArguments: way.windowsVerbatimArguments,
      windowsHide: true,
    })
    return theVersionItPrinted(path, { error: ran.error ?? null, signal: ran.signal, status: ran.status, stdout: ran.stdout, stderr: ran.stderr })
  } catch (err) {
    return theVersionItPrinted(path, { error: err as Error })
  }
}
