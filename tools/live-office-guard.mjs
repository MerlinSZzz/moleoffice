// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
// @ts-check
/**
 * A TEST NEVER REACHES THE LIVE OFFICE. Problem E1SWGJK7wG68, 26 September 2026.
 *
 * WHAT HAPPENED. Sandboxes run on the host network, so inside a sandbox 127.0.0.1 on the live
 * office's port (MOLE_OFFICE_PORT) is that office, and so is every other address of this machine (the tailnet address
 * 192.0.2.10 among them). On 26 September at about 09:19 a mutation run of a T6 tool removed its
 * tool's refusal of the office's port. The tool then found the live office on that port, took it for
 * its own, and sent it GET /api/health (messages n-N3ruN-Jp57 and qIPrnlcEEcUd).
 *
 * WHAT THIS FILE DOES. Installed in a node process, it refuses every connection to a live office's
 * port on one of this machine's own addresses, while MOLE_OFFICE_API, MOLE_OFFICE_WORKSPACE,
 * MOLE_OFFICE_SESSION and MOLE_OFFICE_AGENT are all unset. That is how every test runs: the test
 * runner removes them (tests/a-test-sees-no-agents-environment.ts, tools/run-named-tests.mjs). With
 * any of them set, as in an agent's own writes to the office, it refuses nothing. It checks the four
 * at each connection, not once, so a test process whose setup file removed them is guarded from then
 * on.
 *
 *   - THE ADDRESSES. Loopback (127.0.0.0/8 and ::1), the unspecified addresses 0.0.0.0 and ::
 *     (Linux connects them to this machine), every address os.networkInterfaces() names when the
 *     guard is installed, and each of those written as an IPv4-mapped IPv6 address. A host given as
 *     a name, `localhost` or this machine's own name among them, is checked on the addresses it
 *     resolves to.
 *   - THE PORTS are worked out once, by the test runner, when vitest loads vitest.config.ts:
 *     tools/live-office-ports.mjs says how, and from which two sources. They are handed to every
 *     process after that in PORTS_VARIABLE below, each with the sentence that says where it came
 *     from. So a test that starts an office of its own and gives it MOLE_OFFICE_PORT=<a free port>
 *     does not make that office's port one the guard refuses: the live office's ports are the ones
 *     the runner read before any test changed anything. A process given no PORTS_VARIABLE (the guard
 *     loaded by hand through NODE_OPTIONS) reads the two sources itself.
 *   - A PORT THAT IS NOT KNOWN (a source that names a port that cannot be read) matches every port:
 *     every connection to this machine's own addresses is refused, and the refusal says why.
 *
 * WHAT A REFUSAL DOES. The connection fails with an error whose code is ELIVEOFFICE and whose message
 * names the address, the port, where the port came from, and the test file if one is known. The same
 * sentence is written to standard error at once. Then the error is thrown again on its own, outside
 * the code that asked, so that the run fails even if that code caught the first one: a plain node
 * process ends with exit code 1, and in a test runner's process vitest reports it as an unhandled
 * error and fails the run. A process that installed its own uncaughtException handler decides for
 * itself what that throw does; tools/checks/verdict.mjs, tools/stray-servers.mjs and
 * tools/negative-control.mjs have one.
 *
 * THE TEST FILE is read from TEST_FILE_VARIABLE below, which tests/a-test-names-its-file.ts sets in
 * every test process before the file is collected, so a child the test starts inherits it. When it
 * is not set, the refusal names the process's own command line instead.
 *
 * HOW IT REACHES EVERY PROCESS. vitest.config.ts calls `guardEveryTestProcess()` from
 * tools/live-office-ports.mjs when vitest loads it. That installs the guard in the runner's own
 * process, and puts `--import=<tools/live-office-guard-preload.mjs>` into NODE_OPTIONS and the ports
 * into PORTS_VARIABLE. Every node process started after that inherits both: vitest's workers, and
 * every node child a test starts. A child a test starts with an environment of its own is given the
 * two back, and the test file's name (below), as tools/record-what-tests-read.mjs does for its
 * recorder.
 *
 * WHAT IT DOES NOT REACH:
 *   - a program that is not node, such as curl or the Chromium that Playwright starts. Measured
 *     on 26 September 2026: with the guard loaded and a stand-in on the guarded port, a
 *     page in Playwright's Chromium opened the stand-in and fetched from it, and both were answered,
 *     while node's own fetch in the same process was refused. No test today points a browser at the
 *     office's port: the pages the browser tests open are served by the test's own servers;
 *   - a node child started with NODE_OPTIONS cleared on its own command line (env -u NODE_OPTIONS);
 *   - a process in which one of the four office variables is set, by design.
 *
 * THE HOOK is net.Socket.prototype.connect, which fetch, http, https and net.connect all pass
 * through (the test proves fetch, http and net; https was checked by hand). It never changes a
 * connection it does not refuse.
 *
 * THIS FILE READS NO SETTING AND STARTS NO PROCESS, so the preload costs a child nothing but the hook.
 * tests/the-resolver-reads-the-main-checkouts-env-from-a-worktree.test.ts counts the git commands a
 * child runs, and reading the settings here would add one to every child.
 */

