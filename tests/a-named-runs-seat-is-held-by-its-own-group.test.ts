// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A NAMED RUN'S SEAT IS HELD BY A PROCESS GROUP OF ITS OWN, AND GIVEN BACK WHEN THAT RUN ENDS, HOWEVER IT ENDS.
 *
 * The office holds a test-batches seat for a process group, and gives it back when that group has ended
 * (src/server/lib/slots.ts). tools/run-named-tests.mjs, started by a shell or an agent, ran in its caller's group. So
 * a kill of the tool left the seat held for as long as the caller lived, and the tests it had started ran on. Inside
 * a sandbox the tool named the row it inherited in SANDBOX_PROCESS_ROW, which is the agent's own group. And a second
 * batch started in a group that already had a row ran on the first batch's seat.
 *
 * HOW IT IS PROVED. A long-lived parent, a Node process this test starts as the leader of a group of its own, starts
 * the tool in that group with no group of its own, as a shell does. The tool runs a stand-in vitest, which writes its
 * pid, its parent's pid and its group, then waits or ends. Cases A to C and F are joined to the office's real seat doors
 * in a database of the test's own, with the real process table and made-up load and free space, as the last case of
 * tests/the-test-tool-takes-a-test-batch-seat.test.ts is. Cases D and E answer from a stand-in office.
 *   A. kill -9 of the pid the parent started: the seat is given back within fifteen seconds, and no process of the
 *      batch is left.
 *   B. SIGTERM, SIGINT or SIGHUP to that pid: the seat is given back, the tool ends by that signal, and no process of
 *      the batch is left.
 *   C. The group that holds the seat, and the process the ledger row names, are the batch's own, not the parent's.
 *   D. Inside a sandbox whose SANDBOX_PROCESS_ROW names another row, the ask names the row the tool wrote for its own
 *      process.
 *   E. A first ask answered `again` refuses the start: no vitest, a non-zero exit, and the refusal said once.
 *   F. SIGHUP to the process that runs the stand-in vitest, and to nothing else: the seat is given back under the
 *      signal's name, and the batch fails. A signal sent to the batch's group reaches vitest and the tool at once, and
 *      the tool may read vitest's end before its own handler for the signal runs. B's note is right in either order only
 *      when the end of vitest names the signal too. Here only that order can happen.
 *
 * Every key, row and address here is made up. The test stops only the parents it started and the groups their batches
 * ran in, by the ids it recorded.
 */
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import type { FastifyInstance } from 'fastify'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { freshDb } from './helpers.ts'
import { theProcessReader } from '../src/config/process-reader.mjs'
import * as theSeat from '../tools/test-batch-seat.mjs'

type OsProbe = (typeof import('../src/server/lib/resources.ts'))['LINUX_PROBE']

const REPO = join(import.meta.dirname, '..')
const TOOL = join(REPO, 'tools', 'run-named-tests.mjs')
const OFFICE_VARIABLES = ['MOLE_OFFICE_API', 'MOLE_OFFICE_API_ROOT', 'MOLE_OFFICE_WORKSPACE', 'MOLE_OFFICE_SESSION', 'MOLE_OFFICE_AGENT']
const LEFT_OUT = [...OFFICE_VARIABLES, 'MOLE_AGENT_KEY', 'MOLE_AGENT_KEY_FILE', 'MOLE_OFFICE_TOOL_CONFIGURATION', 'SANDBOX_DIR', 'SANDBOX_PROCESS_ROW', 'SANDBOX_FACTS']
const THE_KEY = 'mok_a-made-up-key-for-a-batch-in-a-group-of-its-own'
const THE_RUN = 'the-calling-run'
/** The row a sandbox's launcher wrote for the agent's own process, which the tool's process inherits. */
const THE_AGENTS_ROW = 'row-of-the-agents-own-group'
const THE_ROW = 'row-of-the-batch'
const THE_SEAT = 'seat-this-group-already-has'
const ASK = 'POST /api/slots/acquire'
const VITEST = 'GET /the-stand-in-vitest-starts'
const REGISTER = 'POST /api/resources'
const USE = 'POST /api/toolset/uses'
/** How long a stopped batch may take to give its seat back and end every process of its own. */
const A_STOPPED_BATCH_ENDS_WITHIN_MS = 15_000

