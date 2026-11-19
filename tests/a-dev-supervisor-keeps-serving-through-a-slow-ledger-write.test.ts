// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * The dev supervisor keeps its server running when a write into the ledger has no certain answer.
 * It reads the ledger for its own row before it writes the row again, so the row is written once,
 * and a 409 for its own row counts as written. It tries each call again after a wait that starts at
 * a second and doubles to thirty. A refusal from the office, or a 409 for a row that is not its own,
 * still ends startup and stops the server. A restart waits for a call of the write that is on its way,
 * but not for a write that is waiting to try again, and a stop ends that wait at once. Only once the
 * row is confirmed does it print the line that says its startup is done.
 *
 * Like a-dev-supervisors-ledger-writes-have-a-deadline.test.ts, this runs unchanged production in a
 * disposable checkout. The child is a stand-in office whose ledger keeps rows the way the real one
 * does: a second write of a live row is answered 409. Each case gives it a plan, the answer for each
 * call in turn. The preload records each fetch, each group stop, and each wait the ledger write
 * sets, and can make the write's first health read fail. Children watch this test worker, so parent
 * death cannot hide a missing stop. Cleanup reads only the recorded sessions and groups, and reaps
 * them even when an assertion fails.
 */
import { execFileSync, spawn } from 'node:child_process'
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { expect, it } from 'vitest'
import { theLogSaysTheStartupIsDone } from '../src/config/supervisor-startup-done.mjs'
import { theTimeLeftIn, type TheTimeLeft } from './how-long-a-test-may-take.ts'
import { A_PROCESS_ENDS_WITH_ITS_OWNER_WITHIN_MS, aLineThatEndsWithItsOwner, commandThatWatchesItsOwnerFromInside } from './the-owner-watching-gate.ts'

const REPO = join(import.meta.dirname, '..')
/** Past the supervisor's five-second deadline for one call, so the answer comes after it has stopped listening. */
const LATE_MS = 7_000
/**
 * Between the restart press and the first answer to the resource POST, either way round. It is well inside the
 * write's first wait of a second, so the old server is stopped before that wait is over.
 */
const THE_RESTART_GAP_MS = 200

/**
 * What the stand-in office answers a call: its plan for that kind of call, in turn, the last one repeated. `malformed` is
 * a 200 without what the call asks for: a session with no record id, a row with no row id, a read with no list of rows.
 */
type Answer = 'ok' | 'late' | 'withheld' | 'conflict' | 'refused' | 'busy' | 'too-many' | 'request-timeout' | 'malformed'
interface Plan {
  session?: readonly Answer[]
  resource?: readonly Answer[]
  read?: readonly Answer[]
  patch?: readonly Answer[]
  /** The preload makes the ledger write's first health read fail, as a connection that broke would. */
  failTheFirstHealthRead?: boolean
  /**
   * The first server asks for a restart during the first resource POST, THE_RESTART_GAP_MS before it answers it, or
   * that long after it has answered it, while the write waits to try again.
   */
  restart?: 'during the call' | 'while the write waits'
}
interface Event {
  what: string
  pid?: number
  group?: number
  signal?: string
  generation?: number
  kind?: string | null
  answer?: string
  status?: number
  method?: string
  path?: string
  ms?: number
  body?: { data?: { detail?: string }; dataPatch?: { state?: string; detail?: string }; key?: string }
}

function eventsIn(root: string): Event[] {
  const file = join(root, 'events.jsonl')
  return existsSync(file) ? readFileSync(file, 'utf8').trim().split('\n').filter(Boolean).map(line => JSON.parse(line) as Event) : []
}

function liveInRecordedGroup(group: number): number[] {
  // Detached fixture leaders start their own sessions. Select only that recorded session, then
  // the recorded process group; never enumerate /proc or ask ps for the whole machine.
  try {
    return execFileSync('ps', ['-s', String(group), '-o', 'pid=,pgid=,stat='], { encoding: 'utf8' }).trim().split('\n').filter(Boolean).flatMap(line => {
      const [pid, pgid, state] = line.trim().split(/\s+/)
      return Number(pgid) === group && !/^[ZX]/.test(state!) ? [Number(pid)] : []
    })
  } catch (error) {
    if ((error as { status?: number }).status === 1) return []
    throw error
  }
}

