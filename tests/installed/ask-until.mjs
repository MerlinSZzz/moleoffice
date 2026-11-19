// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * ASK THE WINDOW AGAIN UNTIL IT SAYS WHAT IS WANTED, WITH A LIMIT ON EACH ASK AS WELL AS ON THE WHOLE WAIT.
 *
 * Round 15's container run (installers 0b21663e4) failed one step in Chinese, in the .deb run without
 * Chromium's sandbox and in the AppImage: "the check page drawn in the dark look". The pictures show the
 * page drew. Each failing run's window log, and no passing run's, shows the GPU process exiting just
 * after a picture was taken ("GPU process exited unexpectedly: exit_code=9", after a CopyOutputResult
 * message was refused). The probe's next ask then got no answer for 30 seconds, and 30 seconds was the
 * whole wait, so the probe never asked a second time.
 *
 * So each ask has its own limit, shorter than the whole wait, and an ask that is not answered in time is
 * counted and asked again. The result says how many asks went unanswered, so a step that passes after a
 * stall says so rather than hiding it.
 *
 * Kept apart from drive-the-window.mjs, which runs as soon as it is imported, so a test can import this.
 * The container run copies this file beside the driver, so it also holds the other things every driver
 * in this folder shares: the plain environment, the check of an installation's own Node and the free port below.
 */

import { existsSync } from 'node:fs'
import { createServer } from 'node:net'
import { dirname, join } from 'node:path'

/**
 * THE ENVIRONMENT A DRIVER GIVES WHAT IT STARTS: its own, with nothing that names an office or an agent.
 *
 * Problem JQ3yaANBi1JC. A sandbox gives its agent's shell MOLE_OFFICE_API, which names the owner's live
 * office, with MOLE_OFFICE_SESSION and the agent's key. At 22:25 on 4 October wave 13t's round 16 ran the
 * bundled for-agents/register-myself.mjs from that shell without --api, to see that it starts, and the tool
 * asked the live office to register an agent "x". A window started from that shell passes the same
 * settings on to the office it starts, which then tells every agent that registers with it that its office
 * is the live one (src/server/api/participants.ts answers with its own MOLE_OFFICE_API). So every variable
 * whose name begins MOLE_OFFICE_, and MOLE_AGENT_KEY, stays behind: a driver names the office it means by
 * --api, or reads it from the lock of the office its window started, and never inherits one.
 * tests/the-installed-office-carries-what-an-agent-starts-with.test.ts runs a driver from such a shell,
 * with the address pointing at a stand-in, and fails when anything reaches the stand-in.
 *
 * ELECTRON_RUN_AS_NODE STAYS BEHIND AS WELL. On Linux a driver runs on the app's own program, told by that
 * variable to run as Node. A window started with it would run as Node too, and never open. A tool that needs
 * it is given it on its own, from what the office says its Node needs (`forAgents.environment`).
 *
 * @param {NodeJS.ProcessEnv} env
 * @returns {NodeJS.ProcessEnv}
 */
export function aPlainEnvironment(env) {
  return Object.fromEntries(Object.entries(env).filter(([name]) => !name.startsWith('MOLE_OFFICE_') && name !== 'MOLE_AGENT_KEY' && name !== 'ELECTRON_RUN_AS_NODE'))
}

/**
 * WHETHER A PROGRAM IS THE NODE AN INSTALLED OFFICE RUNS ON. On Windows and the Mac that is the Node the
 * installation carries, resources/office/runtime/bin/node. On Linux it is the app's own program, which
 * sits beside resources/, whose office folder holds the build stamp.
 *
 * @param {string} program
 * @returns {boolean}
 */
export function isTheInstallationsOwnNode(program) {
  if (program.endsWith('/resources/office/runtime/bin/node')) return true
  return existsSync(join(dirname(program), 'resources', 'office', 'build-stamp.json'))
}

/**
 * THE ONE SETTING A DRIVER GIVES THE WINDOW IT STARTS. A driver reaches the window through Node's
 * inspector, and the window refuses to start with --inspect unless this says on (wave 13t, round 23;
 * src/desktop/the-debugging-switches.mjs). It names no office.
 */
export const THE_WINDOW_MAY_BE_DEBUGGED = Object.freeze({ MOLE_OFFICE_WINDOW_DEBUGGING: 'on' })

/**
 * A PORT ON 127.0.0.1 THAT NOTHING HOLDS, asked of the system, for the inspector of the window a driver starts.
 *
 * Wave 13t, round 19b. The drivers gave their windows fixed inspector ports (9229 and 9230). Two test files
 * that run drive-the-window.mjs, run side by side as the full suite runs files, met at 9229, and one went red
 * every time (the inspector's check n9aXRJuZT_a5). The port is free when it is handed over and the window
 * takes it a moment later; nothing else on the machine is meant to take a port the system just handed out.
 *
 * @returns {Promise<number>}
 */
export function aFreePort() {
  return new Promise((done, fail) => {
    const probe = createServer()
    probe.once('error', fail)
    probe.listen(0, '127.0.0.1', () => {
      const address = probe.address()
      probe.close(() => (address !== null && typeof address === 'object' ? done(address.port) : fail(new Error(`the system answered a request for a free port with ${String(address)}`))))
    })
  })
}

/** What an ask that ran out of time is answered with. A promise cannot be resolved with itself, so it is a value of its own. */
const LATE = Symbol('no answer in time')

/**
 * @template T
 * @param {{
 *   ask: () => Promise<T>,
 *   right: (answer: T) => boolean,
 *   waitMs: number,
 *   eachAskMs: number,
 *   betweenMs?: number,
 * }} how
 * @returns {Promise<{ right: boolean, last: T | { error: string } | null, unanswered: number, asked: number }>}
 */
export async function askUntil({ ask, right, waitMs, eachAskMs, betweenMs = 250 }) {
  if (!(eachAskMs < waitMs)) {
    throw new Error(`Each ask's limit (${String(eachAskMs)} ms) must be shorter than the whole wait (${String(waitMs)} ms), or one ask that hangs uses the whole wait.`)
  }
  const deadline = Date.now() + waitMs
  /** @type {T | { error: string } | null} */
  let last = null
  let unanswered = 0
  let asked = 0
  while (Date.now() < deadline) {
    asked++
    /** @type {ReturnType<typeof setTimeout> | undefined} */
    let timer
    const late = new Promise((done) => {
      timer = setTimeout(() => done(LATE), Math.min(eachAskMs, Math.max(0, deadline - Date.now())))
    })
    try {
      const answer = await Promise.race([ask(), late])
      if (answer === LATE) {
        unanswered++
        last = { error: `no answer within ${String(eachAskMs)} ms` }
        continue
      }
      last = /** @type {T} */ (answer)
      if (right(/** @type {T} */ (answer))) return { right: true, last, unanswered, asked }
    } catch (err) {
      last = { error: String(err instanceof Error ? err.message : err) }
    } finally {
      clearTimeout(timer)
    }
    await new Promise((done) => setTimeout(done, betweenMs))
  }
  return { right: false, last, unanswered, asked }
}
