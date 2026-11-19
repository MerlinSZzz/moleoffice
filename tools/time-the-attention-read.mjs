#!/usr/bin/env node
// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
// @ts-check
/**
 * HOW LONG THE ATTENTION READ TAKES, AND WHETHER IT HOLDS A HEALTH READ BACK (problem CtH8CGBkE5Bz).
 *
 *   node tools/time-the-attention-read.mjs --database <file> --checkout <folder> [--workspace <id>]
 *
 * It starts the server of the checkout named, on a copy of the database named, and times two things,
 * three times each:
 *
 *   1. GET /api/attention?machine=omit&shape=home, alone;
 *   2. the same read, with GET /api/health sent 50 ms after it.
 *
 * It prints three lines of numbers, in milliseconds, each counted from when that request was sent:
 *
 *   attention alone (ms): <three numbers>
 *   attention, with health sent 50 ms after it (ms): <three numbers>
 *   health, sent 50 ms after attention (ms): <three numbers>
 *
 * Nothing it prints comes from the database: no text, no title, no id. A request that fails stops the
 * script with its status code and nothing of the reply. On its error output it says one line when the
 * server on the copy answers, with the port and the process group, so a person can see where it is.
 *
 * Before the timed reads it makes one attention read it does not time, so the first timed read does
 * not also count the server warming up. That is the same on every checkout.
 *
 * ---------------------------------------------------------------------------------------
 * THE COPY
 * ---------------------------------------------------------------------------------------
 *
 * The file named is only read. `aCopyOfALiveDatabase` copies it, write-ahead log and all, into a new
 * folder from `mkdtemp` in the system's temporary folder (`theTimersCopy`). `emptyAndScrub` then takes out of the copy
 * what tools/isolated-mole-office.mjs takes out of a world's copy: the key hashes, the visitors' token
 * hashes and the office's own home row (src/config/what-a-copy-must-not-carry.mjs says why). Without
 * the home row, the server on the copy does not act as the office: it sweeps no other worktree, walks
 * no key file and asks no other world for its health. Then the copy's bytes are searched for every key
 * hash and token hash of the source, the copy is rewritten once when one is still there, and a copy that
 * still holds one is removed before anything is timed.
 *
 * ---------------------------------------------------------------------------------------
 * HOW IT READS AS THE PERSON: THE COPY'S OWN PERSON KEY
 * ---------------------------------------------------------------------------------------
 *
 * A copy of a real office has its key window closed, and its key hashes are gone, so a request with no
 * key names nobody and is refused (6 October 2026 at 18:44: 403 on both checkouts). So the
 * reads carry a key. The server makes `keys.json` beside its database the first time it starts, with a
 * new random person key, and the database here is the copy, in a folder this tool has just made and
 * that held no `keys.json` before the server started (checked). The tool reads the person key from that
 * file, holds it in memory, sends it in the `x-mole-office-key` header, and never prints it. The file is
 * removed with the folder.
 *
 * WHY THIS AND NOT OPENING THE COPY'S KEY WINDOW. A key proves the person the way their own browser
 * does, and the copy's window, its trusted machines and its refusals stay as the real office has them,
 * so what is timed is the real office's path. Opening the window would change a setting of the copy
 * and time a request the real office would refuse.
 *
 * WHY IT CANNOT BE USED AGAINST A LIVE OFFICE. The key is made by the server this tool started, for its
 * copy, and lives only in the copy's folder. A live office has its own `keys.json` with a different
 * person key, which this tool never reads, so the key would prove nothing there. The tool sends every
 * request to 127.0.0.1 at the port it holds for its own server, and the database named is only read.
 *
 * ---------------------------------------------------------------------------------------
 * THE SERVER, AND WHAT KEEPS IT FROM REACHING ANYTHING OUTSIDE THIS MACHINE
 * ---------------------------------------------------------------------------------------
 *
 * `node --import tsx src/server/index.ts --stop-with-pid=<this script>`, started in the checkout as its
 * own process group, on a port this tool holds for it.
 *
 * THE PORT IS HELD, AND LISTENING, FROM THE MOMENT IT IS CHOSEN. The tool opens a listening socket on
 * 127.0.0.1 at a port the kernel picks, and hands it to the server as its descriptor 3, which the server
 * listens on (`MOLE_OFFICE_LISTEN_FD`, as tools/serve-dev.mjs hands its socket over). A port that is
 * picked, let go and then named to the server lies in the range the kernel hands to every other listen on
 * port 0, so another program could take it first. The server then could not listen, and the health read
 * reached the other program, which need not answer at all: Node's fetch waits 300 s for the headers of an
 * answer. A socket that is only bound would not be enough. Another bind to the same port succeeds when
 * both sockets set SO_REUSEADDR, as every listen in Node does, and the first of them to listen keeps the
 * port. A port with a listening socket on it refuses that bind. A health read made before the server has
 * started waits in the kernel's queue for the server, and nothing in this tool accepts it, because the
 * tool closes its own copy of the socket in the same turn that starts the server. That read is given what
 * is left of the start limit, so the limit holds even when nothing ever answers.
 * The server is started by node with tsx loaded rather than by the tsx command, because that command
 * starts node again with its own descriptor 3.
 *
 * ITS ENVIRONMENT IS AN ALLOW-LIST (message p_MSQBkt48hj). Only the names in
 * `FROM_THE_SHELL` are passed on from the shell that runs this: what node and tsx need to start and
 * read text and time. Under the test runner the two names of its guard against the live office's ports
 * (`THE_TEST_GUARD`) are passed on as well, because NODE_OPTIONS then loads that guard. Nothing else
 * is, so no provider key, no proxy, no SSH_AUTH_SOCK, no CLAUDE_CODE_ setting and no MOLE_OFFICE_
 * setting reaches the server. Then these are set (`SET_HERE`):
 *
 *   MOLE_OFFICE_DB=<the copy>                      every file the server writes beside its database
 *                                                  lands in the copy's folder, keys.json included
 *   TMPDIR=<the copy's folder>/tmp                 tsx keeps its cache there, so it goes with the copy
 *   MOLE_OFFICE_PORT=<the held port>
 *   MOLE_OFFICE_LISTEN_FD=3                        the held socket, which the server listens on
 *   MOLE_OFFICE_API=http://127.0.0.1:<that port>
 *   MOLE_OFFICE_MESSAGE_WORKER=off                 no worker: no run started, no message delivered,
 *                                                  no merge, no check
 *   MOLE_OFFICE_TERMINAL_HOLDER=off                no terminal holder started
 *   MOLE_OFFICE_ADDRESS_FOR_OTHER_MACHINES=none    it listens on 127.0.0.1 only
 *   MOLE_OFFICE_NO_WATCH=1                         no restart when a file changes
 *   VITEST=1                                       the server reports itself to no office and sends
 *                                                  no held visit, as a server a test starts does not
 *   HOME=<the copy's folder>/home                  nothing it does under the home folder reaches the
 *                                                  real one
 *   LOG_LEVEL=warn
 *
 * The server's own timers still run on the copy (reminders, counters, sweeps). They write only into
 * the copy, and with the worker off nothing delivers what they write.
 *
 * ---------------------------------------------------------------------------------------
 * THE CLEAN-UP, AT EVERY END
 * ---------------------------------------------------------------------------------------
 *
 * The server's group is sent SIGTERM, and the tool waits until no process of the group is left. If one
 * is still there after 5 s, the group is sent SIGKILL and waited for again. Only then is the copy's
 * folder removed, so a server still writing into it cannot leave half a copy of somebody's database in
 * the temporary folder (otherwise ENOTEMPTY hides the numbers). The same clean-up runs when
 * the tool ends well, when a read fails, and when the tool is sent SIGINT or SIGTERM; after a signal it
 * exits with 128 plus the signal's number. The server's log, in another folder, is kept only when the
 * server did not start, and the error names it.
 *
 * `--hold-after-start <ms>` waits that long after the server answers, before the first read. It is
 * there so the tests can stop the tool while its server runs (tests/the-timing-tool-reads-a-copy-and-
 * leaves-nothing.test.ts); a measurement does not need it.
 *
 * Exit codes: 0 with the numbers printed; 1 when the server would not start, a read failed or the
 * clean-up could not end the server; 2 when the arguments are wrong; 130 or 143 after SIGINT or SIGTERM.
 */