interface Heard {
  url: string
  body: Record<string, unknown> | null
}

/** What the stand-in vitest wrote about itself. */
interface TheStandIn {
  pid: number
  ppid: number
  pgid: number
}

const granted = { status: 200, body: { slot: { id: THE_SEAT, state: 'granted', seat: 1, position: null }, asked: 'new', handedOn: [], says: 'Granted: seat 1 of 3 in test-batches, as the stand-in office says.' } }

let root = ''
let office: Server
let api = ''
let heard: Heard[] = []
/** What the stand-in office answers the seat's ask with, when no case has joined it to the real doors. */
let asks: () => { status: number; body: unknown }
/** The office's real app, when a case hands it the seat's doors, and what it answered there. */
let joined: FastifyInstance | null = null
let joinedAnswers: { url: string; status: number; body: Record<string, unknown> }[] = []
/** The groups this test started: each parent's, as it was started. */
let parents: number[] = []
/** The headers handed on to the app. The key is not one of them: the test app takes an agent's name unchecked. */
const HANDED_ON = ['content-type', 'x-mole-office-workspace', 'x-mole-office-actor-type', 'x-mole-office-actor-id', 'x-mole-office-session', 'x-mole-office-purpose']

beforeEach(async () => {
  root = mkdtempSync(join(tmpdir(), 'a-seat-of-its-own-'))
  mkdirSync(join(root, 'tests'))
  writeFileSync(join(root, 'tests', 'one.test.ts'), "test('x', () => {})\n")
  heard = []
  joined = null
  joinedAnswers = []
  parents = []
  asks = () => granted
  office = createServer((req, res) => {
    let text = ''
    req.on('data', (chunk) => (text += String(chunk)))
    req.on('end', () => {
      // An office registering a process may ask this port what it is, from outside the test. The tool never does.
      if (req.method === 'GET' && req.url === '/api/runtime') {
        res.statusCode = 404
        res.end()
        return
      }
      let body: Record<string, unknown> | null = null
      try {
        body = JSON.parse(text) as Record<string, unknown> | null
      } catch {
        // Heard with body null.
      }
      const url = `${req.method ?? ''} ${req.url ?? ''}`
      heard.push({ url, body })
      if (joined !== null && (req.url ?? '').startsWith('/api/slots/')) {
        const headers: Record<string, string> = {}
        for (const name of HANDED_ON) {
          const value = req.headers[name]
          if (typeof value === 'string') headers[name] = value
        }
        void joined.inject({ method: req.method as 'POST', url: req.url ?? '/', headers, payload: text }).then((reply) => {
          joinedAnswers.push({ url, status: reply.statusCode, body: reply.json() as Record<string, unknown> })
          res.setHeader('content-type', 'application/json')
          res.statusCode = reply.statusCode
          res.end(reply.body)
        })
        return
      }
      const answered = url === ASK
        ? asks()
        : url === REGISTER ? { status: 201, body: { resource: { id: THE_ROW, type: 'process' } } }
        : url === USE ? { status: 201, body: { run: THE_RUN } }
        : { status: 200, body: { resource: { id: THE_ROW }, released: true } }
      res.setHeader('content-type', 'application/json')
      res.statusCode = answered.status
      res.end(JSON.stringify(answered.body))
    })
  })
  await new Promise<void>((ready) => office.listen(0, '127.0.0.1', ready))
  api = `http://127.0.0.1:${String((office.address() as AddressInfo).port)}`
})

afterEach(async () => {
  // EACH PARENT LEADS A GROUP THIS TEST STARTED, and the batch it started ran in that group or in one of its own, which
  // the stand-in vitest wrote down. Both are stopped by those ids, whatever the case left running.
  const groups = new Set(parents)
  const standIn = theStandIn()
  if (standIn !== null) groups.add(standIn.pgid)
  for (const group of groups) {
    try {
      process.kill(-group, 'SIGKILL')
    } catch {
      // The group has ended already.
    }
  }
  await new Promise<void>((closed) => office.close(() => closed()))
  rmSync(root, { recursive: true, force: true })
})

