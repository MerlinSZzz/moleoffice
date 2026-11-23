// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
// @ts-check
/**
 * THE `mole-office` COMMAND: START, ASK ABOUT AND STOP THE MOLE OFFICE SERVICE.
 *
 *   npm run mole-office start      start the service, or find the one already running
 *   npm run mole-office status     say whether it is running, in one sentence per fact
 *   npm run mole-office stop       stop the service the lock names
 *   npm run mole-office restart    stop, then start
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IT IS FOR
 * ---------------------------------------------------------------------------------------
 *
 * Criteria W1, W2(a), W2(c) and W9 of design/window/ACCEPTANCE.md. The service is a process of its
 * own: one command starts it with no window, it keeps running after that command has ended, and it
 * stops only when somebody asks. A second start finds the running service instead of starting
 * another one. The database, the port, the lock and the log all come from src/config/settings.mjs,
 * the one declaration the server reads too, so the command and the server cannot disagree about
 * which database they mean.
 *
 * ---------------------------------------------------------------------------------------
 * HOW IT STARTS THE SERVER
 * ---------------------------------------------------------------------------------------
 *
 * `node --import tsx src/server/index.ts`, with NODE_ENV=production so the server serves the built
 * page itself, as tools/serve-dev.mjs starts it. DETACHED, in a process group of its own, with its
 * output going to the service log beside the lock. WITHOUT `--stop-with-pid`: that flag ties a
 * server's life to the process that started it, and this server must outlive this command (W1).
 *
 * The server takes the service lock itself (src/config/the-service-lock.mjs), so a start this
 * command did not foresee is still refused by the server, and this command prints what it said.
 *
 * ---------------------------------------------------------------------------------------
 * IT STARTS THE TERMINAL HOLDER TOO, AND `stop` ENDS IT
 * ---------------------------------------------------------------------------------------
 *
 * `start` first makes sure the terminal holder (src/holder/index.mjs, src/config/the-terminal-holder.mjs)
 * runs for this database, then starts the server, so the server finds the holder when it starts. The
 * holder is started detached, in a process group of its own, WITHOUT `--stop-with-pid`, like the
 * server. A holder that is already running is left as it is. A holder that cannot be started does not
 * stop the server from starting; the command says why, and the server's terminal doors say that no
 * holder runs.
 *
 * `stop` ends the holder too, after the server has stopped, because a person who stops the office
 * expects nothing of it left running. It asks the process group the server recorded for the holder in
 * the process ledger, and only when the holder's answer, the ledger row and the running process agree
 * (endTheTerminalHolder below). The holder tells its terminals to end before it closes. `restart`
 * stops the server only: the holder keeps running, with every terminal in it, so the server's restart
 * press does not end the person's terminals. The stable upgrade stops only the groups it recorded, and
 * so it keeps the holder (tools/stable/stable-upgrade-processes.mjs). The process ledger's door stops
 * the holder too. On Windows `stop` first asks the holder on its group's stop pipe and waits for it to end, and then
 * ends the holder's Job Object, which ends whatever was left in it (endTheHoldersJobObject below).
 *
 * A STOP WITH NO SERVICE LOCK ENDS A HOLDER TOO, when nothing answers for this database. A server ended by a signal
 * from elsewhere lets its lock go and keeps its holder, and a start whose server did not start leaves one. The stop
 * ends it by the same readings, and says what it ended. A holder it cannot prove is this database's is left, and the
 * stop exits HOLDER_NOT_STOPPED, as a stop with a lock does then.
 *
 * A START ENDS THE HOLDER IT STARTED WHEN THE OFFICE WAITS FOR ITS UPDATE. A waiting office writes nothing, so its
 * process ledger has no row for the holder, and a stop could not end it. The start ends it by the stop's readings, with
 * what it read of the holder when it started it in place of the row. The server starts the holder after the owner's
 * press (endTheHolderWhileTheUpdateWaits below).
 *
 * ---------------------------------------------------------------------------------------
 * HOW IT STOPS THE SERVER
 * ---------------------------------------------------------------------------------------
 *
 * Only a service the lock names, that answers at the lock's port for this database, and that leads
 * its own process group. It asks that group to stop through the system layer, which sends SIGTERM to the whole group
 * on Linux and the Mac (chapter 2 of the office regulations: stop a process only by the group id you recorded; the
 * lock is where it was recorded). It never sends
 * SIGKILL. A server started some other way, by `npm start` in a terminal for example, is in its
 * terminal's group, and signalling that group would reach whatever else is in it, so this refuses.
 *
 * ON WINDOWS THE ASK IS A STOP REQUEST ON THE GROUP'S PIPE, and the office makes that pipe last in its start, after it
 * has begun to answer on its port. An ask that finds no pipe is sent again, every STOP_PIPE_ASK_EVERY_MS, until
 * STOP_PIPE_WAIT_MS has passed, and the command says how many tries it took. The times of a Windows 11 run in round
 * W18 point to this: the uninstaller ran this command about a second after a restarted office had begun to answer,
 * before the pipe's helper usually listens, and the refusal was thrown with no sentence of the command's own. Every
 * other refusal, on every system, is said at once, nothing more is sent, and the command ends with exit code 1.
 *
 * WHEN THE LOCK NAMES THE PROCESS THAT STARTED THE SERVER, that process is stopped instead, by its
 * group, because stopping the server alone would let it start the server again. The lock records the
 * starter only when the server was given `--stop-with-pid`; the record was read at lock time, so it
 * carries the starter's process group and start time. Before anything is signalled, four things are
 * checked: the starter still runs with the recorded start time; its command line is
 * `tools/serve-dev.mjs` under node; its group is the recorded one; and every member of that group is
 * the starter, one of the processes it started, or the one gate process that started it (the
 * bootstrap and the upgrade start serve-dev through such a gate, which leads the group and exits when
 * serve-dev does). Anything else in the group, or any failed check, refuses with nothing signalled.
 *
 * HOW IT STARTS AGAIN. `restart` reads the shape from the lock before it stops anything: a readable
 * starter record means a serve-dev office, and it starts `node tools/serve-dev.mjs --built --prepared`
 * in the checkout the lock named, detached, in a group of its own, with explicit MOLE_OFFICE_DB and
 * MOLE_OFFICE_PORT. In this round that checkout must be the one this command runs from: another
 * checkout's settings are not this command's to read, so it refuses before stopping anything. A lock
 * with no starter record means an office this command started alone, and it is started as before.
 *
 * IT IS PLAIN JAVASCRIPT, run by `node`, so it works without tsx. It lives in src/config with the other
 * plain-JavaScript modules that more than one program reads, because every folder under src/ is on one
 * of the freshness lists in src/config/newest-source.mjs, and this command is no program's code but
 * its own. It does not install anything.
 */

import { spawn } from 'node:child_process'
import { homedir } from 'node:os'
import { createRequire } from 'node:module'
import { closeSync, mkdirSync, openSync, readSync, realpathSync, statSync, writeFileSync, writeSync } from 'node:fs'
import { basename, dirname, resolve } from 'node:path'
import { ENV_FILE, REPO_ROOT, SHUTDOWN_LIMIT_MS, STARTED_BY_THE_SERVICE_COMMAND, THE_COMMAND_ENTRY, THE_INSTALL, canonicalDatabasePath, howToStart, isTheProgramRun, pairingWords, readSettingHere, serviceLockPathFrom, settings, theDatabaseTheStableCheckoutNames, theInstallsNode, theInstallsNodeInALine, theStableCheckoutNamedIn } from './settings.mjs'
import { spoolAGateMet } from './gate-count-spool.mjs'
import { whyAnUpgradeKeepsTheOfficeClosed } from './the-upgrade-mark.mjs'
import {
  chooseTheDataFolder,
  moveTheDataFolder,
  theChosenByWords,
  theDataFolderWasChosenWords,
  theMoveDidNotFinishWords,
  theMoveMarkPath,
  theServiceStartFailedWords,
  theServiceStopFailedWords,
  theStopAndStartOfAMove,
  whereTheDataIs,
  whyADataFolderMoveKeepsTheOfficeClosed,
} from './the-data-folder-move.mjs'
import { whyAStartMayNotMakeTheDatabase } from './may-a-start-make-the-database.mjs'
import { settingsFolder } from './systems/the-settings-folder-removal.mjs'
import { THE_BUILT_PAGE, missingWebBuild } from './the-built-page.mjs'
import { theOfficeToolEnvironment } from './the-office-tool-environment.mjs'
import { theAnswerInWords, theWorldTheDeclarationNames, whatAnswersForThisOffice } from './the-self-check.mjs'
import { readTheServiceLock, theProcessReading, whoHoldsTheLock } from './the-service-lock.mjs'
import { STAND_IN_HEADER } from './stand-in-header.mjs'
import { theProcessReader, theRowIsAboutThisProcess } from './process-reader.mjs'
import { commandLineOf, parentOf, theProcessAt } from './session-process.mjs'
import { howAPathMeets, theStableCheckoutFolder } from './sandbox-folder.mjs'
import { THE_TEST_MARK, THE_TEST_RUN_FLAG, carriesTheTestMark, theProcessNumberIn } from './the-test-mark.mjs'
import { theSystemFor, thisSystem } from './systems/the-system.mjs'
import { readTheGroupItsParentNames, A_STOP_REQUEST_IS_ANSWERED_WITHIN_MS } from './systems/windows-groups.mjs'
import { localStampOf } from './stopped-run-cause.mjs'
import { HOLDER_START_WAIT_MS, NO_HOLDER_LISTENS_ON_A_PATH_THIS_LONG, askTheHolder, startATerminalHolder, theTerminalHolderFolder, theTerminalHolderLog, theTerminalHolderSocket } from './the-terminal-holder.mjs'
import { THE_TERMINAL_HOLDER } from './own-rows.mjs'
import { watchForTheLoginService } from './the-login-watch.mjs'

/**
 * HOW EACH ANSWER ENDS, AS AN EXIT CODE. One code per state, so a script can act on the code alone.
 */
export const EXIT = Object.freeze({
  /** start: the service answers. status: running and answering. stop: it stopped, or found nothing of it running. */
  OK: 0,
  /** start or stop did not do what it was asked; the sentence before says why. */
  FAILED: 1,
  /** No subcommand, or one this command does not know. */
  USAGE: 2,
  /** No lock, and nothing answers for this database. */
  NOT_RUNNING: 3,
  /**
   * The lock names a process that has ended, or a number now given to another process. `stop` exits it only when this
   * office answers on the lock's port, or when a restart keeps the holder.
   */
  STALE: 4,
  /** The lock's process is running, but nothing answers for this database at its port. */
  NOT_ANSWERING: 5,
  /** No lock, but a server answers for this database at the port. */
  ANSWERING_WITHOUT_A_LOCK: 6,
  /** The lock cannot be read, or its process's start time cannot be. */
  CANNOT_TELL: 7,
  /** stop: the service does not lead its own process group, or on Windows does not run in the group its lock names. */
  NOT_ITS_OWN_GROUP: 8,
  /** stop: the process that started the service cannot be stopped safely. */
  STARTER_UNSUITABLE: 9,
  /** restart: the service was started from another checkout, which this command will not start again. */
  NOT_THIS_CHECKOUT: 10,
  /** start: a serve-dev stand-in holds the office's port, so no second supervisor was started. */
  STAND_IN_HOLDS_THE_PORT: 11,
  /**
   * stop: no server runs for this database after it, but the terminal holder was not ended. What answers on the
   * holder's socket could not be proved to be this database's holder, or the holder outlived the wait; the sentence
   * before says which. The Windows installer goes on after it, as after NOT_RUNNING, and ends the holder by its path.
   */
  HOLDER_NOT_STOPPED: 12,
})

/** How long `start` waits for the server to answer before it says so and leaves it running. */
export const START_WAIT_MS = 90_000

/** How long `stop` waits: the server's own shutdown limit, and five seconds for its process to end. */
export const STOP_WAIT_MS = SHUTDOWN_LIMIT_MS + 5_000

/**
 * How long `stop` on Windows asks again while the office's stop pipe is not there, and how often. The helper that
 * makes the pipe took 0.9 seconds to listen on the Windows 11 machine; the wait is long enough for a slow start.
 */
export const STOP_PIPE_WAIT_MS = 15_000
const STOP_PIPE_ASK_EVERY_MS = 250

/** How long one question to the port may take. */
const ONE_QUESTION_MS = 3_000

/** How long `start` waits for a terminal holder it started to answer: declared once, in src/config/the-terminal-holder.mjs. */
export { HOLDER_START_WAIT_MS }

/**
 * How long `stop` waits for the terminal holder to end once its group was asked. The holder tells its terminals to end,
 * waits three seconds for them (STOP_WAIT_MS in src/holder/index.mjs) and closes; this is that and seven seconds more.
 */
export const HOLDER_STOP_WAIT_MS = 10_000

/**
 * The longest `stop` takes to end the terminal holder. On Windows it asks the holder on its group's pipe first, waits
 * for it, ends the group's Job Object, and waits again. On Linux and the Mac it waits once, so this is more than it needs.
 */
