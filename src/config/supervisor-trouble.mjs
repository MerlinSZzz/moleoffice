// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
// @ts-check
/**
 * WHERE THE DEV SUPERVISOR WRITES DOWN THAT IT CANNOT START A SERVER, AND HOW THAT IS READ BACK.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS FILE EXISTS, MEASURED
 * ---------------------------------------------------------------------------------------
 *
 * Problem `5ZHmJ4_C26Y8`. On the owner's live stack on 4 September 2026 the dev supervisor tried to
 * start a fresh server every thirty seconds and failed every time, ninety-six times in a row,
 * between 09:49 and 10:36. Each failure printed a line into `.logs/dev-server-2026-09-04b.log` and
 * reached nothing else. The API answered normally the whole time — from a child the supervisor had
 * lost track of — so `GET /api/health` said nothing was wrong, the runtime record said nothing was
 * wrong, and the browser app said nothing was wrong. The only place the fault existed was a log
 * file in a terminal nobody had open.
 *
 * So the supervisor writes it into a file, and the three things a person might be looking at read
 * that file: the runtime record, `GET /api/health`, and the page that says Mole Office did not
 * start.
 *
 * ---------------------------------------------------------------------------------------
 * WHY A FILE AND NOT THE LEDGER
 * ---------------------------------------------------------------------------------------
 *
 * The ledger lives in the database the SERVER has open. A supervisor whose whole complaint is that
 * it cannot start a server has nothing to write to. It writes to its own ledger row as well, when a
 * server is answering, because that is where somebody looking at what is running will be — but the
 * file is the one that works in the state this is about.
 *
 * ONE PLACE, THREE READERS. The path and the sentence are worked out here and nowhere else:
 * `tools/serve-dev.mjs` writes it, `src/server/lib/runtime.ts` reads it, and `vite.config.ts`
 * serves it to the page that could not start. CLAUDE.md's recurring defect is the same fact worked
 * out in two places, and a file name is exactly the kind of fact that gets spelt twice.
 */

import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

/**
 * THE FILE, RELATIVE TO A CHECKOUT.
 *
 * Under `.logs/`, which is where this repository already keeps what a running stack says about
 * itself and which git ignores. Named for what it is to a reader, not for the mechanism.
 */
export const THE_TROUBLE_FILE = '.logs/the-supervisor-cannot-start-a-server.json'

/**
 * THE FILE THE LAST GUARD REFUSAL OR CURRENT SERVICE-LOCK REFUSAL IS WRITTEN TO, RELATIVE TO A CHECKOUT.
 *
 * Problem `7-lQDWANdVAn`. While the API is down because the start guard refused the database, there
 * is no server to answer and the page has nothing to read about it. The supervisor writes the
 * refusal's first line here, under `.logs/` beside the other thing it says about itself, so the one
 * process still running — the page's frame in development, or a person with a shell — can read why.
 *
 * A guard refusal is removed when the server next answers and its note has been filed. A lock
 * refusal replaces it while the lock stops a start. When the lock is found free, the supervisor
 * restores the last guard refusal if its note still awaits filing, or removes the file otherwise.
 * Inspector refusal 5DLbHt7Fq3ce, invariant 3: a lock refusal alone is not evidence for a guard note
 * or office down time. The supervisor also clears a previous supervisor's file as it starts, the
 * same way it clears the run-of-failures file.
 */
export const THE_REFUSAL_FILE = '.logs/last-refusal.txt'

/**
 * How many lines of the child's own output are kept. Enough to carry the error and the stack it
 * came with; not so many that a file somebody may open in a browser is a log in its own right.
 */
export const HOW_MANY_LINES_ARE_KEPT = 25

/**
 * HOW LONG A WRITTEN RUN OF FAILURES GOES ON MEANING ANYTHING, in milliseconds.
 *
 * The supervisor rewrites this file on every failed start, and it waits at most half a minute
 * between attempts, so a file that is still being written is never more than about thirty seconds
 * old. One that nothing has touched for two minutes belongs to a supervisor that has stopped, and a
 * reader that went on shouting about it would be reporting a fault that is over.
 *
 * ONE RULE IN ONE PLACE, and that is why it is a time rather than a look at the process table. The
 * three readers are the API server, Vite and a browser; only the first two can read a process table
 * and they would then be two spellings of "is that supervisor still going", which is the defect
 * CLAUDE.md names at the top of the file.
 */
export const THE_TROUBLE_IS_STALE_AFTER = 120_000

/**
 * WHERE VITE HANDS THIS FILE TO A BROWSER.
 *
 * The page that says Mole Office did not start cannot import anything — a module would be fetched
 * and transformed by the same machinery that notice exists to report the failure of — so the
 * address is written into `src/web/index.html` by hand as well as read from here by
 * `vite.config.ts`. That is the same fact in two places, so a test compares them:
 * `tests/the-dev-supervisor-does-not-lose-its-own-server.test.ts` fails when they disagree.
 */
export const THE_TROUBLE_ADDRESS = '/mole-office/the-supervisor-cannot-start-a-server'

/**
 * @typedef {object} SupervisorTrouble
 * @property {number} atMs when this was last written, milliseconds since the epoch
 * @property {number} sinceMs when the run of failures started, milliseconds since the epoch
 * @property {number} failedStarts how many starts in a row have failed
 * @property {string} lastExit what the last one ended with, in words
 * @property {readonly string[]} lastOutput the last lines the child printed before it went
 * @property {number} supervisorPid the supervisor that is failing
 * @property {number} supervisorPgid its process group, which is what stopping it signals
 * @property {string} repository the checkout it is watching
 * @property {number} port the port it is trying to serve
 */

