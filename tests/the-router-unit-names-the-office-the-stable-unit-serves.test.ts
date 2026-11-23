// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE ROUTER'S UNIT NAMES THE OFFICE THE STABLE UNIT SERVES. On the host, the router that systemd started exited with
 * status 2 and was started again eight times. Its unit gave it no environment, so it found no office address, and the
 * key file it then looked at held no office key. tools/key-router/install.mjs now reads the serving office's port and
 * database from the stable unit (`systemctl --user show`), checks them against that office's own GET /api/runtime
 * answer, and writes them into the router's unit as two Environment lines. The router's unit command prints the same
 * unit, worked out by the same module.
 *
 * THE MADE-UP HOST. Each case has its own folder in this test's folder. In it are a scratch HOME, a fake systemctl first
 * on PATH, and a made-up database file with its keys.json. A made-up office in this process answers on a loopback port
 * of its own. The fake systemctl answers `show` with a made-up ExecStart, and prints a MainPID and an ActiveState that
 * install does not read. It logs every other call. Nothing here asks the real systemctl or the host's units, and nothing
 * is written under the real home.
 *
 * THE DECOYS. Install is given MOLE_OFFICE_API and MOLE_OFFICE_DB of its own: a port where nobody answers, and a second
 * made-up database whose key the made-up office refuses. An install that took the office from its own environment, or
 * from a .env under it, would ask neither the made-up office nor any other.
 *
 * Install runs with spawn, not spawnSync, because the made-up office answers in this process, and this process answers
 * nothing while it waits for spawnSync.
 */
import { spawn } from 'node:child_process'
import { chmodSync, existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, statSync, symlinkSync, writeFileSync } from 'node:fs'
import { createServer, request } from 'node:http'
import type { AddressInfo } from 'node:net'
import { basename, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { KEY_HEADER } from '../src/config/key-header.mjs'
import { THE_ROUTER_SOCKET_NAME, theKeySlotsFile, theProviderRouterUnit, theProviderRouterUnitPath, theRouterControlSocket } from '../src/config/provider-router.mjs'
import { aRouterFolderFor } from '../tools/provider-router-host.mjs'
import { aTestDatabaseFolder, removeThisTestFolder } from './a-test-folder.ts'

const CHECKOUT = fileURLToPath(new URL('..', import.meta.url)).replace(/\/$/, '')
const INSTALL = join(CHECKOUT, 'tools', 'key-router', 'install.mjs')
const ROUTER = join(CHECKOUT, 'tools', 'provider-router.mjs')
/** The unit the host's office runs under. It is written out here, so this file loads before the module that reads it. */
const THE_STABLE_UNIT = 'mole-office-stable.service'
const THE_SHOW_CALL = `--user show ${THE_STABLE_UNIT} -p ExecStart`
const THE_ENABLING_CALLS = ['--user daemon-reload', '--user enable --now mole-office-keyrouter.service']
/** Made-up process ids. They have seven digits, so no port, folder name or stamp in an output holds one by chance. */
const MAIN_PID = 3141592
const ANOTHER_PID = 2718281
/** A word of the stable unit's ExecStart that install has no reason to read, keep or print. */
const ANOTHER_WORD = 'MOLE_OFFICE_MADE_UP_SETTING=made-up-word-nobody-reads'
const DECOY_KEY = 'made-up-decoy-office-key'
const PERSON_KEY = 'made-up-person-key'
const RUN_TOKEN = 'made-up-run-token'
const PROVIDER_KEY = 'made-up-deepseek-key'

/** `systemctl show` answers this when it is to answer as the stable unit; every other call is only logged. */
const FAKE_SYSTEMCTL = [
  '#!/bin/sh',
  'if [ "$2" = show ]; then printf "%s\\n" "$*" >> "$ROUTER_SYSTEMCTL_SHOW_LOG"; cat "$ROUTER_SYSTEMCTL_SHOW"; exit 0; fi',
  'printf "%s\\n" "$*" >> "$ROUTER_SYSTEMCTL_LOG"',
  '',
].join('\n')

let folder = ''
beforeAll(() => { folder = aTestDatabaseFolder('router-unit') })
afterAll(() => { if (folder) removeThisTestFolder(folder) })

/** What `systemctl show` describes. `words` is the list after `env -i`, or null when systemd knows no ExecStart. */
interface Stable { active: string, pid: number, words: string[] | null }
/** The parts of an office's GET /api/runtime answer that install checks. */
interface Runtime { port: number, supervisor: { pid: number }, repository: { path: string }, database: { path: string } }
/** The case's own folder, and a loopback port where nobody answers. */
interface Where { own: string, closedPort: number }
interface Change {
  stable?: (right: Stable, where: Where) => Stable
  runtime?: (right: Runtime, where: Where) => Runtime
  /** False when the key file beside the database holds the person's key and no office key. */
  officeKey?: boolean
  /** True when the office takes the connection and never answers GET /api/runtime. */
  silent?: boolean
  /** The sandboxes folder, when the case needs one other than the one in its own folder. */
  sandboxes?: string
}
interface Asked { method: string, url: string, key: string | undefined, body: string }
interface MadeUpOffice { port: number, api: string, asked: Asked[], runtime: Runtime | null, silent: boolean, close: () => Promise<void> }
interface Host {
  own: string, home: string, data: string, decoy: string, sandboxes: string, database: string, key: string, unit: string
  closedPort: number, office: MadeUpOffice, env: Record<string, string>, calls: string, shown: string
}
interface Ran { status: number | null, out: string, err: string }

/** A loopback port that was free a moment ago, and that nothing listens on now. */
async function aClosedPort(): Promise<number> {
  const server = createServer()
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done))
  const { port } = server.address() as AddressInfo
  await new Promise<void>((done) => server.close(() => done()))
  return port
}