export const THE_HOLDER_ENDS_WITHIN_MS = A_STOP_REQUEST_IS_ANSWERED_WITHIN_MS + 2 * HOLDER_STOP_WAIT_MS

/**
 * WHAT `stop` SAYS WHEN IT ENDED THE TERMINAL HOLDER, in one sentence.
 *
 * @param {number} pid
 * @param {number} group
 */
export function theHolderWasStoppedWords(pid, group) {
  return `The terminal holder, process ${String(pid)}, was stopped too, by the process group ${String(group)} that the office's process ledger recorded for it, and its terminals were told to end.`
}

/** What `stop` says when no terminal holder answers for this database. */
export const NO_HOLDER_RUNS = 'No terminal holder runs for this database, so none was stopped.'

/** What `start` says before it ends the terminal holder it started, because the office waits for its update. */
export const THE_UPDATE_WAITS_SO_THE_HOLDER_ENDS =
  "This start ends the terminal holder it started, because Mole Office waits for its owner's press to back up and " +
  'update. The server starts the holder after that press.'

/** What `restart` says of the terminal holder, which it keeps. */
export const A_RESTART_KEEPS_THE_HOLDER = 'The restart keeps the terminal holder: its terminals keep running.'

/** What `stop` adds when it leaves the terminal holder running. */
export const THE_HOLDER_WAS_NOT_STOPPED = 'The terminal holder was not stopped, and its terminals keep running.'

/** What `stop` says when it stopped nothing. */
export const NOTHING_WAS_STOPPED = 'Nothing was stopped.'

/**
 * The words a terminal holder is said to have no recorded group in, with the reason it has none.
 * @param {number} pid
 * @param {string} why
 * @returns {string}
 */
export function theHolderHasNoRecordedGroupWords(pid, why) {
  return `The terminal holder, process ${String(pid)}, has no recorded group to ask: ${why}`
}

/** Why a terminal holder has no group to ask for: its row in the office's process ledger carries no process group. */
export const THE_HOLDERS_ROW_CARRIES_NO_GROUP = 'its row in the office\'s process ledger carries no process group.'

/**
 * The words the shutdown door's way out warns in when it left the terminal holder running.
 * @param {string} why
 * @returns {string}
 */
export function theShutDownLeftTheHolderWords(why) {
  return `shutdown: finished, but the terminal holder is still running. ${why}`
}

/**
 * What `stop` says when there is no service lock to stop.
 *
 * @param {string} lockPath
 */
export function theNoServiceLockToStopWords(lockPath) {
  return `There is no service lock at ${lockPath}, so there is no service to stop.`
}

/**
 * What `stop` says when the terminal holder had ended before it was asked to stop.
 *
 * @param {number} pid
 */
export function theHolderEndedByItselfWords(pid) {
  return `The terminal holder, process ${String(pid)}, ended by itself before it was asked to stop.`
}

/**
 * What `stop` says when it has ended the terminal holder on Windows, with the Job Object it runs in. The holder was
 * asked first, and either did not hear the ask or was still running after the wait.
 *
 * @param {number} pid
 * @param {number} group
 */
export function theHoldersJobObjectWasEndedWords(pid, group) {
  return (
    `The terminal holder, process ${String(pid)}, was ended too, with every process in group ${String(group)}, ` +
    'the Job Object its starter made. A terminal that ran in that Job Object ended with it.'
  )
}

/**
 * What `stop` says on Windows when the Job Object the terminal holder runs in could not be ended.
 *
 * @param {number} group
 * @param {string} why
 */
export function theHoldersJobObjectCouldNotBeEndedWords(group, why) {
  return `Group ${String(group)}, the Job Object the terminal holder runs in, could not be ended: ${why}`
}

/**
 * What `stop` says on Windows when the terminal holder answered the ask and had not ended when the wait was over.
 *
 * @param {number} pid
 */
export function theHolderWasStillRunningWords(pid) {
  return (
    `The terminal holder, process ${String(pid)}, answered that it was stopping, and it was still running ` +
    `${String(HOLDER_STOP_WAIT_MS / 1000)} seconds later.`
  )
}

/**
 * The opening of every sentence `stop` says when the terminal holder ended within the wait after it was asked.
 *
 * @param {number} pid
 */
export function theHolderStoppedWhenAskedWords(pid) {
  return (
    `The terminal holder, process ${String(pid)}, stopped when it was asked on its group's stop pipe, after it told its ` +
    'terminals to end.'
  )
}

/**
 * What `stop` says when the terminal holder stopped when it was asked, and its group was empty afterwards.
 *
 * @param {number} pid
 * @param {number} group
 */
export function theHolderStoppedWhenAskedAndNothingWasLeftWords(pid, group) {
  return `${theHolderStoppedWhenAskedWords(pid)} Nothing was left running in group ${String(group)}, the Job Object its starter made.`
}

/**
 * What `stop` says when the terminal holder stopped when it was asked, and what was left in its group was ended.
 *
 * @param {number} pid
 * @param {number} group
 */
export function theHolderStoppedWhenAskedAndEveryProcessWasEndedWords(pid, group) {
  return (
    `${theHolderStoppedWhenAskedWords(pid)} Every process left in group ${String(group)}, the Job Object its starter ` +
    'made, was ended after it.'
  )
}

/**
 * What `stop` says on Windows when it cannot tell whether the server runs in the group the service lock names.
 *
 * @param {number} pid
 * @param {number} group
 * @param {string} why
 */
export function theLocksGroupCannotBeToldWords(pid, group, why) {
  return (
    `Process ${String(pid)} serves this database, but whether it runs in group ${String(group)}, which ` +
    `the service lock names, cannot be told: ${why}`
  )
}

/**
 * What `stop` says on Windows when the server does not run in the group the service lock names.
 *
 * @param {number} pid
 * @param {number} group
 * @param {string} why
 */
export function theServerIsNotInTheLocksGroupWords(pid, group, why) {
  return (
    `Process ${String(pid)} serves this database, but it does not run in group ${String(group)}, which ` +
    `the service lock names: ${why}. So it was not started by mole-office start.`
  )
}

/**
 * What `stop` says on Windows when the server is not in the group the service lock names. Asking that group to stop
 * could reach another program, so the server has to be stopped the way it was started.
 */
export const ASKING_THAT_GROUP_COULD_REACH_ANOTHER_PROGRAM =
  'Asking that group to stop could reach another program. Stop it the way it was started.'

/**
 * What `stop` says on Windows after it has asked the group to stop, with a stop request on its pipe.
 *
 * @param {number} group
 */
export function theGroupWasAskedToStopWords(group) {
  return `Asked group ${String(group)} to stop, with a stop request on its pipe.`
}

/**
 * What `stop` says when the server has ended and the service lock is gone.
 *
 * @param {number} pid
 */
export function theServerStoppedWords(pid) {
  return `Mole Office stopped: process ${String(pid)} has ended, and the service lock is gone.`
}

const sleep = (/** @type {number} */ ms) => new Promise((done) => setTimeout(done, ms))

/** @param {string} line */
const say = (line) => {
  process.stdout.write(`${line}\n`)
}

/**
 * What the declaration names, read once per command.
 */
function theService() {
  const s = settings()
  return {
    databasePath: s.databasePath,
    port: s.apiPort,
    lockPath: s.serviceLockPath,
    logPath: s.serviceLogPath,
  }
}

/**
 * ASK A PORT WHAT ANSWERS FOR THIS OFFICE, through the one self-check in src/config/the-self-check.mjs.
 *
 * The office expected is the one this checkout declares, at the port asked: a lock records the port
 * its server took, and that is the port it must answer on. `ours` is true when that office answers,
 * healthy or not; `found` is the self-check's whole answer, which the sentences below are made from.
 *
 * @param {number} port
 * @returns {Promise<{ ours: boolean, found: import('./the-self-check.mjs').WhatAnswers }>}
 */
async function askThePort(port) {
  const found = await whatAnswersForThisOffice({
    address: `http://127.0.0.1:${String(port)}`,
    expected: { ...theWorldTheDeclarationNames(), port: String(port) },
    asks: 1,
    waitMs: ONE_QUESTION_MS,
  })
  return { ours: found.answer === 'healthy' || found.answer === 'unhealthy', found }
}

/**
 * WHERE THINGS STAND: the lock, its process and the port, read together.
 *
 * @param {ReturnType<typeof theService>} service
 */
async function whereThingsStand(service) {
  const read = readTheServiceLock(service.lockPath)
  if (read.state === 'absent') {
    return { lock: /** @type {const} */ ('absent'), answer: await askThePort(service.port) }
  }
  if (read.state === 'unreadable') return { lock: /** @type {const} */ ('unreadable'), why: read.why }
  const holder = whoHoldsTheLock(read.lock, theProcessReading)
  if (holder.state === 'held') {
    return { lock: /** @type {const} */ ('held'), held: read.lock, answer: await askThePort(read.lock.port) }
  }
  if (holder.state === 'cannot-tell') return { lock: /** @type {const} */ ('cannot-tell'), held: read.lock }
  return {
    lock: /** @type {const} */ ('stale'),
    held: read.lock,
    how: holder,
    answer: await askThePort(read.lock.port),
  }
}

/**
 * What answered at a port, in the self-check's own words.
 *
 * @param {Awaited<ReturnType<typeof askThePort>>} answer
 */
function thePortSays(answer) {
  return theAnswerInWords(answer.found).join('\n')
}

/**
 * One sentence about a stale lock, for each of the two ways a lock goes stale.
 *
 * @param {string} lockPath
 * @param {number} pid
 * @param {'gone' | 'reused'} how
 */
export function theLockIsStale(lockPath, pid, how) {
  return how === 'gone'
    ? `The service lock ${lockPath} names process ${String(pid)}, which has ended, so the lock is stale.`
    : `The service lock ${lockPath} names process ${String(pid)}, and that number now belongs to a different process, so the lock is stale.`
}

/** @param {ReturnType<typeof theService>} service */
async function status(service) {
  const stand = await whereThingsStand(service)
  if (stand.lock === 'unreadable') {
    say(`The service lock ${service.lockPath} is there, but it could not be read: ${stand.why}.`)
    say('So it cannot be told whether Mole Office is running for this database.')
    return EXIT.CANNOT_TELL
  }
  if (stand.lock === 'cannot-tell') {
    say(`The service lock ${service.lockPath} names process ${String(stand.held.pid)}, and a process with that number is running.`)
    say('Its start time could not be read, so it cannot be told whether it is the server that took the lock.')
    return EXIT.CANNOT_TELL
  }
  if (stand.lock === 'absent') {
    say(`There is no service lock at ${service.lockPath}.`)
    say(thePortSays(stand.answer))
    if (stand.answer.ours) {
      say('That server holds no service lock, so it was not started by this version of Mole Office.')
      return EXIT.ANSWERING_WITHOUT_A_LOCK
    }
    say(`Mole Office is not running for the database ${service.databasePath}.`)
    return EXIT.NOT_RUNNING
  }
  if (stand.lock === 'stale') {
    say(theLockIsStale(service.lockPath, stand.held.pid, stand.how.state))
    say(thePortSays(stand.answer))
    say('The next start takes the stale lock over.')
    return EXIT.STALE
  }
  const held = stand.held
  if (!stand.answer.ours) {
    say(`The service lock ${service.lockPath} names process ${String(held.pid)}, which is running.`)
    say(thePortSays(stand.answer))
    if (stand.answer.found.answer === 'not-answering') say('It may still be starting, or it may be stuck.')
    return EXIT.NOT_ANSWERING
  }
  say(
    `Mole Office is running: process ${String(held.pid)} serves the database ${service.databasePath} on ` +
      `http://127.0.0.1:${String(held.port)}, since ${held.processStartedAt}.`,
  )
  say(thePortSays(stand.answer))
  return EXIT.OK
}

/**
 * The output a log file gained after `from`, its last 40 lines.
 *
 * @param {string} logPath
 * @param {number} from
 */
function theLogSince(logPath, from) {
  const size = statSync(logPath).size
  const length = Math.max(0, size - from)
  const buffer = Buffer.alloc(length)
  const fd = openSync(logPath, 'r')
  try {
    readSync(fd, buffer, 0, length, from)
  } finally {
    closeSync(fd)
  }
  const lines = buffer.toString('utf8').split('\n').filter((line) => line.trim() !== '')
  return lines.slice(-40)
}

/**
 * MAKE SURE THE TERMINAL HOLDER RUNS FOR THIS DATABASE, and say in one or two lines what was found or
 * done. It never fails the start: the office serves without terminals, and says so.
 *
 * @param {ReturnType<typeof theService>} service
 */
export async function startTheHolder(service) {
  await startTheHolderAndReadIt(service)
}

/**
 * WHAT A START READ OF THE TERMINAL HOLDER IT STARTED: its number, its group and its start, read once the holder
 * answered. `start` keeps it, and ends that holder by it when the office waits for its update.
 *
 * @typedef {{ pid: number, pgid: number, osStartedAt: string }} TheHolderThisStartStarted
 */

