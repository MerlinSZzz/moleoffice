// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** Problem e-ZODNdmOYhE, wave 13t message JDCiM_ApIIZh.
 * Real detached groups exercise CLI start and rollback. Node's --import seam replaces
 * only the two server spawns, and (in one case) refuses signals to those recorded groups.
 * No real office or other run's process is touched, including during mutation cleanup.
 *
 * OLD (wave 13s round 113, problem bJ_bNVgz4d5i): the world's two ports were the tool's own picks, which Linux takes
 * from its ephemeral range, the range it also hands every other program that listens on port 0. The API stand-in of
 * the third case never binds its port and the browser app is never started, so for about twenty seconds both ports
 * were held by nobody. In a whole-suite run another program took one, and the stop said "port 33363 is still held"
 * and exited 1.
 * NEW: the preload hands the tool's first two listens on port 0 two ports this file picked below that range, where no
 * listen on port 0 and no outgoing connection lands, and the cases check that the world got them.
 * WHY: a test whose port is free only while no other program on the machine wants one passes or fails by what else
 * runs beside it.
 * MUTATIONS (round 113, each after a control run, then restored): stopTheProcesses in tools/isolated-mole-office.mjs no
 * longer counts a live group as still running → the third case goes red; the preload hands the tool's listens their
 * own port 0 again → the first three cases go red on the world's ports. */
import { spawn, spawnSync } from 'node:child_process'
import { createServer } from 'node:http'
import { createServer as createProbe } from 'node:net'
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { placeFor } from '../tools/isolated-mole-office.mjs'
import { theHandedDownPorts } from '../tools/live-office-guard.mjs'
import { fileURLToPath } from 'node:url'
import { afterAll, afterEach, beforeAll, beforeEach, expect, it } from 'vitest'
import { aGroupIsHere } from './a-group-is-here.ts'
import { aTestDatabaseFolder } from './a-test-folder.ts'

const REPO = fileURLToPath(new URL('..', import.meta.url))
const TOOL = join(REPO, 'tools/isolated-mole-office.mjs')
const scratch = aTestDatabaseFolder('wait-rollback')
const source = join(scratch, 'source.db')
const preload = join(scratch, 'preload.mjs')
const standIn = join(scratch, 'stand-in.mjs')
const groupsFile = join(scratch, 'groups.json')
let name: string
let place: string
/** The two ports the world is handed in this case, picked by `twoPortsBelowTheEphemeralRange`. */
let ports: number[]
let officeApi: string
const rows = { written: 0, closed: [] as string[] }

const office = createServer((req, res) => {
  req.resume()
  res.setHeader('content-type', 'application/json')
  if (req.url === '/api/runtime') res.end(JSON.stringify({ addresses: { forOtherMachines: null } }))
  else if (req.url === '/api/records/synthetic-run') res.end(JSON.stringify({ record: { data: { servingAgent: 'synthetic-starter' } } }))
  else if (req.url === '/api/records?kind=session') res.end(JSON.stringify({ records: [] }))
  else if (req.url === '/api/participants') res.end(JSON.stringify({ agents: [] }))
  else if (req.url === '/api/office/worlds') {
    rows.written++
    res.end(JSON.stringify({ world: { id: 'synthetic-world-row' }, reportsKey: { key: 'synthetic-report-key', holder: 'synthetic-starter' } }))
  } else if (req.url === '/api/office/worlds/synthetic-world-row/close') {
    rows.closed.push('synthetic-world-row')
    res.end('{}')
  } else if (req.url?.startsWith('/api/resources/holding?') === true) {
    // `stop` asks the ledger first; this stand-in ledger holds nothing. It says
    // the question back, as the real door does.
    const query = new URL(req.url, 'http://stand-in').searchParams
    const askedAbout = { ports: (query.get('ports') ?? '').split(',').filter((one) => one !== '').map(Number), database: query.get('database') }
    res.end(JSON.stringify({ askedAbout, holders: [], openButGone: [], says: 'No live ledger row holds them.' }))
  } else {
    res.statusCode = 500
    res.end(JSON.stringify({ error: 'Unexpected test request: ' + req.url }))
  }
})

