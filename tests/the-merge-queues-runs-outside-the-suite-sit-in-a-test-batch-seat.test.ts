// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE MERGE QUEUE'S TEST RUNS OUTSIDE THE WHOLE SUITE SIT IN A TEST-BATCHES SEAT (wave 13u round 158, the requirement
 * of 4 Nov 2026 that follows wave 13r round AY).
 *
 * The whole suite holds the office's full-suite seat. Three kinds of the merge tool's test runs held no seat: the files
 * a take-back runs on main, a hand-back repair's files when no full-suite seat is held yet, and a plugin-only entry's
 * own check and privacy gate. Each now runs inside `inATestBatchSeat` (tools/merge-tool/office-keeper.mjs). It asks the
 * office for a seat in the pool test-batches at the door every seat is asked at, held by the merge tool's process
 * group. It says when it waits, and gives the seat back when the run has ended.
 *
 * Every session, process, load and free space here is made up. The office is this checkout's slot doors on a fresh
 * database, behind a small HTTP server of this test's own, and it is handed a probe this test controls. No real
 * process, load or disk is read, and nothing is signalled. One made-up process stands for the merge tool. Its pid is
 * this test's own, with the start time the tool reads for it, because the tool names that pid.
 *
 * The older office of case 2 is a stand-in. Its two answers are written here, in the shape the slot doors gave before
 * the pool test-batches was added (commit ed864cc3f): a refusal of the unknown pool, and the list of the pools it has.
 *
 * The tool's names are read from its module by name, because this file was written before the tool had them. The
 * pool's name is read from tools/test-batch-seat.mjs, where the tools keep it.
 *
 * MUTATION PROOF (logs named in the report of the run that added this file), each alone after a green control:
 *   - inATestBatchSeat runs without asking for a seat: case 1 goes red;
 *   - it runs at the first answer, granted or queued: case 1 goes red;
 *   - it says the wait at the first ask only: case 1 goes red;
 *   - it stops the tool on every refusal: case 2 goes red;
 *   - it runs without a seat on every refusal: case 3 goes red.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { FastifyInstance } from 'fastify'
import { freshDb, type TestDb } from './helpers.ts'
import { TEST_BATCH_POOL } from '../tools/test-batch-seat.mjs'

type ResourcesLib = typeof import('../src/server/lib/resources.ts')
type OsProbe = ResourcesLib['LINUX_PROBE']
type OsProcess = NonNullable<ReturnType<OsProbe['processById']>>

/** What the merge tool gives for a run in a test-batches seat. */
interface TheSeatTool {
  inATestBatchSeat: <T>(detail: string, runs: () => Promise<T>) => Promise<T>
  waitingForATestBatchSeat: (detail: string, id: string) => string
  noTestBatchesPool: (detail: string, pools: string[]) => string
}

interface Slot {
  id: string
  state: 'granted' | 'queued'
  seat: number | null
  position: number | null
  holder: { pgid: number | null }
}

interface Pool {
  name: string
  held: Slot[]
  waiting: Slot[]
  freeSeats: number[]
  machine: { gate: string; state: 'holds' | 'clear' | 'unchecked'; says: string }[]
}

const GB = 1_000_000_000
/** The made-up batches that hold the seats, each leading its own process group. */
const HOLDERS = [47_001, 47_002, 47_003]
/** The pools of the stand-in older office. */
const OLDER_POOLS = ['full-suite', 'browser-tests']

let t: TestDb
let res: ResourcesLib
let app: FastifyInstance
let server: Server
let scratch = ''
let log = ''
let keeperSession = ''
let keeper: Record<string, unknown>
let failure: typeof import('../tools/merge-tool/log-and-state.mjs').MergerFailure
/** The made-up process table. The merge tool's own entry is put in by beforeAll. */
const live = new Map<number, OsProcess>()
/** The made-up machine: quiet, with room to spare, unless a case changes it. */
const machine = { load: 2.5, freeBytes: 400 * GB }
/** While true, the server answers as the stand-in older office. */
let olderOffice = false
/** How many times the merge tool has asked for a seat. */
let asks = 0

