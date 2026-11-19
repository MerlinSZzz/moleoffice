// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
// @ts-check
/**
 * ONE MEMORY LIMIT FOR ALL SANDBOXES TOGETHER, SET BY THE PERSON'S PRESS. Every sandbox container is under one
 * systemd slice (src/config/sandbox-slice.mjs), and this file sets MemoryMax on that slice, takes it off again, and
 * reads whether it is set.
 *
 * ---------------------------------------------------------------------------------------
 * WHY pkexec, AND WHY THE COMMANDS ARE FIXED HERE
 * ---------------------------------------------------------------------------------------
 *
 * A limit on a system slice can only be set by an administrator. Chapter 10 rule 4 of the default regulations is that
 * nothing the person must do is a command in a terminal, so it is a press. The press runs pkexec, so the system's own
 * dialog asks for the person's password each time and the office never holds root.
 *
 * pkexec runs root-owned system programs with the arguments written below, and nothing else. There is no helper
 * script: a file the person's account can write could be changed between their reading the page and their press,
 * and would then run as root. The page shows the same arrays as text, so what the person reads is what runs.
 *
 * `systemctl set-property` without --runtime keeps the limit across reboots, in a drop-in under
 * /etc/systemd/system.control/. `systemctl revert` takes that drop-in away again, so the slice has no limit.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THE PRESS ANSWERS
 * ---------------------------------------------------------------------------------------
 *
 * pkexec's own exit codes (pkexec(1)): 126 when the person dismissed the dialog, 127 when they are not authorized or no
 * authorization could be asked for (no polkit agent answers for this server's login, among others). Any other code is
 * the code of systemctl. A press is `done` only when systemctl exited 0 and the read afterwards agrees; an exit of 0
 * whose read does not agree is `failed`, because the limit is not what the press says.
 *
 * NO DIALOG WITHIN A MINUTE: pkexec waits as long as its dialog does, and a dialog that never came (no polkit agent on
 * the screen the person is at) would hold the press for ever. So pkexec is started in a process group of its own, and
 * when it has not exited within the wait the press sends SIGTERM to that group, and SIGKILL five seconds later if
 * anything of it is still there. Nothing was run as root, because the dialog was never answered, and the press says so.
 * If the group cannot be stopped, the press says that instead and does not claim that nothing changed.
 */

import { execFile, spawn } from 'node:child_process'
import { totalmem } from 'node:os'
import { SANDBOX_SLICE } from './sandbox-slice.mjs'
import { thisSystem } from './systems/the-system.mjs'

/** The limit, in systemd's own unit: 60G is 60 GiB. */
export const THE_SANDBOX_CAP = '60G'

/** The limit in bytes, as `systemctl show` prints it back. */
export const THE_SANDBOX_CAP_BYTES = 60 * 1024 ** 3

/** How long the press waits for the system's dialog to be answered. */
export const THE_DIALOG_WAIT_MS = 60_000

/** How long the press waits after SIGTERM before it sends SIGKILL. */
const THE_KILL_GRACE_MS = 5_000

/**
 * The root-owned system programs the press runs. Tests stand them in through `programs`; the doors never pass it.
 * @typedef {{ pkexec: string, systemctl: string }} ThePrograms
 * @type {Readonly<ThePrograms>}
 */
export const THE_PROGRAMS = Object.freeze({ pkexec: '/usr/bin/pkexec', systemctl: '/usr/bin/systemctl' })

/**
 * THE ONE PLACE A COMMAND IS BUILT: on sets the limit, off takes it away.
 * @param {boolean} on
 * @param {ThePrograms} programs
 * @returns {readonly string[]}
 */
function theCommand(on, programs) {
  const what = on ? ['set-property', SANDBOX_SLICE, `MemoryMax=${THE_SANDBOX_CAP}`] : ['revert', SANDBOX_SLICE]
  return Object.freeze([programs.pkexec, programs.systemctl, ...what])
}

/** What runs as administrator when the person turns the limit on. */
export const THE_CAP_ON_COMMAND = theCommand(true, THE_PROGRAMS)

/** What runs as administrator when the person takes the limit away. */
export const THE_CAP_OFF_COMMAND = theCommand(false, THE_PROGRAMS)

/** How much memory this computer has, in bytes, so the page can say how much of it the limit leaves the sandboxes. */
export function theMachinesMemory() {
  return totalmem()
}