/**
 * What startTheHolder does, answering what this start read of a holder it started, or the reason that holder could not
 * be read. It answers undefined when this start started no holder.
 *
 * @param {ReturnType<typeof theService>} service
 * @param {string[]} [tie] the arguments that tie the holder to the test run (theTieToTheTestRun), none unless `start`
 *   hands them on
 * @returns {Promise<TheHolderThisStartStarted | { pid: number, why: string } | undefined>}
 */
async function startTheHolderAndReadIt(service, tie = []) {
  /**
   * SAY WHY NO HOLDER STARTED, here and in the holder's own log, whose last line the office shows the
   * person on the terminal pages and in the self-check. The log is written only when it can be; when it
   * cannot (its folder cannot be made), the line printed here is the only one, and it says so.
   *
   * @param {string} sentence
   */
  const noHolder = (sentence) => {
    try {
      mkdirSync(theTerminalHolderFolder(), { recursive: true, mode: 0o700 })
      writeFileSync(theTerminalHolderLog(service.databasePath), `${localStampOf(new Date())} the service command: ${sentence}\n`, { flag: 'a', mode: 0o600 })
      say(sentence)
    } catch (err) {
      say(`${sentence} (This could not be written to the holder's log either: ${err instanceof Error ? err.message : String(err)}.)`)
    }
  }
  /**
   * A PAIRED DEVELOPMENT CHECKOUT STARTS NO HOLDER. The holder serves the database the stable office
   * serves, and the stable server's own start starts it. This checkout can read the stored choice, so
   * the skip rests on the pairing itself, and the reason goes into the holder's log the same way every
   * other no-holder sentence does. The stable checkout reads this same pairing, and names itself in it.
   */
  const stable = theStableCheckoutThisCheckoutPairsWith()
  if (stable !== null && stable !== realpathOf(REPO_ROOT)) {
    noHolder(`No terminal holder was started from this checkout, because it pairs with the stable checkout at ${stable}. The stable office's own start starts its holder.`)
    return
  }
  /** A READING THAT WAS NOT TAKEN IS NEITHER ON NOR OFF: SQLite could not read the database, and the reading says why. */
  const holderChoice = readSettingHere('MOLE_OFFICE_TERMINAL_HOLDER')
  if (holderChoice.source === 'not read') {
    noHolder(`MOLE_OFFICE_TERMINAL_HOLDER was not read, so no holder was started. ${holderChoice.why ?? ''}`.trim())
    return
  }
  if (holderChoice.value === 'off') {
    say('The terminal holder was not started, because MOLE_OFFICE_TERMINAL_HOLDER is off. The office cannot open a terminal.')
    return
  }
  /** @type {{ command: string, args: string[], environment: Record<string, string> }} */
  let how
  try {
    const holder = howToStart('holder')
    how = { ...holder, args: [...holder.args, ...tie] }
  } catch (err) {
    noHolder(`${err instanceof Error ? err.message : String(err)} No terminal holder was started.`)
    return
  }
  /** @type {string} */
  let socketPath
  try {
    socketPath = theTerminalHolderSocket(service.databasePath)
  } catch (err) {
    say(`${err instanceof Error ? err.message : String(err)} No terminal holder was started.`)
    return
  }
  // THE HOLDER IS STARTED ONE WAY, by startATerminalHolder in src/config/the-terminal-holder.mjs, which the server's start
  // press asks too. What each outcome means is said here, in the command's own sentences.
  void socketPath
  const started = await startATerminalHolder({ databasePath: service.databasePath, how, cwd: REPO_ROOT, waitMs: HOLDER_START_WAIT_MS })
  if (started.outcome === 'already') say(`The terminal holder is already running: process ${String(started.pid)}. It was left as it is.`)
  else if (started.outcome === 'another') say(`Something answers on the terminal holder's socket ${socketPath}, but not as the holder of this database, so no holder was started.`)
  else if (started.outcome === 'another-copy') {
    say(`${started.why} It was not used, and no holder was started, because it holds the socket ${socketPath}. It was left running with its terminals, and no terminal opens until it ends.`)
  }
  else if (started.outcome === 'could-not-spawn') noHolder(`The terminal holder could not be started: ${started.why}. No terminal holder was started.`)
  else if (started.outcome === 'started' && started.group !== started.pid) {
    // ON WINDOWS the process started is the system layer's starter, which holds the holder in a Job Object named after it.
    say(`The terminal holder is process ${String(started.pid)}: process ${String(started.group)} starts it in group ${String(started.group)}, a Job Object of its own. It keeps running when the server stops.`)
  } else if (started.outcome === 'started') say(`The terminal holder is process ${String(started.pid)}, in process group ${String(started.pid)}. It keeps running when the server restarts, and the stop command ends it.`)
  else if (started.outcome === 'ended') noHolder(`The terminal holder did not start: ${started.why}. Its log is ${started.logPath}.`)
  else if (started.outcome === 'unknown') {
    say(`A terminal holder, process ${String(started.pid)}, answers for this database, and Windows could not say whether the Job Object of group ${String(started.group)}, which this start made, holds it: ${started.why} It was left running; its log is ${started.logPath}.`)
  } else say(`The terminal holder, process ${String(started.pid)}, did not answer within ${String(HOLDER_START_WAIT_MS / 1000)} seconds. It was left running; its log is ${started.logPath}.`)
  if (started.outcome === 'started') return readTheHolderThisStartStarted(started.pid, started.group)
  return undefined
}

/**
 * READ THE TERMINAL HOLDER THIS START STARTED, as endTheTerminalHolder reads a holder, so that the two readings can be
 * compared. On Linux and the Mac that is theProcessAt, and on Windows the system layer's reader.
 * A holder that could not be read gives the reason instead.
 *
 * @param {number} pid
 * @param {number} group the group startATerminalHolder named: the holder's own on Linux and the Mac, and its starter's
 *   Job Object on Windows
 * @returns {Promise<TheHolderThisStartStarted | { pid: number, why: string }>}
 */
async function readTheHolderThisStartStarted(pid, group) {
  const cannotBeRead = (/** @type {string} */ why) => ({
    pid,
    why: `The terminal holder this start started, process ${String(pid)}, could not be read once it answered: ${why}`,
  })
  const system = thisSystem()
  if (system.groups.jobObjects !== null) {
    const reader = system.processes
    const at = reader.readProcessAt === undefined ? reader.processAt(pid) : await reader.readProcessAt(pid)
    if (!at.here) return cannotBeRead('it had ended.')
    if (at.unreadable !== undefined) return cannotBeRead(at.unreadable)
    return { pid, pgid: group, osStartedAt: localStampOf(at.startedAt) }
  }
  const at = theProcessAt(pid)
  if (!at.here) return cannotBeRead('it had ended.')
  if (at.startedAt === null || at.pgid === null) return cannotBeRead('its start or its group could not be read.')
  return { pid, pgid: at.pgid, osStartedAt: localStampOf(new Date(at.startedAt)) }
}

/** The checkout a path really is, or null when that cannot be read.
 *
 * @param {string} path
 * @returns {string | null}
 */
function realpathOf(path) {
  try {
    return realpathSync(path)
  } catch {
    return null
  }
}

/** The supervisor's script, as every start names it: relative to the checkout it starts in. */
const SERVE_DEV = 'tools/serve-dev.mjs'

/**
 * THE WORDS OF A COMMAND LINE, AND WHETHER ITS PROGRAM IS NODE.
 *
 * The line is the process's arguments joined with single spaces, and on macOS it is ps's command column, which
 * has no argument boundaries at all. So it is read as words, and a path with a space in it is two words. The
 * program is node when it is this process's own executable or a file whose base name is exactly `node`.
 *
 * In a Linux bundle this process's own executable is the app's own program, which the window runs on too, so a window's
 * line is under node by this reading. It is still never taken for the supervisor, because the second word of a window's
 * line is never tools/serve-dev.mjs (`namesTheServeDevUnderNode` below).
 *
 * @param {string} commandLine
 * @returns {{ words: string[], underNode: boolean }}
 */
function theWordsUnderNode(commandLine) {
  const words = commandLine.split(' ').filter((word) => word !== '')
  const program = words[0] ?? ''
  return { words, underNode: program === process.execPath || basename(program) === 'node' }
}

/**
 * Whether a command line is node running tools/serve-dev.mjs: the script is the second word, relative as every
 * start names it, or as a full path, which the office's restart wrote before wave 13q.
 *
 * A node path or a checkout path with a space in it splits, so that line is refused, and the stop says so and
 * signals nothing.
 *
 * @param {string} commandLine
 * @returns {boolean}
 */
export function namesTheServeDevUnderNode(commandLine) {
  const { words, underNode } = theWordsUnderNode(commandLine)
  const script = words[1] ?? ''
  return underNode && (script === SERVE_DEV || script.endsWith(`/${SERVE_DEV}`))
}

/**
 * Why the stop will not take a command line as the starter, or null when it is serve-dev under node. The line is
 * given as it was read, so the reason names the program the stop saw.
 *
 * @param {string} commandLine
 * @returns {string | null}
 */
export function whyTheStarterIsNotServeDev(commandLine) {
  if (namesTheServeDevUnderNode(commandLine)) return null
  return `its command line is not node running ${SERVE_DEV} (it is: ${commandLine.slice(0, 120)})`
}

/**
 * Whether a command line is the gate through which the bootstrap and the upgrade start serve-dev:
 * `node -e <program> <command> ["tools/serve-dev.mjs", …]`. The program text has spaces of its own, so only the
 * second word and the last one are read.
 *
 * @param {string} commandLine
 * @returns {boolean}
 */
export function namesTheGateThatStartsServeDev(commandLine) {
  const { words, underNode } = theWordsUnderNode(commandLine)
  if (!underNode || words[1] !== '-e') return false
  let list
  try {
    list = JSON.parse(words[words.length - 1] ?? '')
  } catch {
    return false
  }
  return Array.isArray(list) && list[0] === SERVE_DEV
}

/**
 * EVERY PROCESS IN ONE PROCESS GROUP, as this command reads the process table.
 *
 * Null when the table, or one process's own record in it, cannot be read: then nothing can be said
 * about the group, and the caller refuses rather than signalling into the dark.
 *
 * @param {number} pgid
 * @returns {number[] | null}
 */
function theMembersOfTheGroup(pgid) {
  let every
  try {
    every = theProcessReader().everyCommandLine()
  } catch {
    return null
  }
  if (every === null) return null
  const members = []
  for (const { pid } of every) {
    let at
    try {
      at = theProcessAt(pid)
    } catch {
      return null
    }
    if (at.here && at.pgid === pgid) members.push(pid)
  }
  return members
}

/** Whether a process is the starter itself, or one of the processes the starter began.
 *
 * @param {number} pid
 * @param {number} starterPid
 * @returns {boolean}
 */
function theStarterOrOneItStarted(pid, starterPid) {
  let at = pid
  for (let step = 0; step < 64; step += 1) {
    if (at === starterPid) return true
    if (at <= 1) return false
    const parent = parentOf(at)
    if (parent === null || parent <= 0 || parent === at) return false
    at = parent
  }
  return false
}

/**
 * THE GATE THAT STARTED THIS STARTER AND LEADS ITS GROUP, or null.
 *
 * The bootstrap and the upgrade start serve-dev through a gate: a `node -e <program> <command> <args>`
 * process whose whole job is to start serve-dev and wait for it, detached so that it leads the group.
 * It is part of starting this office and it exits when serve-dev exits, so signalling the group
 * reaches nothing this office does not own. It is accepted only in that shape: the starter's parent,
 * the group leader, and node started with `-e` whose last argument is the list that starts tools/serve-dev.mjs.
 *
 * @param {number} starterPid
 * @param {number} pgid
 * @returns {number | null}
 */
function theGateThatStartedTheStarter(starterPid, pgid) {
  if (pgid === starterPid) return null
  if (parentOf(starterPid) !== pgid) return null
  const command = commandLineOf(pgid)
  if (command === null) return null
  return namesTheGateThatStartsServeDev(command) ? pgid : null
}

/**
 * WHAT THE LOCK SAYS ABOUT THE PROCESS THAT STARTED ITS SERVER, and whether its group can be signalled.
 *
 * `no-starter` and `gone` leave today's stop in charge: the server's own group is signalled, or the
 * refusal that says it does not lead one. `unsuitable` refuses with the reason and signals nothing.
 * `can-be-stopped` means every condition held at this moment: it runs with the recorded start time,
 * its command line is serve-dev under node, its group is the recorded pgid, and every member of that
 * group is the starter, one of the processes it began, or the gate that started it.
 *
 * @param {import('./the-service-lock.mjs').ServiceLock} held
 * @returns {{ state: 'no-starter' } | { state: 'gone' } | { state: 'unsuitable', why: string }
 *   | { state: 'can-be-stopped', pid: number, pgid: number, processStartedAt: string }}
 */