/**
 * A stand-in vitest. It tells the stand-in office it has started, writes its pid, its parent's pid and its group, then
 * either waits to be stopped or writes a passing report for every file it was given and exits 0.
 */
function standIn({ waits }: { waits: boolean }): string {
  const file = join(root, 'stand-in-vitest.mjs')
  writeFileSync(
    file,
    `import { writeFileSync } from 'node:fs'
import { theProcessReader } from ${JSON.stringify(pathToFileURL(join(REPO, 'src', 'config', 'process-reader.mjs')).href)}
const out = process.argv.find((word) => word.startsWith('--outputFile.json='))
const named = process.argv.filter((word) => word.endsWith('.test.ts'))
await fetch(${JSON.stringify(`${api}/the-stand-in-vitest-starts`)}).catch(() => {})
const me = theProcessReader().processAt(process.pid)
writeFileSync(${JSON.stringify(join(root, 'vitest-started.json'))}, JSON.stringify({ pid: process.pid, ppid: me.ppid, pgid: me.pgid }))
if (${String(waits)}) {
  setInterval(() => {}, 1000)
} else {
  writeFileSync(out.slice('--outputFile.json='.length), JSON.stringify({ testResults: named.map((name) => ({ name, status: 'passed' })) }))
  process.exit(0)
}
`,
  )
  return file
}

/** What the stand-in vitest wrote about itself, or null when it has not started. */
function theStandIn(): TheStandIn | null {
  const file = join(root, 'vitest-started.json')
  return existsSync(file) ? (JSON.parse(readFileSync(file, 'utf8')) as TheStandIn) : null
}

/**
 * THE LONG-LIVED PARENT. A Node process started as the leader of a group of its own. It starts the tool in that group,
 * as a shell or an agent does, writes the tool's pid and how the tool ended, and runs on until the test stops its group.
 * What the tool says goes to a file, so a batch that outlives the tool still has somewhere to write.
 */
function aParentStarting(words: string[], change: { session?: string; inASandbox?: boolean } = {}): void {
  const file = join(root, 'the-parent.mjs')
  writeFileSync(
    file,
    `import { spawn } from 'node:child_process'
import { openSync, writeFileSync } from 'node:fs'
const [tool, folder, ...words] = process.argv.slice(2)
const said = openSync(folder + '/the-tool-said.txt', 'a')
const child = spawn(process.execPath, [tool, ...words], { cwd: folder, stdio: ['ignore', said, said] })
writeFileSync(folder + '/the-tool-pid', String(child.pid))
child.on('exit', (code, signal) => writeFileSync(folder + '/the-tool-ended.json', JSON.stringify({ code, signal })))
setInterval(() => {}, 60_000)
`,
  )
  const env: NodeJS.ProcessEnv = { ...process.env }
  for (const name of LEFT_OUT) delete env[name]
  Object.assign(env, {
    MOLE_OFFICE_API: api,
    MOLE_OFFICE_SESSION: change.session ?? THE_RUN,
    MOLE_OFFICE_WORKSPACE: 'default',
    MOLE_OFFICE_AGENT: 'a-seat-of-its-own-tester',
    MOLE_AGENT_KEY: THE_KEY,
    ...(change.inASandbox === true ? { SANDBOX_DIR: root, SANDBOX_PROCESS_ROW: THE_AGENTS_ROW } : {}),
  })
  const parent = spawn(process.execPath, [file, TOOL, root, ...words], { cwd: root, env, detached: true, stdio: 'ignore' })
  if (parent.pid !== undefined) parents.push(parent.pid)
}

/** Waits, for at most `ms`, until `ready` answers true, and answers what it answered last. */
async function until(ready: () => boolean | Promise<boolean>, ms: number): Promise<boolean> {
  const by = Date.now() + ms
  for (;;) {
    if (await ready()) return true
    if (Date.now() > by) return false
    await new Promise((wait) => setTimeout(wait, 100))
  }
}

