// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
// @ts-check
/** @typedef {import('../shared/usage-receipts.ts').UsageReceipt} UsageReceipt */

import { whereItRan } from './usage.mjs'
import { saysStillGoing } from './still-going.mjs'
import { THE_SWEEPS_CLOSE } from './finished.mjs'

/**
 * WHICH EARLIER ROWS OF ONE OF THE OFFICE'S OWN PARTS A LATER START REPLACES.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS IS A `.mjs` AND NOT PART OF `src/server/lib/own-rows.ts`
 * ---------------------------------------------------------------------------------------
 *
 * Problem `2G9jNsuJwJf4`. Two programs file these rows: the API server and the message worker file
 * theirs from `src/server/index.ts`, and the browser app files its own from the Vite plugin
 * `registerThisBrowserApp` in `vite.config.ts`. The rule for which earlier row a start replaces has
 * to be the same rule in both, or the two will drift and neither will say so.
 *
 * The server's half lives in `src/server/lib/own-rows.ts`, which imports `./records.ts` and, under
 * it, `../db/client.ts` — and that module OPENS THE OFFICE DATABASE the moment it is imported. Vite
 * reads `vite.config.ts` at every start and every `resolveConfig`, including the many a test makes;
 * a config that imported the server's module would open the operator's live corpus on every one of
 * those, writable, before a single line of the config had run. So the rule, which is pure, is here,
 * where both can read it, and the database work stays in the server module.
 *
 * `src/config/` is the layer both halves already share: `settings.mjs` and `world-header.mjs` are
 * read by the server, by Vite and by the browser. This file is read by the server and by Vite.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT A ROW IS MATCHED ON, AND WHAT A ROW THAT RECORDS NO PORT MEANS
 * ---------------------------------------------------------------------------------------
 *
 * A row written by this code carries `data.extra.ownPart = { role, port, checkout }` and is matched
 * on all three. A row written before this existed records no port, so it is matched on role and
 * checkout alone — otherwise the office's own old rows would never be closable by the next start,
 * which is the whole point of the change. A row that records a DIFFERENT port is another stack of
 * the same checkout and is left alone.
 *
 * The `role` here is the row's title. Matching on title alone would reach across checkouts, because
 * every worktree's browser app files a row called "The browser app"; the checkout is what keeps one
 * checkout's start from closing another's row.
 */

/** The title the API server files for itself. */
export const THE_API_SERVER = 'The API server'

/** The title the message worker's row is filed under. */
export const THE_MESSAGE_WORKER = 'The message worker'

/** The title the browser app files for itself, from the Vite plugin. */
export const THE_BROWSER_APP = 'The browser app'

/**
 * The title the server files the terminal holder under (src/server/lib/terminals.ts). The service command
 * starts the holder, and the server records it the first time it reaches it.
 */
export const THE_TERMINAL_HOLDER = 'The terminal holder'

/**
 * One part of the office, as the rows that describe it identify it.
 *
 * `port` is the port the part answers on — the API's port for the server and for its worker, the
 * browser app's for the browser. It is null only when the machine could not say, and a null port
 * falls back to role and checkout.
 *
 * @typedef {object} OwnPart
 * @property {string} role
 * @property {number | null} port
 * @property {string} checkout
 */

/**
 * A row, as much of it as this rule reads. `PanelRecord` in `src/shared/types.ts` is the server's
 * full shape; only these three fields are the rule's business, so a row read over HTTP and a row
 * read from the database are the same thing here.
 *
 * @typedef {object} ARecordOfOurs
 * @property {string} id
 * @property {string} title
 * @property {Record<string, unknown>} data
 */

/**
 * @param {unknown} value
 * @returns {Record<string, unknown> | null}
 */
function asObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? /** @type {Record<string, unknown>} */ (value)
    : null
}

/**
 * The `ownPart` identity a row carries, or null because it was written before this existed.
 *
 * @param {ARecordOfOurs} record
 * @returns {Record<string, unknown> | null}
 */
export function theOwnPartOf(record) {
  return asObject(asObject(record.data['extra'])?.['ownPart'])
}

/**
 * The port a row says it was on, or null because it records none.
 *
 * @param {ARecordOfOurs} record
 * @returns {number | null}
 */
export function theRecordedPortOf(record) {
  const port = theOwnPartOf(record)?.['port']
  return typeof port === 'number' && Number.isInteger(port) ? port : null
}

/**
 * The checkout a row says it worked from, without a trailing slash.
 *
 * @param {ARecordOfOurs} record
 * @returns {string | null}
 */
export function theRecordedCheckoutOf(record) {
  const written = record.data['workingDirectory']
  return typeof written === 'string' && written !== '' ? written.replace(/\/$/, '') : null
}

