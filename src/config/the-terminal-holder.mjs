// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
// @ts-check
/**
 * WHERE THE TERMINAL HOLDER IS, AND THE WORDS IT AND THE SERVER SPEAK. Wave 13u, round 1.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THE HOLDER IS
 * ---------------------------------------------------------------------------------------
 *
 * The office's own terminals are held, as design report 6NVaDzG7tyUB block b-4 says, by a small
 * process of their own, src/holder/index.mjs. A terminal dies with
 * the process that holds it. If the server held them, every merge, restart and tray Restart would end
 * every terminal. So the service command starts the holder beside the server, and the server talks
 * to it over a local socket.
 *
 * Three programs read this file: the holder, the service command that starts it, and the server that
 * talks to it. So the place of the socket, the place of the log and the limits are worked out here
 * once, and the three cannot disagree.
 *
 * ---------------------------------------------------------------------------------------
 * WHERE THE SOCKET IS, AND WHY
 * ---------------------------------------------------------------------------------------
 *
 * In `terminals/` inside the per-user data folder (`thePerUserDataFolder`). The folder is made
 * readable by this user only (mode 0700) and the socket too (0600), so another user of the machine
 * cannot type into a terminal. A program running as this same user can: the holder checks nobody, and
 * who may type is decided at the server's doors (src/server/api/terminals.ts says what that leaves).
 *
 * The socket's name is made from the database's path. One machine can run more than one office: a
 * test world, a scratch server of a test, a sandbox. Each office has its own database, so each gets
 * its own holder, and a test's server can never reach the office's terminals. The name is a hash
 * rather than the path itself because a Unix socket's path may be at most 107 bytes on Linux.
 *
 * ON A MAC THE LIMIT IS 103 BYTES, and the data folder is under ~/Library/Application Support, which
 * is longer than Linux's ~/.config. When that path does not fit, the socket goes in
 * ~/.mole-office/terminals, which the holder makes readable by this user only, as it makes its usual
 * folder. Only when that does not fit either does it go in this user's own temporary folder ($TMPDIR, a
 * folder under /var/folders that only this user can open), and then it says once, on the standard
 * error, that macOS may remove files there while the holder runs. When none fits, the socket's place
 * is refused in words and no holder is started. Linux's place is unchanged. Agreed with wave 13u, the
 * holder's owner (its messages Ux__34vHQle1, round 21, and rQhMphIycPVa, round 23). Wave 13t.
 *
 * IT IS PLAIN JAVASCRIPT, like the service command, because the holder runs on plain `node` with no
 * tsx: it is kept small, and replacing it ends its terminals.
 */

import { createHash } from 'node:crypto'
import { spawn } from 'node:child_process'
import { closeSync, mkdirSync, openSync } from 'node:fs'
import { createConnection } from 'node:net'
import { join, resolve } from 'node:path'
import { THE_INSTALL, thePerUserDataFolder } from './settings.mjs'
import { theSystemFor, thisSystem } from './systems/the-system.mjs'

/**
 * The version of the words below. The holder says it when asked; a server that reads another number
 * refuses to talk to that holder rather than guess what it means.
 */
export const THE_HOLDER_PROTOCOL = 1

/**
 * Requests newer than the protocol, named by hello. A caller requires the request it needs;
 * an older holder may omit this list and continues to serve the requests it already knows.
 * The private request version describes the protocol, not host adapter readiness.
 */
export const THE_HOLDER_REQUESTS = Object.freeze(['typeALine', 'privateLoginV1'])

/**
 * @typedef {{ from: string, root: string, build: null | { version: string | null, commit: string | null, builtAt: string | null } }} ACopy
 *   a copy of Mole Office as a holder names it in its hello
 */

/**
 * THE COPY OF MOLE OFFICE THIS PROCESS RUNS FROM: a checkout or an installed copy, the folder it runs from, and an
 * installed copy's build. The holder names it in its hello.
 *
 * @param {{ from: string, root: string, build: null | { version?: unknown, commit?: unknown, builtAt?: unknown } }} [install]
 * @returns {ACopy}
 */