/** The pid the parent started, once the parent has written it. */
async function theTool(): Promise<number> {
  expect(await until(() => existsSync(join(root, 'the-tool-pid')), 10_000), 'the parent must have started the tool').toBe(true)
  return Number(readFileSync(join(root, 'the-tool-pid'), 'utf8'))
}

/** What the stand-in vitest wrote, once it has started. */
async function theStartedStandIn(): Promise<TheStandIn> {
  expect(await until(() => theStandIn() !== null, 20_000), `the stand-in vitest must have started:\n${said()}`).toBe(true)
  return theStandIn()!
}

/** How the tool ended, once the parent has written it. */
async function theToolEnded(): Promise<{ code: number | null; signal: NodeJS.Signals | null }> {
  const file = join(root, 'the-tool-ended.json')
  expect(await until(() => existsSync(file), 20_000), `the tool must have ended:\n${said()}`).toBe(true)
  return JSON.parse(readFileSync(file, 'utf8')) as { code: number | null; signal: NodeJS.Signals | null }
}

/** Everything the tool said, on both streams. */
function said(): string {
  const file = join(root, 'the-tool-said.txt')
  return existsSync(file) ? readFileSync(file, 'utf8') : ''
}

/** Whether a process runs. One that has ended and waits to be reaped does not. */
function runs(pid: number): boolean {
  const read = theProcessReader().processAt(pid)
  if (!read.here) return false
  return read.unreadable !== undefined || !read.state.startsWith('Z')
}

/**
 * Whether any process of the batch still runs: the stand-in vitest, the process that started it, and the leader of its
 * group, unless that leader is the parent, which is the test's and runs on.
 */
function anyOfTheBatchRuns(standIn: TheStandIn, parent: number): boolean {
  return [standIn.pid, standIn.ppid, ...(standIn.pgid === parent ? [] : [standIn.pgid])].some(runs)
}

function times(out: string, words: string): number {
  return out.split(words).length - 1
}

/**
 * THE OFFICE'S REAL SEAT DOORS, in a database of the case's own, joined to the stand-in office for the case. The
 * process table is the real one, so the door reads each holder's group as it reads any holder's. The load and the free
 * space are made up and quiet, so no limit holds the seat back whatever this machine is doing.
 */
async function withTheRealDoors(test: (run: string, app: FastifyInstance) => Promise<void>): Promise<void> {
  const t = await freshDb()
  const res = await import('../src/server/lib/resources.ts')
  const Fastify = (await import('fastify')).default
  const { installErrorHandling } = await import('../src/server/lib/http.ts')
  const { resourceRoutes } = await import('../src/server/api/resources.ts')
  const { slotRoutes } = await import('../src/server/api/slots.ts')
  const app = Fastify({ logger: false })
  installErrorHandling(app)
  await app.register(resourceRoutes, { prefix: '/api' })
  await app.register(slotRoutes, { prefix: '/api' })
  await app.ready()
  const quiet = Object.assign(Object.create(res.LINUX_PROBE) as OsProbe, {
    machineNow: () => ({ loadOneMinute: 1, freeBytes: null }),
    rootFreeBytes: () => 500_000_000_000,
  })
  res.useOsProbe(quiet)
  try {
    const run = t.api.createRecord({
      workspaceId: 'default',
      kind: 'session',
      title: 'A made-up run whose test tool runs in a group of its own',
      data: { state: 'running', runtime: 'claude-code' },
      actor: t.api.HUMAN,
    }).id
    joined = app
    await test(run, app)
  } finally {
    joined = null
    res.useOsProbe(res.LINUX_PROBE)
    await app.close()
    t.close()
  }
}

/** The rows the real doors hold in the test-batches pool. */
async function theSeatsHeld(app: FastifyInstance): Promise<unknown[]> {
  const pools = (await app.inject({ method: 'GET', url: '/api/slots' })).json() as { pools: { name: string; held: unknown[] }[] }
  return pools.pools.find((pool) => pool.name === theSeat.TEST_BATCH_POOL)?.held ?? []
}