function theStarterTheLockNames(held) {
  const starter = held.starter
  if (starter === undefined) return { state: 'no-starter' }
  const now = theProcessAt(starter.pid)
  if (!now.here) return { state: 'gone' }
  if ('unread' in starter) {
    return {
      state: 'unsuitable',
      why:
        `the lock was taken when it could not be read (${starter.unread}), so the lock records no start ` +
        'time to tell it apart from a later process under the same number',
    }
  }
  if (now.startedAt === null) return { state: 'unsuitable', why: 'its start time cannot be read now' }
  if (now.startedAt !== starter.processStartedAt) {
    return {
      state: 'unsuitable',
      why: `a process with that number began at ${now.startedAt}, and the lock recorded ${starter.processStartedAt}`,
    }
  }
  if (now.pgid === null) return { state: 'unsuitable', why: 'its process group cannot be read now' }
  if (now.pgid !== starter.pgid) {
    return { state: 'unsuitable', why: `its process group is ${String(now.pgid)}, and the lock recorded ${String(starter.pgid)}` }
  }
  const command = commandLineOf(starter.pid)
  if (command === null) return { state: 'unsuitable', why: 'its command line cannot be read' }
  const notServeDev = whyTheStarterIsNotServeDev(command)
  if (notServeDev !== null) return { state: 'unsuitable', why: notServeDev }
  const members = theMembersOfTheGroup(starter.pgid)
  if (members === null) {
    return {
      state: 'unsuitable',
      why: `the process list cannot be read, so the members of process group ${String(starter.pgid)} cannot be judged`,
    }
  }
  if (!members.includes(starter.pid)) {
    return { state: 'unsuitable', why: `process ${String(starter.pid)} is not in process group ${String(starter.pgid)} now` }
  }
  const gate = theGateThatStartedTheStarter(starter.pid, starter.pgid)
  for (const pid of members) {
    if (pid === starter.pid || pid === gate) continue
    if (theStarterOrOneItStarted(pid, starter.pid)) continue
    return {
      state: 'unsuitable',
      why: `process group ${String(starter.pgid)} holds process ${String(pid)}, which is not the starter or one of the processes it began`,
    }
  }
  return { state: 'can-be-stopped', pid: starter.pid, pgid: starter.pgid, processStartedAt: starter.processStartedAt }
}

/**
 * Whether the process the lock recorded as the starter has ended, asked with its start time.
 *
 * A number now running a process that began at another time is a different process: the starter has
 * ended and its number was given away, which is the same fact as gone for a stop.
 *
 * @param {number} pid
 * @param {string} processStartedAt
 * @returns {boolean}
 */
function theStarterHasEnded(pid, processStartedAt) {
  const now = theProcessAt(pid)
  if (!now.here) return true
  if (now.startedAt === null) return false
  return now.startedAt !== processStartedAt
}

/**
 * THE STABLE CHECKOUT THIS CHECKOUT'S SETTINGS PAIR WITH, as a real path, or null.
 *
 * The line `MOLE_OFFICE_STABLE_CHECKOUT` in this checkout's `.env` says which stable checkout serves
 * this checkout's database, written by the bootstrap handoff. The shared reader refuses relative
 * values. An absent or empty value means an ordinary checkout. A missing named folder is refused
 * before a holder, service or restart can start anything.
 *
 * @param {string} [ending]
 * @returns {string | null}
 */
function theStableCheckoutThisCheckoutPairsWith(ending = 'Nothing was started.') {
  const stable = theStableCheckoutNamedIn(ENV_FILE)
  if (stable === null) return null
  let folder
  try { folder = statSync(stable).isDirectory() } catch (error) {
    if (!['ENOENT', 'ENOTDIR'].includes(/** @type {NodeJS.ErrnoException} */ (error).code ?? '')) throw error
    folder = false
  }
  if (!folder) {
    const words = pairingWords('stableMissing', { file: ENV_FILE, named: stable })
    throw Object.assign(new Error(`${words} ${ending}`), { code: 'STABLE_CHECKOUT_INVALID' })
  }
  return stable
}

/**
 * WHAT THE DEV SUPERVISOR'S STAND-IN SAYS AT THIS PORT, or null when no stand-in answers it.
 *
 * A stand-in holds the port while serve-dev has no server running: after a failed start, in its
 * backoff, or while the server refuses, for example at the stable tag. Its reply carries
 * STAND_IN_HEADER. It is not nothing answering, and it is not this office: a start must not put a
 * second supervisor behind it.
 *
 * @param {number} port
 * @returns {Promise<{ supervisor: string, said: string } | null>}
 */
async function whatTheStandInAt(port) {
  let reply
  try {
    reply = await fetch(`http://127.0.0.1:${String(port)}/api/health`, { signal: AbortSignal.timeout(ONE_QUESTION_MS) })
  } catch {
    return null
  }
  const supervisor = reply.headers.get(STAND_IN_HEADER)
  if (supervisor === null) return null
  let said = ''
  try {
    const body = /** @type {{ error?: unknown }} */ (await reply.json())
    said = typeof body.error === 'string' ? body.error : ''
  } catch {
    said = ''
  }
  return { supervisor, said }
}

/**
 * THE LINE THAT STOPS AN INSTALLED OFFICE, as a start says it: the install's own Node with what it needs set, then the
 * command's own file and the word `stop`, each path quoted as JSON quotes it.
 * @returns {string}
 */
function theStopLine() {
  const command = howToStart('command')
  return `${theInstallsNodeInALine({ program: command.command, environment: command.environment })} ${command.args.map((arg) => JSON.stringify(arg)).join(' ')} stop`
}

/**
 * WHY A START THAT CARRIES THE TEST SUITE'S MARK MAY NOT GO ON, in one sentence, or null when it may, or carries no mark.
 *
 * A marked start ties every process it starts to the test run the mark names (theTieToTheTestRun), so each of them ends
 * when that run ends, however it ended. So the mark must name a process that is running and can be read, or an office
 * started now could not end with it. And the office must not be the live one: the mark never ties the live office to a
 * test run. The live office is the one in the stable checkout (theStableCheckoutFolder). Its database is any of four:
 * the one that checkout's settings name; anything inside that checkout; when this checkout's settings pair it with that
 * same stable checkout, this checkout's canonical database; and a database whose service lock names that checkout. The
 * stable checkout may have no .env, and the live server may take its database from its service's environment. The lock
 * is then the only one of the four that sees the live office. A lock that cannot be read is refused in a sentence of its
 * own. A checkout or a database is compared as written and as it is on disk (howAPathMeets), so a link to either counts
 * as the thing it links to. A malformed mark is not quoted.
 *
 * It is asked before anything is stopped or started, through whyThisMarkedStartMayNotGoOn: first in `start`, and in
 * `restart` once the shape is decided. For the ordinary start, the only one that can take the paired branch of `start`,
 * it is also asked about what that branch would put in place. Without the mark it reads nothing.
 *
 * @param {{ checkout: string, databasePath: string }} office the checkout the office would run from, and the database
 *   it would open
 * @returns {string | null}
 */
export function whyAMarkedStartMayNotGoOn({ checkout, databasePath }) {
  if (!carriesTheTestMark(process.env)) return null
  const marked = `This start carries the test suite's mark ${THE_TEST_MARK}`
  const untied = 'so nothing was started or stopped: an office started now could not end with the test run that asked for it.'
  const pid = theProcessNumberIn(process.env[THE_TEST_MARK])
  if (pid === null) return `${marked}, but its value is not a process number, ${untied}`
  /** @type {import('./process-reader.mjs').ProcessAt} */
  let at
  try {
    at = theProcessReader().processAt(pid)
  } catch (err) {
    return `${marked}, but it names process ${String(pid)}, which could not be read (${err instanceof Error ? err.message : String(err)}), ${untied}`
  }
  if (at.here && at.unreadable !== undefined) return `${marked}, but it names process ${String(pid)}, which could not be read (${at.unreadable}), ${untied}`
  // A zombie is not running, as the lock reads it: the same reading, handed on, so the process is read once.
  if (!theProcessAt(pid, { processAt: () => at }).here) return `${marked}, but it names process ${String(pid)}, which is not running, ${untied}`
  const live = 'so nothing was started or stopped: the mark never ties the live office to a test run.'
  const home = homedir()
  const stable = theStableCheckoutFolder(home)
  const how = howAPathMeets(checkout, stable)
  if (how !== null) return `${marked}, but the checkout it would run from, ${checkout}, ${how} the stable checkout ${stable}, ${live}`
  const named = theDatabaseTheStableCheckoutNames(home)
  const paired = theStableCheckoutNamedIn(ENV_FILE)
  const opensTheLiveDatabase = `${marked} and would open the live office's database ${databasePath}, ${live}`
  if (
    (named !== null && howAPathMeets(databasePath, named) === 'is') ||
    howAPathMeets(databasePath, stable) !== null ||
    (paired !== null && howAPathMeets(paired, stable) === 'is' && howAPathMeets(databasePath, canonicalDatabasePath()) === 'is')
  ) {
    return opensTheLiveDatabase
  }
  // THE SERVICE LOCK BESIDE THE DATABASE, for a live office whose database only its service's environment names. Whether
  // the lock's process still runs is not asked: a live office that crashed leaves its lock, and its database is still the
  // live one. A lock that cannot be read is not taken as no lock, as the lock module never takes it.
  const lockPath = serviceLockPathFrom({ MOLE_OFFICE_DB: databasePath })
  const lock = readTheServiceLock(lockPath)
  if (lock.state === 'unreadable') {
    return (
      `${marked}, but the service lock beside its database, ${lockPath}, could not be read (${lock.why}), so nothing was ` +
      "started or stopped: without that lock Mole Office cannot tell whether the database is the live office's."
    )
  }
  // A lock written before the lock recorded its checkout names none, and says nothing about the stable checkout.
  if (lock.state === 'read' && typeof lock.lock.checkout === 'string' && howAPathMeets(lock.lock.checkout, stable) === 'is') return opensTheLiveDatabase
  return null
}

/**
 * WHY THIS MARKED START OR RESTART MAY NOT GO ON: whyAMarkedStartMayNotGoOn for the checkout and database it names, and,
 * for the ordinary start, for what the paired branch of `start` would put in place of them, so that is refused before
 * the terminal holder starts and before a restart stops anything. That is the stable checkout this checkout's settings
 * name and this checkout's canonical database. Whether that stable checkout is there is not asked here: a named stable
 * checkout that is missing is refused by the paired branch in its own words, as before. Null when it may go on, or
 * carries no mark.
 *
 * @param {ReturnType<typeof theService>} service
 * @param {{ checkout: string, databasePath: string } | null} asStopped the shape a restart starts again, or null for
 *   the ordinary start
 * @returns {string | null}
 */
function whyThisMarkedStartMayNotGoOn(service, asStopped) {
  const asked = whyAMarkedStartMayNotGoOn({ checkout: asStopped?.checkout ?? REPO_ROOT, databasePath: asStopped?.databasePath ?? service.databasePath })
  if (asked !== null || asStopped !== null || !carriesTheTestMark(process.env)) return asked
  const named = theStableCheckoutNamedIn(ENV_FILE)
  return named === null ? null : whyAMarkedStartMayNotGoOn({ checkout: named, databasePath: canonicalDatabasePath() })
}

/**
 * THE ARGUMENTS THAT TIE A PROCESS THIS START STARTS TO THE TEST RUN ITS MARK NAMES: THE_TEST_RUN_FLAG with the mark's
 * process number, or none when this start carries no mark, so an unmarked start's arguments are as they were. Asked
 * only after whyAMarkedStartMayNotGoOn has let the start go on, which refuses a mark that is not a process number.
 *
 * @returns {string[]}
 */
function theTieToTheTestRun() {
  if (!carriesTheTestMark(process.env)) return []
  const pid = theProcessNumberIn(process.env[THE_TEST_MARK])
  if (pid === null) throw new Error(`The test suite's mark ${THE_TEST_MARK} is not a process number, and the start went on without asking whyAMarkedStartMayNotGoOn.`)
  return [`${THE_TEST_RUN_FLAG}=${String(pid)}`]
}

/**
 * START THE SERVICE, or find the one already running.
 *
 * @param {ReturnType<typeof theService>} service
 * @param {{ shape: 'serve-dev', checkout: string, databasePath: string, port: number } | null} [asStopped]
 *   the shape the office had before `restart` stopped it, or null for the ordinary start. The ordinary
 *   start is the server alone, without `--stop-with-pid`, so it outlives this command. The serve-dev
 *   shape starts the supervisor again, in the checkout it ran from, so a restart never changes shape.
 *   Whether that supervisor is paired, and with which development checkout, is the helper's answer for
 *   its checkout (theOfficeToolEnvironment, src/config/the-office-tool-environment.mjs).
 */