import childProcess from 'node:child_process'
import dns from 'node:dns'
import fs from 'node:fs'
import net from 'node:net'
import os from 'node:os'
import { syncBuiltinESMExports } from 'node:module'
import { fileURLToPath } from 'node:url'

/** The four variables an agent's own writes carry. While any is set, nothing is refused. */
export const THE_OFFICE_VARIABLES = ['MOLE_OFFICE_API', 'MOLE_OFFICE_WORKSPACE', 'MOLE_OFFICE_SESSION', 'MOLE_OFFICE_AGENT']

/**
 * The caller's agent key, the variable naming the file that holds it, and the model logins, which the named-test runner
 * keeps out of its children. These do not switch the guard off: a key without any of the four office variables is
 * still guarded.
 */
export const THE_AGENT_CREDENTIALS = [
  'MOLE_AGENT_KEY', 'MOLE_AGENT_KEY_FILE',
  'DEEPSEEK_API_KEY', 'OPENAI_API_KEY', 'CODEX_API_KEY', 'ANTHROPIC_API_KEY',
  'CLAUDE_CODE_OAUTH_TOKEN', 'OPENCODE_API_KEY', 'OPENROUTER_API_KEY',
]

/** The variable that names the test file a process belongs to. Set by tests/a-test-names-its-file.ts. */
export const TEST_FILE_VARIABLE = 'LIVE_OFFICE_GUARD_TEST_FILE'

/** The variable that hands the ports the runner worked out to every process after it, as JSON. */
export const PORTS_VARIABLE = 'LIVE_OFFICE_GUARD_PORTS'

/** The file NODE_OPTIONS imports. It installs the guard and does nothing else. */
export const THE_PRELOAD = fileURLToPath(new URL('./live-office-guard-preload.mjs', import.meta.url))
export const THE_IMPORT = `--import=${THE_PRELOAD}`

/** The code on every refusal's error. */
export const REFUSAL_CODE = 'ELIVEOFFICE'

/** Marks a process the guard is installed in, so a second install changes only the ports. */
const INSTALLED = Symbol.for('mole-office.live-office-guard')

/**
 * One port the guard refuses, with the sentence saying where it came from. `port` is null when the
 * source names a port that cannot be read, and `said` then says why.
 *
 * @typedef {{ port: number | null, said: string }} AGuardedPort
 */

/**
 * The ports handed down in PORTS_VARIABLE, or null because none were. A value that is there and is
 * not a list of ports throws: the guard cannot say what it guards.
 *
 * @param {Record<string, string | undefined>} [env]
 * @returns {AGuardedPort[] | null}
 */
