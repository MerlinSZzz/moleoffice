// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
// @ts-check
/**
 * READING A RUN'S OWN LOG FOR ITS USAGE RECEIPT: INSIDE THE RUNTIME'S OWN FOLDER, FROM THE END, AND NEVER FOR LONG.
 *
 * Six conditions for the receipt a run's seal carries (message Xbgm8gDFfAY9, quoted in
 * 0J-bDsdC9EeP) are kept by tools/the-seal-receipt.mjs. Conditions 3, 4 and 5 are about how a file is read, and they
 * are here, so the server reads a run's log the same way when a terminal it holds ends (src/server/lib/terminal-agents.ts,
 * wave 13s round 40). The server cannot import from tools/, and the seal cannot read TypeScript under dsh, so this file
 * is JavaScript and imports only Node and other files in src/config.
 *
 *   3. NUMBERS OUT, NEVER CONTENT. A reason given here names an error's code, never its message, which can quote what
 *      was read. A model name is kept only when it has a model name's shape. A path is shown with the home folder as ~.
 *   4. NEVER HELD UP. A log is read from its end, at most THE_MOST_OF_A_LOG_READ bytes and for at most
 *      THE_LONGEST_LOG_READ_MS. Over either, or on a file that cannot be read, the caller gets the reason and no text.
 *   5. READ-ONLY, INSIDE ITS OWN FOLDERS. Every file is read by its real path, and only when that path is inside the
 *      runtime's own folder, so a planted link cannot make a reader read anything else. Nothing is written.
 */

import { closeSync, fstatSync, openSync, readSync, realpathSync } from 'node:fs'
import { join, sep } from 'node:path'

import { theCodexRolloutFor } from './codex-log.mjs'
import { theHomeNamedIn } from './the-paths-of-a-system.mjs'

/** The most of a log read, from its end, in bytes (condition 4). */
export const THE_MOST_OF_A_LOG_READ = 32 * 1024 * 1024

/** The longest a log is read for, in milliseconds (condition 4). */
export const THE_LONGEST_LOG_READ_MS = 2_000

/** One read of a log, in bytes, between two looks at the clock. */
const ONE_PIECE = 1024 * 1024

/** A session or thread id, as Claude Code and Codex write one. Anything else names no file. */
export const AN_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** A model name as the runtimes write one. Any other text from a file is left out (condition 3). */
export const A_MODEL_NAME = /^[A-Za-z0-9][A-Za-z0-9._:/@[\]-]{0,99}$/

/**
 * THE REAL PATH OF A FILE, OR WHY IT IS NOT READ (condition 5): it must exist, and its real path must be inside the real
 * path of `root`.
 * @param {string} path
 * @param {string} root
 * @returns {{ ok: true, real: string } | { ok: false, why: string }}
 */
export function insideItsOwnFolder(path, root) {
  let real
  let realRoot
  try {
    realRoot = realpathSync(root)
  } catch (error) {
    return { ok: false, why: `its folder could not be found (${codeOf(error)})` }
  }
  try {
    real = realpathSync(path)
  } catch (error) {
    return { ok: false, why: `no such file could be read (${codeOf(error)})` }
  }
  if (!real.startsWith(realRoot + sep)) return { ok: false, why: "its real path is outside the runtime's own folder, so it was not read" }
  return { ok: true, real }
}

/**
 * THE LAST BYTES OF A FILE, at most `most`, read for at most `forMs` (condition 4). `whole` says whether that is the
 * whole file.
 * @param {string} path
 * @param {{ most?: number, forMs?: number, now?: () => number }} [limits]
 * @returns {{ ok: true, bytes: Buffer, whole: boolean } | { ok: false, why: string }}
 */