import { whyThisCheckoutMayNotOpenTheDatabase } from '../src/config/settings.mjs'
import { spawn } from 'node:child_process'
import { closeSync, existsSync, mkdirSync, mkdtempSync, openSync, readFileSync, rmSync } from 'node:fs'
import net from 'node:net'
import { constants, homedir, hostname, tmpdir, userInfo } from 'node:os'
import { join, resolve } from 'node:path'
import { setTimeout as sleep } from 'node:timers/promises'
import { fileURLToPath } from 'node:url'
import { getSystemErrorName } from 'node:util'
import Database from 'better-sqlite3'
import { KEY_HEADER } from '../src/config/key-header.mjs'
import { keysPathFrom } from '../src/config/settings.mjs'
import { PORTS_VARIABLE, TEST_FILE_VARIABLE } from './live-office-guard.mjs'
import { emptyAndScrub, hashesLeftAfterAtMostOneRewrite, keyHashesACopyIsSearchedFor } from '../src/config/what-a-copy-must-not-carry.mjs'
import { aCopyOfALiveDatabase } from './a-copy-of-a-live-database.mjs'

/**
 * THE TIMER'S COPY: `VACUUM INTO` from the database named, emptied the way a world's copy is (`emptyAndScrub`
 * with `becomesAWorld`), then searched for every key hash and visitor token hash the source holds, and rewritten
 * once with `VACUUM INTO` when one is still in its bytes (`hashesLeftAfterAtMostOneRewrite`). The emptying alone
 * does not promise that: on the real schema with fifty visitor credentials, some of their token hashes stay in
 * the bytes after it. A copy in which one is still found is removed and this throws, so nothing is timed on it.
 * The copy lives only in a temporary folder while the reads run, and a copy carries no key wherever it lives.
 *
 * THE SOURCE'S HASHES ARE READ ON BOTH SIDES OF THE COPY, as the backup and a world's copy read them: the source
 * may be a live office, and a key or a visitor token it holds when the copy is made and has removed by the search
 * is in the copy all the same, so it is searched for too.
 *
 * @param {string} source  the database named, only read
 * @param {string} copy  where the copy is written
 */