async function start(service, asStopped = null) {
  // A START THAT CARRIES THE TEST SUITE'S MARK goes on only when its processes can end with that test run, and never on
  // the live office, the paired branch's checkout and database included.
  const untied = whyThisMarkedStartMayNotGoOn(service, asStopped)
  if (untied !== null) {
    process.stderr.write(`${untied}\n`)
    return EXIT.FAILED
  }
  // A STABLE UPGRADE THAT CLOSED THIS DATABASE AND DID NOT FINISH leaves a mark beside it. Nothing starts, the terminal
  // holder included, and the sentence says which upgrade and the command that goes on (src/config/the-upgrade-mark.mjs).
  const marked = whyAnUpgradeKeepsTheOfficeClosed(asStopped?.databasePath ?? service.databasePath, theStableCheckoutNamedIn(ENV_FILE), undefined)
  if (marked !== null) {
    process.stderr.write(`${marked}\n`)
    return EXIT.FAILED
  }
  // A DATA FOLDER MOVE THAT IS STILL COPYING keeps every start out (src/config/the-data-folder-move.mjs).
  const moving = whyADataFolderMoveKeepsTheOfficeClosed()
  if (moving !== null) {
    process.stderr.write(`${moving}\n`)
    return EXIT.FAILED
  }
  // A DATABASE THAT IS NOT THERE WHERE THE OFFICE HAS KEPT IT keeps every start out, before anything is made
  // (src/config/may-a-start-make-the-database.mjs).
  const missing = whyAStartMayNotMakeTheDatabase(asStopped?.databasePath ?? service.databasePath)
  if (missing !== null) {
    process.stderr.write(`${missing}\n`)
    return EXIT.FAILED
  }
  const tie = theTieToTheTestRun()
  const startedHolder = asStopped === null ? await startTheHolderAndReadIt(service, tie) : undefined
  const stand = await whereThingsStand(service)
  if (stand.lock === 'held' && stand.answer.ours) {
    say(
      `Mole Office is already running: process ${String(stand.held.pid)} serves the database ${service.databasePath} on ` +
        `http://127.0.0.1:${String(stand.held.port)}, since ${stand.held.processStartedAt}.`,
    )
    await endTheHolderWhileTheUpdateWaits(service, startedHolder, stand.answer)
    spoolAGateMet('the-office-starts-once', 'block')
    say('Nothing was started.')
    return EXIT.OK
  }
  /**
   * A PAIRED DEVELOPMENT CHECKOUT STARTS THE STABLE OFFICE, never a server of its own.
   *
   * When this checkout's `.env` names a stable checkout and nothing answers for this office, the
   * office is the stable one: it reads this checkout's settings and serves this checkout's database.
   * A stand-in holding the port means a serve-dev is already there, so no second one starts. Anything
   * else answering is not "nothing", and falls through to the ordinary start, whose server refuses
   * with the sentence that says why this checkout may not open this database.
   */
  /** @type {Awaited<ReturnType<typeof askThePort>> | null} */
  const standAnswer = 'answer' in stand && stand.answer !== undefined ? stand.answer : null
  if (asStopped === null && standAnswer !== null && !standAnswer.ours) {
    const paired = theStableCheckoutThisCheckoutPairsWith()
    if (paired !== null) {
      const standIn = await whatTheStandInAt(service.port)
      if (standIn !== null) {
        say(standIn.said === '' ? `A serve-dev stand-in holds port ${String(service.port)}, so nothing was started.` : standIn.said)
        spoolAGateMet('the-office-starts-once', 'block')
        say('Nothing was started.')
        return EXIT.STAND_IN_HOLDS_THE_PORT
      }
      if ((stand.lock === 'absent' || stand.lock === 'stale') && standAnswer.found.answer === 'not-answering') {
        say(`This checkout pairs with the stable checkout ${paired}, and nothing answers on port ${String(service.port)}.`)
        asStopped = {
          shape: 'serve-dev',
          checkout: paired,
          databasePath: canonicalDatabasePath(),
          port: service.port,
        }
        // The paired office serves this checkout's canonical database, so its mark is asked for too.
        const pairedMark = whyAnUpgradeKeepsTheOfficeClosed(asStopped.databasePath, paired, undefined)
        if (pairedMark !== null) {
          process.stderr.write(`${pairedMark}\n`)
          return EXIT.FAILED
        }
      }
    }
  }
  if (asStopped === null) {
    const missing = missingWebBuild(THE_BUILT_PAGE)
    if (missing !== null) {
      say(missing)
      say('Nothing was started.')
      return EXIT.FAILED
    }
  }

  const databasePath = asStopped === null ? service.databasePath : asStopped.databasePath
  const port = asStopped === null ? service.port : asStopped.port
  // THE DATA FOLDER MAY NOT EXIST YET: a bundle's first start, in a new per-user data folder.
  mkdirSync(dirname(service.logPath), { recursive: true })
  const log = openSync(service.logPath, 'a')
  writeSync(log, `\n--- mole-office start, ${new Date().toISOString()} ---\n`)
  const from = statSync(service.logPath).size
  // HOW THE SERVER STARTS: the declaration's alone — tsx from source in a checkout, the bundle in a
  // bundle — or, after a serve-dev stop, the supervisor again, in the checkout the lock named. The script is
  // named relative to that checkout, which is the folder it starts in, as every other start names it. So the
  // next stop finds it as the second word even when the checkout's path has a space.
  const node = theInstallsNode()
  const shape =
    asStopped === null
      ? howToStart('server')
      : { command: node.program, args: [SERVE_DEV, '--built', '--prepared'], environment: node.environment }
  // A MARKED START ENDS WITH ITS TEST RUN: the server is told so in the plain shape, and serve-dev in its own, which ends
  // its server by its own stop, so that server is not told.
  const server = { ...shape, args: [...shape.args, ...tie] }
  // IN A GROUP OF ITS OWN, AS THE SYSTEM LAYER STARTS ONE: a process group on Linux and the Mac, as before the layer,
  // and a Job Object on Windows. Both ways name node by its whole path, which a start in a Job Object needs.
  const how = thisSystem().groups.howToStartInItsOwnGroup({
    command: server.command,
    args: server.args,
    windowsVerbatimArguments: false,
    env:
      asStopped === null
        ? {
            // MOLE_OFFICE_STARTED_BY tells the server it runs as the Mole Office service, so its runtime names
            // this command as what manages it (criterion W8). The server believes it only while it leads a
            // process group of its own, or on Windows runs in the group the layer's starter made, which is how
            // this command starts it.
            ...process.env,
            ...server.environment,
            NODE_ENV: 'production',
            MOLE_OFFICE_STARTED_BY: STARTED_BY_THE_SERVICE_COMMAND,
          }
        : // AND THE DEVELOPMENT CHECKOUT, when this is a paired start: the stable server reads that checkout's `.env`
          // and keeps its data, and refuses to start without the line naming it. The helper names it from this
          // process's own pair, so a restart inside the paired stable office names the development checkout and
          // not the stable checkout itself (wave 13q, item 15).
          theOfficeToolEnvironment({
            ...process.env,
            ...server.environment,
            NODE_ENV: 'production',
            // THE DATABASE AND THE PORT ARE SAID EXPLICITLY, because the office about to be started is
            // the one the lock named. A checkout with no .env of its own reads the environment.
            MOLE_OFFICE_DB: asStopped.databasePath,
            MOLE_OFFICE_PORT: String(asStopped.port),
          }, asStopped.checkout).env,
  })
  const child = spawn(how.command, how.args, {
    cwd: asStopped === null ? REPO_ROOT : asStopped.checkout,
    env: how.env,
    detached: how.detached,
    stdio: ['ignore', log, log],
    windowsHide: how.windowsHide,
    windowsVerbatimArguments: how.windowsVerbatimArguments,
  })
  closeSync(log)
  /** @type {{ code: number | null, signal: string | null } | null} */
  let ended = null
  child.once('exit', (code, signal) => {
    ended = { code, signal }
  })
  /** @type {Error | null} */
  let couldNotStart = null
  child.once('error', (err) => {
    couldNotStart = err
  })
  const pid = child.pid
  if (pid === undefined) {
    await sleep(100)
    say(`The server could not be started: ${couldNotStart === null ? 'no process was made' : String(couldNotStart)}.`)
    return EXIT.FAILED
  }
  // ON WINDOWS THE PROCESS STARTED IS THE SYSTEM LAYER'S STARTER, and not the server. The starter puts the server in a
  // Job Object named after its own number, and the server's lock names that number as its group.
  const startedByAStarter = thisSystem().groups.jobObjects !== null
  if (asStopped === null) {
    say(
      `Starting Mole Office for the database ${databasePath} on port ${String(port)}: ` +
        (startedByAStarter
          ? `process ${String(pid)} starts it in group ${String(pid)}, a Job Object of its own.`
          : `process ${String(pid)}, in process group ${String(pid)}.`),
    )
  } else {
    say(
      `Starting Mole Office for the database ${databasePath} on port ${String(port)} under tools/serve-dev.mjs in ` +
        `${asStopped.checkout}: process ${String(pid)}, in process group ${String(pid)}.`,
    )
  }
  say(`Its output goes to ${service.logPath}.`)

  const deadline = Date.now() + START_WAIT_MS
  for (;;) {
    if (ended !== null) {
      const how = /** @type {{ code: number | null, signal: string | null }} */ (ended)
      say(
        how.signal !== null
          ? `The server ended before it answered: it was stopped by the signal ${how.signal}.`
          : `The server ended before it answered, with exit code ${String(how.code)}.`,
      )
      const lines = theLogSince(service.logPath, from)
      say(lines.length === 0 ? 'It wrote nothing to its log.' : `The end of its log:\n${lines.join('\n')}`)
      return EXIT.FAILED
    }
    const lock = readTheServiceLock(service.lockPath)
    // THE LOCK IS THE ONE THIS START IS WAITING FOR: the server's own process alone, or on Windows the server in
    // the group this start's starter made, or the server's lock recording this serve-dev as its starter.
    const lockIsOurs =
      asStopped === null
        ? lock.state === 'read' && (startedByAStarter ? lock.lock.pgid === pid : lock.lock.pid === pid)
        : lock.state === 'read' && lock.lock.starter !== undefined && lock.lock.starter.pid === pid
    if (lockIsOurs) {
      const answer = await askThePort(port)
      if (answer.ours) {
        child.unref()
        say(`Mole Office answers on http://127.0.0.1:${String(port)}.`)
        say(thePortSays(answer))
        say(`It keeps running after this command ends. To stop it: ${THE_INSTALL.from === 'bundle' ? theStopLine() : 'npm run mole-office stop'}`)
        await endTheHolderWhileTheUpdateWaits(service, startedHolder, answer)
        return EXIT.OK
      }
    }
    if (Date.now() >= deadline) {
      child.unref()
      say(
        asStopped !== null
          ? `The supervisor, process ${String(pid)} in process group ${String(pid)}, has not brought the office up within ${String(START_WAIT_MS / 1000)} seconds.`
          : startedByAStarter
            ? `The server, which process ${String(pid)} started in group ${String(pid)}, has not answered within ${String(START_WAIT_MS / 1000)} seconds.`
            : `The server, process ${String(pid)} in process group ${String(pid)}, has not answered within ${String(START_WAIT_MS / 1000)} seconds.`,
      )
      say(`It was left running. Its output is in ${service.logPath}.`)
      say(howToEndAStartThatDidNotAnswer(pid, startedByAStarter, lock))
      return EXIT.FAILED
    }
    await sleep(250)
  }
}

/**
 * HOW TO END WHAT A START LEFT WHEN ITS SERVER DID NOT ANSWER IN TIME. On Linux and the Mac the server leads the group
 * this start made, so the group is stopped. On Windows the process this start made is the system layer's starter, which
 * ends when this command ends, so its number names nothing after that. The server's own number is said when the service
 * lock names it in this start's group. Otherwise this command does not know it, and says so.
 *
 * @param {number} pid the process this start made
 * @param {boolean} startedByAStarter whether that process is the system layer's starter (Windows)
 * @param {ReturnType<typeof readTheServiceLock>} lock the service lock as this start last read it
 * @returns {string}
 */
export function howToEndAStartThatDidNotAnswer(pid, startedByAStarter, lock) {
  if (!startedByAStarter) return `If it should not be running, stop its group: kill -TERM -${String(pid)}`
  if (lock.state === 'read' && lock.lock.pgid === pid) {
    return `If it should not be running, end it and every process it started: taskkill /PID ${String(lock.lock.pid)} /T /F`
  }
  return (
    "This command does not know the server's own number, because the server has not taken its service lock. " +
    `Process ${String(pid)}, the starter, ends when this command ends.`
  )
}

/**
 * ASK A PROCESS GROUP TO STOP, THROUGH THE SYSTEM LAYER: SIGTERM to the whole group on Linux and the Mac, the same
 * signal to the same group as before the layer. A number that is not a whole number above 1 is refused before anything
 * is sent: 0 is this command's own group, and a signal to -1 reaches every process this user owns. What the layer
 * throws comes back as it is, so each stop keeps its own handling of ESRCH.
 *
 * @param {number} group
 * @param {string} [platform] a value of `process.platform`, this system's unless a test names another
 * @returns {Promise<void>}
 */
export async function askTheGroupToStop(group, platform = process.platform) {
  if (!Number.isInteger(group)) {
    throw new Error(`Refusing to ask process group ${String(group)} to stop. A process group is a whole number above 1.`)
  }
  if (group <= 1) throw new Error(`Refusing to ask process group ${String(group)} to stop. That is init, or every process there is.`)
  await theSystemFor(platform).groups.askToStop(group)
}

