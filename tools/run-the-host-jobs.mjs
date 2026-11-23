#!/usr/bin/env node
// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE HOST JOB RUNNER: it runs, on the host, the registered host tools that running runs asked for.
 *
 *   node tools/run-the-host-jobs.mjs --once [--api <address>]
 *   node tools/run-the-host-jobs.mjs --with-the-office=<pid> [--api <address>]
 *
 * One run does three things, in this order, and exits:
 *   1. An answer it could not give last time (the office was down) is given now.
 *   2. A job it had taken and never answered (the runner was stopped while the job ran) is answered `lost`. A job
 *      held in its own scope has that scope stopped first. Otherwise the tool's process group is ended first when its
 *      first process, the tool's own, still runs and began when the runner wrote down; any other group is left, and
 *      the answer says why.
 *   3. It takes the oldest asked job, runs it to its end and answers. It says, as it takes, that it holds no job, so
 *      the office answers `lost` every job still running: one taken by a runner that stopped before it wrote it down.
 * Exit 0 when each step that had something to do did it, 1 when the office could not be reached or did not take an
 * answer (the answer is kept for the next run), and 2 when the runner refuses to start.
 *
 * WITH THE OFFICE (--with-the-office=<the office's pid>) it is the runner the office starts and keeps
 * (src/server/lib/host-job-runner.ts). It takes the lock once and holds it, does what one run does, waits THE_PAUSE_MS
 * and does it again, until it is sent TERM or the office's process has gone. A tool still running then is ended with
 * its group, and its answer is given, or kept for the next runner when the office has gone. A round that fails is said
 * on one line, and the runner goes on. Exit 0 when it stopped so, and 2 when it refuses to start.
 *
 * ONE RUNNER AT A TIME, AND ONLY TO THIS MACHINE. A run takes a lock in its folder first and refuses while another
 * runner holds it or takes it over. It sends the office key only to a loopback address, and follows no redirect.
 *
 * IT IS NOT THE SERVER, since nothing under src/ may start a process. It runs as the person's own user and refuses root.
 * It holds the office's own key, read from the keys file and never from its arguments or its environment, and the
 * two doors it uses take only that key. The office starts it with --with-the-office; a user timer or a person may run
 * --once beside it, and the lock refuses that run while the office's runner holds it.
 *
 * WHAT IT RUNS IS WHAT THE OFFICE'S FILE OF HOST TOOLS DECLARES, read again here and checked with the same module the
 * door checked with (src/config/host-tools.mjs): the tool's declaration must be the one the office handed over, the
 * arguments must pass again, and the program must still have its sha256. The program is started by the real path that
 * was hashed, with no shell, in its declared folder as it resolved, in a new process group, with an environment built
 * from nothing.
 *
 * EACH JOB IS HELD IN A SYSTEMD SCOPE OF ITS OWN where `systemd-run --user` can start one (wave 13q round 65). The
 * scope is named for the job (theScopeOf), and the runner ends the job by stopping it: at the time limit, when it is
 * asked to stop, and after the tool ends. Stopping it ends every process in it, also one that left the tool's process
 * group. A runner given no XDG_RUNTIME_DIR, as by an office started without one, finds the user's runtime folder
 * itself (theUsersSession). Where no scope can be started, the job is held by its process group only, as before, and
 * a process that left the group is not ended. Every answer names which way held the job (HOST_JOB_HOLDINGS) and says
 * it in words.
 *
 * ITS OWN FOLDER (src/config/host-tools-file.mjs) is mode 700, and the guard keeps every agent on the host from
 * writing in it. Under each job's id it keeps the whole log and the outputs; nothing deletes them yet.
 */
import { spawn } from 'node:child_process'
import { createHash, randomBytes } from 'node:crypto'
import {
  chmodSync,
  closeSync,
  constants,
  existsSync,
  fstatSync,
  linkSync,
  lstatSync,
  mkdirSync,
  openSync,
  readdirSync,
  readFileSync,
  readSync,
  renameSync,
  rmSync,
  writeFileSync,
  writeSync,
} from 'node:fs'
import { homedir, userInfo } from 'node:os'
import { basename, dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { isDeepStrictEqual, parseArgs } from 'node:util'

import { theHostJobsFolderBeside, theHostToolsFileBeside } from '../src/config/host-tools-file.mjs'
import {
  AT_MOST_LOG_CHARACTERS,
  AT_MOST_REASON_CHARACTERS,
  readTheHostTools,
  theArgv,
  theProgramOnDisk,
  whyTheArgumentsAreRefused,
} from '../src/config/host-tools.mjs'
import { KEY_HEADER } from '../src/config/key-header.mjs'
import { theOfficeKey } from '../src/config/office-key.mjs'
import { theProcessReader } from '../src/config/process-reader.mjs'
import { commandLineOf, theProcessAt } from '../src/config/session-process.mjs'
import { bootstrapEnvironment, keysPathFrom } from '../src/config/settings.mjs'
import { HOST_JOB_HOLDINGS } from '../src/shared/host-job-holdings.mjs'
import { whereIsTheApiForACommand } from './where-is-the-api.mjs'

/** How long a tool has after TERM before its group is sent KILL. */
export const THE_GRACE_MS = 10_000
/** The most of the log the runner reads back from the end of the file. The office cuts it to the tool's lines. */
const THE_TAIL_BYTES = 4 * AT_MOST_LOG_CHARACTERS
/** How long one call to the office may take. */
const THE_LONGEST_CALL_MS = 30_000
/** How long the runner the office starts waits after one run before the next, so an ask waits at most this long. */
export const THE_PAUSE_MS = 5_000
/** How long it waits instead after a round fails with the same error as the round before. */
export const THE_PAUSE_AFTER_THE_SAME_ERROR_MS = 60_000
/** How often the runner the office starts looks for the office's process. */
const THE_WATCH_MS = 1_000

/**
 * WHAT THE RUNNER SAYS: every sentence it prints and every why it answers about a job, each once. A sentence the runner
 * prints is one line, and the line break is not part of it. A pid is a number, and a time in milliseconds is said in
 * seconds. The refusals of the host tools file and of a program on disk are src/config/host-tools.mjs's, and the office
 * key's are src/config/office-key.mjs's; the runner passes those on as they are written there.
 */
export const THE_RUNNERS_WORDS = {
  onceOrWithTheOffice:
    'Say --once, or --with-the-office=<pid>, and not both. --once answers what it holds, takes the oldest asked host job, runs it and exits. ' +
    "--with-the-office=<pid> does that every few seconds for as long as the office's process <pid> runs; the office starts it so.",
  /** @param {string} said */
  notAProcessId: (said) => `--with-the-office takes the office's process id, and "${said}" is not one.`,
  itDoesNotRunAsRoot: 'The host job runner does not run as root. Run it as the user that runs the office.',
  theKeyCannotBeRead: 'The office key could not be read, so the runner does not start.',
  /** @param {string} api */
  notAnAddress: (api) => `The office's address "${api}" is not an address, so the host job runner does not start.`,
  /** @param {string} origin */
  notThisMachinesLoopback: (origin) =>
    `The office's address ${origin} is not this machine's loopback (127.0.0.1, ::1 or localhost), so the host job runner sends it no key and does not start.`,
  /** @param {string} folder */
  itsFolderIsNotAFolder: (folder) => `The host job runner's folder ${folder} is not a folder, so the runner does not start.`,
  /** @param {string} folder */
  itsFolderIsAnotherUsers: (folder) => `The host job runner's folder ${folder} is another user's, so the runner does not start.`,
  /** @param {string} folder @param {number} mode */
  itsFolderIsOpenToOthers: (folder, mode) =>
    `The host job runner's folder ${folder} is open to others (mode ${(mode & 0o777).toString(8)}); it must be mode 700, so the runner does not start.`,
  /** @param {number} pid */
  theOfficeIsNotRunning: (pid) => `The office's process ${pid} is not running, so this host job runner does not start.`,
  /** @param {number} pid */
  theOfficesStartCannotBeRead: (pid) =>
    `When the office's process ${pid} began could not be read, so this host job runner could not tell it from a process given that number later, and does not start.`,
  /** @param {number} pid */
  theOfficeHasNoCommandLine: (pid) =>
    `The office's process ${pid} has no command line that could be read, so it has ended or is not a program, and this host job runner does not start.`,
  /** @param {number} pid */
  theOfficeHasGone: (pid) => `The office's process ${pid} has gone, so the host job runner stops.`,
  /** @param {number} pid */
  theOfficesStartCannotBeReadNow: (pid) =>
    `When the office's process ${pid} began could not be read, so the host job runner cannot tell whether the office has gone, and goes on.`,
  /** @param {number} pauseMs @param {number} pid */
  itAsksEvery: (pauseMs, pid) => `The host job runner asks the office for a host job every ${pauseMs / 1000} seconds, for as long as the office's process ${pid} runs.`,
  /** @param {number} pid @param {string} lock */
  itsOwnStartCannotBeRead: (pid, lock) => `When this host job runner's own process ${pid} began could not be read, so the lock ${lock} could not name it, and this one does not start.`,
  /** @param {number} pid @param {string} lock */
  aRunnerHoldsTheLock: (pid, lock) => `Another host job runner, process ${pid}, holds the lock ${lock}, so this one does not start.`,
  /** @param {string} lock @param {number} pid */
  theLocksRunnerCannotBeTold: (lock, pid) =>
    `The lock ${lock} names process ${pid}, and a process with that number is running, but when it began could not be read. ` +
    'So this runner cannot tell whether it is another runner, and does not start.',
  /** @param {number} pid @param {string} lock */
  aRunnerIsTakingOver: (pid, lock) => `Another host job runner, process ${pid}, is taking over the lock ${lock}, which a runner that stopped left, so this one does not start.`,
  /** @param {string} file @param {number} pid @param {string} lock */
  aTakerCannotBeTold: (file, pid, lock) =>
    `The file ${file} names process ${pid}, and a process with that number is running, but when it began could not be read. ` +
    `So this runner cannot tell whether another runner is taking over the lock ${lock}, and does not start.`,
  /** @param {string} lock */
  anotherTookOver: (lock) => `Another host job runner took over the lock ${lock} while this one began to, so this one does not start.`,
  /** @param {string} lock */
  anotherTookTheLock: (lock) =>
    `Another host job runner took the lock ${lock} while this one took over a lock left by a runner that stopped, so this one does not start.`,
  /** @param {number} pid @param {string} lock @param {string} file */
  aTakerStopped: (pid, lock, file) =>
    `The host job runner process ${pid} stopped while it took over the lock ${lock}, and left ${file}. This runner took the lock over in its place, and removed that file.`,
  /** @param {string} id */
  lostSinceNoRunnerHeldIt: (id) => `Host job ${id}: lost, since no runner held it.`,
  /** @param {string} what why the office could not be reached */
  theOfficeCouldNotBeAsked: (what) => `The office could not be asked for a host job (${what}).`,
  /** @param {number} status @param {string} said */
  theOfficeAnsweredTheAsk: (status, said) => `The office answered ${status} when asked for a host job: ${said}`,
  noJobIsAsked: 'No host job is asked.',
  askedToStopAsItTook: 'The host job runner was asked to stop as it took the job, so it did not start the tool. Ask again.',
  /** @param {string} tool */
  theToolIsNotInTheFile: (tool) => `The tool ${tool} is not in the host tools file now.`,
  /** @param {string} tool */
  theDeclarationChanged: (tool) => `The declaration of ${tool} in the host tools file is not the one the office handed over, so it changed between the two reads.`,
  /** @param {string} tool */
  registeredAgain: (tool) => `The tool ${tool} was registered again with another program after the job was asked.`,
  /** @param {string} why */
  theArgumentsAreRefused: (why) => `The arguments are refused: ${why}.`,
  /** @param {string} code */
  theProgramCouldNotStart: (code) => `The program could not be started: ${code}.`,
  /** @param {number} seconds */
  endedAtItsTimeLimit: (seconds) => `It was ended at its time limit of ${seconds} seconds.`,
  /** @param {number} graceMs */
  lostWhenAskedToStop: (graceMs) =>
    `The host job runner was asked to stop while the tool ran, so it sent the tool's process group TERM, and KILL had it not ended ${graceMs / 1000} seconds later. It is not run again by itself; ask again.`,
  /** @param {number} graceMs */
  lostWhenAskedToStopInItsScope: (graceMs) =>
    "The host job runner was asked to stop while the tool ran, so it stopped the tool's scope: systemd sent every process in it TERM, " +
    `and KILL had it not ended ${graceMs / 1000} seconds later. It is not run again by itself; ask again.`,
  /** @param {string} unit */
  inItsOwnScope: (unit) =>
    `It was held in its own scope, ${unit}. When the job ends the runner stops the scope, and every process still in it is ended, also one that left the tool's process group.`,
  /** @param {string} why */
  byItsGroupOnly: (why) =>
    `It was held by its process group only, because ${why}. When the job ends the runner ends that group, and a process that left the group is not ended.`,
  /** @param {string} what what systemd-run did (couldNotStart, exited or endedBy) */
  noScope: (what) => `systemd-run --user could not start a scope: ${what}`,
  /** @param {string} folder @param {string} what why it is not (the runtimeFolder words below) */
  noRuntimeFolder: (folder, what) => `XDG_RUNTIME_DIR is not set, and ${folder} is not the user's own runtime folder: ${what}`,
  /** @param {string} code */
  runtimeFolderCannotBeRead: (code) => (code === 'ENOENT' ? 'it does not exist' : `it cannot be read (${code})`),
  runtimeFolderIsNotAFolder: 'it is not a folder',
  /** @param {number} owner */
  runtimeFolderIsAnotherUsers: (owner) => `it belongs to user ${owner}`,
  /** @param {number} mode */
  runtimeFolderModeIsNot700: (mode) => `its mode is ${(mode & 0o777).toString(8)} and not 700`,
  /** @param {string} bus */
  runtimeFolderHoldsNoBus: (bus) => `there is no socket at ${bus}`,
  /** @param {string} program */
  itsPathHoldsAnEqualsSign: (program) => `its program's path ${program} holds "=", which env would read as a variable and not as the program`,
  /** @param {string} command @param {string} code */
  couldNotStart: (command, code) => `${command} could not be started (${code})`,
  /** @param {string} command @param {number} code @param {string} said what it wrote to its error output */
  exited: (command, code, said) => (said === '' ? `${command} exited ${code} and said nothing` : `${command} exited ${code}, saying: ${said.replace(/\.$/, '')}`),
  /** @param {string} command @param {string} signal */
  endedBy: (command, signal) => `${command} was ended by ${signal}`,
  /** @param {string} unit @param {string} what what systemctl did */
  itsScopeWasNotStopped: (unit, what) =>
    `It ran in its own scope, ${unit}, but the scope could not be stopped (${what}), so it was held by its process group only, and a process that left the group may still run.`,
  /** @param {string} id @param {string} what why */
  theAnswerCouldNotBeGiven: (id, what) => `The answer about host job ${id} could not be given (${what}). It is kept for the next run.`,
  /** @param {string} id @param {string} state */
  itsAnswerWasTaken: (id, state) => `Host job ${id}: ${state}.`,
  /** @param {string} id @param {number} status @param {string} said */
  itTookNoAnswer: (id, status, said) => `Host job ${id} took no answer (${status}): ${said}`,
  /** @param {string} id @param {string} refusal */
  theOfficeRefusedTheAnswer: (id, refusal) => `The office refused the answer about host job ${id} (400): ${refusal} The runner gives its state alone.`,
  /** @param {string} refusal */
  theWholeAnswerWasRefused: (refusal) =>
    "The office refused the runner's whole answer, so the exit code, the outputs and the log are not filed; " +
    `what the runner kept is in its folder under the job's id. The office said: ${refusal}`,
  /** @param {number} status @param {string} id @param {string} refusal */
  theAnswerIsKept: (status, id, refusal) => `The office answered ${status} to the answer about host job ${id}: ${refusal} It is kept for the next run.`,
  askedToStop: 'The host job runner was asked to stop.',
  /** @param {string} said @param {number} waitMs @param {boolean} again whether the round before failed with the same error */
  aRoundFailed: (said, waitMs, again) =>
    `A round of the host job runner failed: ${said} ` +
    (again ? `It failed so in the round before too, so the next round is in ${waitMs / 1000} seconds.` : `The next round is in ${waitMs / 1000} seconds.`),
  lostBeforeItsGroupWasWrittenDown:
    "The host job runner stopped, or its round failed, after it took the job and before it wrote down the tool's process group, so whether the tool ran is not known.",
  /** @param {number} groupId @param {string} what what the runner did with the group (theLostGroup) */
  lostWhileTheToolRan: (groupId, what) => `The host job runner stopped while the tool ran in the process group ${groupId}, so how it ended is not known. ${what}`,
  /** @param {string} unit @param {string} what what the runner did with the scope */
  lostWhileTheToolRanInItsScope: (unit, what) => `The host job runner stopped while the tool ran in the scope ${unit}, so how it ended is not known. ${what}`,
  /** @param {number} seconds */
  itsRecoveryDidNotRunWhileTheGroupRan: (seconds) =>
    `Its recovery did not run: the job's group still had a member ${seconds} s after KILL. The folder it left is where it was.`,
  itsRecoveryDidNotRunWithoutAGroup:
    'Its recovery did not run: the runner wrote down no process group for the job, so no process of the job was stopped first.',
  itsRecoveryDidNotRunWhileItsGroupWasNotShownStopped:
    "Its recovery did not run: the job's process group was not shown to have stopped.",
  /** @param {number} seconds */
  itsGroupStillHadAMember: (seconds) => `The tool's group still had a member ${seconds} s after KILL.`,
  itsScopeWasStopped: 'This runner stopped that scope, so every process still in it was ended.',
  itsScopeHadEnded: 'That scope had already ended, so no process of the job was left in it.',
  /** @param {string} what what systemctl did @param {string} then what the runner did with the group (theLostGroup) */
  theLostScopeWasNotStopped: (what, then) => `That scope could not be stopped (${what}), so this runner went by the tool's process group instead. ${then}`,
  /** @param {string} why */
  aLostJob: (why) => `${why} It is not run again by itself; ask again.`,
  itsStartWasNotWrittenDown:
    "When the tool's own process began was not written down, so this runner cannot tell that group from one given the same number later, and does not end it.",
  /** @param {number} pid */
  itsOwnProcessHasEnded: (pid) => `The tool's own process ${pid} has ended, so this runner cannot tell whether processes left in that group are the job's, and does not end them.`,
  /** @param {number} pid */
  itsOwnProcessHasEndedAndItsGroupStillHadAMember: (pid) =>
    `The tool's own process ${pid} has ended, but its group still had a member, so the group is not shown to have stopped.`,
  /** @param {number} pid */
  itsStartCannotBeRead: (pid) => `When process ${pid} began could not be read, so this runner cannot tell whether it is the tool's, and does not end its group.`,
  /** @param {number} pid */
  anotherProgramHasIt: (pid) => `Process ${pid} now began at another time than the tool's own process did, so it is another program, and this runner does not end its group.`,
  /** @param {number} graceMs */
  itsGroupWasEnded: (graceMs) =>
    `The tool's own process still ran, and began when the runner had written down, so this runner sent its group TERM, and KILL ${graceMs / 1000} seconds later had it not ended.`,
}

/** @param {string} line @returns {never} */
function refuse(line) {
  process.stderr.write(`${line}\n`)
  process.exit(2)
}

// ============================================================================ the office

/** The only hosts the runner sends the office key to, as a URL names them. */
const THIS_MACHINE = new Set(['127.0.0.1', '[::1]', 'localhost'])

/**
 * WHY THE RUNNER WILL NOT SEND THE OFFICE KEY TO THIS ADDRESS, or null. Only this machine's loopback address takes it,
 * so a typo or a wrong setting never sends the office's most powerful key to another host.
 * @param {string} api
 * @returns {string | null}
 */
export function whyTheAddressIsRefused(api) {
  let url
  try {
    url = new URL(api)
  } catch {
    return THE_RUNNERS_WORDS.notAnAddress(api)
  }
  if (THIS_MACHINE.has(url.hostname)) return null
  return THE_RUNNERS_WORDS.notThisMachinesLoopback(url.origin)
}

/**
 * One call to the office with its own key. The job's project goes in the header when the door names a job.
 * @param {{ api: string, key: string }} office
 * @param {string} path
 * @param {unknown} body
 * @param {string} [workspace]
 * @returns {Promise<{ status: number, body: any }>}
 */
async function callTheOffice(office, path, body, workspace) {
  const reply = await fetch(`${office.api}${path}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      [KEY_HEADER]: office.key,
      ...(workspace === undefined ? {} : { 'x-mole-office-workspace': workspace }),
    },
    body: JSON.stringify(body),
    // A REDIRECT WOULD CARRY THE KEY to wherever it points, so the call fails instead.
    redirect: 'error',
    signal: AbortSignal.timeout(THE_LONGEST_CALL_MS),
  })
  const text = await reply.text()
  let parsed = null
  try {
    parsed = JSON.parse(text)
  } catch {
    parsed = { text }
  }
  return { status: reply.status, body: parsed }
}

// ============================================================================ the runner's folder

/**
 * The runner's folder, made mode 700 when it is not there, and refused when it is a link, another user's, or open to
 * others.
 * @param {string} folder
 */
function theRunnersFolder(folder) {
  if (!existsSync(folder)) mkdirSync(folder, { recursive: true, mode: 0o700 })
  const stat = lstatSync(folder)
  if (!stat.isDirectory()) refuse(THE_RUNNERS_WORDS.itsFolderIsNotAFolder(folder))
  if (typeof process.getuid === 'function' && stat.uid !== process.getuid()) refuse(THE_RUNNERS_WORDS.itsFolderIsAnotherUsers(folder))
  if ((stat.mode & 0o077) !== 0) refuse(THE_RUNNERS_WORDS.itsFolderIsOpenToOthers(folder, stat.mode))
  return folder
}

/** The name of this file, which a runner's command line holds. */
const THE_RUNNERS_FILE = basename(fileURLToPath(import.meta.url))

/** Whether a command line is a runner's: one of its words names this runner's file. */
const namesTheRunner = (/** @type {string} */ commandLine) => commandLine.split(' ').some((word) => basename(word) === THE_RUNNERS_FILE)

/**
 * WHETHER A PROCESS RECORDED BEFORE STILL RUNS, read as the office reads a process it recorded: by the pid, the start
 * time recorded with it, and the command line. A pid alone is not the process, since pids are given out again, and
 * after a reboot any program may have the one recorded. The lock's holder and the office's process are read so.
 *   - `there`: a process has the pid, began when the record says, and its command line is the one asked for (`isIt`);
 *   - `gone`: no process has the pid, or the one there began at another time or runs another command;
 *   - `cannot-tell`: a process has the pid, and when it began could not be read. That is not gone.
 * A record without a start time was written before one was written with it, and is judged by the command alone. A
 * command line that cannot be read when the start time could is one the process does not have, as a kernel thread has
 * none, or the process ended between the two readings.
 * @param {number} pid
 * @param {string | null} startedAt
 * @param {(commandLine: string) => boolean} isIt
 * @param {import('../src/config/process-reader.mjs').ProcessReader} reads
 * @returns {'there' | 'gone' | 'cannot-tell'}
 */
function whetherItStillRuns(pid, startedAt, isIt, reads) {
  if (!Number.isInteger(pid) || pid <= 0) return 'gone'
  const now = theProcessAt(pid, reads)
  if (!now.here) return 'gone'
  if (now.startedAt === null) return 'cannot-tell'
  if (startedAt !== null && now.startedAt !== startedAt) return 'gone'
  const commandLine = commandLineOf(pid, reads)
  return commandLine !== null && isIt(commandLine) ? 'there' : 'gone'
}

/**
 * A SMALL FILE MADE WHOLE, OR NOT MADE WHEN ITS NAME IS THERE. The text goes into a file of this process's own first, and
 * that file is linked to the name, which fails when the name is there. So a runner that reads the name never finds it
 * empty, as it could between an open and a write.
 * @param {string} file @param {string} text
 * @returns {boolean} Whether this process made it.
 */
function madeWhole(file, text) {
  const mine = `${file}.${process.pid}-${randomBytes(6).toString('hex')}`
  const fd = openSync(mine, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600)
  try {
    writeSync(fd, text)
  } finally {
    closeSync(fd)
  }
  try {
    linkSync(mine, file)
    return true
  } catch (error) {
    if (/** @type {NodeJS.ErrnoException} */ (error).code !== 'EEXIST') throw error
    return false
  } finally {
    rmSync(mine, { force: true })
  }
}

/**
 * What a file of the lock holds, or null when it is not there.
 * @param {string} file @returns {string | null}
 */
function theTextIn(file) {
  try {
    return readFileSync(file, 'utf8')
  } catch (error) {
    if (/** @type {NodeJS.ErrnoException} */ (error).code === 'ENOENT') return null
    throw error
  }
}

/**
 * The runner a file of the lock names, a pid and when its process began, a line each, as whetherItStillRuns reads it,
 * with the file's text as it was read; null when the file is not there.
 * @param {string} file
 * @param {import('../src/config/process-reader.mjs').ProcessReader} reads
 * @returns {{ pid: number, held: 'there' | 'gone' | 'cannot-tell', text: string } | null}
 */
function theRunnerNamedIn(file, reads) {
  const text = theTextIn(file)
  if (text === null) return null
  const [pidLine = '', startedLine = ''] = text.split('\n')
  const pid = Number.parseInt(pidLine, 10)
  return { pid, held: whetherItStillRuns(pid, startedLine === '' ? null : startedLine, namesTheRunner, reads), text }
}

/**
 * ONE RUNNER AT A TIME. The lock is a file in the runner's folder, made whole (madeWhole), holding the runner's pid and
 * when its process began, a line each, and it is removed when the run ends. While a runner that still runs holds it
 * (whetherItStillRuns, by namesTheRunner), or when what holds its pid cannot be read, this run refuses.
 *
 * A LOCK LEFT BY A RUNNER THAT STOPPED IS TAKEN OVER by one runner only. The taking over is itself a file made whole,
 * runner.lock.taking-over, naming the runner as the lock does. Under it the lock is read again, removed only when its
 * runner has still gone, and made anew. Without it, two runners that both found the lock left could each remove it, and
 * the second would remove the lock the first had just made. A runner finding the file of taking over refuses while its
 * runner runs, or while what has its pid cannot be read.
 *
 * A FILE OF TAKING OVER LEFT BY A RUNNER THAT STOPPED, in the few steps of taking over, is gone past: the runner makes
 * its own one level further, runner.lock.taking-over.2, then .3 and on, and goes past each that names a runner that has
 * gone. Such a file is never removed and made again by the runner that finds it, since another runner may have found it
 * too, and both would then take the lock over. Once its own is made, the runner reads every file it went past again,
 * and does not start when one has changed: a runner that took over in between removed it, and another may have made it
 * anew. A runner that has taken the lock over removes the files it went past, the lowest first, and says so for each,
 * so nobody removes one by hand. Until wave 13q round 64 such a file was a refusal that asked the person to remove it.
 * @param {string} folder
 * @param {import('../src/config/process-reader.mjs').ProcessReader} reads
 * @returns {{ refused: string } | { release: () => void }}
 */
function theLock(folder, reads) {
  const file = join(folder, 'runner.lock')
  const self = theProcessAt(process.pid, reads)
  if (!self.here || self.startedAt === null) return { refused: THE_RUNNERS_WORDS.itsOwnStartCannotBeRead(process.pid, file) }
  const mine = `${process.pid}\n${self.startedAt}\n`
  const held = { release: () => rmSync(file, { force: true }) }
  if (madeWhole(file, mine)) return held
  /**
   * Why this run does not start, when the lock's runner runs or cannot be read; null when it has gone or let go.
   * @param {{ pid: number, held: 'there' | 'gone' | 'cannot-tell' } | null} holder
   */
  const whyNot = (holder) => {
    if (holder?.held === 'there') return { refused: THE_RUNNERS_WORDS.aRunnerHoldsTheLock(holder.pid, file) }
    if (holder?.held === 'cannot-tell') return { refused: THE_RUNNERS_WORDS.theLocksRunnerCannotBeTold(file, holder.pid) }
    return null
  }
  const before = whyNot(theRunnerNamedIn(file, reads))
  if (before !== null) return before
  /** The files of taking over this runner went past, as it read them. @type {{ left: string, text: string, pid: number }[]} */
  const wentPast = []
  let takingOver = `${file}.taking-over`
  for (let level = 2; !madeWhole(takingOver, mine); level++) {
    const taker = theRunnerNamedIn(takingOver, reads)
    if (taker === null) return { refused: THE_RUNNERS_WORDS.anotherTookOver(file) }
    if (taker.held === 'there') return { refused: THE_RUNNERS_WORDS.aRunnerIsTakingOver(taker.pid, file) }
    if (taker.held === 'cannot-tell') return { refused: THE_RUNNERS_WORDS.aTakerCannotBeTold(takingOver, taker.pid, file) }
    wentPast.push({ left: takingOver, text: taker.text, pid: taker.pid })
    takingOver = `${file}.taking-over.${level}`
  }
  try {
    if (wentPast.some(({ left, text }) => theTextIn(left) !== text)) return { refused: THE_RUNNERS_WORDS.anotherTookOver(file) }
    const holder = theRunnerNamedIn(file, reads)
    const now = whyNot(holder)
    if (now !== null) return now
    // A lock let go since is not removed, since a runner that began since may have made it anew.
    if (holder !== null) rmSync(file, { force: true })
    if (!madeWhole(file, mine)) return { refused: THE_RUNNERS_WORDS.anotherTookTheLock(file) }
    for (const { left, pid } of wentPast) {
      rmSync(left, { force: true })
      process.stdout.write(`${THE_RUNNERS_WORDS.aTakerStopped(pid, file, left)}\n`)
    }
    return held
  } finally {
    rmSync(takingOver, { force: true })
  }
}

/**
 * Write one small file whole, mode 600, through a file beside it.
 * @param {string} file @param {unknown} value
 */
function writeWhole(file, value) {
  const next = `${file}.next`
  writeFileSync(next, JSON.stringify(value, null, 2) + '\n', { mode: 0o600 })
  chmodSync(next, 0o600)
  renameSync(next, file)
}

// ============================================================================ the outputs and the log

/**
 * The sha256 of an open file, read to its end.
 * @param {number} fd @returns {string}
 */
function theSha256OfAnOpenFile(fd) {
  const hash = createHash('sha256')
  const buffer = Buffer.alloc(64 * 1024)
  for (let at = 0; ; ) {
    const read = readSync(fd, buffer, 0, buffer.length, at)
    if (read === 0) return hash.digest('hex')
    hash.update(buffer.subarray(0, read))
    at += read
  }
}

/**
 * ONE DECLARED OUTPUT, READ WITHOUT FOLLOWING A LINK: lstat, then open with O_NOFOLLOW, then fstat the file opened.
 * Its text is handed back when it is UTF-8 within its declared size.
 * @param {string} folder
 * @param {{ name: string, maxBytes: number }} output
 */
export function readAnOutput(folder, output) {
  const at = join(folder, output.name)
  let stat
  try {
    stat = lstatSync(at)
  } catch {
    return { name: output.name, state: 'missing' }
  }
  if (!stat.isFile()) return { name: output.name, state: 'not a regular file' }
  let fd
  try {
    fd = openSync(at, constants.O_RDONLY | constants.O_NOFOLLOW)
  } catch {
    return { name: output.name, state: 'not a regular file' }
  }
  try {
    const opened = fstatSync(fd)
    if (!opened.isFile()) return { name: output.name, state: 'not a regular file' }
    const sha256 = theSha256OfAnOpenFile(fd)
    if (opened.size > output.maxBytes) return { name: output.name, state: 'too large', size: opened.size, sha256 }
    const bytes = Buffer.alloc(opened.size)
    readSync(fd, bytes, 0, opened.size, 0)
    let text
    try {
      text = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
    } catch {
      text = undefined
    }
    return { name: output.name, state: 'returned', size: opened.size, sha256, ...(text === undefined ? {} : { text }) }
  } finally {
    closeSync(fd)
  }
}

/**
 * The end of the log file, whole lines only when it was cut.
 * @param {string} file @returns {string}
 */
function theEndOfTheLog(file) {
  const fd = openSync(file, constants.O_RDONLY | constants.O_NOFOLLOW)
  try {
    const size = fstatSync(fd).size
    const from = Math.max(0, size - THE_TAIL_BYTES)
    const bytes = Buffer.alloc(size - from)
    readSync(fd, bytes, 0, bytes.length, from)
    const text = bytes.toString('utf8')
    return from === 0 ? text : text.slice(text.indexOf('\n') + 1)
  } finally {
    closeSync(fd)
  }
}

// ============================================================================ one job

/**
 * A signal to a process group. One that has already ended takes none.
 * @param {number} groupId @param {NodeJS.Signals} signal
 */
function toTheGroup(groupId, signal) {
  try {
    process.kill(-groupId, signal)
  } catch {
    // The group has already ended.
  }
}

// ============================================================================ the scope

/** The scope a job is held in, named for the job, so a runner after one that stopped stops the same one. */
export const theScopeOf = (/** @type {string} */ jobId) => `mole-office-host-job-${jobId}.scope`

/** The two variables by which systemd-run and systemctl find the user's own systemd, which the tool is not given. */
const THE_SESSIONS_ADDRESSES = /** @type {const} */ (['XDG_RUNTIME_DIR', 'DBUS_SESSION_BUS_ADDRESS'])

/** The folder in which systemd makes each user's runtime folder, named by the user's id. */
const THE_RUNTIME_FOLDERS = '/run/user'

/**
 * WHY A FOLDER IS NOT THE USER'S OWN RUNTIME FOLDER, or null when it is: a folder (not a link to one) of this user's,
 * mode 700, holding the socket of the user's bus.
 * @param {string} folder @param {number} uid
 * @returns {string | null}
 */
function whyItIsNotTheRuntimeFolder(folder, uid) {
  /** @type {import('node:fs').Stats} */
  let stat
  try {
    stat = lstatSync(folder)
  } catch (error) {
    return THE_RUNNERS_WORDS.runtimeFolderCannotBeRead(/** @type {NodeJS.ErrnoException} */ (error).code ?? String(error))
  }
  if (!stat.isDirectory()) return THE_RUNNERS_WORDS.runtimeFolderIsNotAFolder
  if (stat.uid !== uid) return THE_RUNNERS_WORDS.runtimeFolderIsAnotherUsers(stat.uid)
  if ((stat.mode & 0o777) !== 0o700) return THE_RUNNERS_WORDS.runtimeFolderModeIsNot700(stat.mode)
  const bus = join(folder, 'bus')
  try {
    if (lstatSync(bus).isSocket()) return null
  } catch {
    // Said below: there is no socket there.
  }
  return THE_RUNNERS_WORDS.runtimeFolderHoldsNoBus(bus)
}

/**
 * THE ENVIRONMENT systemd-run AND systemctl ARE GIVEN: the path, and the session as the runner was given it. A runner
 * given no XDG_RUNTIME_DIR, as by an office started without one, finds the user's own runtime folder itself, and takes
 * it only as whyItIsNotTheRuntimeFolder allows; otherwise `missing` says why, and no scope is tried.
 * @param {string} runtimeFolders THE_RUNTIME_FOLDERS unless a test hands in its own
 * @returns {{ session: Record<string, string>, missing: string | null }}
 */
function theUsersSession(runtimeFolders) {
  /** @type {Record<string, string>} */
  const session = { PATH: '/usr/bin:/bin' }
  for (const name of THE_SESSIONS_ADDRESSES) {
    const value = process.env[name]
    if (value !== undefined) session[name] = value
  }
  if (session['XDG_RUNTIME_DIR'] !== undefined) return { session, missing: null }
  const { uid } = userInfo()
  const folder = join(runtimeFolders, String(uid))
  const why = whyItIsNotTheRuntimeFolder(folder, uid)
  if (why !== null) return { session, missing: THE_RUNNERS_WORDS.noRuntimeFolder(folder, why) }
  session['XDG_RUNTIME_DIR'] = folder
  return { session, missing: null }
}

/** The most of what systemd-run or systemctl wrote that goes into a why, so the why stays under the office's limit. */
const AT_MOST_SAID = 1000

/**
 * RUN systemd-run OR systemctl TO ITS END, with no shell, and keep what it wrote to its error output on one line.
 * @param {string} command @param {string[]} args @param {Record<string, string>} env
 * @returns {Promise<{ code: number | null, signal: string | null, said: string } | { error: string }>}
 */
function whatACommandDid(command, args, env) {
  return new Promise((resolveIt) => {
    const child = spawn(command, args, { env, shell: false, stdio: ['ignore', 'ignore', 'pipe'] })
    let said = ''
    child.stderr?.setEncoding('utf8')
    child.stderr?.on('data', (/** @type {string} */ chunk) => {
      if (said.length < AT_MOST_SAID) said += chunk
    })
    child.once('error', (error) => resolveIt({ error: /** @type {NodeJS.ErrnoException} */ (error).code ?? error.message }))
    child.once('close', (code, signal) => resolveIt({ code, signal, said: said.replace(/\s+/g, ' ').trim().slice(0, AT_MOST_SAID) }))
  })
}

/**
 * What a command that did not do what was asked did, said for a why.
 * @param {string} command @param {Awaited<ReturnType<typeof whatACommandDid>>} did
 */
function whatItDid(command, did) {
  if ('error' in did) return THE_RUNNERS_WORDS.couldNotStart(command, did.error)
  return did.code === null ? THE_RUNNERS_WORDS.endedBy(command, String(did.signal)) : THE_RUNNERS_WORDS.exited(command, did.code, did.said)
}

/** Stop a scope and wait until systemd says it has stopped. @param {string} unit @param {Record<string, string>} session */
const stopTheScope = (unit, session) => whatACommandDid('systemctl', ['--user', 'stop', unit], session)

/** What `systemctl stop` answers for a unit that is not loaded, as a scope is once every process in it has ended. */
const NOT_LOADED = 5

/**
 * @typedef {{ heldBy: (typeof HOST_JOB_HOLDINGS)[number], howItWasHeld: string, scope?: { unit: string, session: Record<string, string> } }} Holding
 * How a job is held. `heldBy` and `howItWasHeld` go into its answer, and change when its scope could not be stopped.
 */

/**
 * WHICH WAY HOLDS THIS JOB: its own scope where systemd-run --user starts one now, or its process group only, and why.
 * A program whose path holds "=" is not given to env, which would read it as a variable.
 * @param {string} jobId @param {string} program @param {string} runtimeFolders
 * @returns {Promise<Holding>}
 */
async function theWayToHold(jobId, program, runtimeFolders) {
  const byTheGroup = (/** @type {string} */ why) => ({ heldBy: HOST_JOB_HOLDINGS[1], howItWasHeld: THE_RUNNERS_WORDS.byItsGroupOnly(why) })
  if (program.includes('=')) return byTheGroup(THE_RUNNERS_WORDS.itsPathHoldsAnEqualsSign(program))
  const { session, missing } = theUsersSession(runtimeFolders)
  if (missing !== null) return byTheGroup(missing)
  const tried = await whatACommandDid('systemd-run', ['--user', '--scope', '--quiet', '--collect', '--', 'true'], session)
  if ('error' in tried || tried.code !== 0) return byTheGroup(THE_RUNNERS_WORDS.noScope(whatItDid('systemd-run', tried)))
  const unit = theScopeOf(jobId)
  return { heldBy: HOST_JOB_HOLDINGS[0], howItWasHeld: THE_RUNNERS_WORDS.inItsOwnScope(unit), scope: { unit, session } }
}

/**
 * WHAT THE RUNNER STARTS FOR THIS JOB: the real paths of the program it hashed and of its folder, or why it does not
 * start. The declaration the office handed over must be the one in the file now, the arguments must pass, and the
 * program must still be the one registered.
 * @param {string} toolsFile
 * @param {any} job
 * @param {any} declaration
 * @returns {{ refused: string } | { program: string, folder: string }}
 */
function whatItStarts(toolsFile, job, declaration) {
  const read = readTheHostTools(toolsFile)
  if ('refused' in read) return read
  const entry = read.tools.find((one) => /** @type {any} */ (one).declaration.name === job.data.tool)
  if (entry === undefined) return { refused: THE_RUNNERS_WORDS.theToolIsNotInTheFile(job.data.tool) }
  const mine = /** @type {any} */ (entry).declaration
  if (!isDeepStrictEqual(mine, declaration)) return { refused: THE_RUNNERS_WORDS.theDeclarationChanged(job.data.tool) }
  if (mine.program.sha256 !== job.data.sha256) return { refused: THE_RUNNERS_WORDS.registeredAgain(job.data.tool) }
  const arguments_ = whyTheArgumentsAreRefused(mine, job.data.arguments)
  if (arguments_ !== null) return { refused: THE_RUNNERS_WORDS.theArgumentsAreRefused(arguments_) }
  return theProgramOnDisk(mine)
}

/**
 * THE ENVIRONMENT A TOOL IS GIVEN: the path, the person it runs as, and its own job. Nothing of the
 * office's is in it. The path starts with the Node that runs this runner, so a tool whose first line
 * is `#!/usr/bin/env node` gets that Node and not an older one a machine keeps at /usr/bin.
 * @param {string} jobId @param {string} output
 */
function theToolEnvironment(jobId, output) {
  return {
    PATH: `${dirname(process.execPath)}:/usr/bin:/bin`,
    HOME: homedir(),
    USER: userInfo().username,
    LANG: 'C.UTF-8',
    TZ: 'UTC',
    HOST_JOB_ID: jobId,
    HOST_JOB_OUTPUT: output,
  }
}

/** How long a lost job's recovery step may run. It is a cleanup, not the job. */
const THE_RECOVERY_LIMIT_MS = 60_000
/** How long a lost job's group gets to have no member left, after KILL, before its recovery is not run. */
const THE_GROUP_WAIT_MS = 5_000
/** The grace a recovery step gets after TERM before its group is sent KILL, kept short because it is a cleanup. */
const theRecoveryGrace = (limitMs) => Math.min(5_000, Math.max(200, Math.floor(limitMs / 4)))

/** A time limit in words: seconds where it is whole seconds, milliseconds otherwise. @param {number} ms */
function theLimitInWords(ms) {
  return ms % 1_000 === 0 ? `${ms / 1_000} s` : `${ms} ms`
}

/**
 * WHETHER A PROCESS GROUP HAS A MEMBER, read once. A group whose leader has ended can still hold children the job
 * started, and a number is not given out as a new process while it is still a live group's number.
 * @param {number} groupId @returns {boolean}
 */
function theGroupHasAMember(groupId) {
  try {
    process.kill(-groupId, 0)
    return true
  } catch {
    return false
  }
}

/**
 * WHETHER A PROCESS GROUP HAS NO MEMBER LEFT, waited for at most `ms`. A group whose leader has ended can still hold
 * children the job started, and the recovery step must run after those have gone, as it does after a scope stops.
 * @param {number} groupId @param {number} ms
 * @returns {Promise<boolean>}
 */
async function untilTheGroupHasGone(groupId, ms) {
  const until = Date.now() + ms
  for (;;) {
    if (!theGroupHasAMember(groupId)) return true
    if (Date.now() >= until) return false
    await new Promise((done) => setTimeout(done, 50))
  }
}

/**
 * THE TOOL'S OWN RECOVERY STEP, for a lost job, and what it said. The runner is generic: a
 * declaration may name one, and the runner calls it once with the job's id and nothing else, only
 * after the lost job's scope has stopped. A declaration without one says nothing and runs nothing.
 * The step is checked on disk and by its sha256, as the program is, and it is given the same
 * environment a job is given.
 * @param {any} declaration @param {string} jobId @param {string} jobFolder @param {number} [limitMs]
 * @returns {Promise<string>} a sentence for the answer, or '' when there is no step
 */
async function itsRecovery(declaration, jobId, jobFolder, limitMs = THE_RECOVERY_LIMIT_MS) {
  const recovery = declaration?.recovery
  if (recovery === undefined) return ''
  const onDisk = theProgramOnDisk({ program: recovery.program, folder: declaration.folder })
  if ('refused' in onDisk) return `Its recovery did not run: ${onDisk.refused}.`
  const argv = recovery.argv.map((/** @type {string} */ word) => word === '{job}' ? jobId : word)
  return await new Promise((done) => {
    let settled = false
    /** @type {NodeJS.Timeout | undefined} */
    let grace
    const settle = (/** @type {string} */ sentence) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      if (grace !== undefined) clearTimeout(grace)
      child.stdout?.destroy()
      child.stderr?.destroy()
      child.unref()
      done(sentence)
    }
    const child = spawn(onDisk.program, argv, {
      cwd: onDisk.folder,
      env: theToolEnvironment(jobId, join(jobFolder, 'out')),
      shell: false,
      detached: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let said = ''
    const keep = (/** @type {Buffer} */ chunk) => {
      said += chunk.toString('utf8')
      if (said.length > AT_MOST_SAID) said = said.slice(-AT_MOST_SAID)
    }
    child.stdout?.on('data', keep)
    child.stderr?.on('data', keep)
    // THE LIMIT ENDS THE STEP FOR SURE: TERM now, KILL after a short grace, and the answer is given even when the
    // step ignores TERM or leaves a child holding the pipes. A step that waits for ever would hold the runner's lock
    // and every job after it.
    const timer = setTimeout(() => {
      const pid = child.pid
      if (pid === undefined) {
        settle(`Its recovery was stopped at its ${theLimitInWords(limitMs)} limit.`)
        return
      }
      try {
        process.kill(-pid, 'SIGTERM')
      } catch {
        // It ended.
      }
      grace = setTimeout(() => {
        try {
          process.kill(-pid, 'SIGKILL')
        } catch {
          // It ended.
        }
        settle(`Its recovery was stopped at its ${theLimitInWords(limitMs)} limit.`)
      }, theRecoveryGrace(limitMs))
    }, limitMs)
    child.once('error', (error) => {
      settle(`Its recovery did not run: ${/** @type {NodeJS.ErrnoException} */ (error).code ?? error.message}.`)
    })
    child.once('close', (code, signal) => {
      const words = said.replace(/\s+$/, '').trim()
      const how = code === null ? `was ended by ${String(signal)}` : `ended ${String(code)}`
      settle(words === '' ? `Its recovery ${how} and said nothing.` : `Its recovery said: ${words}`)
    })
  })
}

/**
 * RUN ONE JOB TO ITS END and say how it ended. At the time limit its scope is stopped, which sends every process in it
 * TERM and KILL after the grace; held by its group only, TERM goes to the group and KILL after the grace. When the
 * program ends by itself the scope is stopped all the same, and KILL goes to what is left of its group, so nothing it
 * started outlives the job.
 *
 * A SCOPE THAT CANNOT BE STOPPED is said, and its group is ended in its place; the job is then held by its group only.
 * `systemctl stop` answers NOT_LOADED for a scope whose processes have all ended, so that answer stops it only when the
 * tool has ended by the time systemctl answers.
 *
 * WHEN THE RUNNER IS ASKED TO STOP WHILE THE TOOL RUNS (`stop`), the job is ended the same way, and it is lost: it did
 * not run to its end, and it is not run again by itself.
 * @param {any} job
 * @param {any} declaration
 * @param {{ program: string, folder: string }} onDisk
 * @param {string} jobFolder
 * @param {number} graceMs
 * @param {number} groupWaitMs
 * @param {Holding} holding
 * @param {(groupId: number) => void} started
 * @param {AbortSignal} [stop]
 * @param {number} [recoveryMs]
 * @returns {Promise<Record<string, unknown>>}
 */
function runOneJob(job, declaration, onDisk, jobFolder, graceMs, groupWaitMs, holding, started, stop, recoveryMs = THE_RECOVERY_LIMIT_MS) {
  const output = join(jobFolder, 'out')
  mkdirSync(output, { recursive: true, mode: 0o700 })
  const logFile = join(jobFolder, 'log')
  const log = openSync(logFile, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600)
  const environment = theToolEnvironment(job.id, output)
  return new Promise((resolveTheJob) => {
    let settled = false
    const done = (/** @type {Record<string, unknown>} */ answer) => {
      if (settled) return
      settled = true
      resolveTheJob(answer)
    }
    let atTheLimit = false
    let stopped = false
    /** @type {NodeJS.Timeout | undefined} */
    let grace
    const argv = theArgv(declaration, job.data.arguments)
    const { scope } = holding
    // IN A SCOPE, systemd-run makes the scope and becomes the tool, through env, which takes the session's addresses
    // away again: the tool is given no way to ask the user's systemd for anything.
    const child = scope === undefined
      ? spawn(onDisk.program, argv, { cwd: onDisk.folder, env: environment, shell: false, detached: true, stdio: ['ignore', log, log] })
      : spawn(
        'systemd-run',
        [
          '--user', '--scope', '--quiet', '--collect', `--unit=${scope.unit}`, `--property=TimeoutStopSec=${graceMs}ms`, '--',
          '/usr/bin/env', ...THE_SESSIONS_ADDRESSES.flatMap((name) => ['-u', name]), onDisk.program, ...argv,
        ],
        { cwd: onDisk.folder, env: { ...environment, ...scope.session }, shell: false, detached: true, stdio: ['ignore', log, log] },
      )
    // The program holds its own copy of the log; the runner's is closed now.
    closeSync(log)
    const toItsGroup = (/** @type {NodeJS.Signals} */ signal) => {
      if (child.pid !== undefined) toTheGroup(child.pid, signal)
    }
    const endTheGroup = () => {
      toItsGroup('SIGTERM')
      grace = setTimeout(() => toItsGroup('SIGKILL'), graceMs)
    }
    let ended = false
    /** @type {Promise<boolean> | undefined} Whether the scope was stopped; asked once. */
    let scopeStopped
    const stopItsScope = (/** @type {{ unit: string, session: Record<string, string> }} */ scope) => {
      const { unit } = scope
      // WHETHER THE TOOL HAS ENDED IS READ WHEN systemctl ANSWERS, not when it is asked: a tool that ends while the stop
      // asked at the time limit is on its way leaves its scope empty, and systemd unloads it before the stop reaches it.
      // systemctl answers so only after the tool's process has left the scope, and Node reaps children in the order
      // they were started, so the tool's end is read first. It is not only if the tool's exit stalls, between leaving
      // its scope and ending, for longer than systemd and systemctl take to answer.
      scopeStopped ??= stopTheScope(unit, scope.session).then((did) => {
        if ('code' in did && (did.code === 0 || (did.code === NOT_LOADED && ended))) return true
        holding.heldBy = HOST_JOB_HOLDINGS[1]
        holding.howItWasHeld = THE_RUNNERS_WORDS.itsScopeWasNotStopped(unit, whatItDid('systemctl', did))
        return false
      })
      return scopeStopped
    }
    const endTheJob = () => {
      if (scope === undefined) return endTheGroup()
      void stopItsScope(scope).then((itStopped) => {
        if (!itStopped && !ended) endTheGroup()
      })
    }
    const limit = setTimeout(() => {
      atTheLimit = true
      endTheJob()
    }, declaration.timeLimitSeconds * 1000)
    const whenStopped = () => {
      if (atTheLimit || stopped) return
      stopped = true
      clearTimeout(limit)
      endTheJob()
    }
    stop?.addEventListener('abort', whenStopped, { once: true })
    if (stop?.aborted === true) whenStopped()
    child.once('spawn', () => {
      if (child.pid !== undefined) started(child.pid)
    })
    child.once('error', (error) => {
      clearTimeout(limit)
      stop?.removeEventListener('abort', whenStopped)
      done({ state: 'could not start', why: THE_RUNNERS_WORDS.theProgramCouldNotStart(/** @type {NodeJS.ErrnoException} */ (error).code ?? error.message) })
    })
    child.once('exit', async (code, signal) => {
      ended = true
      clearTimeout(limit)
      stop?.removeEventListener('abort', whenStopped)
      if (scope !== undefined) await stopItsScope(scope)
      if (grace !== undefined) clearTimeout(grace)
      toItsGroup('SIGKILL')
      // THE GROUP HAS TO HAVE GONE TOO, on the path held by its group only: KILL was just sent, and a member may
      // still be there for a moment. The scope path has awaited the stop already. WHEN A MEMBER IS STILL THERE the
      // recovery is not run, and the answer says why: the step must not read what a process of the job still uses.
      const byItsGroupOnly = scope === undefined || holding.heldBy === HOST_JOB_HOLDINGS[1]
      const theGroupHasGone = !byItsGroupOnly || child.pid === undefined ? true : await untilTheGroupHasGone(child.pid, groupWaitMs)
      // A JOB LOST WHILE IT RAN, OR ENDED AT ITS TIME LIMIT, IS CLEANED UP AFTER ITS SCOPE HAS STOPPED, never before:
      // the recovery step reads what the job left and removes only what its own journal proves. A time-limit kill is
      // as much a stopped job as a stop asked for, and a hand-over killed at its two-hour limit leaves the same
      // staging folder and journal behind.
      const recovered = !(stopped || atTheLimit)
        ? ''
        : theGroupHasGone
          ? await itsRecovery(declaration, job.id, jobFolder, recoveryMs)
          : declaration?.recovery === undefined
            ? ''
            : THE_RUNNERS_WORDS.itsRecoveryDidNotRunWhileTheGroupRan(groupWaitMs / 1_000)
      const outputs = declaration.outputs.map((/** @type {{ name: string, maxBytes: number }} */ one) => readAnOutput(output, one))
      const declared = new Set(declaration.outputs.map((/** @type {{ name: string }} */ one) => one.name))
      const undeclaredFiles = readdirSync(output).filter((name) => !declared.has(name)).length
      done({
        state: stopped ? 'lost' : atTheLimit ? 'ended at its time limit' : 'finished',
        ...(stopped
          ? { why: `${holding.heldBy === HOST_JOB_HOLDINGS[0] ? THE_RUNNERS_WORDS.lostWhenAskedToStopInItsScope(graceMs) : THE_RUNNERS_WORDS.lostWhenAskedToStop(graceMs)}${recovered === '' ? '' : ` ${recovered}`}` }
          : atTheLimit ? { why: `${THE_RUNNERS_WORDS.endedAtItsTimeLimit(declaration.timeLimitSeconds)}${recovered === '' ? '' : ` ${recovered}`}` } : {}),
        ...(code === null ? {} : { exitCode: code }),
        ...(signal === null ? {} : { signal }),
        heldBy: holding.heldBy,
        howItWasHeld: holding.howItWasHeld,
        outputs,
        undeclaredFiles,
        logTail: theEndOfTheLog(logFile),
      })
    })
  })
}

// ============================================================================ one run

/**
 * WHAT THE RUNNER DID WITH THE PROCESS GROUP OF A TOOL WHOSE RUNNER STOPPED WHILE IT RAN, and whether the group is
 * gone. The group's number is the tool's own process's pid, which is given out again once the group has ended. So the
 * group is ended only when its first process still runs and began when the runner wrote down; otherwise it may be
 * another program's, and it is left. A group left because it may be another program's is not the job's, so it is
 * gone as far as this job is concerned; a group whose start was never written down, or cannot be read, is not shown
 * to have gone, and the recovery step must not run. A first process that has ended can still leave children in its
 * group, and the number is still that group's while any of them lives, so the group itself is checked before it
 * counts as gone.
 * @param {number} groupId
 * @param {string | undefined} groupStartedAt
 * @param {number} graceMs
 * @param {number} groupWaitMs
 * @param {import('../src/config/process-reader.mjs').ProcessReader} reads
 * @returns {Promise<{ said: string, gone: boolean }>}
 */
async function theLostGroup(groupId, groupStartedAt, graceMs, groupWaitMs, reads) {
  if (groupStartedAt === undefined) return { said: THE_RUNNERS_WORDS.itsStartWasNotWrittenDown, gone: false }
  const now = theProcessAt(groupId, reads)
  if (!now.here) {
    const gone = !theGroupHasAMember(groupId)
    return {
      said: gone ? THE_RUNNERS_WORDS.itsOwnProcessHasEnded(groupId) : THE_RUNNERS_WORDS.itsOwnProcessHasEndedAndItsGroupStillHadAMember(groupId),
      gone,
    }
  }
  if (now.startedAt === null) return { said: THE_RUNNERS_WORDS.itsStartCannotBeRead(groupId), gone: false }
  if (now.startedAt !== groupStartedAt) return { said: THE_RUNNERS_WORDS.anotherProgramHasIt(groupId), gone: true }
  toTheGroup(groupId, 'SIGTERM')
  await new Promise((done) => setTimeout(done, graceMs))
  toTheGroup(groupId, 'SIGKILL')
  // KILL WAS JUST SENT, and a member may still be there for a moment. A group with a member left is not shown to
  // have stopped, so the recovery step is not run against what a process of the job may still be using.
  const gone = await untilTheGroupHasGone(groupId, groupWaitMs)
  return {
    said: gone ? THE_RUNNERS_WORDS.itsGroupWasEnded(graceMs) : THE_RUNNERS_WORDS.itsGroupStillHadAMember(groupWaitMs / 1_000),
    gone,
  }
}

/**
 * Give an answer the runner holds. It is kept when the office does not take it, and dropped when the office says the
 * job takes no answer any more (409) or is not there (404).
 *
 * A WHOLE ANSWER THE OFFICE REFUSES AS WRONG (400) IS GIVEN AGAIN AS ITS STATE ALONE, with the refusal as the reason,
 * once. Kept as it was, it would be refused on every run, and the runner would take no other job.
 * @param {{ api: string, key: string }} office
 * @param {string} heldFile
 * @param {{ id: string, workspaceId: string, answer: Record<string, unknown>, stateAlone?: boolean }} held
 * @returns {Promise<boolean>} Whether the answer is settled.
 */
async function giveTheAnswer(office, heldFile, held) {
  let reply
  try {
    reply = await callTheOffice(office, `/api/host-jobs/${encodeURIComponent(held.id)}/answer`, held.answer, held.workspaceId)
  } catch (error) {
    process.stderr.write(`${THE_RUNNERS_WORDS.theAnswerCouldNotBeGiven(held.id, error instanceof Error ? error.message : String(error))}\n`)
    return false
  }
  if (reply.status === 200 || reply.status === 404 || reply.status === 409) {
    rmSync(heldFile, { force: true })
    const said = reply.status === 200
      ? THE_RUNNERS_WORDS.itsAnswerWasTaken(held.id, String(held.answer['state']))
      : THE_RUNNERS_WORDS.itTookNoAnswer(held.id, reply.status, String(reply.body?.error ?? reply.body?.text ?? ''))
    process.stdout.write(`${said}\n`)
    return true
  }
  const refusal = String(reply.body?.error ?? reply.body?.text ?? '')
  if (reply.status === 400 && held.stateAlone !== true) {
    process.stderr.write(`${THE_RUNNERS_WORDS.theOfficeRefusedTheAnswer(held.id, refusal)}\n`)
    const why = THE_RUNNERS_WORDS.theWholeAnswerWasRefused(refusal)
    held.answer = { state: held.answer['state'], why: why.slice(0, AT_MOST_REASON_CHARACTERS) }
    held.stateAlone = true
    writeWhole(heldFile, held)
    return giveTheAnswer(office, heldFile, held)
  }
  process.stderr.write(`${THE_RUNNERS_WORDS.theAnswerIsKept(reply.status, held.id, refusal)}\n`)
  return false
}

/**
 * ONE RUN OF THE RUNNER, to this machine's office only and holding the lock. `graceMs` and `groupWaitMs` are
 * THE_GRACE_MS and THE_GROUP_WAIT_MS unless a test shortens them, `reads` is this system's process reader and
 * `runtimeFolders` THE_RUNTIME_FOLDERS unless a test hands in its own.
 * @param {{ api: string, key: string, folder: string, toolsFile: string, graceMs?: number, groupWaitMs?: number, recoveryMs?: number, stop?: AbortSignal, reads?: import('../src/config/process-reader.mjs').ProcessReader, runtimeFolders?: string }} at
 * @returns {Promise<number>} The exit code.
 */
export async function runOnce(at) {
  const notHere = whyTheAddressIsRefused(at.api)
  if (notHere !== null) {
    process.stderr.write(`${notHere}\n`)
    return 2
  }
  const reads = at.reads ?? theProcessReader()
  const lock = theLock(at.folder, reads)
  if ('refused' in lock) {
    process.stderr.write(`${lock.refused}\n`)
    return 2
  }
  try {
    return await theRunHoldingTheLock({ ...at, reads })
  } finally {
    lock.release()
  }
}

/**
 * `stop` and `quiet` are the office's runner's: it ends a running tool when it is asked to stop, and says nothing when
 * nothing is asked, since it asks every few seconds.
 * @param {{ api: string, key: string, folder: string, toolsFile: string, reads: import('../src/config/process-reader.mjs').ProcessReader, graceMs?: number, groupWaitMs?: number, recoveryMs?: number, stop?: AbortSignal, quiet?: boolean, runtimeFolders?: string }} at
 * @returns {Promise<number>}
 */
async function theRunHoldingTheLock(at) {
  const office = { api: at.api, key: at.key }
  const heldFile = join(at.folder, 'taken.json')
  if (existsSync(heldFile)) {
    const held = JSON.parse(readFileSync(heldFile, 'utf8'))
    if (held.answer === undefined) {
      const graceMs = at.graceMs ?? THE_GRACE_MS
      const groupWaitMs = at.groupWaitMs ?? THE_GROUP_WAIT_MS
      /** @type {string} */
      let why
      /** Whether the job's processes were shown to have stopped before the recovery step is read. */
      let itsGroupStopped = false
      if (held.groupId === undefined) why = THE_RUNNERS_WORDS.lostBeforeItsGroupWasWrittenDown
      else if (held.heldBy === HOST_JOB_HOLDINGS[0]) {
        // A JOB LOST IN ITS SCOPE has the scope stopped, which ends every process still in it. Where it cannot be
        // stopped, the runner goes by the group, as for a job held by its group only.
        const unit = theScopeOf(held.id)
        const did = await stopTheScope(unit, theUsersSession(at.runtimeFolders ?? THE_RUNTIME_FOLDERS).session)
        /** @type {string} */
        let what
        if ('code' in did && did.code === 0) {
          what = THE_RUNNERS_WORDS.itsScopeWasStopped
          itsGroupStopped = true
        } else if ('code' in did && did.code === NOT_LOADED) {
          what = THE_RUNNERS_WORDS.itsScopeHadEnded
          itsGroupStopped = true
        } else {
          held.heldBy = HOST_JOB_HOLDINGS[1]
          held.howItWasHeld = THE_RUNNERS_WORDS.itsScopeWasNotStopped(unit, whatItDid('systemctl', did))
          const byItsGroup = await theLostGroup(held.groupId, held.groupStartedAt, graceMs, groupWaitMs, at.reads)
          what = THE_RUNNERS_WORDS.theLostScopeWasNotStopped(whatItDid('systemctl', did), byItsGroup.said)
          itsGroupStopped = byItsGroup.gone
        }
        why = THE_RUNNERS_WORDS.lostWhileTheToolRanInItsScope(unit, what)
      } else {
        const byItsGroup = await theLostGroup(held.groupId, held.groupStartedAt, graceMs, groupWaitMs, at.reads)
        why = THE_RUNNERS_WORDS.lostWhileTheToolRan(held.groupId, byItsGroup.said)
        itsGroupStopped = byItsGroup.gone
      }
      // THE STEP IS CALLED ONLY NOW, after the scope or the group has been shown to have stopped, and it is read
      // from the register as it is now. A runner that cannot read the register says so and still ends the job. A
      // job whose group was never written down, or was not shown to have stopped, gets no recovery: the step reads
      // what the job left, and it must not read what a process of the job may still be using.
      const register = readTheHostTools(at.toolsFile)
      const declaration = 'refused' in register ? undefined : /** @type {any} */ (register.tools.find((one) => /** @type {any} */ (one).declaration.name === held.tool))?.declaration
      const recovered =
        declaration?.recovery === undefined
          ? ''
          : itsGroupStopped
            ? await itsRecovery(declaration, held.id, join(at.folder, held.id), at.recoveryMs)
            : held.groupId === undefined
              ? THE_RUNNERS_WORDS.itsRecoveryDidNotRunWithoutAGroup
              : THE_RUNNERS_WORDS.itsRecoveryDidNotRunWhileItsGroupWasNotShownStopped
      held.answer = {
        state: 'lost',
        why: THE_RUNNERS_WORDS.aLostJob(`${why}${recovered === '' ? '' : ` ${recovered}`}`),
        ...(held.groupId === undefined || held.heldBy === undefined ? {} : { heldBy: held.heldBy, howItWasHeld: held.howItWasHeld }),
      }
      writeWhole(heldFile, held)
    }
    if (!(await giveTheAnswer(office, heldFile, held))) return 1
  }
  if (at.stop?.aborted === true) return 0
  // NOTHING IS HELD NOW: what taken.json held is answered. So the office answers lost every job still running.
  let taken
  try {
    taken = await callTheOffice(office, '/api/host-jobs/take', { holding: 'nothing' })
  } catch (error) {
    process.stderr.write(`${THE_RUNNERS_WORDS.theOfficeCouldNotBeAsked(error instanceof Error ? error.message : String(error))}\n`)
    return 1
  }
  if (taken.status !== 200) {
    process.stderr.write(`${THE_RUNNERS_WORDS.theOfficeAnsweredTheAsk(taken.status, String(taken.body?.error ?? taken.body?.text ?? ''))}\n`)
    return 1
  }
  // AN OFFICE BEFORE THE `holding` OF THE TAKE answers no `lost`, and answered none lost.
  for (const id of Array.isArray(taken.body.lost) ? taken.body.lost : []) process.stdout.write(`${THE_RUNNERS_WORDS.lostSinceNoRunnerHeldIt(String(id))}\n`)
  if (taken.body.job === null) {
    if (at.quiet !== true) process.stdout.write(`${THE_RUNNERS_WORDS.noJobIsAsked}\n`)
    return 0
  }
  const { job, declaration } = taken.body
  /** @type {{ id: string, workspaceId: string, tool?: string, groupId?: number, groupStartedAt?: string, heldBy?: string, howItWasHeld?: string, answer?: Record<string, unknown> }} */
  const held = { id: job.id, workspaceId: job.workspaceId, tool: job.data.tool }
  writeWhole(heldFile, held)
  const starts = whatItStarts(at.toolsFile, job, declaration)
  const jobFolder = join(at.folder, job.id)
  // WHICH WAY HOLDS THE JOB is found before the stop is looked at, so a stop asked while systemd-run is tried starts nothing.
  const holding = 'refused' in starts ? null : await theWayToHold(job.id, starts.program, at.runtimeFolders ?? THE_RUNTIME_FOLDERS)
  if ('refused' in starts) held.answer = { state: 'could not start', why: starts.refused }
  else if (at.stop?.aborted === true) held.answer = { state: 'could not start', why: THE_RUNNERS_WORDS.askedToStopAsItTook }
  else if (holding !== null) {
    mkdirSync(jobFolder, { mode: 0o700 })
    held.answer = await runOneJob(job, declaration, starts, jobFolder, at.graceMs ?? THE_GRACE_MS, at.groupWaitMs ?? THE_GROUP_WAIT_MS, holding, (groupId) => {
      held.groupId = groupId
      // WHEN THE TOOL'S OWN PROCESS BEGAN is written with its group, so a runner after one that stopped can tell the
      // group from one given the same number later (theLostGroup). WHICH WAY HOLDS IT is written with them, so that
      // runner stops its scope.
      const itsStart = theProcessAt(groupId, at.reads)
      if (itsStart.here && itsStart.startedAt !== null) held.groupStartedAt = itsStart.startedAt
      held.heldBy = holding.heldBy
      held.howItWasHeld = holding.howItWasHeld
      writeWhole(heldFile, held)
    }, at.stop, at.recoveryMs)
  }
  writeWhole(heldFile, held)
  return (await giveTheAnswer(office, heldFile, /** @type {any} */ (held))) ? 0 : 1
}

/**
 * THE RUNNER THE OFFICE STARTS, for as long as the office runs, to this machine's office only and holding the lock the
 * whole time, so a run by hand or by a timer beside it refuses. `graceMs`, `groupWaitMs`, `pauseMs` and `watchMs` are
 * THE_GRACE_MS, THE_GROUP_WAIT_MS, THE_PAUSE_MS and THE_WATCH_MS unless a test shortens them, and `reads` is this
 * system's process reader unless a test hands in its own.
 * @param {{ api: string, key: string, folder: string, toolsFile: string, officePid: number, graceMs?: number, groupWaitMs?: number, pauseMs?: number, watchMs?: number, reads?: import('../src/config/process-reader.mjs').ProcessReader }} at
 * @returns {Promise<number>} The exit code: 0 when it stopped as asked or with the office, 2 when it refused to start.
 */
export async function runWithTheOffice(at) {
  const notHere = whyTheAddressIsRefused(at.api)
  if (notHere !== null) {
    process.stderr.write(`${notHere}\n`)
    return 2
  }
  const reads = at.reads ?? theProcessReader()
  // THE OFFICE'S PROCESS AS IT IS NOW: when it began and its command line, so a process given its pid later is not it.
  // One whose start cannot be read cannot be told from such a process, so this runner does not start.
  // AN OFFICE ALREADY GONE is refused before the lock, so this runner neither holds the lock nor takes a job for it.
  const theOffice = theProcessAt(at.officePid, reads)
  if (!theOffice.here) {
    process.stderr.write(`${THE_RUNNERS_WORDS.theOfficeIsNotRunning(at.officePid)}\n`)
    return 2
  }
  if (theOffice.startedAt === null) {
    process.stderr.write(`${THE_RUNNERS_WORDS.theOfficesStartCannotBeRead(at.officePid)}\n`)
    return 2
  }
  const theOfficesStart = theOffice.startedAt
  const theOfficesCommandLine = commandLineOf(at.officePid, reads)
  if (theOfficesCommandLine === null) {
    process.stderr.write(`${THE_RUNNERS_WORDS.theOfficeHasNoCommandLine(at.officePid)}\n`)
    return 2
  }
  const lock = theLock(at.folder, reads)
  if ('refused' in lock) {
    process.stderr.write(`${lock.refused}\n`)
    return 2
  }
  const pauseMs = at.pauseMs ?? THE_PAUSE_MS
  const watchMs = at.watchMs ?? THE_WATCH_MS
  const stopping = new AbortController()
  const stop = (/** @type {string} */ why) => {
    if (stopping.signal.aborted) return
    process.stdout.write(`${why}\n`)
    stopping.abort()
  }
  const onTerm = () => stop(THE_RUNNERS_WORDS.askedToStop)
  process.on('SIGTERM', onTerm)
  // THE OFFICE'S PROCESS IS LOOKED FOR EVERY SECOND, or every `watchMs` a test gives, by its pid, when it began and its
  // command line (whetherItStillRuns), so a runner whose office was ended outright stops too, and a process given the
  // office's pid later does not keep it. A start that cannot be read later is not gone, and is said once.
  let saidItCannotTell = false
  const watch = setInterval(() => {
    const office = whetherItStillRuns(at.officePid, theOfficesStart, (line) => line === theOfficesCommandLine, reads)
    if (office === 'gone') stop(THE_RUNNERS_WORDS.theOfficeHasGone(at.officePid))
    else if (office === 'cannot-tell' && !saidItCannotTell) {
      saidItCannotTell = true
      process.stderr.write(`${THE_RUNNERS_WORDS.theOfficesStartCannotBeReadNow(at.officePid)}\n`)
    }
  }, watchMs)
  try {
    process.stdout.write(`${THE_RUNNERS_WORDS.itAsksEvery(pauseMs, at.officePid)}\n`)
    /** @type {string | null} */
    let theLastError = null
    while (!stopping.signal.aborted) {
      let waitMs = pauseMs
      // A ROUND THAT FAILS DOES NOT END THE RUNNER, or every ask would wait until the office starts another. A job it
      // took and left without an answer is answered lost by the next round.
      try {
        await theRunHoldingTheLock({ ...at, reads, stop: stopping.signal, quiet: true })
        theLastError = null
      } catch (error) {
        const said = error instanceof Error ? error.message : String(error)
        const again = said === theLastError
        theLastError = said
        waitMs = again ? THE_PAUSE_AFTER_THE_SAME_ERROR_MS : pauseMs
        process.stderr.write(`${THE_RUNNERS_WORDS.aRoundFailed(said, waitMs, again)}\n`)
      }
      if (stopping.signal.aborted) break
      await new Promise((resolveThePause) => {
        const pause = setTimeout(resolveThePause, waitMs)
        stopping.signal.addEventListener('abort', () => {
          clearTimeout(pause)
          resolveThePause(undefined)
        }, { once: true })
      })
    }
    return 0
  } finally {
    clearInterval(watch)
    process.off('SIGTERM', onTerm)
    lock.release()
  }
}

async function main() {
  const { values } = parseArgs({ options: { once: { type: 'boolean' }, 'with-the-office': { type: 'string' }, api: { type: 'string' } }, strict: true })
  const office = values['with-the-office']
  if ((values.once === true) === (office !== undefined)) refuse(THE_RUNNERS_WORDS.onceOrWithTheOffice)
  const officePid = office === undefined ? null : Number(office)
  if (officePid !== null && !(Number.isInteger(officePid) && officePid > 1)) refuse(THE_RUNNERS_WORDS.notAProcessId(String(office)))
  if (typeof process.getuid === 'function' && process.getuid() === 0) refuse(THE_RUNNERS_WORDS.itDoesNotRunAsRoot)
  const env = bootstrapEnvironment()
  const keysFile = keysPathFrom(env)
  const held = theOfficeKey(env)
  if (held.key === null) refuse(held.says ?? THE_RUNNERS_WORDS.theKeyCannotBeRead)
  const api = whereIsTheApiForACommand(values.api)
  const folder = theRunnersFolder(theHostJobsFolderBeside(keysFile))
  const at = { api, key: held.key, folder, toolsFile: theHostToolsFileBeside(keysFile) }
  process.exitCode = officePid === null ? await runOnce(at) : await runWithTheOffice({ ...at, officePid })
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) await main()