function signalGroup(group: number): void {
  try { process.kill(-group, 'SIGKILL') } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error
  }
}

async function aFreePort(): Promise<number> {
  const probe = createServer()
  return await new Promise((done, fail) => {
    probe.once('error', fail)
    probe.listen(0, '127.0.0.1', () => {
      const address = probe.address()
      if (address === null || typeof address === 'string') throw new Error('The fixture has no port.')
      probe.close(() => done(address.port))
    })
  })
}

async function until(read: () => boolean, time: TheTimeLeft, what: string): Promise<void> {
  const end = Date.now() + time.forAWait(what)
  while (!read()) {
    if (Date.now() >= end) throw new Error(`Timed out waiting for ${what}.`)
    await delay(20)
  }
}

interface TheSupervisor {
  root: string
  port: number
  leader: number
  output: () => string
  events: () => Event[]
  ended: () => { code: number | null; signal: NodeJS.Signals | null } | undefined
  startupIsDone: () => boolean
}

async function withASupervisor(plan: Plan, time: TheTimeLeft, check: (supervisor: TheSupervisor) => Promise<void>): Promise<void> {
  const root = mkdtempSync(join(tmpdir(), 'dev-slow-ledger-'))
  let leader: number | undefined
  let output = ''
  try {
    for (const part of ['src', 'tools']) cpSync(join(REPO, part), join(root, part), { recursive: true })
    symlinkSync(join(REPO, 'node_modules'), join(root, 'node_modules'))
    writeFileSync(join(root, 'package.json'), '{"type":"module"}')
    writeFileSync(join(root, 'src/worker/index.ts'), '// A fixture worker entry.\n')
    writeFileSync(join(root, 'plan.json'), JSON.stringify(plan))
    const recordEvent = `const event = value => appendFileSync('events.jsonl', JSON.stringify(value) + '\\n');`
    writeFileSync(join(root, 'src/server/index.ts'), `
      import { createServer } from 'node:http'
      import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs'
      ${recordEvent}
      ${aLineThatEndsWithItsOwner()}
      const generation = existsSync('generation') ? Number(readFileSync('generation', 'utf8')) + 1 : 1
      writeFileSync('generation', String(generation))
      event({ what: 'child', pid: process.pid, generation })
      const plan = generation === 1 ? JSON.parse(readFileSync('plan.json', 'utf8')) : {}
      const asked = { session: 0, resource: 0, read: 0, patch: 0 }
      const next = kind => { const list = plan[kind] ?? ['ok']; return list[Math.min(asked[kind]++, list.length - 1)] }
      const rows = []
      let landsAfterTheNextRead = null
      const server = createServer(async (request, response) => {
        let raw = ''
        for await (const chunk of request) raw += chunk
        const body = raw ? JSON.parse(raw) : null
        const url = request.url
        const kind = request.method === 'POST' && url === '/api/records' ? 'session'
          : request.method === 'POST' && url === '/api/resources' ? 'resource'
            : request.method === 'GET' && url.startsWith('/api/resources?') ? 'read'
              : request.method === 'PATCH' && body?.dataPatch?.state !== 'finished' ? 'patch' : null
        const answer = kind === null ? 'ok' : next(kind)
        const send = (status, value) => {
          event({ what: 'request', generation, kind, answer, status, method: request.method, path: url, body })
          response.writeHead(status, { 'content-type': 'application/json', connection: 'close' })
          response.end(JSON.stringify(value))
        }
        if (generation === 1 && plan.restart !== undefined && kind === 'resource' && asked.resource === 1) {
          const press = () => process.send({ officeControl: 'restart' })
          if (plan.restart === 'during the call') { press(); await new Promise(done => setTimeout(done, ${String(THE_RESTART_GAP_MS)})) }
          else setTimeout(press, ${String(THE_RESTART_GAP_MS)})
        }
        if (answer === 'busy') return send(503, { error: 'A made-up busy office.' })
        if (answer === 'too-many') return send(429, { error: 'A made-up limit on calls.' })
        if (answer === 'request-timeout') return send(408, { error: 'A made-up request that took too long.' })
        if (answer === 'refused') return send(403, { error: 'A made-up refusal.' })
        if (answer === 'malformed') return send(200, kind === 'session' ? { record: {} } : kind === 'resource' ? { resource: {} } : {})
        if (kind === 'session') return send(200, { record: { id: 'fixture-session-' + String(asked.session) } })
        if (kind === 'read') {
          const session = new URL(url, 'http://x').searchParams.get('sessionRecordId')
          send(200, { resources: rows.filter(row => row.sessionRecordId === session && row.releasedAt === null) })
          if (landsAfterTheNextRead !== null) {
            rows.push(landsAfterTheNextRead)
            event({ what: 'landed', generation })
            landsAfterTheNextRead = null
          }
          return
        }
        if (kind === 'resource') {
          const session = request.headers['x-mole-office-session']
          const row = { id: 'fixture-resource-' + String(asked.resource), sessionRecordId: session, type: body.type, key: body.key, releasedAt: null }
          const there = rows.find(one => one.sessionRecordId === session && one.type === body.type && one.key === body.key && one.releasedAt === null)
          if (answer === 'conflict' || there !== undefined) {
            send(409, { error: 'This session already has ' + body.type + ' "' + body.key + '" in the ledger, and it has not been released.' })
          } else if (answer === 'withheld') {
            event({ what: 'request', generation, kind, answer, method: request.method, path: url, body })
            landsAfterTheNextRead = row
          } else if (answer === 'late') {
            rows.push(row)
            event({ what: 'request', generation, kind, answer, method: request.method, path: url, body })
            setTimeout(() => { try { response.writeHead(200, { 'content-type': 'application/json' }); response.end(JSON.stringify({ resource: row })) } catch {} }, ${String(LATE_MS)})
          } else {
            rows.push(row)
            send(200, { resource: row })
          }
          return
        }
        send(200, kind === 'patch' ? { record: { id: url.split('/').pop() } } : {})
      })
      server.listen({ fd: Number(process.env.MOLE_OFFICE_LISTEN_FD) }, () => event({ what: 'listening', generation }))
      process.on('SIGTERM', () => {
        event({ what: 'child-stopping', generation })
        server.closeAllConnections()
        server.close(() => process.exit(0))
      })
    `)
    writeFileSync(join(root, 'observe.mjs'), `
      import { appendFileSync, readFileSync } from 'node:fs'
      ${recordEvent}
      const plan = JSON.parse(readFileSync('plan.json', 'utf8'))
      // Called by the write itself, and not from something it awaits: an awaited frame reads "at async".
      const calledFrom = pattern => pattern.test(new Error().stack ?? '')
      let healthReadsFailed = 0
      const reallyFetch = globalThis.fetch
      globalThis.fetch = async (url, options) => {
        const path = new URL(String(url)).pathname
        const method = options?.method ?? 'GET'
        const ours = calledFrom(/\\bat (?:oneLedgerCall|writeThisSupervisorIntoTheLedger) \\(/)
        if (ours) event({ what: 'fetch', path, method })
        if (ours && path === '/api/health' && plan.failTheFirstHealthRead && healthReadsFailed === 0) {
          healthReadsFailed += 1
          event({ what: 'health-read-failed' })
          throw new TypeError('fetch failed')
        }
        try {
          return await reallyFetch(url, options)
        } catch (error) {
          if (ours) event({ what: 'fetch-failed', path, method })
          throw error
        }
      }
      const reallySetTimeout = globalThis.setTimeout
      const reallyClearTimeout = globalThis.clearTimeout
      const pauses = new Set()
      globalThis.setTimeout = (callback, ms, ...rest) => {
        if (!calledFrom(/\\bat pause \\(/)) return reallySetTimeout(callback, ms, ...rest)
        event({ what: 'pause', ms })
        const handle = reallySetTimeout((...given) => {
          pauses.delete(handle)
          event({ what: 'pause-over', ms })
          callback(...given)
        }, ms, ...rest)
        pauses.add(handle)
        return handle
      }
      globalThis.clearTimeout = handle => {
        if (pauses.delete(handle)) event({ what: 'pause-cut-short' })
        return reallyClearTimeout(handle)
      }
      const kill = process.kill.bind(process)
      process.kill = (pid, signal) => {
        if (pid < 0) event({ what: 'group-stop', group: -pid, signal })
        return kill(pid, signal)
      }
    `)
    const port = await aFreePort()
    const watched = commandThatWatchesItsOwnerFromInside(['--import', './observe.mjs', 'tools/serve-dev.mjs'])
    const command = spawn(watched.command, watched.args, {
      cwd: root, detached: true, stdio: ['ignore', 'pipe', 'pipe'],
      env: { PATH: process.env.PATH, HOME: root, MOLE_OFFICE_PORT: String(port), MOLE_OFFICE_DB: join(root, 'fixture.db'),
        MOLE_OFFICE_WORKSPACE: 'default', MOLE_OFFICE_CHECK_FOR_MISSED_CHANGES: '0' },
    })
    const pid = command.pid
    if (pid === undefined) throw new Error('The fixture command did not start.')
    leader = pid
    command.stdout.on('data', (chunk: Buffer) => { output += chunk.toString() })
    command.stderr.on('data', (chunk: Buffer) => { output += chunk.toString() })
    let ended: { code: number | null; signal: NodeJS.Signals | null } | undefined
    command.once('exit', (code, signal) => { ended = { code, signal } })
    await check({
      root, port, leader: pid,
      output: () => output,
      events: () => eventsIn(root),
      ended: () => ended,
      startupIsDone: () => theLogSaysTheStartupIsDone(output, pid, port),
    })
  } finally {
    // The lines the write printed, for the round's report, and for a case that went red.
    console.info(JSON.stringify({ plan, lines: output.split('\n').filter(line => line.startsWith('[dev]')) }))
    const groups = [...new Set([leader, ...eventsIn(root).filter(e => e.what === 'child').map(e => e.pid)].filter((pid): pid is number => pid !== undefined))]
    for (const group of groups) signalGroup(group)
    const end = Date.now() + A_PROCESS_ENDS_WITH_ITS_OWNER_WITHIN_MS
    while (groups.some(group => liveInRecordedGroup(group).length > 0) && Date.now() < end) await delay(20)
    expect(groups.flatMap(liveInRecordedGroup), 'Cleanup must reap its own fixture groups even on red.').toEqual([])
    rmSync(root, { recursive: true, force: true })
  }
}