/**
 * THE TERMINAL HOLDER'S OPEN ROW IN THE OFFICE'S PROCESS LEDGER, read from the database without writing it. The server
 * writes the row when it reaches the holder (recordTheHolder in src/server/lib/terminals.ts): a process row keyed by the
 * holder's pid, under a session record titled as the holder, with the group and the start time read at that moment.
 * On Windows the row carries no group.
 *
 * @param {string} databasePath
 * @param {number} pid
 * @returns {{ pgid: number | null, osStartedAt: string | null } | { why: string }}
 */
function theHoldersLedgerRow(databasePath, pid) {
  const Database = /** @type {typeof import('better-sqlite3')} */ (createRequire(import.meta.url)('better-sqlite3'))
  /** @type {{ pgid: number | null, osStartedAt: string | null }[]} */
  let rows
  try {
    const db = new Database(databasePath, { readonly: true, fileMustExist: true })
    try {
      rows = /** @type {{ pgid: number | null, osStartedAt: string | null }[]} */ (
        db
          .prepare(
            'SELECT r.pgid AS pgid, r.os_started_at AS osStartedAt FROM session_resources r JOIN records s ON s.id = r.session_record_id ' +
              "WHERE r.type = 'process' AND r.key = ? AND r.released_at IS NULL AND s.kind = 'session' AND s.title = ?",
          )
          .all(String(pid), THE_TERMINAL_HOLDER)
      )
    } finally {
      db.close()
    }
  } catch (err) {
    const code = /** @type {{ code?: unknown }} */ (err).code
    if (typeof code !== 'string' || !code.startsWith('SQLITE_')) throw err
    return { why: `SQLite could not read the office's process ledger in ${databasePath}: ${/** @type {Error} */ (err).message} (${code}).` }
  }
  const first = rows[0]
  if (first === undefined) return { why: "no open row in the office's process ledger records it." }
  if (new Set(rows.map((row) => `${String(row.pgid)} ${String(row.osStartedAt)}`)).size > 1) {
    return { why: `the office's process ledger has ${String(rows.length)} open rows for it, and they name different groups or start times.` }
  }
  return { pgid: first.pgid, osStartedAt: first.osStartedAt }
}

/**
 * WHAT A HOLDER'S PROOF IS READ FROM, in the words endTheTerminalHolder says it in. A stop reads the holder's open row
 * in the office's process ledger. A start that ends the holder it started reads what it read of that holder when it
 * started it.
 *
 * @typedef {{ records: string, recorded: string, theOne: string, stopped: (pid: number, group: number) => string }} TheProofsWords
 */

/** @type {TheProofsWords} */
const THE_LEDGERS_WORDS = {
  records: "The office's process ledger records",
  recorded: "the office's process ledger recorded",
  theOne: 'the terminal holder the office recorded',
  stopped: theHolderWasStoppedWords,
}

/** @type {TheProofsWords} */
const THIS_STARTS_WORDS = {
  records: 'This start read',
  recorded: 'this start read',
  theOne: 'the terminal holder this start started',
  stopped: (pid, group) =>
    `The terminal holder this start started, process ${String(pid)}, was stopped by its process group ${String(group)}, and its terminals were told to end.`,
}

/**
 * The proof a holder is ended by, and its words: the start's own reading when a start ends the holder it started, and
 * otherwise the holder's row in the office's process ledger.
 *
 * @param {string} databasePath
 * @param {number} pid
 * @param {TheHolderThisStartStarted | null} started
 * @returns {{ recorded: ReturnType<typeof theHoldersLedgerRow>, by: TheProofsWords }}
 */
function theProofOf(databasePath, pid, started) {
  if (started === null) return { recorded: theHoldersLedgerRow(databasePath, pid), by: THE_LEDGERS_WORDS }
  return { recorded: { pgid: started.pgid, osStartedAt: started.osStartedAt }, by: THIS_STARTS_WORDS }
}

/**
 * END THE TERMINAL HOLDER THIS START STARTED, WHEN THE OFFICE WAITS FOR ITS UPDATE. An installed office whose database
 * holds work and is not up to date waits for its owner's press of "Back up and update", and its health says so
 * (src/server/lib/the-update.ts). It writes nothing while it waits, so its process ledger has no row for the holder
 * this start started, and a stop would leave that holder running. So this start ends it at once, by the readings a
 * stop takes, with what it read of the holder when it started it in place of the ledger's row. The server starts the
 * holder after the press, and records it. A holder this start did not start is left as it is.
 *
 * Whether the office waits is the server's own answer, as the self-check read it at the port.
 *
 * @param {ReturnType<typeof theService>} service
 * @param {TheHolderThisStartStarted | { pid: number, why: string } | undefined} started
 * @param {Awaited<ReturnType<typeof askThePort>>} answer
 */
async function endTheHolderWhileTheUpdateWaits(service, started, answer) {
  if (started === undefined || answer.found.answer !== 'unhealthy' || answer.found.updateWaiting !== true) return
  say(THE_UPDATE_WAITS_SO_THE_HOLDER_ENDS)
  if ('why' in started) {
    say(`${started.why} ${THE_HOLDER_WAS_NOT_STOPPED}`)
    return
  }
  await endTheTerminalHolder(service, say, started)
}

/**
 * END THE TERMINAL HOLDER OF THIS DATABASE once its server has stopped, or once a stop finds its service lock stale,
 * by the process group the office's process ledger recorded for it (chapter 2 of the office regulations: stop a process
 * only by the group id you recorded). A person who stops the office expects nothing of it left running. The holder
 * tells its terminals to end, waits a little for them and closes. A terminal still running after that is named in the
 * holder's log.
 *
 * Its group is asked to stop only when four readings agree. The holder answers on this database's socket and names this
 * database. One open ledger row of the holder's own session names its pid. That row's group is the pid. The process
 * under the pid now is in that group and started when the row says. Any other reading leaves the holder running and
 * says why, and the stop exits HOLDER_NOT_STOPPED: no server runs, and a part of the office still runs.
 *
 * ON WINDOWS the holder's ledger row carries no group, because Windows has none. A group there is the Job Object a
 * starter made, named after the starter's own number (src/config/systems/windows-starts.mjs).
 * The starter makes the holder, so the holder's parent is that number, and Windows keeps a process's parent number
 * after the parent has ended. A starter never makes a Job Object whose name is taken. So the holder is asked to stop on
 * its group's stop pipe and given HOLDER_STOP_WAIT_MS to end, and then its Job Object is ended, with every process left
 * in it, its terminals among them (endTheHoldersJobObject). That happens only when four readings agree. The holder
 * answers on this database's socket and names this database. One open ledger row of the holder's own session names its
 * pid. The process under the pid now started when the row says. Windows answers that the Job Object named after that
 * process's parent holds it.
 *
 * THE OWNER'S SHUT DOWN ASKS THIS TOO. The window hands its Shut down to the office page, and the page's door ends the
 * server through its own way out (src/server/index.ts), which asks this once its database is closed and before it lets
 * its lock go, and collects what this says through `tell`. Before that, only this command ended the holder, and on a Mac
 * on 4 November 2026 it ran on after Shut down.
 *
 * A START ASKS THIS TOO, for the holder it started, when the office waits for its update. It hands in what it read of
 * that holder in place of the ledger's row, and the holder must answer as that process (endTheHolderWhileTheUpdateWaits).
 *
 * @param {{ databasePath: string }} service
 * @param {(line: string) => void} [tell] where what it did is said: this command's output, unless the server's way out
 *   collects it
 * @param {TheHolderThisStartStarted | null} [started] what a start read of the holder it started, when that start ends
 *   it (endTheHolderWhileTheUpdateWaits). It stands in place of the ledger's row, and the holder must answer as it.
 * @returns {Promise<number>} the stop's exit code
 */
export async function endTheTerminalHolder(service, tell = say, started = null) {
  const left = (/** @type {string} */ why) => {
    tell(`${why} ${THE_HOLDER_WAS_NOT_STOPPED}`)
    return EXIT.HOLDER_NOT_STOPPED
  }
  /** @type {string} */
  let socketPath
  try {
    socketPath = theTerminalHolderSocket(service.databasePath)
  } catch (err) {
    return left(err instanceof Error ? err.message : String(err))
  }
  /** @type {Record<string, unknown>} */
  let hello
  try {
    hello = await askTheHolder(socketPath, { op: 'hello' })
  } catch (err) {
    const code = /** @type {{ code?: unknown }} */ (err).code
    const why = err instanceof Error ? err.message : String(err)
    // NO SOCKET, OR NOTHING TAKES A CONNECTION ON IT: no holder runs. One that is there and does not answer is not none.
    if (code === 'absent') {
      tell(NO_HOLDER_RUNS)
      return EXIT.OK
    }
    if (code === 'refused') {
      tell(`${why} So no terminal holder was stopped.`)
      return EXIT.OK
    }
    // A PATH TOO LONG FOR A UNIX SOCKET was not asked, and no holder can be listening on it: no holder runs.
    if (code === 'too-long') {
      tell(`${why} ${NO_HOLDER_LISTENS_ON_A_PATH_THIS_LONG} No terminal holder was stopped.`)
      return EXIT.OK
    }
    return left(why)
  }
  if (hello.ok !== true || hello.database !== service.databasePath) {
    return left(`Something answers on the terminal holder's socket ${socketPath}, but not as the holder of this database.`)
  }
  const pid = hello.pid
  if (typeof pid !== 'number' || !Number.isInteger(pid) || pid <= 1) {
    return left(`The terminal holder on ${socketPath} gave no process number that can be stopped (${JSON.stringify(pid)}).`)
  }
  if (started !== null && started.pid !== pid) {
    return left(`The terminal holder on ${socketPath} is process ${String(pid)}, and not process ${String(started.pid)}, which this start started.`)
  }
  const system = thisSystem()
  if (system.groups.jobObjects !== null) return endTheHoldersJobObject(service.databasePath, pid, system, left, tell, started)
  const { recorded, by } = theProofOf(service.databasePath, pid, started)
  if ('why' in recorded) return left(theHolderHasNoRecordedGroupWords(pid, recorded.why))
  if (recorded.pgid === null) {
    return left(theHolderHasNoRecordedGroupWords(pid, THE_HOLDERS_ROW_CARRIES_NO_GROUP))
  }
  if (recorded.pgid !== pid) {
    return left(
      `${by.records} the terminal holder, process ${String(pid)}, in process group ` +
        `${String(recorded.pgid)}, which it does not lead, so asking that group to stop could reach another program.`,
    )
  }
  const at = theProcessAt(pid)
  if (!at.here) {
    tell(theHolderEndedByItselfWords(pid))
    return EXIT.OK
  }
  if (at.startedAt === null || at.pgid === null) {
    return left(`Process ${String(pid)} could not be read, so whether it is ${by.theOne} cannot be told.`)
  }
  if (at.pgid !== recorded.pgid) {
    return left(
      `Process ${String(pid)} is in process group ${String(at.pgid)}, not in group ${String(recorded.pgid)}, which ` +
        `${by.recorded} for the terminal holder.`,
    )
  }
  const notTheRecordedHolder = whyItMayNotBeTheRecordedHolder(pid, recorded.osStartedAt, localStampOf(new Date(at.startedAt)), by)
  if (notTheRecordedHolder !== null) return left(notTheRecordedHolder)
  try {
    await askTheGroupToStop(recorded.pgid)
  } catch (err) {
    if (/** @type {NodeJS.ErrnoException} */ (err).code === 'ESRCH') {
      tell(theHolderEndedByItselfWords(pid))
      return EXIT.OK
    }
    return left(`Process group ${String(recorded.pgid)} could not be asked to stop: ${err instanceof Error ? err.message : String(err)}`)
  }
  const deadline = Date.now() + HOLDER_STOP_WAIT_MS
  for (;;) {
    const now = theProcessAt(pid)
    if (!now.here || now.startedAt !== at.startedAt) {
      tell(by.stopped(pid, recorded.pgid))
      return EXIT.OK
    }
    if (Date.now() >= deadline) {
      tell(
        `The terminal holder, process ${String(pid)}, is still running ${String(HOLDER_STOP_WAIT_MS / 1000)} seconds after ` +
          `its recorded process group ${String(recorded.pgid)} was asked to stop.`,
      )
      tell(`Nothing more was sent to it. Its log is ${theTerminalHolderLog(service.databasePath)}.`)
      return EXIT.HOLDER_NOT_STOPPED
    }
    await sleep(100)
  }
}

/**
 * Why the process under a pid may not be the terminal holder the office's process ledger recorded, or null when it
 * started when the row says.
 *
 * @param {number} pid
 * @param {string | null} recordedStart the row's start time
 * @param {string} startedAt the start of the process under the pid now, as the ledger writes one
 * @param {TheProofsWords} by what the start time was read from
 * @returns {string | null}
 */
function whyItMayNotBeTheRecordedHolder(pid, recordedStart, startedAt, by) {
  if (theRowIsAboutThisProcess(recordedStart, { startedAt }).same === true) return null
  // A START'S OWN READING ALWAYS HAS A START TIME, so only the ledger's row comes to the first sentence.
  return recordedStart === null
    ? `The office's process ledger recorded no start time for the terminal holder, process ${String(pid)}, so whether the process running now is that holder cannot be told.`
    : `Process ${String(pid)} started at ${startedAt}, but ${by.recorded} the terminal holder starting at ${recordedStart}, so it may be another program.`
}