export function theCopyThisIs(install = THE_INSTALL) {
  const text = (/** @type {unknown} */ value) => (typeof value === 'string' ? value : null)
  const build = install.build === null ? null : { version: text(install.build.version), commit: text(install.build.commit), builtAt: text(install.build.builtAt) }
  return { from: install.from, root: install.root, build }
}

/**
 * WHY A HOLDER THAT HOLDS THIS DATABASE IS NOT THIS COPY'S, or null when it is.
 *
 * Every installed copy keeps its database in the user's own data folder, so every installed copy finds the same holder
 * socket. On a Mac on 4 November 2026 the holder of an earlier copy still answered there. A start that took it as its
 * own would have used code from a copy that was gone. So, from an installed copy:
 *   - a holder that names no copy was started by a version older than this one, which named none;
 *   - a holder from a checkout, from another folder or of another build is another copy.
 * From a checkout:
 *   - a holder from an installed copy is another copy;
 *   - a holder from another checkout is used as before, because a paired development checkout uses the stable
 *     checkout's holder, and a checkout's database is its own;
 *   - so is a holder that names no copy.
 *
 * The service command's start and the server both ask this, so they cannot disagree.
 *
 * @param {Record<string, unknown>} hello the holder's answer to hello
 * @param {{ from: string, root: string, build: null | { version?: unknown, commit?: unknown, builtAt?: unknown } }} [install]
 * @returns {{ says: string, copy: string, sameRoot: boolean, namesNoCopy: boolean, mayBeReplaced: boolean } | null}
 */
export function howTheHolderIsNotThisCopys(hello, install = THE_INSTALL) {
  const ours = theCopyThisIs(install)
  const named = /** @type {Record<string, unknown> | undefined} */ (hello['copy'])
  const pid = String(hello['pid'])
  if (named === undefined || named === null || typeof named !== 'object') {
    if (ours.from === 'checkout') return null
    return { says: `The terminal holder, process ${pid}, names no copy of Mole Office, so it was started by a version older than this one. This is ${theCopyIn(ours)}.`, copy: 'a version older than this one, which named no copy of Mole Office', sameRoot: false, namesNoCopy: true, mayBeReplaced: true }
  }
  const theirs = theCopyThisIs(/** @type {Parameters<typeof theCopyThisIs>[0]} */ ({ from: String(named['from']), root: String(named['root']), build: named['build'] ?? null }))
  const same =
    ours.from === 'checkout'
      ? theirs.from === 'checkout'
      : theirs.from === ours.from && theirs.root === ours.root && theirs.build?.commit === ours.build?.commit && theirs.build?.builtAt === ours.build?.builtAt
  if (same) return null
  const sameRoot = theirs.root === ours.root
  return { says: `The terminal holder, process ${pid}, runs from another copy of Mole Office: ${theCopyIn(theirs)}. This is ${theCopyIn(ours)}.`, copy: theCopyIn(theirs), sameRoot, namesNoCopy: false, mayBeReplaced: sameRoot }
}

/** The original sentence for a copy fault, or null when this is its holder.
 * @param {Record<string, unknown>} hello
 * @param {{ from: string, root: string, build: null | { version?: unknown, commit?: unknown, builtAt?: unknown } }} [install]
 * @returns {string | null}
 */
export function whyTheHolderIsNotThisCopys(hello, install = THE_INSTALL) {
  return howTheHolderIsNotThisCopys(hello, install)?.says ?? null
}

/**
 * A copy in words.
 *
 * @param {ACopy} copy
 */
function theCopyIn(copy) {
  if (copy.from === 'checkout') return `the checkout in ${copy.root}`
  const build = copy.build
  return `the installed copy in ${copy.root}, version ${build?.version ?? 'not named'}, built ${build?.builtAt ?? 'at a time not named'} from commit ${build?.commit ?? 'not named'}`
}

/**
 * HOW MANY LINES OF A TERMINAL'S PAST OUTPUT THE HOLDER KEEPS, above the screen. In memory only: it
 * is never written to disk or to a backup, because keys can land in a terminal's output (problem
 * __4iR4FkFAGS found a pasted key in every backup). A new viewer gets these lines and the screen.
 */
