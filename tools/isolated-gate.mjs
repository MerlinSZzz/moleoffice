// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
// @ts-check
/**
 * THE GATE OF AN ISOLATED RUN: IT RUNS FIRST IN THE RUN'S OWN CONTAINER, AS ROOT, MAKES THIS MACHINE UNREACHABLE, PROVES
 * IT, AND ONLY THEN STARTS THE RUN'S COMMAND AS AN ORDINARY USER WITH NO CAPABILITIES.
 *
 * WHY: T6 of a decision, and D-8WG4Snxxga. T6 compares models on one module, each twice: once
 * with Mole Office, and once from the source alone. In T5 the source-only runs reached the live office, and one
 * registered an agent in the owner's name. A source-only run must not be able to reach the office at all, nor anything
 * else inside: this machine, the other machines of the tailnet, the LAN.
 *
 * tools/sandbox.mjs `exec <instance> --isolated` starts this in a fresh container of the sandbox's own image, on
 * docker's bridge network, with NET_ADMIN, as root, with IPv6 turned off and public DNS servers named. This file is
 * mounted into that container read-only from the launcher's own checkout, so the gate that runs is the launcher's,
 * never an older copy in the sandbox's clone.
 *
 * What it does, in order, and each step fails closed: the command never starts, and the exit code says which step.
 *   1. `ip route add blackhole <network>` for every --blackhole: the inside ranges and each of this machine's own
 *      addresses, which tools/sandbox.mjs reads at run time. And for the two halves of each subnet the container
 *      sits on (its own link): docker gives the container a route to that whole subnet, which is more specific than
 *      a blackholed range around it, so without the halves every other container on the same network could still be
 *      reached (the inspector's note on run QfIZTxlPXcYQ). The halves are more specific still, and leave no neighbour
 *      reachable, while the way out keeps working: it goes to the gateway over the link, and no address is looked up
 *      for that. Exit 90 when one cannot be added.
 *   2. Reads the blackhole routes back, and every one asked for, or found for the link, must be there. Exit 90.
 *   3. IPv6 must be off in the container (net.ipv6.conf.all.disable_ipv6 = 1), so no link-local path to the host is
 *      left. Exit 94. And the reverse-path filter must be off on `all` and on every interface (rp_filter = 0, which
 *      tools/sandbox.mjs sets when it makes the container). With it on, an ARP request from the gateway, whose address
 *      is blackholed in step 1, fails the reverse-path check and is dropped. This machine then cannot confirm the
 *      container's address, and drops the run's traffic every ~45 s until the container speaks first: T6's way-S runs
 *      lost 66 to 88 minutes each to that (problem roHECcQU9Fmq). The filter only decides what the container ACCEPTS.
 *      Everything it sends to this machine, the tailnet or the LAN still goes into a blackhole, so the ARP answer is the
 *      one new thing, and no road opens. Exit 95.
 *   4. Every --unreachable address:port must answer nothing. A connection that is taken means the office could be
 *      reached. Exit 91.
 *   5. Every --resolve host must resolve, or the run could not reach its model either. Exit 92.
 *   6. Starts the command with setpriv as --as uid:gid: every capability dropped from the inheritable and bounding
 *      sets, and no new privileges, so a sudo or a setuid program in the image gains nothing and no route can be
 *      changed back. Its HOME is --home when given: the run's own home, which tools/sandbox.mjs prepares before
 *      the container starts, and never the sandbox's own home, which holds the other runs' settings and conversations
 *      and the session hook that brings Mole Office in (message 87T4xUjQgCp3). Without it, HOME is that user's
 *      own from the image, which can be a folder that does not exist: the sandbox image's user 1000 has /nonexistent,
 *      and on 26 Sep T6's opencode runs failed on it (message uAD6Mzu7tWiA). Signals to the gate go on to the
 *      command, and the gate exits with the command's code.
 *      Exit 93 when setpriv or the user cannot be found, or --home is not a folder.
 *
 * Usage (inside the container, as root):
 *   node isolated-gate.mjs --as <uid>:<gid> [--home <folder>] [--blackhole <cidr>]... [--unreachable <address>:<port>]...
 *       [--resolve <host>]... -- <command...>
 */