/**
 * An office that answers only with its own key, as a real one does, so a wrong key sent to it is not hidden. It answers
 * GET /api/runtime with what the case sets, or holds that request open with no answer when the case makes it silent. It
 * refuses every run token at POST /api/provider-router/admissions, so a router that asks it sends nothing to a provider.
 */
async function aMadeUpOffice(key: string): Promise<MadeUpOffice> {
  const office: MadeUpOffice = { port: 0, api: '', asked: [], runtime: null, silent: false, close: async () => {} }
  const server = createServer((req, res) => {
    const parts: Buffer[] = []
    req.on('data', (part: Buffer) => parts.push(part))
    req.on('end', () => {
      const sent = req.headers[KEY_HEADER]
      office.asked.push({ method: req.method ?? '', url: req.url ?? '', key: typeof sent === 'string' ? sent : undefined, body: Buffer.concat(parts).toString('utf8') })
      const answer = (status: number, body: unknown) => res.writeHead(status, { 'content-type': 'application/json' }).end(JSON.stringify(body))
      if (sent !== key) return answer(401, { code: 'no-key' })
      if (req.method === 'GET' && req.url === '/api/runtime') return office.silent ? undefined : answer(200, office.runtime)
      if (req.method === 'POST' && req.url === '/api/provider-router/admissions') return answer(200, { admitted: false, code: 'invalid-token', says: 'The made-up office admits no token.' })
      return answer(404, { code: 'not-found' })
    })
  })
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done))
  office.port = (server.address() as AddressInfo).port
  office.api = `http://127.0.0.1:${String(office.port)}`
  office.close = () => new Promise<void>((done) => { server.closeAllConnections(); server.close(() => done()) })
  return office
}

/**
 * `systemctl show` as systemd prints it: one Name=value line each, and ExecStart as the list systemd keeps. It also
 * prints MainPID and ActiveState, as a fake that ignores -p, so a case can show that install does not read them.
 */
function theShowAnswer({ active, pid, words }: Stable): string {
  const execStart = words === null
    ? 'ExecStart='
    : `ExecStart={ path=/usr/bin/env ; argv[]=/usr/bin/env -i ${words.join(' ')} ; ignore_errors=no ; start_time=[n/a] ; stop_time=[n/a] ; pid=0 ; code=(null) ; status=0/0 }`
  return [`MainPID=${String(pid)}`, execStart, `ActiveState=${active}`, ''].join('\n')
}