/**
 * Whether a row still claims to be going and has not already been closed.
 *
 * @param {ARecordOfOurs} record
 * @returns {boolean}
 */
export function stillGoing(record) {
  if (!saysStillGoing(record.data['state'])) return false
  const because = record.data['closedBecause']
  return !(typeof because === 'string' && because !== '')
}

/**
 * THE PROCESS A ROW SAYS IT STOOD FOR, or nulls because nobody recorded one.
 *
 * `pid` is what makes a row checkable, and `pidStartedAt` is what makes the pid an identity rather
 * than a number pids come round again to reuse. Both live where the session hook already writes a
 * run's process, `data.extra.discovered`, so one reader serves a hand-filed run and the office's own
 * row alike.
 *
 * THE ONLY READER OF THAT BLOCK. Until wave 13y round 31 the sessions door, the terminal holder's row
 * and the terminal agents each read it for themselves, and one of them took any number as a pid.
 * tests/a-rows-recorded-process-is-read-in-one-place.test.ts fails when another reader appears.
 *
 * A field that is missing, the wrong type or an impossible pid becomes null rather than being passed
 * on as a plausible value. The caller asks for trust and is told there is none. Whether the process is
 * still that process is another question, answered by `theRecordedProcessIsGone` below for the
 * office's own rows and by `whetherTheRecordedProcessRuns` in src/config/session-process.mjs for a run.
 *
 * @param {{ data: Record<string, unknown> }} record
 * @returns {{ pid: number | null, pidStartedAt: string | null }}
 */
export function theRecordedProcessOf(record) {
  const discovered = asObject(asObject(record.data['extra'])?.['discovered'])
  const pid = discovered?.['pid']
  const pidStartedAt = discovered?.['pidStartedAt']
  return {
    pid: typeof pid === 'number' && Number.isInteger(pid) && pid > 0 ? pid : null,
    pidStartedAt: typeof pidStartedAt === 'string' && pidStartedAt !== '' ? pidStartedAt : null,
  }
}

/**
 * WHETHER THE PROCESS A ROW NAMED IS GONE, with the pid and start time the row recorded.
 *
 * `live` is the operating system's reading of that pid, or null because nothing is running under it.
 * Three answers, and the difference between the last two is the whole point:
 *
 * - `gone` — nothing runs under the pid, or something does whose start time is not the recorded one.
 *   A pid that came round again names a different program, so the row's process has exited;
 * - `alive` — the process is there and, where a start time was recorded, it is the same process;
 * - `unknown` — the row records no pid at all. Nothing can be said about a row nobody gave a pid.
 *
 * `directoryChangedAt` is the reading this repository used before 3 September 2026, which wrote the
 * modification time of the `/proc/<pid>` directory as the start time. A row stamped that way is the
 * same process and is not reported gone here. `theRowIsAboutThisProcess` in src/config/process-reader.mjs
 * carries the same rule for the ledger; this is the office's own rows' half of it.
 *
 * @param {{ pid: number | null, pidStartedAt: string | null }} recorded
 * @param {{ startedAt: string, directoryChangedAt?: string | null } | null} live
 * @returns {'gone' | 'alive' | 'unknown'}
 */
export function theRecordedProcessIsGone(recorded, live) {
  if (recorded.pid === null) return 'unknown'
  if (live === null) return 'gone'
  if (recorded.pidStartedAt === null) return 'alive'
  if (recorded.pidStartedAt === live.startedAt) return 'alive'
  if (live.directoryChangedAt !== undefined && live.directoryChangedAt !== null && recorded.pidStartedAt === live.directoryChangedAt) {
    return 'alive'
  }
  return 'gone'
}

/**
 * THE CLOSE ONE READING OF THE MACHINE WRITES ON A ROW WHOSE PROCESS IS GONE.
 *
 * The cause is the one thing this reading knows: the process the row named is not on this machine,
 * and when it was looked for. It never says `crashed` — the row was not found by reading a process
 * that went away with a cause, and inventing one is invariant 5 of USER.md. `went-stale` is the
 * close word for "nobody said it ended".
 *
 * @param {number} pid
 * @param {string} stamp
 * @returns {{ state: string, closedAt: string, closedBecause: string, closedHow: string }}
 */
export function theDeadOwnRowPatch(pid, stamp) {
  return {
    state: 'finished',
    closedAt: stamp,
    closedBecause: `its process ${String(pid)} is gone, found at ${stamp}`,
    closedHow: THE_SWEEPS_CLOSE,
  }
}