/** A probe for the made-up process table and machine. It never signals anything. */
function useTheMachine(): void {
  res.useOsProbe({
    platform: 'fake',
    processById: (pid) => live.get(pid) ?? null,
    processesInGroup: (pgid) => [...live.values()].filter((p) => p.pgid === pgid),
    listeningPorts: () => [],
    gpu: () => ({ available: true, processes: [] }),
    containers: () => ({ available: true, containers: [] }),
    locks: () => ({ files: [], unreadable: [] }),
    ownProcessGroup: () => 999_999,
    killProcessGroup: () => {
      throw new Error('a slot never signals anything, and this test signals nothing')
    },
    stopContainer: () => {
      throw new Error('this test stops nothing')
    },
    machineNow: () => ({ loadOneMinute: machine.load, freeBytes: null }),
    rootFreeBytes: () => machine.freeBytes,
  })
}

/** The stand-in older office's answer to one request. */
function theOlderOffice(method: string | undefined, url: string | undefined, pool: string): [number, unknown] {
  if (method === 'POST' && url === '/api/slots/acquire') return [400, { error: `There is no slot pool called "${pool}". The pools are ${OLDER_POOLS.join(' and ')}.` }]
  if (method === 'GET' && url === '/api/slots') return [200, { checkedAt: '2026-11-04T10:00:00.000Z', platform: 'fake', pools: OLDER_POOLS.map((name) => ({ name })) }]
  return [404, { error: 'The stand-in older office answers two doors only.' }]
}

async function answer(request: IncomingMessage, reply: ServerResponse): Promise<void> {
  const chunks: Buffer[] = []
  for await (const chunk of request) chunks.push(chunk as Buffer)
  const body = Buffer.concat(chunks).toString('utf8')
  if (request.method === 'POST' && request.url === '/api/slots/acquire' && request.headers['x-mole-office-session'] === keeperSession) asks += 1
  if (olderOffice) {
    const [status, said] = theOlderOffice(request.method, request.url, TEST_BATCH_POOL)
    reply.writeHead(status, { 'content-type': 'application/json' })
    reply.end(JSON.stringify(said))
    return
  }
  // Only the office's own headers go on, so no credential the tool sends reaches the made-up office.
  const headers = Object.fromEntries(Object.entries(request.headers).filter(([name]) => name.startsWith('x-mole-office-') || name === 'content-type'))
  const injected = await app.inject({ method: request.method === 'POST' ? 'POST' : 'GET', url: request.url ?? '/', headers: headers as Record<string, string>, ...(body === '' ? {} : { payload: body }) })
  reply.writeHead(injected.statusCode, { 'content-type': 'application/json' })
  reply.end(injected.body)
}

beforeAll(async () => {
  t = await freshDb()
  res = await import('../src/server/lib/resources.ts')
  const Fastify = (await import('fastify')).default
  const { installErrorHandling } = await import('../src/server/lib/http.ts')
  const { resourceRoutes } = await import('../src/server/api/resources.ts')
  const { slotRoutes } = await import('../src/server/api/slots.ts')
  app = Fastify({ logger: false })
  installErrorHandling(app)
  await app.register(resourceRoutes, { prefix: '/api' })
  await app.register(slotRoutes, { prefix: '/api' })
  await app.ready()

  // THE MERGE TOOL'S PROCESS, made up around this test's own pid and the start time the tool reads for it.
  const { startTimeOf } = await import('../src/config/session-process.mjs')
  const started = startTimeOf(process.pid)
  expect(started, 'the start time of this test process could be read').not.toBeNull()
  live.set(process.pid, { pid: process.pid, pgid: process.pid, ppid: 1, command: 'the merge tool, made up', startedAt: '2026-11-04 10:00:00', startedInstant: started!.toISOString() })
  useTheMachine()

  server = createServer((request, reply) => { void answer(request, reply) })
  await new Promise<void>((ok) => server.listen(0, '127.0.0.1', ok))
  const at = `http://127.0.0.1:${String((server.address() as AddressInfo).port)}`
  scratch = mkdtempSync(join(tmpdir(), 'mole-office-test-batch-seat-'))
  keeperSession = session('A made-up merge tool run')
  const argv = process.argv
  process.argv = [argv[0]!, argv[1]!, '--entry', 'synthetic-entry', '--session', keeperSession, '--workdir', scratch,
    '--api', at, '--workspace', 'default', '--office-for', '6', '--slot-every', '0.2']
  try {
    keeper = (await import('../tools/merge-tool/office-keeper.mjs')) as unknown as Record<string, unknown>
    failure = (await import('../tools/merge-tool/log-and-state.mjs')).MergerFailure
    log = (await import('../tools/merge-tool/arguments.mjs')).LOG
  } finally {
    process.argv = argv
  }
}, 60_000)