import { execFileSync, spawn } from 'node:child_process'
import { lookup } from 'node:dns/promises'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { connect } from 'node:net'
import { constants } from 'node:os'

/** How long an address may take to answer before it counts as answering nothing. */
const CONNECT_LIMIT_MS = 3_000

/** @param {string} line */
function say(line) {
  process.stderr.write(`isolated-gate: ${line}\n`)
}

/** @param {number} code
 * @param {string} why
 * @returns {never} */
function stop(code, why) {
  say(`${why} The command was not started.`)
  process.exit(code)
}

/** @param {string[]} argv */
function readArguments(argv) {
  /** @type {{ as: string | null, home: string | null, blackhole: string[], unreachable: string[], resolve: string[], command: string[] }} */
  const chosen = { as: null, home: null, blackhole: [], unreachable: [], resolve: [], command: [] }
  for (let i = 0; i < argv.length; i += 1) {
    const word = argv[i]
    if (word === '--') {
      chosen.command = argv.slice(i + 1)
      break
    }
    const value = argv[i + 1]
    if (value === undefined) stop(2, `${word} takes a value.`)
    i += 1
    if (word === '--as') chosen.as = value
    else if (word === '--home') chosen.home = value
    else if (word === '--blackhole') chosen.blackhole.push(value)
    else if (word === '--unreachable') chosen.unreachable.push(value)
    else if (word === '--resolve') chosen.resolve.push(value)
    else stop(2, `I do not know the option ${word}.`)
  }
  return chosen
}

const chosen = readArguments(process.argv.slice(2))
if (chosen.command.length === 0) stop(2, 'Say what to run, after --.')
const as = /^(\d+):(\d+)$/.exec(chosen.as ?? '')
if (as === null) stop(2, `--as takes <uid>:<gid>, not ${JSON.stringify(chosen.as)}.`)
if (chosen.blackhole.length === 0) stop(2, 'No --blackhole was given, so nothing would be isolated.')

/**
 * THE TWO HALVES OF EACH SUBNET THIS CONTAINER SITS ON, read from the routes the kernel made for its links: for
 * 172.17.0.0/16, 172.17.0.0/17 and 172.17.128.0/17. A link of /31 or /32 has no neighbour to shut out.
 */
function theLinksHalves() {
  /** @param {number} n */
  const dotted = (n) => [24, 16, 8, 0].map((shift) => Math.floor(n / 2 ** shift) % 256).join('.')
  return execFileSync('ip', ['-4', 'route', 'show', 'table', 'main', 'proto', 'kernel', 'scope', 'link'], { encoding: 'utf8' })
    .split('\n')
    .map((line) => line.trim().split(/\s+/)[0] ?? '')
    .filter((link) => /^\d{1,3}(\.\d{1,3}){3}\/\d{1,2}$/.test(link))
    .flatMap((link) => {
      const [address, bits] = /** @type {[string, string]} */ (link.split('/'))
      const length = Number(bits)
      if (length > 30) return []
      const start = address.split('.').reduce((n, part) => n * 256 + Number(part), 0)
      return [`${dotted(start)}/${String(length + 1)}`, `${dotted(start + 2 ** (31 - length))}/${String(length + 1)}`]
    })
}
const theLink = theLinksHalves()
const blackholes = [...chosen.blackhole, ...theLink.filter((half) => !chosen.blackhole.includes(half))]

// 1 AND 2. THE BLACKHOLES, added and then read back. `ip` writes a /32 without its length.
for (const network of blackholes) {
  try {
    execFileSync('ip', ['route', 'add', 'blackhole', network], { stdio: ['ignore', 'ignore', 'pipe'] })
  } catch (why) {
    stop(90, `The blackhole route to ${network} could not be added (${String(/** @type {{ stderr?: unknown }} */ (why).stderr ?? why).trim()}).`)
  }
}
const inPlace = new Set(
  execFileSync('ip', ['-4', 'route', 'show', 'type', 'blackhole'], { encoding: 'utf8' })
    .split('\n')
    .map((line) => line.trim().split(/\s+/)[1])
    .filter((network) => typeof network === 'string' && network !== ''),
)
const missing = blackholes.filter((network) => !inPlace.has(network) && !inPlace.has(network.replace(/\/32$/, '')))
if (missing.length > 0) stop(90, `These blackhole routes are not in place after being added: ${missing.join(', ')}.`)