/** A made-up host whose stable unit serves a made-up office, as a case changes it. */
async function aMadeUpHost(name: string, change: Change = {}): Promise<Host> {
  const own = join(folder, name)
  const home = join(own, 'home')
  const bin = join(own, 'bin')
  const data = join(own, 'data')
  const decoy = join(own, 'decoy')
  const sandboxes = change.sandboxes ?? join(own, 'sandboxes')
  const database = join(data, 'office.db')
  const key = `made-up-office-key-of-${name}`
  for (const each of [home, bin, data, decoy, sandboxes]) mkdirSync(each, { recursive: true, mode: 0o700 })
  writeFileSync(database, '')
  writeFileSync(join(data, 'keys.json'), JSON.stringify(change.officeKey === false ? { person: PERSON_KEY } : { office: key }), { mode: 0o600 })
  writeFileSync(join(decoy, 'office.db'), '')
  writeFileSync(join(decoy, 'keys.json'), JSON.stringify({ office: DECOY_KEY }), { mode: 0o600 })
  const closedPort = await aClosedPort()
  const where = { own, closedPort }
  const office = await aMadeUpOffice(key)
  const runtime: Runtime = { port: office.port, supervisor: { pid: MAIN_PID }, repository: { path: CHECKOUT }, database: { path: database } }
  office.runtime = change.runtime === undefined ? runtime : change.runtime(runtime, where)
  office.silent = change.silent === true
  const stable: Stable = { active: 'active', pid: MAIN_PID, words: [`MOLE_OFFICE_PORT=${String(office.port)}`, `MOLE_OFFICE_DB=${database}`, ANOTHER_WORD, '/made-up/stable/node', '/made-up/stable/checkout/server.mjs'] }
  writeFileSync(join(own, 'show'), theShowAnswer(change.stable === undefined ? stable : change.stable(stable, where)))
  writeFileSync(join(bin, 'systemctl'), FAKE_SYSTEMCTL, { mode: 0o700 })
  const calls = join(own, 'systemctl.log')
  const shown = join(own, 'show.log')
  const env = {
    HOME: home, PATH: `${bin}:${process.env.PATH ?? ''}`,
    ROUTER_SYSTEMCTL_SHOW: join(own, 'show'), ROUTER_SYSTEMCTL_SHOW_LOG: shown, ROUTER_SYSTEMCTL_LOG: calls,
    MOLE_OFFICE_API: `http://127.0.0.1:${String(closedPort)}`, MOLE_OFFICE_DB: join(decoy, 'office.db'),
  }
  return { own, home, data, decoy, sandboxes, database, key, unit: theProviderRouterUnitPath(home), closedPort, office, env, calls, shown }
}

/** Run install on the made-up host, the way a person runs it. */
function install(host: Host): Promise<Ran> {
  return aRun(host, [INSTALL, '--sandboxes', host.sandboxes])
}

/** Run the router's unit command on the made-up host, the way a person runs it. */
function theUnitCommand(host: Host): Promise<Ran> {
  return aRun(host, [ROUTER, 'unit', '--sandboxes', host.sandboxes])
}

/** Run a program of this checkout with node, in the made-up host's environment, and keep what it printed. */
function aRun(host: Host, args: string[]): Promise<Ran> {
  return new Promise((done, reject) => {
    const child = spawn(process.execPath, args, { env: host.env, stdio: ['ignore', 'pipe', 'pipe'] })
    let out = ''
    let err = ''
    child.stdout.on('data', (part: Buffer) => { out += part.toString() })
    child.stderr.on('data', (part: Buffer) => { err += part.toString() })
    child.once('error', reject)
    child.once('close', (status) => done({ status, out, err }))
  })
}

/** The lines a log holds, or none when nothing was logged. */
function theLines(log: string): string[] {
  return existsSync(log) ? readFileSync(log, 'utf8').trim().split('\n').filter((line) => line !== '') : []
}

/** The unit install should write on this host: the router's unit, naming the made-up office and its database. */
function theUnitFor(host: Host): string {
  return theProviderRouterUnit({ node: process.execPath, router: ROUTER, sandboxes: host.sandboxes, office: { api: host.office.api, database: host.database } })
}

/**
 * THE UNIT THE EARLIER INSTALL WROTE, word for word, for this node, router and sandboxes. It is written out here, not
 * made from the new unit's text, because it is what the earlier install already wrote on the host, so it no longer
 * changes. Made from the new text, it would agree with code that also changed another line of the unit, and that code
 * would refuse the host's file as a different unit.
 */
function theEarlierUnitFor(host: Host): string {
  return [
    '[Unit]',
    "Description=Mole Office provider router: swaps a run's token for a provider key",
    '',
    '[Service]',
    'Type=simple',
    `ExecStart=${process.execPath} ${ROUTER} serve --sandboxes ${host.sandboxes}`,
    'Restart=always',
    'RestartSec=2',
    'UMask=0077',
    '',
    '[Install]',
    'WantedBy=default.target',
    '',
  ].join('\n')
}