/** Waits for the line that says startup is done, and checks the server was never stopped on the way. */
async function itKeepsServing(supervisor: TheSupervisor, time: TheTimeLeft): Promise<Event[]> {
  await until(() => supervisor.ended() !== undefined || supervisor.startupIsDone(), time, 'the end of startup')
  const events = supervisor.events()
  expect(supervisor.ended(), supervisor.output()).toBeUndefined()
  expect(events.some(e => e.what === 'child-stopping'), JSON.stringify(events)).toBe(false)
  return events
}

/** Stops the command as a person would, and checks it stopped its server once. */
async function itStopsOnce(supervisor: TheSupervisor, time: TheTimeLeft, code: number): Promise<Event[]> {
  if (supervisor.ended() === undefined && code === 0) process.kill(supervisor.leader, 'SIGTERM')
  await until(() => supervisor.ended() !== undefined, time, 'the end of the command')
  expect(supervisor.ended(), supervisor.output()).toEqual({ code, signal: null })
  const events = supervisor.events()
  const child = events.filter(e => e.what === 'child').at(-1)?.pid
  const stops = events.filter(e => e.what === 'group-stop' && e.group === child && e.signal === 'SIGTERM')
  expect(stops, JSON.stringify(events)).toHaveLength(1)
  return events
}