/**
 * WAIT FOR THE TERMINAL HOLDER TO END, for HOLDER_STOP_WAIT_MS at most. It has ended when it is not here, or when a
 * process readable under its pid started at another time. Both waits in `endTheHoldersJobObject` use this, so the two
 * cannot drift.
 *
 * @param {() => Promise<import('./process-reader.mjs').ProcessAt>} readTheHolder
 * @param {number} pid
 * @param {Date} startedAt the holder's start, as the first reading gave it
 * @returns {Promise<boolean>} whether it has ended
 */
async function waitForTheHolderToEnd(readTheHolder, pid, startedAt) {
  const deadline = Date.now() + HOLDER_STOP_WAIT_MS
  for (;;) {
    const now = await readTheHolder()
    if (!now.here || (now.unreadable === undefined && now.startedAt.getTime() !== startedAt.getTime())) return true
    if (Date.now() >= deadline) return false
    await sleep(100)
  }
}

/**
 * END THE TERMINAL HOLDER ON WINDOWS WITH ITS JOB OBJECT, when the readings endTheTerminalHolder names agree. Every
 * check comes first, and a disagreement leaves the holder running and says why. Then it asks the holder to stop on its
 * group's pipe and waits for it to end, and says so when it did not end in that wait. Then it ends every process in
 * that Job Object at once, which ends a terminal that did not end when asked. A refused ask is said as it came, and the
 * end still goes on.
 *
 * The Job Object, whether it holds the holder, and its end are Windows's own. On Linux they are stood in by
 * tests/the-holder-on-windows-ends-with-its-job-object.test.ts, and only a run on Windows shows them.
 *
 * @param {string} databasePath
 * @param {number} pid the process the holder's answer names
 * @param {import('./systems/the-system.mjs').ASystem} system
 * @param {(why: string) => number} left
 * @param {(line: string) => void} tell
 * @param {TheHolderThisStartStarted | null} started what a start read of the holder it started, in place of the ledger's
 *   row, when that start ends it
 * @returns {Promise<number>} the stop's exit code
 */
async function endTheHoldersJobObject(databasePath, pid, system, left, tell, started) {
  const jobObjects = /** @type {import('./systems/the-system.mjs').JobObjects} */ (system.groups.jobObjects)
  const reader = system.processes
  const readTheHolder = () => (reader.readProcessAt === undefined ? Promise.resolve(reader.processAt(pid)) : reader.readProcessAt(pid))
  const { recorded, by } = theProofOf(databasePath, pid, started)
  if ('why' in recorded) return left(`Whether process ${String(pid)} is ${by.theOne} cannot be told: ${recorded.why}`)
  const at = await readTheHolder()
  if (!at.here) {
    tell(theHolderEndedByItselfWords(pid))
    return EXIT.OK
  }
  if (at.unreadable !== undefined) {
    return left(`Process ${String(pid)} could not be read, so whether it is ${by.theOne} cannot be told: ${at.unreadable}`)
  }
  const notTheRecordedHolder = whyItMayNotBeTheRecordedHolder(pid, recorded.osStartedAt, localStampOf(at.startedAt), by)
  if (notTheRecordedHolder !== null) return left(notTheRecordedHolder)
  // ITS GROUP IS ITS PARENT'S NUMBER, believed only when Windows answers that the Job Object of that number holds it.
  const holding = await readTheGroupItsParentNames(jobObjects, pid, at.ppid)
  if ('noParent' in holding) {
    return left(`Process ${String(pid)} names no parent, so no Job Object of a starter can be named for it.`)
  }
  const { group } = holding
  if ('unknown' in holding) {
    return left(`Whether the terminal holder, process ${String(pid)}, runs in group ${String(group)}, the Job Object named after its parent, cannot be told: ${holding.unknown}`)
  }
  if (!holding.holds) {
    return left(
      `The terminal holder, process ${String(pid)}, does not run in group ${String(group)}, the Job Object named after its parent: ` +
        `${holding.why}. So Mole Office's starter did not start it, and ending that group could reach another program.`,
    )
  }
  let answered = false
  let stoppedWhenAsked = false
  try {
    await system.groups.askToStop(group)
    answered = true
  } catch (err) {
    // A REFUSED ASK IS SAID AS IT CAME, and the end below still goes on: the holder may be an older one that cannot hear.
    tell(err instanceof Error ? err.message : String(err))
  }
  if (answered) {
    stoppedWhenAsked = await waitForTheHolderToEnd(readTheHolder, pid, at.startedAt)
    if (!stoppedWhenAsked) {
      tell(theHolderWasStillRunningWords(pid))
    }
  }
  try {
    system.groups.signal(group, 'SIGKILL')
  } catch (err) {
    if (/** @type {NodeJS.ErrnoException} */ (err).code === 'ESRCH') {
      if (answered) {
        tell(theHolderStoppedWhenAskedAndNothingWasLeftWords(pid, group))
        return EXIT.OK
      }
      tell(theHolderEndedByItselfWords(pid))
      return EXIT.OK
    }
    if (stoppedWhenAsked) {
      tell(
        `${theHolderStoppedWhenAskedWords(pid)} What was left in group ${String(group)}, the Job Object its starter made, ` +
          `could not be ended: ${err instanceof Error ? err.message : String(err)}`,
      )
      return EXIT.OK
    }
    return left(theHoldersJobObjectCouldNotBeEndedWords(group, err instanceof Error ? err.message : String(err)))
  }
  if (stoppedWhenAsked) {
    tell(theHolderStoppedWhenAskedAndEveryProcessWasEndedWords(pid, group))
    return EXIT.OK
  }
  if (await waitForTheHolderToEnd(readTheHolder, pid, at.startedAt)) {
    tell(theHoldersJobObjectWasEndedWords(pid, group))
    return EXIT.OK
  }
  tell(
    `The terminal holder, process ${String(pid)}, is still running ${String(HOLDER_STOP_WAIT_MS / 1000)} seconds after ` +
      `Windows said that every process in its group ${String(group)} was ended.`,
  )
  tell(`Nothing more was sent to it. Its log is ${theTerminalHolderLog(databasePath)}.`)
  return EXIT.HOLDER_NOT_STOPPED
}

/**
 * WHAT A STOP THAT ENDED THE SERVER DOES WITH THE TERMINAL HOLDER: `restart` keeps it, and `stop` ends it.
 *
 * @param {ReturnType<typeof theService>} service
 * @param {boolean} keepTheHolder
 * @returns {Promise<number>}
 */
async function theHolderAfterTheServer(service, keepTheHolder) {
  if (!keepTheHolder) return endTheTerminalHolder(service)
  say(A_RESTART_KEEPS_THE_HOLDER)
  return EXIT.OK
}

/**
 * @param {ReturnType<typeof theService>} service
 * @param {{ keepTheHolder?: boolean }} [how] `restart` keeps the terminal holder, and `stop` ends it.
 */
async function stop(service, { keepTheHolder = false } = {}) {
  const stand = await whereThingsStand(service)
  if (stand.lock === 'absent') {
    say(theNoServiceLockToStopWords(service.lockPath))
    say(thePortSays(stand.answer))
    // A SERVER THAT ANSWERS WITHOUT A LOCK still uses its terminal holder, and a restart keeps the holder. Otherwise no
    // server runs for this database, and a holder it left is ended by the same readings as after a server's stop.
    if (stand.answer.ours || keepTheHolder) {
      say(NOTHING_WAS_STOPPED)
      return stand.answer.ours ? EXIT.ANSWERING_WITHOUT_A_LOCK : EXIT.NOT_RUNNING
    }
    return endTheTerminalHolder(service)
  }
  if (stand.lock === 'unreadable' || stand.lock === 'cannot-tell') {
    const code = await status(service)
    say(NOTHING_WAS_STOPPED)
    return code
  }
  if (stand.lock === 'stale') {
    say(theLockIsStale(service.lockPath, stand.held.pid, stand.how.state))
    say(thePortSays(stand.answer))
    // A SERVER THAT ANSWERS FOR THIS DATABASE still uses its terminal holder, and a restart keeps the holder. Otherwise
    // no server runs for this database, because the lock's process has ended, and a holder it left is ended by the same
    // readings as with no lock.
    if (stand.answer.ours || keepTheHolder) {
      say(NOTHING_WAS_STOPPED)
      return EXIT.STALE
    }
    return endTheTerminalHolder(service)
  }
  const held = stand.held
  if (!stand.answer.ours) {
    say(`The service lock ${service.lockPath} names process ${String(held.pid)}, which is running.`)
    say(thePortSays(stand.answer))
    say('Nothing was stopped, because this command stops only a service that answers for this database.')
    return EXIT.NOT_ANSWERING
  }

  // WHEN THE LOCK NAMES THE PROCESS THAT STARTED THIS SERVER, that process's group is the one to
  // signal: stopping the server alone would let its starter start the server again.
  const starterRecord = held.starter
  const starter = theStarterTheLockNames(held)
  if (starter.state === 'unsuitable' && starterRecord !== undefined) {
    say(`The process that started this server, ${String(starterRecord.pid)}, cannot be stopped safely: ${starter.why}.`)
    say(
      "Signalling its process group could reach programs outside this office, and signalling the server's " +
        'group alone would let that process start the server again.',
    )
    say(NOTHING_WAS_STOPPED)
    return EXIT.STARTER_UNSUITABLE
  }
  if (starter.state === 'can-be-stopped') {
    let asked = true
    try {
      await askTheGroupToStop(starter.pgid)
    } catch (err) {
      if (/** @type {NodeJS.ErrnoException} */ (err).code !== 'ESRCH') throw err
      asked = false
    }
    if (asked) {
      say(`Asked process group ${String(starter.pgid)} of the process that started this server (${String(starter.pid)}) to stop, with SIGTERM.`)
    }
    const deadline = Date.now() + STOP_WAIT_MS
    for (;;) {
      const holder = whoHoldsTheLock(held, theProcessReading)
      const lock = readTheServiceLock(service.lockPath)
      const lockGone = lock.state === 'absent' || (lock.state === 'read' && lock.lock.token !== held.token)
      if (theStarterHasEnded(starter.pid, starter.processStartedAt) && holder.state !== 'held' && lockGone) {
        say(theServerStoppedWords(held.pid))
        say(`The process that started it (${String(starter.pid)}) has ended too.`)
        return theHolderAfterTheServer(service, keepTheHolder)
      }
      if (Date.now() >= deadline) {
        if (!theStarterHasEnded(starter.pid, starter.processStartedAt)) {
          say(
            `The process that started this server (${String(starter.pid)}) is still running ` +
              `${String(STOP_WAIT_MS / 1000)} seconds after its group was asked to stop.`,
          )
        }
        say(
          holder.state === 'held'
            ? `Process ${String(held.pid)} is still running ${String(STOP_WAIT_MS / 1000)} seconds after it was asked to stop.`
            : `Process ${String(held.pid)} has ended, but its service lock ${service.lockPath} is still there.`,
        )
        say(`Nothing more was sent to it. Its output is in ${service.logPath}.`)
        return EXIT.FAILED
      }
      await sleep(200)
    }
  }
  const { jobObjects } = thisSystem().groups
  if (jobObjects === null) {
    const now = theProcessReading(held.pid)
    const group = now.here ? now.pgid : null
    if (held.pgid !== held.pid || group !== held.pid) {
      say(
        `Process ${String(held.pid)} serves this database, but it does not lead its own process group ` +
          `(its group is ${String(group ?? held.pgid)}), so it was not started by mole-office start.`,
      )
      say('Signalling its group could reach other programs. Stop it the way it was started.')
      say(NOTHING_WAS_STOPPED)
      return EXIT.NOT_ITS_OWN_GROUP
    }
  } else {
    // ON WINDOWS THE LOCK NAMES THE GROUP THE LAYER'S STARTER PUT THE SERVER IN, whose Job Object is named after the
    // starter. That Job Object must still hold the lock's server before it is asked anything, so that a stale lock
    // or a number Windows gave again cannot ask another program's group to stop.
    const holding = jobObjects.holds(held.pgid, held.pid)
    if ('unknown' in holding) {
      say(theLocksGroupCannotBeToldWords(held.pid, held.pgid, holding.unknown))
      say(NOTHING_WAS_STOPPED)
      return EXIT.CANNOT_TELL
    }
    if (!holding.holds) {
      say(theServerIsNotInTheLocksGroupWords(held.pid, held.pgid, holding.why))
      say(ASKING_THAT_GROUP_COULD_REACH_ANOTHER_PROGRAM)
      say(NOTHING_WAS_STOPPED)
      return EXIT.NOT_ITS_OWN_GROUP
    }
  }

  // A PIPE THAT IS NOT THERE YET IS ASKED AGAIN; every other refusal is said, and nothing more is sent. See the header.
  const askedFrom = Date.now()
  let tries = 0
  for (;;) {
    tries += 1
    try {
      await askTheGroupToStop(held.pgid)
      break
    } catch (err) {
      const notThere = /** @type {{ thePipeIsNotThere?: unknown }} */ (err).thePipeIsNotThere === true
      if (!notThere || Date.now() - askedFrom >= STOP_PIPE_WAIT_MS) {
        say(err instanceof Error ? err.message : String(err))
        if (notThere) say(`The pipe was not there at any of the ${String(tries)} tries in ${String(STOP_PIPE_WAIT_MS / 1000)} seconds.`)
        say(`Nothing more was sent to it. Its output is in ${service.logPath}.`)
        return EXIT.FAILED
      }
      await sleep(STOP_PIPE_ASK_EVERY_MS)
    }
  }
  if (tries > 1) {
    say(
      `Group ${String(held.pgid)}'s stop pipe was not there yet, so the request was sent again until it was: ` +
        `${String(tries)} tries in ${String(Date.now() - askedFrom)} ms.`,
    )
  }
  say(
    jobObjects === null
      ? `Asked process group ${String(held.pid)} to stop, with SIGTERM.`
      : theGroupWasAskedToStopWords(held.pgid),
  )
  const deadline = Date.now() + STOP_WAIT_MS
  for (;;) {
    const holder = whoHoldsTheLock(held, theProcessReading)
    const lock = readTheServiceLock(service.lockPath)
    const lockGone = lock.state === 'absent' || (lock.state === 'read' && lock.lock.token !== held.token)
    if (holder.state !== 'held' && lockGone) {
      say(theServerStoppedWords(held.pid))
      return theHolderAfterTheServer(service, keepTheHolder)
    }
    if (Date.now() >= deadline) {
      say(
        holder.state === 'held'
          ? `Process ${String(held.pid)} is still running ${String(STOP_WAIT_MS / 1000)} seconds after it was asked to stop.`
          : `Process ${String(held.pid)} has ended, but its service lock ${service.lockPath} is still there.`,
      )
      say(`Nothing more was sent to it. Its output is in ${service.logPath}.`)
      return EXIT.FAILED
    }
    await sleep(200)
  }
}