/**
 * No output holds a value of the made-up host but the port and the unit's own path: not the database's folder, which
 * also names its key file, not a key, not a process id and not another word of the stable unit.
 */
function expectNoValueIn(ran: Ran, host: Host): void {
  for (const value of [host.data, host.decoy, host.key, DECOY_KEY, PERSON_KEY, String(MAIN_PID), String(ANOTHER_PID), 'made-up-word-nobody-reads', '/made-up/']) {
    expect(ran.out).not.toContain(value)
    expect(ran.err).not.toContain(value)
  }
}

/** Ask a router socket one POST and read its whole answer. */
function post(socketPath: string, path: string, headers: Record<string, string>, body: string): Promise<{ status: number | undefined, body: string }> {
  return new Promise((done, reject) => {
    const req = request({ socketPath, method: 'POST', path, headers: { 'content-type': 'application/json', ...headers } }, (res) => {
      let text = ''
      res.on('data', (part: Buffer) => { text += part.toString() })
      res.on('end', () => done({ status: res.statusCode, body: text }))
    })
    req.on('error', reject)
    req.end(body)
  })
}

const theWords = (right: Stable, change: (words: string[]) => string[]): Stable => ({ ...right, words: change(right.words ?? []) })
const withThePort = (port: string) => (words: string[]) => words.map((word) => word.startsWith('MOLE_OFFICE_PORT=') ? `MOLE_OFFICE_PORT=${port}` : word)

interface Refusal {
  what: string
  change: Change
  /** Words of the one sentence that names the check that failed. */
  says: RegExp
  /** Which port the refusal names, when it read one. */
  names: 'the office' | 'the closed port' | null
  /** Whether install got as far as asking the made-up office. */
  asks: boolean
  /** The least and the most time install may take, in milliseconds, when the case is about time. */
  takes?: { atLeast: number, atMost: number }
}

const REFUSALS: Refusal[] = [
  // THE FAULT: on a host with no stable office, install would write a unit naming an office it could not check.
  // A unit systemd does not know has an empty ExecStart, so it names no port.
  { what: 'there is no stable unit', change: { stable: () => ({ active: 'inactive', pid: 0, words: null }) }, says: /MOLE_OFFICE_PORT/, names: null, asks: false },
  // THE FAULT: with no port of its own, the router falls back to the default address, which is not the office's.
  { what: 'the stable unit names no port', change: { stable: (right) => theWords(right, (words) => words.filter((word) => !word.startsWith('MOLE_OFFICE_PORT='))) }, says: /MOLE_OFFICE_PORT/, names: null, asks: false },
  // THE FAULT: an install that took the first of two ports would name the port where nobody answers. The office's port
  // comes second, so an install that took the last would pass every other check. Only taking each name once refuses it.
  { what: 'the stable unit names its port twice', change: { stable: (right, where) => theWords(right, (words) => [`MOLE_OFFICE_PORT=${String(where.closedPort)}`, ...words]) }, says: /MOLE_OFFICE_PORT/, names: null, asks: false },
  // THE FAULT: with no database of its own, the router reads the default database's key file, which holds no office key.
  { what: 'the stable unit names no database', change: { stable: (right) => theWords(right, (words) => words.filter((word) => !word.startsWith('MOLE_OFFICE_DB='))) }, says: /MOLE_OFFICE_DB/, names: 'the office', asks: false },
  // THE FAULT: env keeps the last of two settings of one name, so taking the first would name a database the office does
  // not have open.
  { what: 'the stable unit names its database twice', change: { stable: (right, where) => theWords(right, (words) => [...words, `MOLE_OFFICE_DB=${join(where.own, 'decoy', 'office.db')}`]) }, says: /MOLE_OFFICE_DB/, names: 'the office', asks: false },
  // THE FAULT: a port out of range would go into the unit as an address that no office can answer on.
  { what: 'the stable unit names a port out of range', change: { stable: (right) => theWords(right, withThePort('65536')) }, says: /1 to 65535/, names: null, asks: false },
  // THE FAULT: systemd reads `%` in a unit line as a specifier, so a path holding one would open another key file than
  // the office's. Such a path is refused, never escaped.
  { what: 'the database path holds a character a unit line may not hold', change: { stable: (right) => theWords(right, (words) => words.map((word) => word.startsWith('MOLE_OFFICE_DB=') ? 'MOLE_OFFICE_DB=/made-up/data/office%h.db' : word)) }, says: /letters, digits/, names: 'the office', asks: false },
  // THE FAULT: the router reads the same key file and would exit with status 2 at each start, the loop on the host.
  { what: 'the key file beside the database holds no office key', change: { officeKey: false }, says: /no office key/, names: 'the office', asks: false },
  // THE FAULT: a unit naming a port where no office answers starts the same loop of refusals.
  { what: 'no office answers on the port the stable unit names', change: { stable: (right, where) => theWords(right, withThePort(String(where.closedPort))) }, says: /did not answer/, names: 'the closed port', asks: false },
  // THE FAULT: an office that holds the port and no longer answers would keep install waiting for ever. The ask has 5 s.
  { what: 'the office takes the connection and never answers', change: { silent: true }, says: /did not answer/, names: 'the office', asks: true, takes: { atLeast: 4_500, atMost: 15_000 } },
  // THE FAULT: an office on the port with another database open is not the one the stable unit serves, and its key
  // is not the one beside the database the unit would name.
  { what: 'the office has another database open', change: { runtime: (right, where) => ({ ...right, database: { path: join(where.own, 'decoy', 'office.db') } }) }, says: /another database/, names: 'the office', asks: true },
  // THE FAULT: the answer comes from an office that says it serves another port, so it is not the office the unit names.
  { what: 'the office says it serves another port', change: { runtime: (right, where) => ({ ...right, port: where.closedPort }) }, says: /another port/, names: 'the office', asks: true },
  // THE FAULT: install run from another copy of the code, such as a worktree, would write a unit that starts that copy's
  // router for an office that runs other code.
  { what: 'the office runs from another checkout', change: { runtime: (right, where) => ({ ...right, repository: { path: where.own } }) }, says: /checkout/, names: 'the office', asks: true },
]