afterAll(async () => {
  server?.closeAllConnections()
  if (server !== undefined) await new Promise<void>((ok) => server.close(() => ok()))
  res?.useOsProbe(res.LINUX_PROBE)
  await app?.close()
  t?.close()
  if (scratch !== '') rmSync(scratch, { recursive: true, force: true })
})

/** The tool's names, each read by name; one it does not give is a failure here. */
function theTool(): TheSeatTool {
  const names = ['inATestBatchSeat', 'waitingForATestBatchSeat', 'noTestBatchesPool'] as const
  for (const name of names) expect(Reflect.get(keeper, name), `office-keeper.mjs gives ${name}`).toBeDefined()
  return Object.fromEntries(names.map((name) => [name, Reflect.get(keeper, name)])) as unknown as TheSeatTool
}

/** A made-up running session record, and its id. */
function session(title = 'A made-up batch that holds a test-batches seat'): string {
  return t.api.createRecord({ workspaceId: 'default', kind: 'session', title, data: { state: 'running', runtime: 'claude-code' }, actor: t.api.HUMAN }).id
}

function as(sessionId: string): Record<string, string> {
  return { 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': 'claude-code', 'x-mole-office-session': sessionId }
}

/** A made-up batch, leading its own process group, takes a seat. */
async function aBatchTakesASeat(pid: number, pool: string): Promise<{ session: string; slot: Slot }> {
  live.set(pid, { pid, pgid: pid, ppid: 1, command: 'node tools/run-named-tests.mjs', startedAt: '2026-11-04 10:00:00' })
  const owner = session()
  const reply = await app.inject({ method: 'POST', url: '/api/slots/acquire', headers: as(owner), payload: { pool, pid } })
  expect(reply.statusCode, reply.body).toBe(200)
  return { session: owner, slot: (reply.json() as { slot: Slot }).slot }
}

async function aBatchGivesItBack(owner: string, id: string): Promise<void> {
  const reply = await app.inject({ method: 'POST', url: `/api/slots/${id}/release`, headers: as(owner), payload: {} })
  expect(reply.statusCode, reply.body).toBe(200)
}

/** The pool as GET /api/slots shows it. A read: it hands nothing on. */
async function thePool(name: string): Promise<Pool> {
  const reply = await app.inject({ method: 'GET', url: '/api/slots' })
  expect(reply.statusCode, reply.body).toBe(200)
  const found = (reply.json() as { pools: Pool[] }).pools.find((pool) => pool.name === name)
  expect(found, reply.body).toBeDefined()
  return found!
}

/** The merge tool's row in a list of the pool's rows, if it has one there. */
function theToolsRow(rows: Slot[]): Slot | undefined {
  return rows.find((row) => row.holder.pgid === process.pid)
}

/** The lines of the merge tool's log that contain `words`. */
function linesSaying(words: string): string[] {
  return existsSync(log) ? readFileSync(log, 'utf8').split('\n').filter((line) => line.includes(words)) : []
}

/** Waits until `read` answers something, and answers it. */
async function until<T>(what: string, read: () => Promise<T | undefined> | T | undefined): Promise<T> {
  const stop = Date.now() + 10_000
  for (;;) {
    const value = await read()
    if (value !== undefined) return value
    if (Date.now() > stop) throw new Error(`Waited 10 seconds for ${what}.`)
    await new Promise((wait) => setTimeout(wait, 50))
  }
}

describe('a merge tool run outside the whole suite', () => {
  it('1: waits in line while three made-up batches hold the three seats, says what holds it each time that changes, and runs in a seat', async () => {
    const tool = theTool()
    const pool = TEST_BATCH_POOL
    const holders = []
    for (const pid of HOLDERS) holders.push(await aBatchTakesASeat(pid, pool))
    expect(holders.map((one) => one.slot.state)).toEqual(['granted', 'granted', 'granted'])

    const detail = 'a made-up run of one file'
    let ranInASeat: boolean | null = null
    const running = tool.inATestBatchSeat(detail, async () => {
      ranInASeat = theToolsRow((await thePool(pool)).held) !== undefined
      return 'the made-up run answered'
    })

    // THE SEATS HOLD IT: in line, first, with nothing run, said once though asked again.
    const row = await until('the merge tool in line', async () => theToolsRow((await thePool(pool)).waiting))
    expect(row.position).toBe(1)
    const opening = tool.waitingForATestBatchSeat(detail, row.id)
    await until('the wait said', () => (linesSaying(opening).length > 0 ? true : undefined))
    const asked = asks
    await until('two more asks', () => (asks >= asked + 2 ? true : undefined))
    expect(linesSaying(opening), 'the wait is said once while nothing about it changes').toHaveLength(1)
    expect(ranInASeat, 'nothing ran while the three seats were held').toBeNull()

    // A SEAT IS FREE, BUT THE MACHINE'S LOAD HOLDS IT: said again, with the office's words for the load.
    machine.load = 15.2
    useTheMachine()
    await aBatchGivesItBack(holders[1]!.session, holders[1]!.slot.id)
    const holding = (await thePool(pool)).machine.filter((limit) => limit.state === 'holds')
    expect(holding, 'the made-up load holds the free seat').toHaveLength(1)
    const again = await until('the wait said again', () => linesSaying(opening)[1])
    expect(again).toContain(holding[0]!.says)
    expect(ranInASeat, 'nothing ran while the load held the free seat').toBeNull()

    // THE LOAD FALLS: seated, run in the seat, and the seat given back.
    machine.load = 2.5
    useTheMachine()
    expect(await running).toBe('the made-up run answered')
    expect(ranInASeat, 'the run held a test-batches seat while it ran').toBe(true)
    const after = await thePool(pool)
    expect(theToolsRow([...after.held, ...after.waiting]), 'the seat was given back').toBeUndefined()
    expect(after.held).toHaveLength(2)

    for (const one of [holders[0]!, holders[2]!]) await aBatchGivesItBack(one.session, one.slot.id)
  }, 30_000)

  it('2: on an office with no test-batches pool, runs without a seat and says that the office runs older code', async () => {
    const tool = theTool()
    const detail = 'a made-up run on an older office'
    let ran = 0
    olderOffice = true
    try {
      expect(await tool.inATestBatchSeat(detail, async () => { ran += 1; return 'ran without a seat' })).toBe('ran without a seat')
    } finally {
      olderOffice = false
    }
    expect(ran).toBe(1)
    expect(linesSaying(tool.noTestBatchesPool(detail, OLDER_POOLS))).toHaveLength(1)
  }, 30_000)

  it('3: stops the tool on any other refusal, and runs nothing', async () => {
    const tool = theTool()
    const merger = live.get(process.pid)!
    // The office knows the pool but refuses the tool's process, because the made-up process table no longer has it.
    live.delete(process.pid)
    let ran = 0
    try {
      const ended = await tool.inATestBatchSeat('a made-up run the office refuses', async () => { ran += 1 }).then(() => null, (err: unknown) => err)
      expect(ended).toBeInstanceOf(failure)
      expect(String((ended as Error).message)).toContain(TEST_BATCH_POOL)
    } finally {
      live.set(process.pid, merger)
    }
    expect(ran).toBe(0)
  }, 30_000)
})