// 3. NO IPv6.
const v6 = '/proc/sys/net/ipv6/conf/all/disable_ipv6'
if (existsSync(v6) && readFileSync(v6, 'utf8').trim() !== '1') {
  stop(94, 'IPv6 is on in this container, so a link-local path to the host could be left open.')
}

// 3b. THE REVERSE-PATH FILTER IS OFF (problem roHECcQU9Fmq).
const conf = '/proc/sys/net/ipv4/conf'
const filtered = (existsSync(conf) ? readdirSync(conf) : [])
  .filter((one) => one !== 'lo' && one !== 'default')
  .filter((one) => {
    const setting = `${conf}/${one}/rp_filter`
    return existsSync(setting) && readFileSync(setting, 'utf8').trim() !== '0'
  })
if (filtered.length > 0) {
  stop(95, `The reverse-path filter is on for ${filtered.join(', ')}, so this machine's ARP to the container would go unanswered and the run's connections would stall.`)
}

// 4. NOTHING INSIDE ANSWERS.
/** @param {string} target */
function answers(target) {
  const at = target.lastIndexOf(':')
  const host = target.slice(0, at)
  const port = Number(target.slice(at + 1))
  return new Promise((done) => {
    const socket = connect({ host, port })
    /** @param {boolean} took */
    const over = (took) => {
      socket.destroy()
      done(took)
    }
    socket.setTimeout(CONNECT_LIMIT_MS, () => over(false))
    socket.once('connect', () => over(true))
    socket.once('error', () => over(false))
  })
}
for (const target of chosen.unreachable) {
  if (await answers(target)) stop(91, `${target} took a connection, so this machine could still be reached.`)
}

// 5. THE MODEL CAN BE REACHED.
for (const host of chosen.resolve) {
  try {
    await lookup(host)
  } catch (why) {
    stop(92, `${host} does not resolve (${why instanceof Error ? why.message : String(why)}), so the run could not reach its model.`)
  }
}

// 6. THE COMMAND, AS AN ORDINARY USER WITH NO CAPABILITIES.
const [, uid, gid] = /** @type {RegExpExecArray & [string, string, string]} */ (as)
/** @type {string[]} */
let entry = []
try {
  entry = execFileSync('getent', ['passwd', uid], { encoding: 'utf8' }).trim().split(':')
} catch {
  entry = []
}
const [user, , , , , home] = entry
if (user === undefined || home === undefined || home === '') stop(93, `No user ${uid} is known in this image, so the command has no one to run as.`)
// ITS HOME: the run's own home when the launcher names one, including OpenCode's permission file when needed.
if (chosen.home !== null && !(existsSync(chosen.home) && statSync(chosen.home).isDirectory())) {
  stop(93, `The home folder ${chosen.home} is not there, so the command would have nowhere to keep its settings.`)
}
const itsHome = chosen.home ?? home
say(
  `${String(blackholes.length)} blackhole routes are in place (${String(theLink.length)} of them the container's own link), ` +
    `IPv6 is off, ${String(chosen.unreachable.length)} addresses ` +
    `answered nothing, ${String(chosen.resolve.length)} hosts resolved; the command runs as ${uid}:${gid} with no capabilities, ` +
    `in the home ${itsHome}.`,
)
const child = spawn(
  'setpriv',
  [`--reuid=${uid}`, `--regid=${gid}`, '--init-groups', '--inh-caps=-all', '--bounding-set=-all', '--no-new-privs', '--', ...chosen.command],
  { stdio: 'inherit', env: { ...process.env, HOME: itsHome, USER: user, LOGNAME: user } },
)
for (const signal of /** @type {const} */ (['SIGTERM', 'SIGINT', 'SIGHUP'])) process.on(signal, () => child.kill(signal))
child.on('error', (why) => stop(93, `setpriv could not be started (${why.message}).`))
child.on('exit', (code, signal) => process.exit(code ?? (signal === null ? 1 : 128 + (constants.signals[signal] ?? 0))))