describe('the router unit that install writes', () => {
  it('writes the unit with the office\'s address and database at 0600, enables it, and keeps it when it already matches', async () => {
    // THE FAULT: the unit gave the router no environment, so it found no office address and no key file, and exited with
    // status 2 at each start. The decoys also catch an install that takes the office from its own environment.
    const host = await aMadeUpHost('right')
    try {
      const ran = await install(host)
      expect(ran.status).toBe(0)
      expect(ran.out).toContain(host.unit)
      const written = readFileSync(host.unit, 'utf8')
      expect(written).toBe(theUnitFor(host))
      const lines = written.split('\n')
      const at = lines.findIndex((line) => line.startsWith('ExecStart='))
      expect(lines.slice(at - 2, at)).toEqual([`Environment=MOLE_OFFICE_API=${host.office.api}`, `Environment=MOLE_OFFICE_DB=${host.database}`])
      expect(lines.filter((line) => line.startsWith('Environment='))).toHaveLength(2)
      for (const value of [host.key, String(MAIN_PID), 'made-up-word-nobody-reads', '/made-up/', host.decoy]) expect(written).not.toContain(value)
      expect(statSync(host.unit).mode & 0o777).toBe(0o600)
      expect(theLines(host.shown)).toEqual([THE_SHOW_CALL])
      expect(theLines(host.calls)).toEqual(THE_ENABLING_CALLS)
      expect(host.office.asked).toEqual([{ method: 'GET', url: '/api/runtime', key: host.key, body: '' }])
      expectNoValueIn(ran, host)
      const again = await install(host)
      expect(again.status).toBe(0)
      expect(readFileSync(host.unit, 'utf8')).toBe(written)
      expect(theLines(host.calls)).toEqual([...THE_ENABLING_CALLS, ...THE_ENABLING_CALLS])
      expectNoValueIn(again, host)
    } finally {
      await host.office.close()
    }
  })

  it('writes the same unit and enables it when the stable unit is inactive and the office runs outside it', async () => {
    // THE FAULT: the office as every upgrade leaves it runs outside its unit, and an install that required the unit would
    // refuse after every upgrade.
    const host = await aMadeUpHost('after-an-upgrade', {
      stable: (right) => ({ ...right, active: 'inactive', pid: 0 }),
      runtime: (right) => ({ ...right, supervisor: { pid: ANOTHER_PID } }),
    })
    try {
      const ran = await install(host)
      expect(ran.status).toBe(0)
      expect(ran.out).toContain(host.unit)
      expect(readFileSync(host.unit, 'utf8')).toBe(theUnitFor(host))
      expect(statSync(host.unit).mode & 0o777).toBe(0o600)
      expect(theLines(host.shown)).toEqual([THE_SHOW_CALL])
      expect(theLines(host.calls)).toEqual(THE_ENABLING_CALLS)
      expect(host.office.asked).toEqual([{ method: 'GET', url: '/api/runtime', key: host.key, body: '' }])
      expectNoValueIn(ran, host)
    } finally {
      await host.office.close()
    }
  })

  it('takes a database and a checkout named through a link for the files they lead to', async () => {
    // THE FAULT: the office names its real paths, and a stable unit may name its database through a link. Compared as
    // text, one database would be taken for two and the right office refused.
    const host = await aMadeUpHost('link', {
      stable: (right, where) => theWords(right, (words) => words.map((word) => word.startsWith('MOLE_OFFICE_DB=') ? `MOLE_OFFICE_DB=${join(where.own, 'linked-data', 'office.db')}` : word)),
      runtime: (right, where) => ({ ...right, repository: { path: join(where.own, 'linked-checkout') } }),
    })
    try {
      symlinkSync(host.data, join(host.own, 'linked-data'))
      symlinkSync(CHECKOUT, join(host.own, 'linked-checkout'))
      const ran = await install(host)
      expect(ran.status).toBe(0)
      expect(readFileSync(host.unit, 'utf8')).toContain(`\nEnvironment=MOLE_OFFICE_DB=${join(host.own, 'linked-data', 'office.db')}\n`)
      expect(theLines(host.calls)).toEqual(THE_ENABLING_CALLS)
    } finally {
      await host.office.close()
    }
  })

  it.each(REFUSALS.map((refusal) => [refusal.what, refusal] as const))('writes nothing and enables nothing when %s', async (_what, refusal) => {
    const name = `refused-${String(REFUSALS.indexOf(refusal))}`
    const host = await aMadeUpHost(name, refusal.change)
    try {
      const started = Date.now()
      const ran = await install(host)
      const took = Date.now() - started
      if (refusal.takes !== undefined) {
        expect(took).toBeGreaterThanOrEqual(refusal.takes.atLeast)
        expect(took).toBeLessThanOrEqual(refusal.takes.atMost)
      }
      expect(ran.status).not.toBe(0)
      expect(ran.err).toMatch(refusal.says)
      expect(ran.err).toContain(host.unit)
      if (refusal.names !== null) expect(ran.err).toContain(String(refusal.names === 'the office' ? host.office.port : host.closedPort))
      expect(lstatSync(host.unit, { throwIfNoEntry: false })).toBeUndefined()
      expect(theLines(host.shown)).toEqual([THE_SHOW_CALL])
      expect(theLines(host.calls)).toEqual([])
      expect(host.office.asked.filter((one) => one.url === '/api/runtime')).toHaveLength(refusal.asks ? 1 : 0)
      expectNoValueIn(ran, host)
    } finally {
      await host.office.close()
    }
  })

  it('replaces the unit an earlier install wrote, which named no office, and keeps no copy of it', async () => {
    // THE FAULT: the host already holds the unit the earlier install wrote. An install that kept every existing unit
    // would leave the router restarting, so that one earlier form is written over, through a new file at 0600.
    const host = await aMadeUpHost('earlier')
    try {
      const expected = theUnitFor(host)
      const earlier = theEarlierUnitFor(host)
      expect(earlier).not.toBe(expected)
      mkdirSync(dirname(host.unit), { recursive: true, mode: 0o700 })
      writeFileSync(host.unit, earlier)
      chmodSync(host.unit, 0o644)
      const ran = await install(host)
      expect(ran.status).toBe(0)
      expect(readFileSync(host.unit, 'utf8')).toBe(expected)
      expect(statSync(host.unit).mode & 0o777).toBe(0o600)
      expect(readdirSync(dirname(host.unit))).toEqual([basename(host.unit)])
      expect(theLines(host.calls)).toEqual(THE_ENABLING_CALLS)
      expectNoValueIn(ran, host)
    } finally {
      await host.office.close()
    }
  })

  const DIFFERENT: [string, (expected: string, host: Host) => string][] = [
    // THE FAULT: install would write over a unit the person changed by hand.
    ['a unit the person changed', (expected) => `${expected}# changed by hand\n`],
    // THE FAULT: install would write over a unit that names another office, and move the router without a word.
    ['a unit naming another office', (expected, host) => expected.replace(`Environment=MOLE_OFFICE_API=${host.office.api}\n`, `Environment=MOLE_OFFICE_API=http://127.0.0.1:${String(host.closedPort)}\n`)],
  ]
  it.each(DIFFERENT)('leaves %s alone and enables nothing', async (what, theFile) => {
    const host = await aMadeUpHost(`different-${what.split(' ').join('-')}`)
    try {
      const expected = theUnitFor(host)
      const different = theFile(expected, host)
      expect(different).not.toBe(expected)
      mkdirSync(dirname(host.unit), { recursive: true, mode: 0o700 })
      writeFileSync(host.unit, different, { mode: 0o600 })
      const ran = await install(host)
      expect(ran.status).not.toBe(0)
      expect(ran.err).toContain(host.unit)
      expect(readFileSync(host.unit, 'utf8')).toBe(different)
      expect(theLines(host.calls)).toEqual([])
      expectNoValueIn(ran, host)
    } finally {
      await host.office.close()
    }
  })

  it('starts the router as the unit does, and it stays up and asks the office with the office key from the key file', async () => {
    // THE FAULT: started by systemd with no environment, the router found no office address and no office key, exited
    // with status 2 and was started again eight times. Started here from nothing but the unit's own lines, it has to
    // find both, stay up, and reach the office with the key the office made.
    // THE SANDBOXES FOLDER IS A TEST FOLDER OF ITS OWN, with the shortest name. A Unix socket path holds at most 107
    // bytes, and the router's two sockets lie two and three folders down in it. Under this test's own folder they come to
    // 109 bytes each when the temporary folder's path is 24 bytes long. Then listen says it is listening, and no socket
    // is at the path it was given.
    const sandboxes = aTestDatabaseFolder('s')
    const host = await aMadeUpHost('start', { sandboxes })
    try {
      expect((await install(host)).status).toBe(0)
      const lines = readFileSync(host.unit, 'utf8').split('\n')
      const execStart = lines.filter((line) => line.startsWith('ExecStart='))
      expect(execStart).toHaveLength(1)
      const [program, ...args] = execStart[0]!.slice('ExecStart='.length).split(' ')
      const fromTheUnit: Record<string, string> = {}
      for (const line of lines.filter((one) => one.startsWith('Environment='))) {
        const [name, ...value] = line.slice('Environment='.length).split('=')
        fromTheUnit[name!] = value.join('=')
      }
      // Nothing is started unless the unit names the made-up office, so a router started here asks no other office.
      expect(fromTheUnit).toEqual({ MOLE_OFFICE_API: host.office.api, MOLE_OFFICE_DB: host.database })
      // THE SLOTS FILE IS THE ONLY THING IN THIS HOME. The router starts without a key slots file, because it reads the
      // file at each request. But with no slot for a provider, it refuses the request with no-slot before it asks the
      // office. One DeepSeek slot lets the request below reach the office's admission. Every value in it is made up
      // here; the host's own slots file is never read or copied.
      const home = join(host.own, 'router-home')
      mkdirSync(join(home, '.config', 'mole-office'), { recursive: true, mode: 0o700 })
      chmodSync(join(home, '.config', 'mole-office'), 0o700)
      writeFileSync(theKeySlotsFile(home), JSON.stringify({ version: 1, slots: [{ id: 'made-up-deepseek', provider: 'deepseek', label: 'Made-up DeepSeek slot', key: PROVIDER_KEY }] }), { mode: 0o600 })
      mkdirSync(join(host.sandboxes, '.run', 'a'), { recursive: true, mode: 0o700 })
      const socket = join(aRouterFolderFor(join(host.sandboxes, '.run', 'a')), THE_ROUTER_SOCKET_NAME)
      for (const path of [theRouterControlSocket(host.sandboxes), socket]) {
        expect(Buffer.byteLength(path), `the socket path ${path} is longer than the 107 bytes a Unix socket path may hold`).toBeLessThanOrEqual(107)
      }
      // As systemd starts a user unit: only the unit's Environment lines and HOME, in the home folder, in a process
      // group of its own, so the test stops it by that group.
      const router = spawn(program!, args, { cwd: home, env: { ...fromTheUnit, HOME: home }, detached: true, stdio: ['ignore', 'ignore', 'pipe'] })
      let said = ''
      router.stderr.on('data', (part: Buffer) => { said += part.toString() })
      const stopped = new Promise<void>((done) => { router.once('exit', () => done()); router.once('error', () => done()) })
      try {
        await new Promise<void>((done, reject) => {
          const timeout = setTimeout(() => reject(new Error(`the router did not say it was listening: ${said}`)), 10_000)
          router.stderr.on('data', () => { if (said.includes('listening on')) { clearTimeout(timeout); done() } })
          router.once('exit', (code) => { clearTimeout(timeout); reject(new Error(`the router exited with ${String(code)}: ${said}`)) })
        })
        // On the host it exited within a second of each start.
        await new Promise((done) => setTimeout(done, 3_000))
        expect(router.exitCode).toBeNull()
        expect(router.signalCode).toBeNull()
        expect((await post(theRouterControlSocket(host.sandboxes), '/open', {}, JSON.stringify({ sandbox: 'a' }))).status).toBe(200)
        const carried = await post(socket, '/deepseek/chat/completions', { authorization: `Bearer ${RUN_TOKEN}` }, JSON.stringify({ model: 'deepseek-chat', messages: [{ role: 'user', content: 'made-up' }] }))
        // The made-up office refused the token, so nothing went to a provider.
        expect(carried.status).toBe(401)
        const admissions = host.office.asked.filter((one) => one.url === '/api/provider-router/admissions')
        expect(admissions).toHaveLength(1)
        expect(admissions[0]).toMatchObject({ method: 'POST', key: host.key })
        expect(JSON.parse(admissions[0]!.body)).toMatchObject({ token: RUN_TOKEN, provider: 'deepseek', model: 'deepseek-chat' })
        expect(said).not.toContain(host.key)
        expect(said).not.toContain(PROVIDER_KEY)
      } finally {
        // A router that died by a signal has a null exitCode, and killing its group then throws, which hides the failure.
        if (router.exitCode === null && router.signalCode === null && router.pid) process.kill(-router.pid, 'SIGTERM')
        await stopped
      }
    } finally {
      await host.office.close()
      removeThisTestFolder(sandboxes)
    }
  })
})