/** The give-backs the real release door answered. */
function theGiveBacks(): { url: string; status: number; body: Record<string, unknown> }[] {
  return joinedAnswers.filter((one) => /^POST \/api\/slots\/[^/]+\/release$/.test(one.url))
}

describe('a named run stopped from outside gives its seat back and leaves nothing running', () => {
  // Mutation: start the batch in the caller's group (the seat stays held by the parent's group, and the stand-in
  // vitest runs on); drop the watch on the process that started the batch (its own group runs on, holding the seat).
  it('A: gives the seat back and ends every process of the batch when the pid its parent started is killed with SIGKILL', async () => {
    await withTheRealDoors(async (run, app) => {
      aParentStarting(['--root', root, '--vitest', standIn({ waits: true }), 'one'], { session: run })
      const tool = await theTool()
      const batch = await theStartedStandIn()
      expect(await theSeatsHeld(app), said()).toHaveLength(1)
      process.kill(tool, 'SIGKILL')
      const givenBack = await until(async () => (await theSeatsHeld(app)).length === 0, A_STOPPED_BATCH_ENDS_WITHIN_MS)
      expect(givenBack, `the seat must be given back within ${String(A_STOPPED_BATCH_ENDS_WITHIN_MS)} ms:\n${said()}`).toBe(true)
      expect(theGiveBacks().map((one) => one.status), said()).toEqual([200])
      expect(await until(() => !anyOfTheBatchRuns(batch, parents[0]!), A_STOPPED_BATCH_ENDS_WITHIN_MS), said()).toBe(true)
    })
  })

  // Mutation: start the batch in the caller's group (the signal ends the tool, and the stand-in vitest it started runs
  // on; SIGHUP gives nothing back); keep the signal from the batch's group; swallow it so the tool ends some other way.
  it.each(['SIGTERM', 'SIGINT', 'SIGHUP'] as const)('B: gives the seat back, ends by %s and ends every process of the batch when the pid its parent started is sent it', async (signal) => {
    await withTheRealDoors(async (run, app) => {
      aParentStarting(['--root', root, '--vitest', standIn({ waits: true }), 'one'], { session: run })
      const tool = await theTool()
      const batch = await theStartedStandIn()
      process.kill(tool, signal)
      expect(await until(async () => (await theSeatsHeld(app)).length === 0, A_STOPPED_BATCH_ENDS_WITHIN_MS), said()).toBe(true)
      const back = theGiveBacks()
      expect(back.map((one) => one.status), said()).toEqual([200])
      expect(String(back[0]!.body['note']).startsWith(theSeat.stoppedBy(signal)), String(back[0]!.body['note'])).toBe(true)
      expect(await theToolEnded(), said()).toEqual({ code: null, signal })
      expect(await until(() => !anyOfTheBatchRuns(batch, parents[0]!), A_STOPPED_BATCH_ENDS_WITHIN_MS), said()).toBe(true)
    })
  })

  // Mutation: give the seat back as a batch that ended when vitest was ended by a signal; leave the process vitest
  // ran in running.
  it("F: gives the seat back under the signal's name, and fails the batch, when only the process that runs vitest is sent SIGHUP", async () => {
    await withTheRealDoors(async (run, app) => {
      aParentStarting(['--root', root, '--vitest', standIn({ waits: true }), 'one'], { session: run })
      const batch = await theStartedStandIn()
      process.kill(batch.ppid, 'SIGHUP')
      expect(await theToolEnded(), said()).toEqual({ code: 1, signal: null })
      expect(await theSeatsHeld(app), said()).toHaveLength(0)
      const back = theGiveBacks()
      expect(back.map((one) => one.status), said()).toEqual([200])
      expect(String(back[0]!.body['note']).startsWith(theSeat.stoppedBy('SIGHUP')), String(back[0]!.body['note'])).toBe(true)
      expect(await until(() => !anyOfTheBatchRuns(batch, parents[0]!), A_STOPPED_BATCH_ENDS_WITHIN_MS), said()).toBe(true)
    })
  })
})