const requests = (events: Event[], kind: string) => events.filter(e => e.what === 'request' && e.kind === kind)

it('a row written after the limit is read back and counts as written, once, and the server keeps serving', async ({ task }) => {
  const time = theTimeLeftIn(task)
  await withASupervisor({ resource: ['late'] }, time, async (supervisor) => {
    const events = await itKeepsServing(supervisor, time)
    expect(requests(events, 'resource'), JSON.stringify(events)).toHaveLength(1)
    const failed = events.findIndex(e => e.what === 'fetch-failed' && e.path === '/api/resources' && e.method === 'POST')
    const read = events.findIndex(e => e.what === 'request' && e.kind === 'read')
    expect(failed, JSON.stringify(events)).toBeGreaterThan(-1)
    expect(read, JSON.stringify(events)).toBeGreaterThan(failed)
    expect(requests(events, 'patch'), JSON.stringify(events)).toHaveLength(1)
    const after = await itStopsOnce(supervisor, time, 0)
    expect(requests(after, 'resource'), 'No write may be sent again.').toHaveLength(1)
  })
}, 60_000)

it('a 409 for its own row, after a write that landed late, counts as written and the server keeps serving', async ({ task }) => {
  const time = theTimeLeftIn(task)
  await withASupervisor({ resource: ['withheld', 'ok'] }, time, async (supervisor) => {
    const events = await itKeepsServing(supervisor, time)
    const writes = requests(events, 'resource')
    expect(writes.map(e => e.status ?? 'no answer'), JSON.stringify(events)).toEqual(['no answer', 409])
    expect(events.filter(e => e.what === 'landed'), JSON.stringify(events)).toHaveLength(1)
    const reads = requests(events, 'read')
    expect(reads, JSON.stringify(events)).toHaveLength(2)
    expect(events.indexOf(reads[1]!), JSON.stringify(events)).toBeGreaterThan(events.indexOf(writes[1]!))
    expect(requests(events, 'patch'), JSON.stringify(events)).toHaveLength(1)
    await itStopsOnce(supervisor, time, 0)
  })
}, 60_000)