export function theHandedDownPorts(env = process.env) {
  const text = env[PORTS_VARIABLE]
  if (text === undefined) return null
  let list
  try {
    list = JSON.parse(text)
  } catch {
    list = null
  }
  const whole =
    Array.isArray(list) &&
    list.length > 0 &&
    list.every((one) => one !== null && typeof one === 'object' && (one.port === null || Number.isInteger(one.port)) && typeof one.said === 'string')
  if (!whole) throw new Error(`${PORTS_VARIABLE} is ${JSON.stringify(text)}, which is not a list of ports, so the guard cannot say what it guards.`)
  return list
}

/**
 * An IPv4-mapped IPv6 address written as its IPv4 address; any other address unchanged, without a zone.
 * @param {string} address
 */
function plain(address) {
  const bare = address.replace(/%.*$/u, '').toLowerCase()
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/u.exec(bare)
  return mapped?.[1] ?? bare
}

/** Every address of this machine, as `plain` writes them, read now. */
function thisMachinesAddresses() {
  const found = new Set(['::1', '0.0.0.0', '::'])
  for (const list of Object.values(os.networkInterfaces())) {
    for (const one of list ?? []) found.add(plain(one.address))
  }
  return found
}

/**
 * The one sentence of a refusal. `because` is each guarded port that matched, with where it came from.
 * @param {string} host
 * @param {string} address
 * @param {number} port
 * @param {AGuardedPort[]} because
 */
function theRefusal(host, address, port, because) {
  const where = host === address ? `${address}:${port}` : `${host} (${address}) port ${port}`
  const file = process.env[TEST_FILE_VARIABLE]
  const who =
    file !== undefined && file !== ''
      ? `The test file: ${file}.`
      : `No test file is named in this process; its command line is: ${process.argv.join(' ')}.`
  const why = because.some((one) => one.port === null)
    ? "It is on this machine, and a live office's port is not known here, so no port on this machine is let through."
    : "That is a live office's port, on this machine, and a test may never reach a live office."
  return `Refused a connection to ${where}. ${why} ${because.map((one) => one.said).join(' ')} ${who} Start an office of the test's own on a free port instead.`
}

/**
 * Install the guard in this process, refusing `ports`. Installed a second time, the hook stays as it
 * is and refuses `ports` from then on.
 *
 * @param {AGuardedPort[]} ports
 */