/**
 * THE CLOSE ONE READING OF THE DISK WRITES ON A ROW WHOSE WORKING DIRECTORY IS GONE.
 *
 * The cause is the one thing this reading knows: the row's working directory is not on the disk any
 * more, and the row recorded no process to check instead, so nothing behind the word `running` can
 * be found. It never says `crashed` — the directory's absence is the one thing observed, and how
 * the run itself ended is not. `went-stale` is the close word for "nobody said it ended".
 *
 * @param {string} directory
 * @param {string} stamp
 * @returns {{ state: string, closedAt: string, closedBecause: string, closedHow: string }}
 */
export function theDirectoryGoneRowPatch(directory, stamp) {
  return {
    state: 'finished',
    closedAt: stamp,
    closedBecause: `its working directory ${directory} no longer exists and it recorded no process`,
    closedHow: THE_SWEEPS_CLOSE,
  }
}

/**
 * THE LIVE ROWS AN EARLIER RUN OF ONE PART LEFT BEHIND.
 *
 * `keep` is the row filed by this start, which is never its own predecessor.
 *
 * @param {readonly ARecordOfOurs[]} records
 * @param {OwnPart} part
 * @param {string | null} [keep]
 * @returns {ARecordOfOurs[]}
 */
export function theEarlierOwnRowsAmong(records, part, keep = null) {
  const checkout = part.checkout.replace(/\/$/, '')
  return records.filter((record) => {
    if (record.id === keep) return false
    if (record.title !== part.role) return false
    if (!stillGoing(record)) return false
    if (theRecordedCheckoutOf(record) !== checkout) return false
    const port = theRecordedPortOf(record)
    // A ROW THAT NAMES A DIFFERENT PORT IS A DIFFERENT STACK, and closing it would end the row of a
    // part that is still running. A row that names no port is an old one and is matched without it.
    return port === null || part.port === null || port === part.port
  })
}

/**
 * The `data.extra` block written on a fresh row so a later start can recognise an earlier one.
 *
 * @param {OwnPart} part
 * @param {number | null} pid
 * @param {string | null} pidStartedAt
 * @returns {Record<string, unknown>}
 */
export function theOwnPartBlock(part, pid, pidStartedAt) {
  return {
    ownPart: { role: part.role, port: part.port, checkout: part.checkout.replace(/\/$/, '') },
    ...(pid === null
      ? {}
      : { discovered: { pid, ...(pidStartedAt === null ? {} : { pidStartedAt }) } }),
  }
}

/**
 * THE RECEIPT FOR ONE OF THE SERVER'S OWN PARTS.
 *
 * None of the four parts runs a model itself, so the receipt carries words and no usage numbers.
 *
 * The terminal holder's words say what they do not cover. Its row stands for the holder process: the pid in
 * `extra.discovered`, the process resource keyed by that pid, and the group its release signals. A person may run a
 * model in one of its terminals. An agent the office opens in a terminal is filed as a run of its own, with its own
 * receipt (src/server/lib/terminal-run-receipt.ts). The office files no row for a plain terminal the person opens, and
 * the holder's receipt does not claim what runs in one.
 * @param {string} role
 * @param {Record<string, string | undefined>} env
 * @returns {UsageReceipt}
 */
export function theOwnPartUsageReceipt(role, env) {
  let says
  if (role === THE_API_SERVER) {
    says = 'The API server runs no model, so this run has no tokens to count.'
  } else if (role === THE_MESSAGE_WORKER) {
    says = 'The message worker runs no model, so this run has no tokens to count. A run it starts is a run of its own, with its own receipt.'
  } else if (role === THE_BROWSER_APP) {
    says = 'The browser app runs no model, so this run has no tokens to count.'
  } else if (role === THE_TERMINAL_HOLDER) {
    says =
      'The terminal holder runs no model, so this run has no tokens to count. What runs in its terminals is not counted here. ' +
      'An agent the office opens in a terminal has a row of its own.'
  } else {
    throw new Error(`The office has no own-part usage receipt for ${role}.`)
  }
  return {
    runtime: 'mole-office',
    source: "the office's own part, which runs no model",
    says,
    ranIn: whereItRan(env),
  }
}

/**
 * THE CLOSE ONE START WRITES ON AN EARLIER ROW, worked out in one place.
 *
 * The cause is the one thing this start knows: a newer start of the same part replaced the row. It
 * never says `crashed`: the row was not found by reading a process that has gone, it was found by a
 * newer start of the same part, and inventing a crash the new start did not observe is invariant 5
 * of USER.md.
 *
 * @param {string} stamp
 * @returns {{ state: string, closedAt: string, closedBecause: string, closedHow: string }}
 */
export function theReplacedOwnRowPatch(stamp) {
  return {
    state: 'finished',
    closedAt: stamp,
    closedBecause: `replaced by the start of ${stamp}`,
    closedHow: THE_SWEEPS_CLOSE,
  }
}