export function theTimersCopy(source, copy) {
  const pairingRefusal1 = whyThisCheckoutMayNotOpenTheDatabase(source)
  if (pairingRefusal1 !== null) throw new Error(pairingRefusal1)
  const hashes = theSourcesHashes(source)
  aCopyOfALiveDatabase(source, copy)
  const pairingRefusal2 = whyThisCheckoutMayNotOpenTheDatabase(copy)
  if (pairingRefusal2 !== null) throw new Error(pairingRefusal2)
  const handle = new Database(copy, { fileMustExist: true })
  try {
    emptyAndScrub(handle, { becomesAWorld: true })
  } finally {
    handle.close()
  }
  theSourcesHashes(source, hashes)
  const { left } = hashesLeftAfterAtMostOneRewrite(copy, hashes, (file) => new Database(file, { readonly: true, fileMustExist: true }))
  if (left > 0) {
    rmSync(copy, { force: true })
    throw new Error(
      `${String(left)} of the ${String(hashes.size)} key and token hash${hashes.size === 1 ? '' : 'es'} of the source ${left === 1 ? 'is' : 'are'} still in the bytes ` +
        `of the copy at ${copy} after it was emptied and rewritten once with VACUUM INTO, so it was removed and nothing was timed.`,
    )
  }
}

/**
 * Every key hash and visitor token hash `source` holds, opened read only, added to `into` when it is given.
 * @param {string} source
 * @param {Set<string>} [into]
 * @returns {Set<string>}
 */
function theSourcesHashes(source, into) {
  const original = new Database(source, { readonly: true, fileMustExist: true })
  try {
    return keyHashesACopyIsSearchedFor(original, into)
  } finally {
    original.close()
  }
}

/** The read timed. */
export const THE_ATTENTION_READ = '/api/attention?machine=omit&shape=home'

/** How long after the attention read the health read is sent. */
export const HEALTH_AFTER_MS = 50

/** How many times each is timed. */
export const TIMES = 3

/** The names passed on from the shell, and no others: what node and tsx need, and the text and time settings. */
export const FROM_THE_SHELL = Object.freeze(['PATH', 'LANG', 'LC_ALL', 'TZ', 'NODE_OPTIONS'])

/**
 * The two names the test runner's guard against the live office's ports reads, passed on when they are
 * there, so a server this tool starts under a test is guarded as every other process the test starts.
 * They hold port numbers and a test file's name.
 */
export const THE_TEST_GUARD = Object.freeze([PORTS_VARIABLE, TEST_FILE_VARIABLE])