/** The two commands as the page shows them, word for word. */
export const THE_CAP_ON_TEXT = THE_CAP_ON_COMMAND.join(' ')
export const THE_CAP_OFF_TEXT = THE_CAP_OFF_COMMAND.join(' ')

/**
 * @typedef {{ held: 'on' | 'off' | 'other' | 'unreadable', bytes: number | null, says: string }} SandboxCapReading
 * @typedef {'done' | 'already' | 'cancelled' | 'not authorized' | 'no dialog' | 'failed' | 'not readable'} SandboxCapOutcome
 * @typedef {{ outcome: SandboxCapOutcome, reason: string | null, reading: SandboxCapReading | null, says: string }} SandboxCapDone
 */

/**
 * The first line a program wrote, or null.
 * @param {string} text
 */
function firstLine(text) {
  const line = text.split('\n').find((one) => one.trim() !== '')
  return line === undefined ? null : line.trim().slice(0, 200)
}

/**
 * WHETHER THE LIMIT HOLDS, AS SYSTEMD SAYS: `systemctl show <slice> -p MemoryMax --value`, which needs no root. It
 * prints the limit in bytes, or `infinity` when there is none. Any other answer, and no answer, is `unreadable`, never
 * a guess.
 * @param {{ systemctl?: string, platform?: string }} [input]
 * @returns {Promise<SandboxCapReading>}
 */
export async function readTheSandboxCap(input = {}) {
  const platform = input.platform ?? process.platform
  if (platform !== 'linux') {
    return { held: 'unreadable', bytes: null, says: `The limit is set through systemd, which is on Linux only, and this computer runs ${platform}.` }
  }
  const systemctl = input.systemctl ?? THE_PROGRAMS.systemctl
  /** @type {{ code: number | string | null, out: string, err: string }} */
  const said = await new Promise((resolve) => {
    execFile(systemctl, ['show', SANDBOX_SLICE, '-p', 'MemoryMax', '--value'], { encoding: 'utf8', timeout: 10_000 }, (err, out, errOut) => {
      const code = err === null ? 0 : (/** @type {{ code?: number | string }} */ (err).code ?? null)
      resolve({ code, out: String(out), err: String(errOut ?? '') || (err === null ? '' : err.message) })
    })
  })
  if (said.code !== 0) {
    const why = said.code === 'ENOENT' ? `there is no ${systemctl} on this computer` : (firstLine(said.err) ?? `it exited with ${String(said.code)}`)
    return { held: 'unreadable', bytes: null, says: `systemd could not be asked about ${SANDBOX_SLICE}: ${why}.` }
  }
  const word = said.out.trim()
  if (word === 'infinity') return { held: 'off', bytes: null, says: `${SANDBOX_SLICE} has no memory limit: the sandboxes together may use all of this computer's memory.` }
  if (!/^\d+$/.test(word)) return { held: 'unreadable', bytes: null, says: `systemd answered "${word.slice(0, 80)}" for the limit of ${SANDBOX_SLICE}, which is not a number of bytes.` }
  const bytes = Number(word)
  if (bytes === THE_SANDBOX_CAP_BYTES) return { held: 'on', bytes, says: `${SANDBOX_SLICE} is held to ${THE_SANDBOX_CAP}: the sandboxes together may use at most that.` }
  return { held: 'other', bytes, says: `${SANDBOX_SLICE} is held to ${String(bytes)} bytes, which is not the ${THE_SANDBOX_CAP} this press sets.` }
}

/**
 * Whether anything of a process group is still there. EPERM means it is there and not ours to signal.
 * @param {number} group
 */
function theGroupIsThere(group) {
  try {
    thisSystem().groups.signal(group, 0)
    return true
  } catch (err) {
    return /** @type {{ code?: string }} */ (err).code !== 'ESRCH'
  }
}

/**
 * Signal a process group, and say whether the signal could be sent.
 * @param {number} group
 * @param {NodeJS.Signals} signal
 */
function signalTheGroup(group, signal) {
  try {
    thisSystem().groups.signal(group, signal)
    return true
  } catch {
    return false
  }
}

/**
 * Wait until the group has gone, for at most `ms`. True when it has gone.
 * @param {number} group
 * @param {number} ms
 */
async function theGroupGoes(group, ms) {
  const until = Date.now() + ms
  while (theGroupIsThere(group)) {
    if (Date.now() >= until) return false
    await new Promise((resolve) => setTimeout(resolve, 50))
  }
  return true
}