/** @param {ReturnType<typeof theService>} service */
async function restart(service) {
  const stand = await whereThingsStand(service)
  if (stand.lock === 'absent' && !stand.answer.ours) {
    say('Nothing was running, so nothing was stopped.')
    return start(service)
  }
  if (stand.lock === 'stale') {
    say(`The service lock ${service.lockPath} is stale, so nothing was stopped.`)
    return start(service)
  }
  /**
   * THE SHAPE IS DECIDED BEFORE ANYTHING IS STOPPED, from the lock alone: a readable starter record
   * means the office runs under serve-dev, and it is started again the same way, in the checkout the
   * lock named. That checkout is allowed in exactly two cases: it is this checkout, or it is the
   * stable checkout this checkout's `.env` pairs with. Any other checkout is refused before the stop,
   * because another checkout's settings are not this command's to read. An unread starter record is
   * refused here too: without a start time there is no way to tell which process it was, so nothing
   * is stopped.
   */
  if (stand.lock === 'held' && stand.held.starter !== undefined && 'unread' in stand.held.starter) {
    say(
      `This command will not restart the office the service lock ${service.lockPath} names: it was taken when the ` +
        `process that started this server could not be read (${stand.held.starter.unread}), so this command cannot ` +
        'tell which shape to bring back.',
    )
    say(NOTHING_WAS_STOPPED)
    return EXIT.STARTER_UNSUITABLE
  }
  /** @type {{ shape: 'serve-dev', checkout: string, databasePath: string, port: number } | null} */
  let asStopped = null
  if (stand.lock === 'held' && stand.held.starter !== undefined) {
    const there = realpathOf(stand.held.checkout)
    const here = realpathOf(REPO_ROOT)
    const paired = theStableCheckoutThisCheckoutPairsWith(NOTHING_WAS_STOPPED)
    const isThisCheckout = there !== null && here !== null && there === here
    const isThePairedStable = there !== null && paired !== null && there === paired
    if (!isThisCheckout && !isThePairedStable) {
      const because =
        there === null
          ? `the checkout it names (${stand.held.checkout}) cannot be read now`
          : `the checkout it names (${stand.held.checkout}) is not the checkout this command runs from (${REPO_ROOT}), and it is not the stable checkout this checkout pairs with`
      say(`This command will not restart the office the service lock ${service.lockPath} names: ${because}.`)
      say("It starts a serve-dev office only in its own checkout, or in the stable checkout this checkout's settings pair with.")
      say(NOTHING_WAS_STOPPED)
      return EXIT.NOT_THIS_CHECKOUT
    }
    asStopped = {
      shape: 'serve-dev',
      checkout: there,
      // THE DATABASE the office is started on: the lock's own when it ran from this checkout, and this
      // checkout's canonical database when it ran from the paired stable checkout, whose settings come
      // from this checkout.
      databasePath: isThisCheckout ? stand.held.database : canonicalDatabasePath(),
      port: stand.held.port,
    }
  }
  // A RESTART THAT CARRIES THE TEST SUITE'S MARK is asked before the stop, with the shape it would start again: the
  // ordinary start after the stop may take the paired branch, so that is asked too.
  const untied = whyThisMarkedStartMayNotGoOn(service, asStopped)
  if (untied !== null) {
    process.stderr.write(`${untied}\n`)
    return EXIT.FAILED
  }
  const stopped = await stop(service, { keepTheHolder: true })
  if (stopped !== EXIT.OK) {
    say('Nothing was started, because the service was not stopped.')
    return stopped
  }
  return start(service, asStopped)
}

/**
 * WATCH: start the service, then start it again by the window's rule when it ends with no stop asked for, and stop
 * it on SIGTERM. The Linux login unit runs this as its main process (src/config/start-at-login.mjs,
 * src/config/the-login-watch.mjs).
 *
 * @param {ReturnType<typeof theService>} service
 */
function watch(service) {
  return watchForTheLoginService({ lockPath: service.lockPath, run: (verb) => (verb === 'start' ? start(service) : stop(service)) })
}

/**
 * THE DATABASE THE RUNNING OFFICE NAMES, from GET /api/health at the port this command serves, or null when nothing
 * answers or the answer names no database.
 *
 * Health never reads which program sent a request. Most other doors read that first for a request with no key, and on
 * Windows that reading can take longer than this ask waits, so the office answers 503 and the move would switch back.
 *
 * @param {number} [port] The port this command serves, unless a test names another.
 * @returns {Promise<string | null>}
 */
export async function askWhichDatabaseTheOfficeNames(port = theService().port) {
  try {
    const reply = await fetch(`http://127.0.0.1:${String(port)}/api/health`, { signal: AbortSignal.timeout(5_000) })
    if (!reply.ok) return null
    const body = /** @type {{ path?: unknown }} */ (await reply.json())
    return typeof body.path === 'string' ? body.path : null
  } catch {
    return null
  }
}

/**
 * THE WAYS A MOVE STOPS AND STARTS THIS OFFICE. A fresh `theService()` is read each time, so the start after the
 * switch reads the new `.env` line. The move is handed the start-at-login reading, and its stop chooses the running
 * word from it: on Linux the login unit is stopped when `systemctl --user is-active` says it is running, and the unit
 * is started again only when that stop stopped it; every other stop and start runs the service command's own stop and
 * start.
 * @returns {{ envFile: string, markPath: string, stop: () => Promise<{ ok: boolean, says: string }>,
 *   start: () => Promise<{ ok: boolean, says: string }>, theRuntimeDatabase: () => Promise<string | null>,
 *   theLoginUnit: () => Promise<import('./start-at-login.mjs').StartAtLoginReading> }}
 */
function theMoveWays() {
  return {
    envFile: ENV_FILE,
    markPath: theMoveMarkPath(ENV_FILE),
    theLoginUnit: async () => {
      const { readStartAtLogin, theOfficeThisServerIs } = await import('./start-at-login.mjs')
      return readStartAtLogin({ home: homedir(), office: theOfficeThisServerIs() })
    },
    ...theStopAndStartOfAMove({
      theUnitsReading: async () => {
        if (process.platform !== 'linux') return null
        const { readStartAtLogin, theOfficeThisServerIs } = await import('./start-at-login.mjs')
        return readStartAtLogin({ home: homedir(), office: theOfficeThisServerIs() })
      },
      stopTheUnit: async () => {
        const { stopTheStartAtLoginUnit } = await import('./start-at-login.mjs')
        return stopTheStartAtLoginUnit()
      },
      startTheUnit: async () => {
        const { startTheStartAtLoginUnit } = await import('./start-at-login.mjs')
        return startTheStartAtLoginUnit()
      },
      stopTheService: async () => {
        const code = await stop(theService())
        return code === EXIT.OK ? { ok: true, says: '' } : { ok: false, says: theServiceStopFailedWords(code) }
      },
      startTheService: async () => {
        const code = await start(theService())
        return code === EXIT.OK ? { ok: true, says: '' } : { ok: false, says: theServiceStartFailedWords(code) }
      },
    }),
    theRuntimeDatabase: async () => {
      const deadline = Date.now() + START_WAIT_MS
      for (;;) {
        const database = await askWhichDatabaseTheOfficeNames()
        if (database !== null) return database
        if (Date.now() >= deadline) return null
        await sleep(250)
      }
    },
  }
}

/**
 * THE `data-folder` VERB: `where` prints the folder and who chose it, `choose <place>` records a first install's place,
 * and `move <place>` moves the folder. It answers the exit code for the step.
 * @param {string[]} args
 * @returns {Promise<number>}
 */
async function dataFolder(args) {
  const [verb, ...rest] = args
  try {
    if (verb === 'where' && rest.length === 0) {
      const where = whereTheDataIs()
      say(where.folder)
      say(theChosenByWords(where.chosenBy))
      return EXIT.OK
    }
    if (verb === 'choose' && rest.length === 1) {
      const chosen = chooseTheDataFolder(/** @type {string} */ (rest[0]))
      say(theDataFolderWasChosenWords(chosen.database, chosen.envFile))
      return EXIT.OK
    }
    if (verb === 'move' && rest.length === 1) {
      const last = await moveTheDataFolder(/** @type {string} */ (rest[0]), theMoveWays())
      if ('refused' in last) {
        process.stderr.write(`${last.refused}\n`)
        return EXIT.FAILED
      }
      if (last.state === 'started') {
        say(last.says ?? theMoveDidNotFinishWords(last.state))
        return EXIT.OK
      }
      process.stderr.write(`${last.says ?? theMoveDidNotFinishWords(last.state)}\n`)
      return EXIT.FAILED
    }
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
    return EXIT.FAILED
  }
  process.stderr.write(`${USAGE}\n`)
  return EXIT.USAGE
}

const USAGE = [
  'Usage: npm run mole-office <start | status | stop | restart | watch | data-folder>',
  '  start        start the Mole Office service, or find the one already running for this database',
  '  status       say whether the service is running for this database',
  '  stop         stop the service the service lock names, and its terminal holder',
  '  restart      stop the service, then start it; the terminal holder keeps running',
  '  watch        start the service, start it again when it ends with no stop asked for, and stop it on SIGTERM',
  '  data-folder where            print the data folder, then who chose it',
  '  data-folder choose <place>   record the data folder for a first install',
  '  data-folder move <place>     move the data folder, stopping and starting the office',
  '  settings-folder remove       remove the settings folder, keeping every data folder in it',
  'The database, the port, the lock and the log come from .env and the environment, as for the server.',
].join('\n')

/**
 * @param {string[]} args
 * @returns {Promise<number>}
 */
export async function main(args) {
  const [what, ...rest] = args
  if (what === 'data-folder') return dataFolder(rest)
  if (what === 'settings-folder') return settingsFolder(rest, { EXIT, USAGE })
  if (rest.length > 0 || what === undefined) {
    process.stderr.write(`${USAGE}\n`)
    return EXIT.USAGE
  }
  const commands = { start, status, stop, restart, watch }
  if (!Object.hasOwn(commands, what)) {
    process.stderr.write(`"${what}" is not a mole-office command.\n${USAGE}\n`)
    return EXIT.USAGE
  }
  return commands[/** @type {keyof typeof commands} */ (what)](theService())
}

if (isTheProgramRun(import.meta.url, THE_COMMAND_ENTRY)) {
  // A restart press prepares this detached command before answering. It acts only after the
  // response finishes. A lost parent or a minute without the answer cancels the request.
  if (process.argv.includes('--after-answer')) {
    const go = await new Promise((done) => {
      const limit = setTimeout(() => done(false), 60_000)
      process.once('disconnect', () => { clearTimeout(limit); done(false) })
      process.once('message', (message) => { clearTimeout(limit); done(message === 'the answer was sent') })
      process.send?.('ready')
    })
    if (!go) process.exit(1)
    process.disconnect?.()
    process.argv = process.argv.filter((word) => word !== '--after-answer')
  }
  // A module that start-at-login.mjs imports back must finish loading before main asks for it, so the entry does not await.
  main(process.argv.slice(2)).then((code) => process.exit(code))
}