export function installTheGuard(ports) {
  const held = /** @type {Record<symbol, { ports: AGuardedPort[] }>} */ (/** @type {unknown} */ (globalThis))
  const already = held[INSTALLED]
  if (already !== undefined) {
    already.ports = ports
    return
  }
  const state = { ports }
  held[INSTALLED] = state
  const addresses = thisMachinesAddresses()
  const isThisMachine = (/** @type {string} */ address) => {
    const one = plain(address)
    return one.startsWith('127.') || addresses.has(one)
  }
  /** The guarded ports that match `port`: a port that is not known matches every port. */
  const guarded = (/** @type {number} */ port) => state.ports.filter((one) => one.port === null || one.port === port)
  const active = () => THE_OFFICE_VARIABLES.every((name) => process.env[name] === undefined)

  /** Say the refusal, fail the connection with it, and throw it once more where nothing catches it. */
  const refuse = (/** @type {string} */ host, /** @type {string} */ address, /** @type {number} */ port, /** @type {AGuardedPort[]} */ because) => {
    const sentence = theRefusal(host, address, port, because)
    try {
      fs.writeSync(2, `${sentence}\n`)
    } catch {
      // Standard error is closed. The two errors below still carry the sentence.
    }
    const error = Object.assign(new Error(sentence), { code: REFUSAL_CODE, address, port })
    setImmediate(() => {
      throw Object.assign(new Error(`This process was stopped because it tried to reach the live office. ${sentence}`), { code: REFUSAL_CODE })
    })
    return error
  }

  const connect = /** @type {(...args: any[]) => net.Socket} */ (net.Socket.prototype.connect)
  /** @this {net.Socket} */
  net.Socket.prototype.connect = function guardedConnect(/** @type {any[]} */ ...args) {
    if (!active()) return connect.apply(this, args)
    // net.connect() hands over its arguments already worked out, as one array; anything else is worked
    // out here the way net does it.
    const [options, callback] = /** @type {[any, any]} */ (Array.isArray(args[0]) ? args[0] : /** @type {any} */ (net)._normalizeArgs(args))
    // A path is a local socket file, as net reads it (http hands over a path of null for a port).
    if (options.path || options.port === undefined || options.port === null) return connect.apply(this, args)
    const port = Number(options.port)
    const because = guarded(port)
    if (because.length === 0) return connect.apply(this, args)
    const host = typeof options.host === 'string' && options.host !== '' ? options.host : 'localhost'
    if (net.isIP(host) !== 0) {
      if (!isThisMachine(host)) return connect.apply(this, args)
      const error = refuse(host, host, port, because)
      process.nextTick(() => this.destroy(error))
      return this
    }
    // A NAME IS CHECKED ON WHAT IT RESOLVES TO: the lookup the caller would have used, answered only
    // when no address it gives is this machine's.
    const lookup = typeof options.lookup === 'function' ? options.lookup : dns.lookup
    const checked = (/** @type {string} */ hostname, /** @type {any} */ how, /** @type {Function} */ answer) => {
      lookup(hostname, how, (/** @type {any} */ error, /** @type {any} */ address, /** @type {any} */ family) => {
        if (error) return answer(error, address, family)
        const all = Array.isArray(address) ? address : [{ address, family }]
        const local = all.find((one) => isThisMachine(String(one.address)))
        if (local !== undefined) return answer(refuse(hostname, String(local.address), port, because))
        return answer(error, address, family)
      })
    }
    const again = { ...options, lookup: checked }
    return typeof callback === 'function' ? connect.call(this, again, callback) : connect.call(this, again)
  }

  // A CHILD GIVEN AN ENVIRONMENT OF ITS OWN IS GIVEN THE GUARD BACK: the import in NODE_OPTIONS, the
  // ports, and the test file's name, each only where it is missing. So a node process a test starts
  // with PATH alone is guarded too.
  const carried = (/** @type {any} */ options) => {
    if (!options || typeof options !== 'object' || !options.env || typeof options.env !== 'object') return options
    const env = { ...options.env }
    const imports = typeof env.NODE_OPTIONS === 'string' ? env.NODE_OPTIONS : ''
    if (!imports.includes(THE_PRELOAD)) env.NODE_OPTIONS = imports === '' ? THE_IMPORT : `${imports} ${THE_IMPORT}`
    if (env[PORTS_VARIABLE] === undefined) env[PORTS_VARIABLE] = JSON.stringify(state.ports)
    const file = process.env[TEST_FILE_VARIABLE]
    if (env[TEST_FILE_VARIABLE] === undefined && file !== undefined) env[TEST_FILE_VARIABLE] = file
    return { ...options, env }
  }
  const cp = /** @type {Record<string, Function>} */ (/** @type {unknown} */ (childProcess))
  for (const name of ['spawn', 'spawnSync', 'execFile', 'execFileSync', 'fork', 'exec', 'execSync']) {
    const original = /** @type {Function} */ (cp[name])
    // exec and execSync take (command, options); the others take (command, args, options) or (command, options).
    const at = (/** @type {any[]} */ passed) =>
      name === 'exec' || name === 'execSync' ? 1 : Array.isArray(passed[1]) ? 2 : passed[1] !== null && typeof passed[1] === 'object' ? 1 : -1
    /** @this {unknown} */
    const wrapped = function (/** @type {any[]} */ ...passed) {
      const where = at(passed)
      if (where >= 0 && where < passed.length) passed[where] = carried(passed[where])
      return original.apply(this, passed)
    }
    Object.defineProperties(wrapped, Object.getOwnPropertyDescriptors(original))
    cp[name] = wrapped
  }
  syncBuiltinESMExports()
}