// Each case that ends startup, with how many rows it writes and reads first, and whether it has a session to mark finished.
for (const [refusal, plan, writes, reads, filed] of [
  ['a 409 for a row that is not its own', { resource: ['conflict'] }, 1, 1, true],
  ['a refusal of the row', { resource: ['refused'] }, 1, 0, true],
  ['a row answered with no row id', { resource: ['malformed'] }, 1, 0, true],
  ['a refusal of the session', { session: ['refused'] }, 0, 0, false],
  ['a session answered with no record id', { session: ['malformed'] }, 0, 0, false],
  ['a refused read of the ledger', { resource: ['busy'], read: ['refused'] }, 1, 1, true],
  ['a refusal of the session detail', { patch: ['refused'] }, 1, 0, true],
] as const) {
  it(`${refusal} ends startup and stops the server`, async ({ task }) => {
    const time = theTimeLeftIn(task)
    await withASupervisor({ ...plan }, time, async (supervisor) => {
      const events = await itStopsOnce(supervisor, time, 1)
      expect(supervisor.startupIsDone(), supervisor.output()).toBe(false)
      expect(requests(events, 'resource'), JSON.stringify(events)).toHaveLength(writes)
      expect(requests(events, 'read'), JSON.stringify(events)).toHaveLength(reads)
      const finished = events.findIndex(e => e.what === 'request' && e.body?.dataPatch?.state === 'finished')
      const stop = events.findIndex(e => e.what === 'group-stop' && e.signal === 'SIGTERM')
      expect(stop, JSON.stringify(events)).toBeGreaterThan(-1)
      if (filed) expect(finished, JSON.stringify(events)).toBeGreaterThan(-1)
      expect(stop, JSON.stringify(events)).toBeGreaterThan(finished)
    })
  }, 60_000)
}

it('the health read, the session and its detail are each tried again after no certain answer, with a wait that doubles', async ({ task }) => {
  const time = theTimeLeftIn(task)
  const plan: Plan = { failTheFirstHealthRead: true, session: ['busy', 'ok'], patch: ['too-many', 'request-timeout', 'ok'] }
  await withASupervisor(plan, time, async (supervisor) => {
    const events = await itKeepsServing(supervisor, time)
    expect(events.filter(e => e.what === 'health-read-failed'), JSON.stringify(events)).toHaveLength(1)
    expect(events.filter(e => e.what === 'fetch' && e.path === '/api/health'), JSON.stringify(events)).toHaveLength(2)
    const sessions = requests(events, 'session')
    expect(sessions, JSON.stringify(events)).toHaveLength(2)
    expect(sessions[1]?.body?.data?.detail).toContain(sessions[0]?.body?.data?.detail)
    expect(sessions[1]?.body?.data?.detail).not.toBe(sessions[0]?.body?.data?.detail)
    expect(requests(events, 'resource'), JSON.stringify(events)).toHaveLength(1)
    const patches = requests(events, 'patch')
    expect(patches.map(e => e.status), JSON.stringify(events)).toEqual([429, 408, 200])
    expect(new Set(patches.map(e => JSON.stringify(e.body))).size, 'The detail is the same update each time.').toBe(1)
    expect(events.filter(e => e.what === 'pause').map(e => e.ms)).toEqual([1_000, 2_000, 4_000, 8_000])
    await itStopsOnce(supervisor, time, 0)
  })
}, 60_000)