/** @param {string} root the checkout @returns {string} */
export function theTroubleFileIn(root) {
  return join(root, THE_TROUBLE_FILE)
}

/** @param {string} root the checkout @returns {string} */
export function theRefusalFileIn(root) {
  return join(root, THE_REFUSAL_FILE)
}

/**
 * THE ONE PLAIN SENTENCE, written once and said by every reader.
 *
 * IT NAMES NO TIME, and that is on purpose rather than an omission. The one writer of local
 * wall-clock in this repository is `src/shared/time.ts`, which is TypeScript, and this file is read
 * by `tools/serve-dev.mjs` running under plain node — the supervisor must keep working when the
 * TypeScript in the checkout does not. So the file carries the two moments as milliseconds, which
 * is a machine fact needing no formatting, and whoever wants them in words formats them with the
 * one formatter.
 *
 * @param {SupervisorTrouble} trouble
 * @returns {string}
 */
export function whatTheTroubleSays(trouble) {
  return (
    `The supervisor has failed to start a fresh server ${String(trouble.failedStarts)} times in a row; the last ` +
    `exit said ${trouble.lastExit}. A server answering on port ${String(trouble.port)} is one from before the ` +
    'failures started, and it will not pick up a change to the code.'
  )
}

/**
 * WRITE IT DOWN, or say what stopped that.
 *
 * It never throws. A supervisor that cannot write this file has one more thing wrong with it and
 * still has a server to try to start; the caller prints what happened and carries on.
 *
 * @param {string} root the checkout
 * @param {SupervisorTrouble} trouble
 * @returns {{ written: string } | { failed: string }}
 */
export function writeTheTrouble(root, trouble) {
  const path = theTroubleFileIn(root)
  try {
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(path, `${JSON.stringify(trouble, null, 2)}\n`, 'utf8')
    return { written: path }
  } catch (err) {
    return { failed: err instanceof Error ? err.message : String(err) }
  }
}

/**
 * WRITE THE GUARD'S REFUSAL WHERE SOMETHING STILL RUNNING CAN READ IT.
 *
 * It is a plain line of text and not JSON: the reader is a page frame that cannot import a module
 * and has no server to ask, and the fact is one sentence the guard already wrote. It never throws,
 * for the same reason `writeTheTrouble` does not: a supervisor that cannot write this file still
 * has to say the refusal in its own log.
 *
 * @param {string} root the checkout
 * @param {string} firstLine the refusal's first line
 * @returns {{ written: string } | { failed: string }}
 */
export function writeTheRefusal(root, firstLine) {
  const path = theRefusalFileIn(root)
  try {
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(path, `${firstLine}\n`, 'utf8')
    return { written: path }
  } catch (err) {
    return { failed: err instanceof Error ? err.message : String(err) }
  }
}

/**
 * TAKE THE REFUSAL FILE BACK, because the server has answered and the note has been filed.
 *
 * @param {string} root the checkout
 * @returns {void}
 */
export function forgetTheRefusal(root) {
  try {
    rmSync(theRefusalFileIn(root), { force: true })
  } catch {
    // Leaving it costs a stale line in a file; stopping a working supervisor over it would cost
    // more. The next supervisor clears it as it starts.
  }
}

/**
 * IS THIS STILL ABOUT NOW?
 *
 * @param {SupervisorTrouble} trouble
 * @param {number} [now] milliseconds since the epoch. A parameter so a test can hold the clock still.
 * @returns {boolean}
 */
export function theTroubleStillStands(trouble, now = Date.now()) {
  return now - trouble.atMs < THE_TROUBLE_IS_STALE_AFTER
}

/**
 * TAKE IT BACK, because a server has started properly and the trouble is over.
 *
 * @param {string} root the checkout
 * @returns {void}
 */
export function forgetTheTrouble(root) {
  try {
    rmSync(theTroubleFileIn(root), { force: true })
  } catch {
    // A file that cannot be removed is not worth stopping a working supervisor for. The next
    // reader checks whether the supervisor named in it is still running, so a leftover says
    // nothing about a machine where it is not.
  }
}

/**
 * READ IT BACK, or null because there is none.
 *
 * A file that will not parse reads as none. It is written by one process in one line and read by
 * another; a half-written one is a moment, not a state, and the next second's read gets the whole
 * thing.
 *
 * A file nothing has rewritten for `THE_TROUBLE_IS_STALE_AFTER` also reads as none. See that
 * constant for why.
 *
 * @param {string} root the checkout
 * @param {number} [now] milliseconds since the epoch. A parameter so a test can hold the clock still.
 * @returns {SupervisorTrouble | null}
 */
export function readTheTrouble(root, now = Date.now()) {
  const path = theTroubleFileIn(root)
  if (!existsSync(path)) return null
  try {
    const read = /** @type {unknown} */ (JSON.parse(readFileSync(path, 'utf8')))
    if (read === null || typeof read !== 'object') return null
    const one = /** @type {Record<string, unknown>} */ (read)
    if (typeof one.failedStarts !== 'number' || typeof one.supervisorPid !== 'number') return null
    if (typeof one.atMs !== 'number') return null
    const trouble = /** @type {SupervisorTrouble} */ (read)
    return theTroubleStillStands(trouble, now) ? trouble : null
  } catch {
    return null
  }
}