describe('the router unit that the router\'s unit command prints', () => {
  it('prints exactly the unit install writes on the same host, and writes and enables nothing itself', async () => {
    // THE FAULT: the unit command printed a unit that named no office, which is the unit that failed on the host.
    const host = await aMadeUpHost('printed')
    try {
      const printed = await theUnitCommand(host)
      expect(printed.status).toBe(0)
      expect(printed.out).toBe(theUnitFor(host))
      expect(lstatSync(host.unit, { throwIfNoEntry: false })).toBeUndefined()
      expect(theLines(host.shown)).toEqual([THE_SHOW_CALL])
      expect(theLines(host.calls)).toEqual([])
      expect(host.office.asked).toEqual([{ method: 'GET', url: '/api/runtime', key: host.key, body: '' }])
      for (const value of [host.data, host.decoy, host.key, DECOY_KEY, String(MAIN_PID), 'made-up-word-nobody-reads', '/made-up/']) expect(printed.err).not.toContain(value)
      expect((await install(host)).status).toBe(0)
      expect(printed.out).toBe(readFileSync(host.unit, 'utf8'))
    } finally {
      await host.office.close()
    }
  })

  it('prints nothing and fails when the stable unit names no office', async () => {
    // THE FAULT: a unit command that printed a unit when it could not read the office would hand the person the unit
    // that names no office.
    const host = await aMadeUpHost('printed-no-office', { stable: () => ({ active: 'inactive', pid: 0, words: null }) })
    try {
      const printed = await theUnitCommand(host)
      expect(printed.status).not.toBe(0)
      expect(printed.out).toBe('')
      expect(printed.err).toMatch(/MOLE_OFFICE_PORT/)
      expect(lstatSync(host.unit, { throwIfNoEntry: false })).toBeUndefined()
      expect(theLines(host.shown)).toEqual([THE_SHOW_CALL])
      expect(theLines(host.calls)).toEqual([])
      expect(host.office.asked).toEqual([])
      expectNoValueIn(printed, host)
    } finally {
      await host.office.close()
    }
  })
})