export function theLastBytesOf(path, { most = THE_MOST_OF_A_LOG_READ, forMs = THE_LONGEST_LOG_READ_MS, now = Date.now } = {}) {
  const until = now() + forMs
  let fd
  try {
    fd = openSync(path, 'r')
  } catch (error) {
    return { ok: false, why: `the file could not be opened (${codeOf(error)})` }
  }
  try {
    const size = fstatSync(fd).size
    const start = Math.max(0, size - most)
    const buffer = Buffer.alloc(size - start)
    let done = 0
    while (done < buffer.length) {
      if (now() > until) return { ok: false, why: `reading it took longer than ${String(forMs)} ms, so it was left` }
      const read = readSync(fd, buffer, done, Math.min(ONE_PIECE, buffer.length - done), start + done)
      if (read === 0) break
      done += read
    }
    return { ok: true, bytes: buffer.subarray(0, done), whole: start === 0 }
  } catch (error) {
    return { ok: false, why: `the file could not be read (${codeOf(error)})` }
  } finally {
    closeSync(fd)
  }
}

/**
 * THE END OF A FILE AS TEXT, read as `theLastBytesOf` reads it. A first line cut by the start of the read is left out.
 * @param {string} path
 * @param {{ most?: number, forMs?: number, now?: () => number }} [limits]
 * @returns {{ ok: true, text: string, whole: boolean } | { ok: false, why: string }}
 */
export function theEndOf(path, limits) {
  const read = theLastBytesOf(path, limits)
  if (!read.ok) return read
  const text = read.bytes.toString('utf8')
  return { ok: true, text: read.whole ? text : text.slice(text.indexOf('\n') + 1), whole: read.whole }
}

/** An error's code alone, never its message, which can name or quote what was read (condition 3). */
export function codeOf(/** @type {unknown} */ error) {
  const code = typeof error === 'object' && error !== null ? /** @type {{ code?: unknown }} */ (error).code : undefined
  return typeof code === 'string' && /^[A-Z0-9_]{1,40}$/.test(code) ? code : 'no reason given'
}

/**
 * A PATH AS A RECEIPT SHOWS IT: with the home folder written as ~, since a full path carries the machine's user name
 * (review message DLqviJ8nr3yH).
 * @param {string} path
 * @param {Record<string, string | undefined>} env
 */
export function shownInAReceipt(path, env) {
  const home = theHomeNamedIn(env)
  return home !== null && path.startsWith(home + sep) ? `~${path.slice(home.length)}` : path
}

/**
 * THE ROLLOUT OF ONE CODEX THREAD, inside Codex's own sessions folder: CODEX_HOME's, else the home folder's .codex.
 * @param {string} thread
 * @param {Record<string, string | undefined>} env
 * @returns {{ ok: true, path: string } | { ok: false, why: string }}
 */
export function theRolloutOfTheCodexThread(thread, env) {
  const named = env['CODEX_HOME']
  const home = theHomeNamedIn(env)
  const codexHome = named !== undefined && named !== '' ? named : home === null ? null : join(home, '.codex')
  if (codexHome === null) return { ok: false, why: 'no home folder is named, so Codex\'s own folder is unknown.' }
  const root = join(codexHome, 'sessions')
  const found = theCodexRolloutFor(thread, root)
  if (found === null) return { ok: false, why: 'no rollout of the run\'s Codex thread is in Codex\'s sessions folder.' }
  const inside = insideItsOwnFolder(found, root)
  return inside.ok ? { ok: true, path: inside.real } : { ok: false, why: `the rollout of the run's Codex thread: ${inside.why}.` }
}

/**
 * A RECEIPT READ FROM A LOG, with its model kept only when it has a model name's shape (condition 3).
 * @template {{ model?: string }} R
 * @param {R} read
 * @returns {R}
 */
export function withAModelOfItsShape(read) {
  const { model, ...rest } = read
  return /** @type {R} */ (typeof model === 'string' && A_MODEL_NAME.test(model) ? { ...rest, model } : rest)
}

/**
 * THE WORDS FOR A RUNTIME WHOSE LOG NOTHING HERE READS: "an opencode run's own log", "a kimi run's own log".
 * @param {string} runtime
 */
export function theOwnLogOfARunOn(runtime) {
  return `${/^[aeiou]/i.test(runtime) ? 'an' : 'a'} ${runtime} run's own log`
}