export const THE_SCROLLBACK_LINES = 5000

/**
 * THE LONGEST PATH A UNIX SOCKET MAY HAVE ON LINUX, in bytes: 108 with the closing zero. A longer path is
 * cut short by the kernel without a word, and the holder would listen somewhere nobody looks.
 */
export const THE_LONGEST_SOCKET_PATH_BYTES = 107

/** THE SAME ON A MAC: 104 with the closing zero (sun_path in the Mac's sys/un.h). */
export const THE_LONGEST_SOCKET_PATH_BYTES_ON_A_MAC = 103

/**
 * The longest socket path this system allows.
 *
 * @param {string} [platform]
 */
export function theLongestSocketPathBytes(platform = process.platform) {
  return platform === 'darwin' ? THE_LONGEST_SOCKET_PATH_BYTES_ON_A_MAC : THE_LONGEST_SOCKET_PATH_BYTES
}

/** The size a terminal opens at when the caller names none. */
export const THE_FIRST_SIZE = Object.freeze({ cols: 120, rows: 32 })

/** The largest size a terminal may be given, either way. */
export const THE_LARGEST_SIDE = 1000

/**
 * THE LONGEST LINE THE HOLDER READS FROM ONE CONNECTION, in characters. A line is one request. Typing and
 * pasting go through it, so it allows a long paste, and a longer line is refused rather than held.
 */
export const THE_LONGEST_REQUEST_CHARACTERS = 1024 * 1024


/**
 * The folder the holder's log is in, for this user, and its socket unless that would be too long on a Mac.
 *
 * @param {Record<string, string | undefined>} [env]
 * @param {string} [platform]
 */
export function theTerminalHolderFolder(env = process.env, platform = process.platform) {
  return join(thePerUserDataFolder(env, platform), 'terminals')
}

/**
 * The name both files share, made from the database's absolute path.
 *
 * @param {string} databasePath
 */
function theNameFor(databasePath) {
  return createHash('sha256').update(resolve(databasePath)).digest('hex').slice(0, 16)
}

/** Whether this process has already said that its socket is in TMPDIR. Once per process is enough. */
let theTemporaryPlaceWasSaid = false

/**
 * THE SOCKET THE HOLDER OF THE OFFICE ON THIS DATABASE LISTENS ON.
 *
 * On Linux it is always in the holder's folder; a path too long there is refused by the holder when it
 * starts. On a Mac a path too long there moves to ~/.mole-office/terminals, then to $TMPDIR, and a path
 * too long in all three is refused here. On Windows it is a named pipe made from the same name, by the system
 * layer in src/config/systems/the-system.mjs. Holders have run on a Windows 11 machine since wave 13t's round W14.
 *
 * @param {string} databasePath
 * @param {Record<string, string | undefined>} [env]
 * @param {string} [platform]
 * @param {(words: string) => void} [say] where the sentence about TMPDIR goes; the standard error
 */
export function theTerminalHolderSocket(databasePath, env = process.env, platform = process.platform, say = (words) => void process.stderr.write(`${words}\n`)) {
  const name = theNameFor(databasePath)
  const { holderAddress } = theSystemFor(platform)
  const usual = holderAddress(name, theTerminalHolderFolder(env, platform))
  const longest = theLongestSocketPathBytes(platform)
  if (platform !== 'darwin' || Buffer.byteLength(usual) <= longest) return usual
  const fits = (/** @type {string | null} */ path) => path !== null && Buffer.byteLength(path) <= longest
  const inHome = env.HOME ? holderAddress(name, join(env.HOME, '.mole-office', 'terminals')) : null
  if (fits(inHome)) return /** @type {string} */ (inHome)
  const temporary = env.TMPDIR ? holderAddress(name, join(env.TMPDIR, 'mole-office-terminals')) : null
  if (fits(temporary)) {
    if (!theTemporaryPlaceWasSaid) {
      theTemporaryPlaceWasSaid = true
      say(
        `The terminal holder's socket is ${String(temporary)}, in TMPDIR, because the shorter places did not fit a Mac's ` +
          `${String(longest)} bytes. macOS may remove files in TMPDIR that have not been used for a while, even while the ` +
          "holder runs; then the office cannot reach the holder's terminals until the holder is started again. " +
          'Point HOME at a shorter folder to keep the socket out of TMPDIR.',
      )
    }
    return /** @type {string} */ (temporary)
  }
  const tooLong = (/** @type {string} */ path) => `${path}, which is ${String(Buffer.byteLength(path))} bytes long`
  throw new Error(
    `The terminal holder's socket would be ${tooLong(usual)}, and on a Mac a Unix socket's path may be at most ` +
      `${String(longest)}. ` +
      (inHome === null ? 'HOME is not set, so ~/.mole-office/terminals cannot be used. ' : `The place in HOME would be ${tooLong(inHome)}. `) +
      (temporary === null ? 'TMPDIR is not set, so there is no shorter folder to use. ' : `The place in TMPDIR would be ${tooLong(temporary)}. `) +
      'None fits. Nothing was started. Point HOME or TMPDIR at a shorter folder.',
  )
}