/**
 * THE PERSON'S PRESS: SET THE LIMIT, OR TAKE IT AWAY, through pkexec, so the system's dialog asks for the person's
 * password. The comment at the top of this file says what each answer means. Nothing is run when the limit cannot be
 * read, because then the press could not say whether it worked, and nothing is run when the limit is already as the
 * person asks.
 * @param {boolean} on
 * @param {{ programs?: ThePrograms, waitMs?: number, platform?: string }} [options] `programs` is for tests only.
 * @returns {Promise<SandboxCapDone>}
 */
export async function pressTheSandboxCap(on, options = {}) {
  const programs = options.programs ?? THE_PROGRAMS
  const waitMs = options.waitMs ?? THE_DIALOG_WAIT_MS
  const wanted = on ? 'on' : 'off'
  const before = await readTheSandboxCap({ systemctl: programs.systemctl, platform: options.platform })
  if (before.held === 'unreadable') {
    return { outcome: 'not readable', reason: before.says, reading: before, says: `Nothing was run, because whether the limit holds cannot be read: ${before.says}` }
  }
  if (before.held === wanted) {
    return { outcome: 'already', reason: null, reading: before, says: `Nothing was run, because the limit is already ${wanted}.` }
  }
  const [program, ...args] = theCommand(on, programs)
  const child = spawn(/** @type {string} */ (program), args, { detached: true, stdio: ['ignore', 'ignore', 'pipe'] })
  let errOut = ''
  child.stderr?.setEncoding('utf8')
  child.stderr?.on('data', (chunk) => {
    if (errOut.length < 4096) errOut += String(chunk)
  })
  /** @type {{ how: 'exited', code: number | null } | { how: 'did not start', why: string } | { how: 'waited too long' }} */
  const ended = await new Promise((resolve) => {
    const timer = setTimeout(() => resolve({ how: 'waited too long' }), waitMs)
    child.once('error', (err) => {
      clearTimeout(timer)
      resolve({ how: 'did not start', why: err.message })
    })
    // 'close', not 'exit': stderr is read to its end before the answer is made from it.
    child.once('close', (code) => {
      clearTimeout(timer)
      resolve({ how: 'exited', code })
    })
  })
  if (ended.how === 'did not start') {
    return { outcome: 'failed', reason: ended.why, reading: null, says: `pkexec could not be started (${ended.why}). Nothing was run.` }
  }
  if (ended.how === 'waited too long') {
    const group = /** @type {number} */ (child.pid)
    signalTheGroup(group, 'SIGTERM')
    let gone = await theGroupGoes(group, THE_KILL_GRACE_MS)
    if (!gone) {
      signalTheGroup(group, 'SIGKILL')
      gone = await theGroupGoes(group, 1_000)
    }
    if (!gone) {
      return {
        outcome: 'failed',
        reason: `process group ${String(group)} could not be stopped`,
        reading: null,
        says: `No dialog was answered within ${String(Math.round(waitMs / 1000))} seconds, and the request (process group ${String(group)}) could not be stopped. Whether it changes the limit is not known.`,
      }
    }
    return { outcome: 'no dialog', reason: null, reading: null, says: `No dialog was answered within ${String(Math.round(waitMs / 1000))} seconds, so the request was stopped. Nothing was changed.` }
  }
  const reason = firstLine(errOut)
  if (ended.code === 126) return { outcome: 'cancelled', reason, reading: null, says: 'The dialog was cancelled. Nothing was changed.' }
  if (ended.code === 127) {
    return { outcome: 'not authorized', reason, reading: null, says: `pkexec did not get permission${reason === null ? '' : ` (${reason})`}. Nothing was changed.` }
  }
  if (ended.code !== 0) {
    return { outcome: 'failed', reason: reason ?? `exit ${String(ended.code)}`, reading: null, says: `systemctl failed (${reason ?? `exit ${String(ended.code)}`}).` }
  }
  const after = await readTheSandboxCap({ systemctl: programs.systemctl, platform: options.platform })
  if (after.held !== wanted) {
    return { outcome: 'failed', reason: after.says, reading: after, says: `systemctl said it was done, but the limit read afterwards is not ${wanted}: ${after.says}` }
  }
  return { outcome: 'done', reason: null, reading: after, says: `Done. ${after.says}` }
}