describe("a named run's seat and row belong to its own group", () => {
  // Mutation: start the batch in the caller's group; name the caller's pid in the ask or in the row.
  it("C: the real acquire door grants the seat to the batch's own group, not the parent's, and the row names that group's leader", async () => {
    await withTheRealDoors(async (run, app) => {
      aParentStarting(['--root', root, '--vitest', standIn({ waits: false }), 'one'], { session: run })
      const ended = await theToolEnded()
      expect(ended, said()).toEqual({ code: 0, signal: null })
      const batch = theStandIn()!
      const parent = parents[0]!
      const acquired = joinedAnswers.find((one) => one.url === ASK)
      expect(acquired?.status, said()).toBe(200)
      const id = (acquired!.body['slot'] as { id: string }).id
      // The seat was given back when the tool ended, so the row is read from the ledger's history, by its group.
      const ledger = (await app.inject({ method: 'GET', url: `/api/resources?includeReleased=true&pgid=${String(batch.pgid)}` })).json() as {
        resources: { id: string; pgid: number | null }[]
      }
      const row = ledger.resources.find((one) => one.id === id)
      expect(row, said()).toBeDefined()
      expect(row!.pgid, `the seat must not be held by the parent's group ${String(parent)}`).not.toBe(parent)
      expect(row!.pgid).toBe(batch.pgid)
      // The ledger row names the leader of the batch's own group.
      expect(heard.find((one) => one.url === REGISTER)?.body?.['key'], said()).toBe(String(batch.pgid))
      expect(theGiveBacks().map((one) => one.status), said()).toEqual([200])
    })
  })

  // Mutation: name the inherited SANDBOX_PROCESS_ROW in the ask; name a row for another process than the batch's own.
  it("D: inside a sandbox the ask names the row written for the batch's own process, never the row it inherited", async () => {
    aParentStarting(['--root', root, '--vitest', standIn({ waits: false }), 'one'], { inASandbox: true })
    const ended = await theToolEnded()
    const ask = heard.find((one) => one.url === ASK)
    expect(ask?.body?.['resource'], said()).toBe(THE_ROW)
    expect(ask?.body).not.toHaveProperty('pid')
    expect(heard.some((one) => JSON.stringify(one.body ?? {}).includes(THE_AGENTS_ROW)), said()).toBe(false)
    const batch = theStandIn()!
    expect(batch.pgid, said()).not.toBe(parents[0])
    expect(heard.find((one) => one.url === REGISTER)?.body?.['key'], said()).toBe(String(batch.pgid))
    expect(ended, said()).toEqual({ code: 0, signal: null })
  })
})

describe('a second batch in one process group', () => {
  // Mutation: put the borrowed path back, so the second batch runs on the first one's seat; or give that seat back.
  it("E: refuses to start when the group already has a row: no vitest, a non-zero exit, and the refusal said once", async () => {
    asks = () => ({ ...granted, body: { ...granted.body, asked: 'again' } })
    aParentStarting(['--root', root, '--vitest', standIn({ waits: false }), 'one'])
    const ended = await theToolEnded()
    expect(ended.signal, said()).toBe(null)
    expect(ended.code, said()).not.toBe(0)
    expect(heard.map((one) => one.url), said()).not.toContain(VITEST)
    expect(theStandIn()).toBe(null)
    // The row is the other batch's, so this one gives nothing back.
    expect(heard.map((one) => one.url), said()).not.toContain(`POST /api/slots/${THE_SEAT}/release`)
    // READ BY NAME, so this file still loads, and its other cases still run, where the refusal is not worded.
    const refused = (theSeat as unknown as Record<string, unknown>)['aSecondBatchIsRefused']
    expect(typeof refused, 'tools/test-batch-seat.mjs words the refusal').toBe('function')
    expect(times(said(), (refused as (id: string, state: string) => string)(THE_SEAT, 'granted')), said()).toBe(1)
  })
})