/** The names this tool sets for the server itself. */
export const SET_HERE = Object.freeze([
  'MOLE_OFFICE_DB',
  'TMPDIR',
  'MOLE_OFFICE_PORT',
  'MOLE_OFFICE_LISTEN_FD',
  'MOLE_OFFICE_API',
  'MOLE_OFFICE_MESSAGE_WORKER',
  'MOLE_OFFICE_TERMINAL_HOLDER',
  'MOLE_OFFICE_ADDRESS_FOR_OTHER_MACHINES',
  'MOLE_OFFICE_NO_WATCH',
  'VITEST',
  'HOME',
  'LOG_LEVEL',
])

/** The line the tool writes to its error output once the server on the copy answers. */
export const THE_SERVER_ANSWERS = 'The server on the copy answers'

/** How long the server is given to answer its health read after it is started. */
export const START_LIMIT_MS = 180_000

/** How long the server's group is given to end after SIGTERM, and then after SIGKILL. */
export const END_LIMIT_MS = 5_000

/** The last startup lines, kept in the failure even when the temporary folder later goes away. @param {string} file */
function serverLogTail(file) {
  let tail
  try { tail = readFileSync(file, 'utf8').trimEnd().split('\n').slice(-40).join('\n').slice(-16_384) }
  catch (error) { return `The server log could not be read: ${String(error)}` }
  /** @param {string} value */
  const word = value => new RegExp(`\\b${value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'g')
  tail = tail.replaceAll(homedir(), '<home>').replace(/\/(?:home|Users)\/[^/\s"]+/g, '/<home>')
  for (const value of [hostname(), userInfo().username]) if (value !== '') tail = tail.replace(word(value), '<machine>')
  return `The last 40 lines of the server log, masked:\n${tail.replace(/\b\d{1,3}(?:\.\d{1,3}){3}\b/g, '<address>').replace(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g, '<address>')}`
}

/**
 * A listening socket on 127.0.0.1 at a port the kernel picks, for the server to take over. It is made
 * with node's own `net._createServerHandle`, as tools/serve-dev.mjs `holdThePort` makes its socket and
 * says why that function. Nothing here accepts on it: the caller closes it in the turn that starts the
 * server.
 *
 * @returns {{ port: number, handle: any }} the port, and the handle as `spawn`'s `stdio` takes it
 */
function aListeningPort() {
  const handle = /** @type {any} */ (net)._createServerHandle('127.0.0.1', 0, 4)
  const bound = /** @type {{ port?: number }} */ ({})
  let failed = typeof handle === 'number' ? handle : handle.getsockname(bound)
  if (failed === 0) failed = handle.listen(511)
  if (failed !== 0 || typeof bound.port !== 'number' || bound.port === 0) {
    if (typeof handle !== 'number') handle.close()
    throw new Error(`No port on 127.0.0.1 could be held for the server (${failed !== 0 ? getSystemErrorName(failed) : 'the kernel named no port'}).`)
  }
  return { port: bound.port, handle }
}

/** Whether any process of this group is still there. @param {number} group */
function theGroupIsThere(group) {
  try {
    process.kill(-group, 0)
    return true
  } catch (err) {
    if (/** @type {NodeJS.ErrnoException} */ (err).code === 'ESRCH') return false
    throw err
  }
}

/** Send a signal to the group, if any of it is left. @param {number} group @param {NodeJS.Signals} signal */
function signalTheGroup(group, signal) {
  try {
    process.kill(-group, signal)
  } catch (err) {
    if (/** @type {NodeJS.ErrnoException} */ (err).code !== 'ESRCH') throw err
  }
}

/** Wait up to `ms` for the group to be gone. @param {number} group @param {number} ms */
async function theGroupEndsWithin(group, ms) {
  const until = performance.now() + ms
  while (theGroupIsThere(group)) {
    if (performance.now() > until) return false
    await sleep(50)
  }
  return true
}

/**
 * One request, read to its end. It answers the milliseconds from `sentAt` to the end of the reply.
 *
 * @param {string} url @param {Record<string, string>} headers @param {number} sentAt
 */
async function timed(url, headers, sentAt) {
  const res = await fetch(url, { headers })
  await res.arrayBuffer()
  const ended = performance.now()
  if (!res.ok) throw new Error(`${new URL(url).pathname} answered ${String(res.status)}`)
  return ended - sentAt
}

/**
 * Start the checkout's server on a copy of the database, time the reads and stop the server.
 *
 * @param {{ database: string, checkout: string, workspace?: string, holdAfterStartMs?: number }} what
 * @returns {Promise<{ alone: number[], attention: number[], health: number[] }>}
 */
export async function timeTheAttentionRead(what) {
  const checkout = resolve(what.checkout)
  if (!existsSync(what.database)) throw new Error(`There is no database file at ${what.database}.`)
  if (!existsSync(join(checkout, 'node_modules', 'tsx'))) throw new Error(`The checkout ${checkout} has no node_modules/tsx, so its server cannot be started.`)

  const place = mkdtempSync(join(tmpdir(), 'mole-office-attention-timing-'))
  // THE SERVER'S LOG IN A FOLDER OF ITS OWN, kept and named when the server does not start, so the
  // reason can be read without the copy of the database being kept with it.
  const logs = mkdtempSync(join(tmpdir(), 'mole-office-attention-timing-log-'))
  const serverLog = join(logs, 'server.log')
  let keepTheLog = false
  /** @type {number | undefined} */
  let group

  // THE ONE CLEAN-UP, run once whichever end comes first: the reads ending, a failure, or a signal.
  /** @type {Promise<void> | null} */
  let cleaning = null
  const cleanUp = () => {
    cleaning ??= (async () => {
      if (group !== undefined) {
        signalTheGroup(group, 'SIGTERM')
        if (!(await theGroupEndsWithin(group, END_LIMIT_MS))) {
          signalTheGroup(group, 'SIGKILL')
          if (!(await theGroupEndsWithin(group, END_LIMIT_MS))) {
            throw new Error(
              `The server's process group ${String(group)} was still there ${String((2 * END_LIMIT_MS) / 1000)} s after SIGTERM and SIGKILL, ` +
                `so the copy's folder ${place} was left in place rather than removed under it.`,
            )
          }
        }
      }
      rmSync(place, { recursive: true, force: true })
      if (!keepTheLog) rmSync(logs, { recursive: true, force: true })
    })()
    return cleaning
  }
  /** @param {NodeJS.Signals} signal */
  const onSignal = (signal) => {
    const code = 128 + constants.signals[signal]
    cleanUp().then(
      () => process.exit(code),
      (err) => {
        process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`)
        process.exit(code)
      },
    )
  }
  process.on('SIGINT', onSignal)
  process.on('SIGTERM', onSignal)

  try {
    const copy = join(place, 'copy.db')
    theTimersCopy(resolve(what.database), copy)
    const home = join(place, 'home')
    mkdirSync(home)
    const tmp = join(place, 'tmp')
    mkdirSync(tmp)
    // THE KEY FILE MUST BE THE ONE THE SERVER ON THE COPY MAKES. The folder is new, so none is there.
    const keys = keysPathFrom({ MOLE_OFFICE_DB: copy })
    if (existsSync(keys)) throw new Error(`${keys} was there before the server on the copy started, so the key in it is not the copy's own.`)

    const held = aListeningPort()
    const port = held.port
    const at = `http://127.0.0.1:${String(port)}`
    /** @type {NodeJS.ProcessEnv} */
    const env = {}
    for (const name of [...FROM_THE_SHELL, ...THE_TEST_GUARD]) if (process.env[name] !== undefined) env[name] = process.env[name]
    Object.assign(env, {
      MOLE_OFFICE_DB: copy,
      TMPDIR: tmp,
      MOLE_OFFICE_PORT: String(port),
      MOLE_OFFICE_LISTEN_FD: '3',
      MOLE_OFFICE_API: at,
      MOLE_OFFICE_MESSAGE_WORKER: 'off',
      MOLE_OFFICE_TERMINAL_HOLDER: 'off',
      MOLE_OFFICE_ADDRESS_FOR_OTHER_MACHINES: 'none',
      MOLE_OFFICE_NO_WATCH: '1',
      VITEST: '1',
      HOME: home,
      LOG_LEVEL: 'warn',
    })
    const log = openSync(serverLog, 'a')
    const child = spawn(process.execPath, ['--import', 'tsx', 'src/server/index.ts', `--stop-with-pid=${String(process.pid)}`], {
      cwd: checkout,
      env,
      detached: true,
      stdio: ['ignore', log, log, held.handle],
    })
    closeSync(log)
    // The server holds the socket now. This tool's own copy is closed, so the port goes when the server does.
    held.handle.close()
    group = child.pid
    /** @type {number | null} */
    let ended = null
    child.on('exit', (code) => {
      ended = code ?? -1
    })

    const startedAt = performance.now()
    for (;;) {
      if (ended !== null) {
        keepTheLog = true
        throw new Error(`The server stopped while starting, with exit code ${String(ended)}. Its log is ${serverLog}.\n${serverLogTail(serverLog)}`)
      }
      if (performance.now() - startedAt > START_LIMIT_MS) {
        keepTheLog = true
        throw new Error(`The server did not answer GET /api/health within ${String(START_LIMIT_MS / 1000)} s. Its log is ${serverLog}.\n${serverLogTail(serverLog)}`)
      }
      // What is left of the limit, in whole milliseconds, as AbortSignal.timeout takes no fraction. It is
      // made outside the try, so a fault in it fails the run and is not taken for a server not answering.
      const left = AbortSignal.timeout(Math.max(1, Math.ceil(START_LIMIT_MS - (performance.now() - startedAt))))
      try {
        if ((await fetch(`${at}/api/health`, { signal: left })).ok) break
      } catch {
        // not answering yet, or the start limit is over, which the next turn says
      }
      await sleep(250)
    }
    process.stderr.write(`${THE_SERVER_ANSWERS} at port ${String(port)}, process group ${String(group)}.\n`)

    /** @type {unknown} */
    let made
    try {
      made = JSON.parse(readFileSync(keys, 'utf8'))
    } catch {
      throw new Error(`The server on the copy answers, and its key file ${keys} could not be read.`)
    }
    const person = typeof made === 'object' && made !== null ? /** @type {Record<string, unknown>} */ (made)['person'] : undefined
    if (typeof person !== 'string' || person === '') throw new Error(`The key file ${keys} the server on the copy made holds no person key.`)

    /** @type {Record<string, string>} */
    const headers = { [KEY_HEADER]: person, ...(what.workspace === undefined ? {} : { 'x-mole-office-workspace': what.workspace }) }
    if (what.holdAfterStartMs !== undefined) await sleep(what.holdAfterStartMs)

    const attentionAt = `${at}${THE_ATTENTION_READ}`
    await timed(attentionAt, headers, performance.now())

    const alone = []
    for (let i = 0; i < TIMES; i += 1) alone.push(await timed(attentionAt, headers, performance.now()))

    const attention = []
    const health = []
    for (let i = 0; i < TIMES; i += 1) {
      const attentionRead = timed(attentionAt, headers, performance.now())
      await sleep(HEALTH_AFTER_MS)
      const healthRead = timed(`${at}/api/health`, headers, performance.now())
      const [a, h] = await Promise.all([attentionRead, healthRead])
      attention.push(a)
      health.push(h)
    }
    return { alone, attention, health }
  } finally {
    try {
      await cleanUp()
    } finally {
      process.off('SIGINT', onSignal)
      process.off('SIGTERM', onSignal)
    }
  }
}

/** @param {number[]} times */
const said = (times) => times.map((ms) => String(Math.round(ms))).join(' ')

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2)
  /** @param {string} name */
  const valueOf = (name) => {
    const at = args.indexOf(name)
    return at === -1 ? undefined : args[at + 1]
  }
  const database = valueOf('--database')
  const checkout = valueOf('--checkout')
  const workspace = valueOf('--workspace')
  const hold = valueOf('--hold-after-start')
  const holdAfterStartMs = hold === undefined ? undefined : Number(hold)
  if (database === undefined || checkout === undefined || (holdAfterStartMs !== undefined && !(Number.isInteger(holdAfterStartMs) && holdAfterStartMs >= 0))) {
    process.stderr.write(
      'Usage: node tools/time-the-attention-read.mjs --database <file> --checkout <folder> [--workspace <id>] [--hold-after-start <ms>]\n',
    )
    process.exit(2)
  }
  try {
    const { alone, attention, health } = await timeTheAttentionRead({
      database,
      checkout,
      ...(workspace === undefined ? {} : { workspace }),
      ...(holdAfterStartMs === undefined ? {} : { holdAfterStartMs }),
    })
    process.stdout.write(`attention alone (ms): ${said(alone)}\n`)
    process.stdout.write(`attention, with health sent ${String(HEALTH_AFTER_MS)} ms after it (ms): ${said(attention)}\n`)
    process.stdout.write(`health, sent ${String(HEALTH_AFTER_MS)} ms after attention (ms): ${said(health)}\n`)
  } catch (err) {
    process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`)
    process.exit(1)
  }
}