it('a read of the ledger with no certain answer, or with no list of rows, is read again, and a row it does not hold is written again', async ({ task }) => {
  const time = theTimeLeftIn(task)
  await withASupervisor({ resource: ['busy', 'ok'], read: ['busy', 'malformed', 'ok'] }, time, async (supervisor) => {
    const events = await itKeepsServing(supervisor, time)
    const writes = requests(events, 'resource')
    const reads = requests(events, 'read')
    expect(writes.map(e => e.status), JSON.stringify(events)).toEqual([503, 200])
    expect(reads.map(e => e.answer), JSON.stringify(events)).toEqual(['busy', 'malformed', 'ok'])
    expect(events.indexOf(writes[1]!), JSON.stringify(events)).toBeGreaterThan(events.indexOf(reads[2]!))
    await itStopsOnce(supervisor, time, 0)
  })
}, 60_000)

for (const [restart, title] of [
  ['during the call', 'a restart during a call of the write waits for its answer, and goes ahead once the write waits to try again'],
  ['while the write waits', 'a restart while the write waits to try again goes ahead at once'],
] as const) {
  it(`${title}, and the write finishes through the next server`, async ({ task }) => {
    const time = theTimeLeftIn(task)
    await withASupervisor({ resource: ['busy'], read: ['busy'], restart }, time, async (supervisor) => {
      await until(() => supervisor.ended() !== undefined || supervisor.startupIsDone(), time, 'the end of startup')
      expect(supervisor.ended(), supervisor.output()).toBeUndefined()
      const events = supervisor.events()
      expect(events.filter(e => e.what === 'child').map(e => e.generation), JSON.stringify(events)).toEqual([1, 2])
      // The old server answered the call that was on its way, and was stopped before the write read the ledger through it.
      expect(requests(events, 'resource').filter(e => e.generation === 1).map(e => e.status), JSON.stringify(events)).toEqual([503])
      expect(requests(events, 'read').filter(e => e.generation === 1), JSON.stringify(events)).toEqual([])
      expect(requests(events, 'resource').filter(e => e.status === 200).map(e => e.generation), JSON.stringify(events)).toEqual([2])
      expect(requests(events, 'patch').map(e => e.generation), JSON.stringify(events)).toEqual([2])
      await itStopsOnce(supervisor, time, 0)
    })
  }, 60_000)
}

it('the wait doubles to thirty seconds, and a stop ends it at once and sends nothing more', async ({ task }) => {
  const time = theTimeLeftIn(task)
  await withASupervisor({ session: ['busy'] }, time, async (supervisor) => {
    await until(() => supervisor.events().some(e => e.what === 'pause' && e.ms === 30_000) || supervisor.ended() !== undefined, time, 'the longest wait')
    expect(supervisor.ended(), supervisor.output()).toBeUndefined()
    const events = await itStopsOnce(supervisor, time, 0)
    expect(events.filter(e => e.what === 'pause').map(e => e.ms)).toEqual([1_000, 2_000, 4_000, 8_000, 16_000, 30_000])
    expect(events.filter(e => e.what === 'pause-cut-short'), JSON.stringify(events)).toHaveLength(1)
    expect(events.filter(e => e.what === 'pause-over' && e.ms === 30_000), JSON.stringify(events)).toHaveLength(0)
    expect(requests(events, 'session'), JSON.stringify(events)).toHaveLength(6)
    expect(supervisor.startupIsDone(), supervisor.output()).toBe(false)
  })
}, 90_000)