/** For a test: say the TMPDIR sentence again, as a new process would. */
export function forgetTheTemporaryPlaceWasSaid() {
  theTemporaryPlaceWasSaid = false
}

/**
 * THE HOLDER'S LOG. It says when the holder started and stopped and when a terminal opened and ended.
 * It never holds what a terminal showed or what was typed into one.
 *
 * @param {string} databasePath
 * @param {Record<string, string | undefined>} [env]
 */
export function theTerminalHolderLog(databasePath, env = process.env) {
  return join(theTerminalHolderFolder(env), `${theNameFor(databasePath)}.log`)
}

/**
 * HOW LONG ONE REQUEST TO THE HOLDER MAY TAKE. The holder answers from memory, so a request that
 * takes longer than this means the holder is stuck, and the caller is told so.
 */
export const ONE_REQUEST_MS = 3_000

/** How often a wait for the holder's answer counts the time that passed, and the most one count may add. */
const ONE_TICK_MS = 50
const THE_MOST_ONE_TICK_COUNTS_MS = 100

/**
 * ASK THE HOLDER ONE THING AND READ ITS ONE ANSWER, on a connection made for it and closed after.
 *
 * It resolves with the holder's answer, whether `ok` is true or false; the caller reads `ok`. It
 * rejects with a sentence when nothing answers: no socket (`code` 'absent'), nobody listening
 * ('refused'), no answer in time ('silent'), or a line that is not an answer ('garbled').
 *
 * THE WAIT COUNTS ONLY THE TIME THIS PROCESS WAS FREE TO READ THE ANSWER. A tick every 50 ms adds the
 * time since the one before, at most 100 ms of it, so a second this process spent on other work is not
 * counted as the holder's silence. When the wait is used up, the refusal is made after the process
 * has read whatever answer is already waiting on the connection.
 *
 * @param {string} socketPath
 * @param {Record<string, unknown>} request without an id; one is added.
 * @param {number} [waitMs]
 * @returns {Promise<Record<string, unknown> & { ok: boolean }>}
 */