interface Group { pid: number; port: number; service: string }
function groups(): Group[] {
  return existsSync(groupsFile) ? JSON.parse(readFileSync(groupsFile, 'utf8')) as Group[] : []
}
function portIsFree(port: number): Promise<boolean> {
  return new Promise((done) => {
    const probe = createProbe()
    probe.on('error', () => done(false))
    probe.listen(port, '127.0.0.1', () => probe.close(() => done(true)))
  })
}
/** The lowest port of the machine's ephemeral range, from which Linux picks a port for a listen on port 0. */
const THE_EPHEMERAL_RANGE_STARTS = Number(readFileSync('/proc/sys/net/ipv4/ip_local_port_range', 'utf8').trim().split(/\s+/)[0])
/**
 * Two free ports below the ephemeral range, in its lower half, never a live office's port. Such a port is taken only by
 * a program that names it, so it stays free between the world's start and its stop.
 */
async function twoPortsBelowTheEphemeralRange(): Promise<number[]> {
  expect(Number.isInteger(THE_EPHEMERAL_RANGE_STARTS) && THE_EPHEMERAL_RANGE_STARTS > 2048, 'the ephemeral range could not be read').toBe(true)
  const lowest = Math.floor(THE_EPHEMERAL_RANGE_STARTS / 2)
  const guarded = new Set((theHandedDownPorts() ?? []).map((one) => one.port))
  const picked: number[] = []
  for (let tries = 0; tries < 200 && picked.length < 2; tries++) {
    const port = lowest + Math.floor(Math.random() * (THE_EPHEMERAL_RANGE_STARTS - lowest))
    if (!guarded.has(port) && !picked.includes(port) && await portIsFree(port)) picked.push(port)
  }
  expect(picked, 'no two free ports were found below the ephemeral range').toHaveLength(2)
  return picked
}
function run(args: string[], mode = 'api-silent', denySignals = false): Promise<{ status: number | null; stdout: string; stderr: string }> {
  return new Promise((done, bad) => {
    const child = spawn(process.execPath, ['--import', preload, TOOL, ...args], {
      cwd: REPO,
      env: { ...process.env, MOLE_OFFICE_API: officeApi, MOLE_OFFICE_WORKSPACE: 'default',
        MOLE_OFFICE_AGENT: 'synthetic-starter', MOLE_AGENT_KEY: 'synthetic-office-key',
        SYNTHETIC_MODE: mode, SYNTHETIC_DENY_SIGNALS: String(denySignals), SYNTHETIC_PORTS: JSON.stringify(ports) },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let stdout = '', stderr = ''
    child.stdout.on('data', (bytes) => { stdout += String(bytes) })
    child.stderr.on('data', (bytes) => { stderr += String(bytes) })
    child.on('error', bad)
    child.on('close', (status) => {
      done({ status, stdout, stderr })
    })
  })
}

beforeAll(async () => {
  const built = spawnSync(process.execPath, ['node_modules/.bin/tsx', 'src/server/db/migrate.ts'], {
    cwd: REPO, env: { ...process.env, MOLE_OFFICE_DB: source }, encoding: 'utf8', timeout: 120_000,
  })
  expect(built.status, built.stdout + built.stderr).toBe(0)
  writeFileSync(standIn, `
import { createServer } from 'node:http'
const [service, port, mode] = process.argv.slice(2)
console.log('Synthetic last words: ' + service + ' stand-in is waiting.')
if (mode === 'api-silent') {
  // Keep a live group with no listener: a free port must not prove it stopped.
  setInterval(() => {}, 1000)
} else {
  // The browser holds a connection open. The readiness limit must bound fetch too.
  createServer((req, res) => { if (service === 'API') res.end('{}') })
    .listen(Number(port), '127.0.0.1')
}
`)
  writeFileSync(preload, `
import cp from 'node:child_process'
import net from 'node:net'
import { syncBuiltinESMExports } from 'node:module'
import { writeFileSync } from 'node:fs'
// The tool picks the world's two ports by listening on port 0; those two listens get the ports the test picked.
const picked = JSON.parse(process.env.SYNTHETIC_PORTS ?? '[]')
const originalListen = net.Server.prototype.listen
net.Server.prototype.listen = function(port, ...rest) {
  return originalListen.call(this, port === 0 && picked.length > 0 ? picked.shift() : port, ...rest)
}
const originalSpawn = cp.spawn
const originalKill = process.kill.bind(process)
const recorded = []
cp.spawn = function(command, args, options) {
  const service = args?.[0] === 'tools/serve-dev.mjs' ? 'API' :
    String(command).endsWith('/.bin/vite') ? 'browser app' : null
  if (service === null) return originalSpawn(command, args, options)
  const port = Number(options.env[service === 'API' ? 'MOLE_OFFICE_PORT' : 'MOLE_OFFICE_WEB_PORT'])
  const child = originalSpawn(process.execPath, [${JSON.stringify(standIn)}, service, String(port), process.env.SYNTHETIC_MODE], options)
  recorded.push({ pid: child.pid, port, service })
  writeFileSync(${JSON.stringify(groupsFile)}, JSON.stringify(recorded))
  return child
}
process.kill = function(pid, signal) {
  if (process.env.SYNTHETIC_DENY_SIGNALS === 'true' && signal !== 0 && recorded.some(one => -one.pid === pid)) {
    throw Object.assign(new Error('Synthetic signal refusal'), { code: 'EPERM' })
  }
  return originalKill(pid, signal)
}
syncBuiltinESMExports()
`)
  await new Promise<void>((done) => office.listen(0, '127.0.0.1', done))
  const address = office.address()
  if (address === null || typeof address === 'string') throw new Error('The test office has no port')
  officeApi = `http://127.0.0.1:${address.port}`
}, 120_000)
beforeEach(async () => {
  ports = await twoPortsBelowTheEphemeralRange()
  name = `t-wait-${Math.random().toString(36).slice(2, 10)}`
  place = placeFor(name)
  rmSync(groupsFile, { force: true })
  rows.written = 0
  rows.closed = []
})
afterEach(async () => {
  // The independent spawn record also survives the old die-without-rollback mutation.
  for (const group of groups()) {
    try { process.kill(-group.pid, 'SIGKILL') } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error
    }
  }
  for (const group of groups()) {
    for (let n = 0; n < 40 && aGroupIsHere(group.pid); n++) await new Promise((done) => setTimeout(done, 50))
    expect(aGroupIsHere(group.pid), 'mutation cleanup left a recorded group alive').toBe(false)
    expect(await portIsFree(group.port)).toBe(true)
  }
  rmSync(place, { recursive: true, force: true })
})
afterAll(async () => {
  await new Promise<void>((done, bad) => office.close((error) => error ? bad(error) : done()))
  rmSync(scratch, { recursive: true, force: true })
})

// Mutations: die in waitUntil; omit the row close; omit directory removal.
it('an API wait that runs out stops its group, deletes the place and closes its registered row', async () => {
  const out = await run(['start', name, '--from', source, '--ready-within', '1', '--show-to-the-person', '--run', 'synthetic-run'])
  expect(out.status, out.stderr).toBe(1)
  expect(groups()).toHaveLength(1)
  const group = groups()[0]!
  expect(group.port).toBe(ports[0])
  expect(out.stderr).toContain(`The API did not answer at http://127.0.0.1:${group.port}/api/health within 1 seconds.`)
  expect(out.stderr).toContain('Synthetic last words: API stand-in is waiting.')
  expect(out.stderr).toContain('Nothing is running: its API is stopped, the browser app was not started')
  expect(aGroupIsHere(group.pid)).toBe(false)
  expect(await portIsFree(group.port)).toBe(true)
  expect(existsSync(place)).toBe(false)
  expect(rows.written).toBe(1)
  expect(rows.closed).toEqual(['synthetic-world-row'])
}, 40_000)

// Mutations: die in waitUntil; omit directory removal.
it('a browser wait that runs out stops both spawned groups, including a request that hangs', async () => {
  const out = await run(['start', name, '--from', source, '--ready-within', '1'], 'browser-silent')
  expect(out.status, out.stderr).toBe(1)
  expect(groups()).toHaveLength(2)
  expect(groups().map((one) => one.port)).toEqual(ports)
  expect(out.stderr).toContain(`The browser app did not answer at http://127.0.0.1:${groups()[1]!.port}/ within 1 seconds.`)
  expect(out.stderr).toContain('Synthetic last words: browser app stand-in is waiting.')
  expect(out.stderr).toContain('Nothing is running: its API and browser app are stopped')
  for (const group of groups()) {
    expect(aGroupIsHere(group.pid)).toBe(false)
    expect(await portIsFree(group.port)).toBe(true)
  }
  expect(existsSync(place)).toBe(false)
  expect(rows.written).toBe(0)
}, 40_000)

// Mutations: ignore live groups whose ports are free; die without rollback in waitUntil.
it('a group that cannot be stopped is named, keeps its directory and has a usable stop command', async () => {
  const out = await run(['start', name, '--from', source, '--ready-within', '1', '--show-to-the-person', '--run', 'synthetic-run'], 'api-silent', true)
  expect(out.status, out.stderr).toBe(1)
  const group = groups()[0]!
  expect(aGroupIsHere(group.pid)).toBe(true)
  expect(out.stderr).toContain(`API group ${group.pid} is still running`)
  expect(out.stderr).toContain(`Stop it with: node tools/isolated-mole-office.mjs stop ${name}`)
  expect(out.stderr).not.toContain('Nothing is running')
  expect(existsSync(place)).toBe(true)
  const where = JSON.parse(readFileSync(join(place, 'where.json'), 'utf8')) as { apiPgid: number; apiPort: number; webPort: number }
  expect(where.apiPgid).toBe(group.pid)
  expect([where.apiPort, where.webPort]).toEqual(ports)
  expect(rows.closed).toEqual([])
  // The same name really works without the signal-denial seam.
  const stopped = await run(['stop', name])
  expect(stopped.status, stopped.stderr).toBe(0)
  expect(aGroupIsHere(group.pid)).toBe(false)
  expect(existsSync(place)).toBe(false)
  expect(rows.closed).toEqual(['synthetic-world-row'])
}, 40_000)

// Mutation: accept zero as a --ready-within value and enter start.
it.each(['0', '-1', '1.5', 'NaN', 'Infinity', '', '9007199254740991'])('--ready-within refuses %j before starting anything', async (value) => {
  const out = await run(['start', name, '--from', source, '--ready-within', value])
  expect(out.status, out.stderr).toBe(1)
  expect(out.stderr).toContain('`--ready-within` needs a positive whole number of seconds')
  expect(groups()).toEqual([])
  expect(existsSync(place)).toBe(false)
  expect(rows.written).toBe(0)
}, 40_000)

// Mutation: change the default wait from 90 seconds to 30 seconds.
it('the wait option requires one value on start and keeps the default at 90 seconds', async () => {
  const { readArguments } = await import('../tools/isolated-mole-office.mjs')
  expect(readArguments(['start', name]).readyMs).toBe(90_000)
  expect(readArguments(['start', name, '--ready-within', '1']).readyMs).toBe(1000)
  expect(readArguments(['start', name, '--ready-within']).bad).toContain('needs a positive whole number')
  expect(readArguments(['start', name, '--ready-within', '1', '--ready-within', '2']).bad).toContain('given twice')
  expect(readArguments(['stop', name, '--ready-within', '1']).bad).toContain('belongs to `start`')
  expect(groups()).toEqual([])
})