export function askTheHolder(socketPath, request, waitMs = ONE_REQUEST_MS) {
  return new Promise((done, fail) => {
    const socket = createConnection(socketPath)
    let pending = ''
    let finished = false
    /** @param {'absent' | 'refused' | 'silent' | 'garbled' | 'closed'} code @param {string} sentence */
    const refuse = (code, sentence) => {
      if (finished) return
      finished = true
      clearInterval(tick)
      socket.destroy()
      fail(Object.assign(new Error(sentence), { code }))
    }
    let counted = 0
    let last = Date.now()
    const tick = setInterval(() => {
      const now = Date.now()
      counted += Math.min(now - last, THE_MOST_ONE_TICK_COUNTS_MS)
      last = now
      if (counted < waitMs) return
      clearInterval(tick)
      setImmediate(() =>
        refuse('silent', `The terminal holder on ${socketPath} did not answer within ${String(waitMs / 1000)} second${waitMs === 1000 ? '' : 's'}.`),
      )
    }, ONE_TICK_MS)
    socket.setEncoding('utf8')
    socket.once('connect', () => socket.write(`${JSON.stringify({ ...request, id: 1 })}\n`))
    socket.on('data', (chunk) => {
      pending += chunk
      const newline = pending.indexOf('\n')
      if (newline < 0 || finished) return
      finished = true
      clearInterval(tick)
      socket.destroy()
      try {
        const answer = JSON.parse(pending.slice(0, newline))
        if (answer === null || typeof answer !== 'object' || typeof answer.ok !== 'boolean') throw new Error('no ok')
        done(answer)
      } catch {
        fail(Object.assign(new Error(`The terminal holder on ${socketPath} answered with something that is not an answer.`), { code: 'garbled' }))
      }
    })
    socket.once('close', () => refuse('closed', `The terminal holder on ${socketPath} closed the connection without answering.`))
    socket.once('error', (/** @type {NodeJS.ErrnoException} */ err) => {
      if (err.code === 'ENOENT') refuse('absent', `No terminal holder is running for this office: there is no socket at ${socketPath}.`)
      else if (err.code === 'ECONNREFUSED') refuse('refused', `No terminal holder answers on ${socketPath}.`)
      else refuse('refused', `The terminal holder on ${socketPath} could not be reached: ${err.message}.`)
    })
  })
}

/** How long a start waits for a holder it started to answer. */
export const HOLDER_START_WAIT_MS = 10_000

/**
 * WHETHER THE HOLDER THAT ANSWERED IS THE ONE A START MADE, from the group the start made and the pid the holder said.
 * On Linux and the Mac the process started leads the group and is the holder, so the two pids are the same. On Windows
 * the process started is the starter, and the holder is the one the starter's Job Object holds, which Windows is asked
 * without holding the thread. A Job Object that does not hold it is a no. A holding that cannot be read is answered
 * as unknown, with Windows's reason, never taken as a yes or a no. A pid that is not a whole number above 0 is a no,
 * and nothing is asked about it.
 *
 * @param {number} group the pid of the process the start made
 * @param {unknown} pid the pid the holder said in its hello
 * @param {import('./systems/the-system.mjs').JobObjects | null} [jobObjects]
 * @returns {Promise<boolean | { unknown: string }>}
 */
export async function theHolderThisStartMade(group, pid, jobObjects = thisSystem().groups.jobObjects) {
  if (!Number.isSafeInteger(pid) || /** @type {number} */ (pid) <= 0) return false
  if (pid === group) return true
  if (jobObjects === null) return false
  const holding = await jobObjects.readHolds(group, /** @type {number} */ (pid))
  if ('unknown' in holding) return { unknown: holding.unknown }
  return holding.holds
}

/**
 * START A TERMINAL HOLDER FOR ONE DATABASE, unless one already answers there, and say what happened. The service command's
 * `start` asks this, and so does the server's press for a holder that is not running (src/server/api/terminals.ts), so
 * a holder is started one way. The holder is started detached, in a group of its own as the system layer starts one,
 * without --stop-with-pid, with its output going to its log; it keeps running after whoever started it.
 *
 * ON WINDOWS THAT GROUP IS A JOB OBJECT, and the process started is the layer's starter, which starts the holder inside
 * it (src/config/systems/windows-starts.mjs). So the holder answers with its own pid, which is not `child.pid`, and it
 * is the one this start made only when that Job Object holds it (`theHolderThisStartMade`). `pid` is the holder's
 * and `group` the starter's; on Linux and the Mac the two are the same process. When Windows cannot say whether that
 * Job Object holds the holder that answered, the outcome is `unknown`, with Windows's reason, and the holder is left
 * running. Holders have been started this way on a Windows 11 machine since wave 13t's round W14.
 *
 * A HOLDER OF THIS DATABASE FROM ANOTHER COPY OF MOLE OFFICE is `another-copy`, with the reason
 * `whyTheHolderIsNotThisCopys` gives. It is not used, and no holder is started, because its socket is in the way.
 *
 * @param {{ databasePath: string, how: { command: string, args: string[], environment?: Record<string, string> }, cwd: string, waitMs?: number }} options
 *   `how.environment` is what the holder's start adds to this process's environment, as howToStart('holder') gives it.
 * @returns {Promise<
 *   | { outcome: 'already', pid: number }
 *   | { outcome: 'another' }
 *   | { outcome: 'another-copy', pid: number, why: string }
 *   | { outcome: 'started', pid: number, group: number }
 *   | { outcome: 'ended', why: string, logPath: string }
 *   | { outcome: 'silent', pid: number, logPath: string }
 *   | { outcome: 'unknown', pid: number, group: number, why: string, logPath: string }
 *   | { outcome: 'could-not-spawn', why: string }
 * >}
 */
export async function startATerminalHolder(options) {
  /** @type {string} */
  let socketPath
  try {
    socketPath = theTerminalHolderSocket(options.databasePath)
  } catch (err) {
    return { outcome: 'could-not-spawn', why: err instanceof Error ? err.message : String(err) }
  }
  /** @param {Record<string, unknown>} hello */
  const isOurs = (hello) => hello.ok === true && hello.database === options.databasePath
  const already = await askTheHolder(socketPath, { op: 'hello' }).catch(() => null)
  if (already !== null) {
    if (!isOurs(already)) return { outcome: 'another' }
    const notOurs = whyTheHolderIsNotThisCopys(already)
    return notOurs === null ? { outcome: 'already', pid: Number(already.pid) } : { outcome: 'another-copy', pid: Number(already.pid), why: notOurs }
  }
  const logPath = theTerminalHolderLog(options.databasePath)
  /** @type {import('node:child_process').ChildProcess} */
  let child
  try {
    mkdirSync(theTerminalHolderFolder(), { recursive: true, mode: 0o700 })
    const log = openSync(logPath, 'a', 0o600)
    try {
      // IN A GROUP OF ITS OWN, AS THE SYSTEM LAYER STARTS ONE: a process group on Linux and the Mac, a Job Object on
      // Windows. The holder has this process's own environment, and what its start adds.
      const how = thisSystem().groups.howToStartInItsOwnGroup({
        command: options.how.command,
        args: [...options.how.args, '--database', options.databasePath],
        windowsVerbatimArguments: false,
        env: { ...process.env, ...options.how.environment },
      })
      child = spawn(how.command, how.args, {
        cwd: options.cwd,
        env: how.env,
        detached: how.detached,
        stdio: ['ignore', log, log],
        windowsHide: how.windowsHide,
        windowsVerbatimArguments: how.windowsVerbatimArguments,
      })
    } finally {
      closeSync(log)
    }
  } catch (err) {
    return { outcome: 'could-not-spawn', why: err instanceof Error ? err.message : String(err) }
  }
  /** @type {string | null} */
  let ended = null
  child.once('exit', (code, signal) => {
    ended = signal !== null ? `it was stopped by the signal ${signal}` : `it ended with exit code ${String(code)}`
  })
  child.once('error', (err) => {
    ended = `it could not be started: ${String(err)}`
  })
  const deadline = Date.now() + (options.waitMs ?? HOLDER_START_WAIT_MS)
  for (;;) {
    await new Promise((done) => setTimeout(done, 100))
    const hello = await askTheHolder(socketPath, { op: 'hello' }, 1_000).catch(() => null)
    const made = hello !== null && isOurs(hello) ? await theHolderThisStartMade(Number(child.pid), hello.pid) : false
    if (made === true) {
      child.unref()
      return { outcome: 'started', pid: Number(/** @type {Record<string, unknown>} */ (hello).pid), group: Number(child.pid) }
    }
    if (made !== false) {
      child.unref()
      return { outcome: 'unknown', pid: Number(/** @type {Record<string, unknown>} */ (hello).pid), group: Number(child.pid), why: made.unknown, logPath }
    }
    if (ended !== null || Date.now() >= deadline) {
      child.unref()
      return ended !== null ? { outcome: 'ended', why: ended, logPath } : { outcome: 'silent', pid: Number(child.pid), logPath }
    }
  }
}
