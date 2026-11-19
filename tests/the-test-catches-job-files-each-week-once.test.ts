// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE TEST CATCHES JOB READS THE QUEUE EACH DAY AND FILES EACH WEEK ONCE (wave 13n round C, approved in pkVr6rS5xZe-).
 *
 * tools/run-the-test-catches-job.mjs is one tick, run by a timer outside the repository with --queue, --work and
 * --sandboxes on its command line. The daily counter of src/config/test-catches-job.mjs owns the schedule; its
 * unanswered firings are the work. A tick files the counter when it is missing, answers older firings as not run,
 * and for the newest: runs tools/test-catches-in-the-queue.mjs as a child from the Monday that starts the latest
 * whole week, keeps its output as one dated file in the work folder, and files the latest whole week's report once,
 * linked about the counter and about the named-tests tool's record, with its short forms written, and with the
 * report as the firing's result.
 *
 * WHAT THIS FILE PROVES, with a fresh database, the office's own doors through app.inject, and a stand-in for the
 * queue reader that records its arguments and writes made-up rows where --out says:
 *   1. without each of its five environment variables, productionDoors() refuses with one sentence;
 *   2. the command line needs --queue, --work and --sandboxes, each an absolute path, and nothing else;
 *   3. the first tick files the daily counter, the second files no other, and a paused one stays paused;
 *   4. with no firing waiting, nothing is read;
 *   5. one firing: the reader runs once with exactly its arguments, the dated file is kept, the latest whole week is
 *      filed with the line catch and the queue catch in it, linked about the counter and the named-tests tool, and
 *      the firing's result is the report; the answer and the report name no folder;
 *   5b. the filed report has its short forms, current: a level-1 name, and one part for each block;
 *   5c. with no named-tests tool record the tick stops loudly and files nothing, and files once the tool is there;
 *   6. the next day's firing reads again and files no second report for the same week;
 *   7. after Monday 00:00, the newest of three firings files the new week and the two older are answered as not run;
 *   8. a reader that failed is answered with its status and its error cut to 300 characters, and nothing is filed;
 *      a folder its error names is shown by its flag, never by its path;
 *   9. the job is registered, and its counter is every 24 hours with nobody able to add.
 *
 * NOTHING HERE READS A REAL QUEUE. The queue, work and sandboxes folders are made under the test's own temporary
 * folder, and every row, report, address and key is made up.
 */
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { FastifyInstance } from 'fastify'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { THE_TEST_FIXTURE_ROOT, THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { TEST_CATCHES_COUNTER, TEST_CATCHES_JOB } from '../src/config/test-catches-job.mjs'
import { productionDoors, readTheTickArguments, testCatchesTick } from '../tools/run-the-test-catches-job.mjs'
import { NO_UNCOMMITTED_CHANGE, THE_TEST_FILES_TOOL } from '../src/shared/toolset.ts'

/** A Wednesday. The latest whole week is then 12 to 19 October. */
const START = new Date('2026-10-21T09:00:00')
const PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id,
}
const KEEPER_ID = 'synthetic-test-catches'
const LINES_ID = 'synthetic-line-agent'
const READER = fileURLToPath(new URL('../tools/test-catches-in-the-queue.mjs', import.meta.url))
const THE_REFUSAL = 'The test catches runner needs its own agent, project, session and key environment.'

let db: TestDb
let app: FastifyInstance
let counters: typeof import('../src/server/lib/counters.ts')
let jobs: typeof import('../src/server/lib/office-jobs.ts')
let clock = START.getTime()
let keeper: Record<string, string>
let root: string
let folders: { queue: string; work: string; sandboxes: string }

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(START)
  clock = START.getTime()
  db = await freshDb()
  app = (await apiApp()).app
  counters = await import('../src/server/lib/counters.ts')
  jobs = await import('../src/server/lib/office-jobs.ts')
  const made = await app.inject({ method: 'POST', url: '/api/agents/started', headers: PERSON, payload: { handle: KEEPER_ID, name: 'Synthetic test catches' } })
  expect(made.statusCode, made.body).toBe(201)
  const run = db.api.createRecord({ workspaceId: 'default', kind: 'session', title: 'The synthetic test catches run', data: { state: 'running' }, actor: { type: 'agent', id: KEEPER_ID } }).id
  keeper = { ...PERSON, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': KEEPER_ID, 'x-mole-office-session': run }
  // A JOB FIRES ONLY IN THE DATABASE THAT IS THE OFFICE, so this fresh database is made a synthetic home office.
  const office = await import('../src/server/lib/office.ts')
  const world = await import('../src/server/lib/world.ts')
  office.registerWorldHere({ name: 'Synthetic test catches office', purpose: null, handback: null, kind: 'home', startedBy: { kind: 'person', id: THE_TEST_OFFICES_OWNER.id }, checkout: `${THE_TEST_FIXTURE_ROOT}/test-catches`, head: 'abc1234', databaseIdentity: world.theWorldThisDatabaseIs() ?? '', address: 'http://127.0.0.1:41901', addressForOtherMachines: null, standing: 'canonical', parentWorld: null, installation: 'synthetic-test-catches' })
  expect(office.theOfficeIsInThisDatabase()).toBe(true)
  root = mkdtempSync(join(tmpdir(), 'test-catches-tick-'))
  folders = { queue: join(root, 'made-up-queue'), work: join(root, 'work'), sandboxes: join(root, 'sandboxes') }
  mkdirSync(folders.queue)
  madeUpOldReports()
}, 60_000)

afterEach(async () => {
  vi.useRealTimers()
  await app?.close()
  db?.close()
  rmSync(root, { recursive: true, force: true })
})

/** One checkout whose named test reports went red then green before any line was stored. */
function madeUpOldReports(): void {
  const logs = join(folders.sandboxes, 'alpha', 'worktrees', 'one', '.logs')
  mkdirSync(logs, { recursive: true })
  for (const [name, day, status] of [['named-tests-1.json', '2026-10-01', 'failed'], ['named-tests-2.json', '2026-10-02', 'passed']] as const) {
    const startTime = new Date(`${day}T10:00:00`).getTime()
    writeFileSync(join(logs, name), JSON.stringify({ startTime, testResults: [{ name: '/work/tests/an-old-red.test.ts', status, startTime, endTime: startTime + 1000 }] }))
  }
}

/** Two named test runs of one file on a line, red on one tree then green on another: one catch before the seal. */
async function aLineCatch(red: string, green: string): Promise<void> {
  const headers = { ...PERSON, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': LINES_ID }
  const run = db.api.createRecord({ workspaceId: 'default', kind: 'session', title: 'A synthetic line run', data: { state: 'running' }, actor: { type: 'agent', id: LINES_ID } }).id
  for (const [at, result, commit] of [[red, 'failed', '0'], [green, 'passed', '1']] as const) {
    const res = await app.inject({ method: 'POST', url: '/api/toolset/uses', headers: { ...headers, 'x-mole-office-session': run }, payload: { tool: THE_TEST_FILES_TOOL, said: 'A synthetic named run', files: [{ file: 'tests/a-line-catch.test.ts', result, seconds: 2, testFileHash: '1111111111111111' }], tree: { commit: commit.repeat(40), change: NO_UNCOMMITTED_CHANGE } } })
    expect(res.statusCode, res.body).toBe(201)
    db.client.sqlite.prepare('UPDATE tool_uses SET at = ? WHERE run_id = ? AND seq = ?').run(at, run, (res.json() as { uses: number }).uses)
  }
}

/** Files the named-tests tool's record, which the line rows need and the weekly report is about. Returns its id. */
function theNamedTestsTool(): string {
  const category = db.api.createRecord({ workspaceId: 'default', kind: 'tool_category', title: 'Synthetic tools', data: { says: 'Test fixtures.' }, actor: { type: 'agent', id: LINES_ID } }).id
  return db.api.createRecord({ workspaceId: 'default', kind: 'tool', title: THE_TEST_FILES_TOOL, data: { entry: 'tool', slug: THE_TEST_FILES_TOOL, forWhom: 'developers', category, kept: 'in this repository', state: 'not built yet' }, actor: { type: 'agent', id: LINES_ID } }).id
}

const queueRow = (entry: string, at: string, file: string, more: Record<string, unknown> = {}) => ({
  entry, at, commit: 'c'.repeat(40), file, ranIn: 'suite', seconds: 7, redInRun: false, alone: null, redOnMain: false, cleared: null, caught: false, flaky: false, ...more,
})
const QUEUE_ROWS = [
  queueRow('e1', '2026-10-14 10:00:00', 'tests/a-queue-catch.test.ts', { redInRun: true, caught: true }),
  queueRow('e2', '2026-10-20 10:00:00', 'tests/next-week.test.ts', { redInRun: true, caught: true }),
]

/** A STAND-IN FOR THE QUEUE READER. It records each argument array and writes the reader's output shape to --out. */
function aStandInReader(how: { fails?: { status: number; stderr: string } } = {}) {
  const calls: string[][] = []
  const exec = (args: readonly string[]) => {
    calls.push([...args])
    if (how.fails !== undefined) return { status: how.fails.status, stdout: '', stderr: how.fails.stderr }
    const value = (flag: string) => args[args.indexOf(flag) + 1]!
    writeFileSync(value('--out'), JSON.stringify({ queue: value('--queue'), since: value('--since'), read: { entries: 2, lines: 2, testedSteps: 2, rowsFromSteps: QUEUE_ROWS.length }, skipped: {}, rows: QUEUE_ROWS, files: {} }))
    return { status: 0, stdout: '', stderr: 'Read 2 entries.\n' }
  }
  return { exec, calls }
}

/** The runner's doors: the test office through app.inject, as its own agent, refusing what the office refuses. */
function doorsFor(exec: ReturnType<typeof aStandInReader>['exec']) {
  const ask = async (method: string, path: string, body?: unknown) => {
    const response = await app.inject({ method: method as 'GET' | 'POST', url: path, headers: keeper, ...(body === undefined ? {} : { payload: body as Record<string, unknown> }) })
    if (response.statusCode >= 300) throw new Error(`The test office answered ${method} ${path} with ${String(response.statusCode)}: ${response.body}`)
    return JSON.parse(response.body)
  }
  return { ask, exec }
}

type ACounter = { id: string; title: string; paused: unknown; action: { kind: string; job?: string } }
type ARow = { seq: number; what: string; answer?: { job?: string; ids: string[]; says: string; finished: boolean } }

async function theJobsCounters(): Promise<ACounter[]> {
  const listed = await app.inject({ method: 'GET', url: '/api/counters', headers: PERSON })
  expect(listed.statusCode, listed.body).toBe(200)
  return (JSON.parse(listed.body).counters as ACounter[]).filter((one) => one.action.kind === 'job' && one.action.job === TEST_CATCHES_JOB)
}
async function theAnswerOf(id: string, seq: number) {
  const read = await app.inject({ method: 'GET', url: `/api/counters/${id}?limit=25`, headers: PERSON })
  expect(read.statusCode, read.body).toBe(200)
  const row = (JSON.parse(read.body).rows as ARow[]).find((one) => one.seq === seq)
  expect(row?.what).toBe('firing')
  return row!.answer!
}
/** Moves the clock on a day and a minute at a time and lets the office fire what is due, `n` times. */
async function theDailyFirings(n: number): Promise<{ id: string; seq: number }[]> {
  const [installed] = await theJobsCounters()
  expect(installed, 'the daily counter is filed first').toBeDefined()
  const fired: { id: string; seq: number }[] = []
  for (let i = 0; i < n; i++) {
    clock += 24 * 60 * 60_000 + 60_000
    vi.setSystemTime(new Date(clock))
    expect(counters.fireTheCountersThatAreDue(new Date(clock)).fired).toEqual([installed!.id])
    const read = await app.inject({ method: 'GET', url: `/api/counters/${installed!.id}?limit=25`, headers: PERSON })
    const newest = (JSON.parse(read.body).rows as ARow[]).find((row) => row.what === 'firing')!
    expect(newest.answer).toMatchObject({ job: TEST_CATCHES_JOB, finished: false })
    fired.push({ id: installed!.id, seq: newest.seq })
  }
  return fired
}
const reports = () => db.client.sqlite.prepare("SELECT id, data FROM records WHERE kind = 'report' AND deleted_at IS NULL ORDER BY created_at").all() as { id: string; data: string }[]
const aboutOf = (id: string) => (db.client.sqlite.prepare("SELECT to_id AS toId FROM links WHERE from_id = ? AND type = 'about'").all(id) as { toId: string }[]).map((one) => one.toId).sort()
const readTheReport = async (id: string) => {
  const res = await app.inject({ method: 'GET', url: `/api/records/${id}`, headers: PERSON })
  expect(res.statusCode, res.body).toBe(200)
  const body = JSON.parse(res.body) as { record?: { kind: string; data: { date: string; blocks: { id: string; type: string; rows?: { cells: unknown[] }[] }[] } }; kind?: string; data?: unknown }
  return (body.record ?? body) as { kind: string; title: string; summary: string; data: { date: string; blocks: { id: string; type: string; rows?: { cells: unknown[] }[] }[] } }
}

describe('the runner names its own agent', () => {
  const FIVE = ['MOLE_OFFICE_API', 'MOLE_OFFICE_WORKSPACE', 'MOLE_OFFICE_AGENT', 'MOLE_OFFICE_SESSION', 'MOLE_AGENT_KEY'] as const
  // MADE UP. Nothing listens at this address, and the key is no key.
  const MADE_UP = { MOLE_OFFICE_API: 'http://127.0.0.1:9', MOLE_OFFICE_WORKSPACE: 'default', MOLE_OFFICE_AGENT: KEEPER_ID, MOLE_OFFICE_SESSION: 'synthetic-session', MOLE_AGENT_KEY: 'synthetic-not-a-key' }
  function withTheEnvironment(missing: (typeof FIVE)[number] | null, then: () => void) {
    const saved = Object.fromEntries(FIVE.map((name) => [name, process.env[name]]))
    try {
      for (const name of FIVE) process.env[name] = MADE_UP[name]
      if (missing !== null) delete process.env[missing]
      then()
    } finally {
      for (const name of FIVE) {
        if (saved[name] === undefined) delete process.env[name]
        else process.env[name] = saved[name]
      }
    }
  }

  it.each(FIVE)('1. refuses to build its doors without %s, in one sentence that shows no key', (missing) => {
    withTheEnvironment(missing, () => {
      let said = ''
      try {
        productionDoors()
      } catch (why) {
        said = why instanceof Error ? why.message : String(why)
      }
      expect(said).toBe(THE_REFUSAL)
      expect(said).not.toContain(MADE_UP.MOLE_AGENT_KEY)
    })
  })

  it('builds its doors, and asks nothing, when all five are there', () => {
    withTheEnvironment(null, () => {
      const doors = productionDoors()
      expect(typeof doors.ask).toBe('function')
      expect(typeof doors.exec).toBe('function')
    })
  })
})

describe('the command line', () => {
  it('2. needs --queue, --work and --sandboxes, each an absolute path, and nothing else', () => {
    const whole = ['--queue', '/made-up/queue', '--work', '/made-up/work', '--sandboxes', '/made-up/sandboxes']
    expect(readTheTickArguments(whole)).toEqual({ queue: '/made-up/queue', work: '/made-up/work', sandboxes: '/made-up/sandboxes' })
    const refused = (argv: string[], named: string) => {
      let said = ''
      try {
        readTheTickArguments(argv)
      } catch (why) {
        said = why instanceof Error ? why.message : String(why)
      }
      expect(said, argv.join(' ')).toContain(named)
    }
    for (const flag of ['--queue', '--work', '--sandboxes']) {
      const at = whole.indexOf(flag)
      refused([...whole.slice(0, at), ...whole.slice(at + 2)], flag)
      refused(whole.map((one, i) => (i === at + 1 ? 'made-up/relative' : one)), flag)
    }
    refused([...whole, '--since', '2026-10-01'], '--since')
  })
})

describe('the daily counter', () => {
  it('3. is filed by the first tick, not again by the second, and a paused one stays paused and is not replaced', async () => {
    const reader = aStandInReader()
    const doors = doorsFor(reader.exec)
    await testCatchesTick(doors, folders)
    const installed = await theJobsCounters()
    expect(installed).toHaveLength(1)
    expect(installed[0]).toMatchObject({ title: TEST_CATCHES_COUNTER.title, paused: null, mayAdd: { anyone: false, who: [] }, triggers: [{ kind: 'every', hours: 24 }], action: { kind: 'job', job: TEST_CATCHES_JOB } })
    await testCatchesTick(doors, folders)
    expect((await theJobsCounters()).map((one) => one.id)).toEqual([installed[0]!.id])
    const paused = await app.inject({ method: 'POST', url: `/api/counters/${installed[0]!.id}/pause`, headers: PERSON, payload: { because: 'Synthetic pause for the installation case.' } })
    expect(paused.statusCode, paused.body).toBe(200)
    await testCatchesTick(doors, folders)
    const after = await theJobsCounters()
    expect(after.map((one) => one.id)).toEqual([installed[0]!.id])
    expect(after[0]!.paused).not.toBeNull()
    expect(reader.calls).toEqual([])
  })

  it('4. reads nothing, and says so, while no firing waits', async () => {
    const reader = aStandInReader()
    const doors = doorsFor(reader.exec)
    await testCatchesTick(doors, folders)
    const said = await testCatchesTick(doors, folders)
    expect(said).toContain('No test catches firing is waiting')
    expect(reader.calls).toEqual([])
    expect(reports()).toEqual([])
  })
})

describe('a day\'s tick', () => {
  it('5. reads the queue once from the week\'s Monday, keeps the dated file, and files the latest whole week once, linked about the counter and the named-tests tool', async () => {
    const tool = theNamedTestsTool()
    await aLineCatch('2026-10-13 10:00:00', '2026-10-13 11:00:00')
    const reader = aStandInReader()
    const doors = doorsFor(reader.exec)
    await testCatchesTick(doors, folders)
    const [firing] = await theDailyFirings(1)
    const said = await testCatchesTick(doors, folders)

    const daily = join(folders.work, 'queue-2026-10-22.json')
    expect(reader.calls).toEqual([[READER, '--queue', folders.queue, '--since', '2026-10-12', '--out', daily]])
    expect(existsSync(daily)).toBe(true)
    const filed = reports()
    expect(filed).toHaveLength(1)
    const id = filed[0]!.id
    // About the counter that asked for it, and about what it measures: the named-tests tool's runs of the test files.
    expect(aboutOf(id)).toEqual([firing!.id, tool].sort())
    const answer = await theAnswerOf(firing!.id, firing!.seq)
    expect(answer.finished).toBe(true)
    expect(answer.ids).toEqual([id])
    expect(answer.says).toContain('queue-2026-10-22.json')
    const week = JSON.parse(readFileSync(join(folders.work, 'week-2026-10-12.json'), 'utf8')) as { report: string; from: string; to: string }
    expect([week.report, week.from, week.to]).toEqual([id, '2026-10-12', '2026-10-19'])

    const report = await readTheReport(id)
    expect(report.kind).toBe('report')
    expect(report.data.date).toBe('2026-10-12')
    const caught = report.data.blocks.find((b) => b.id === 'caught')!
    expect(caught.rows!.map((r) => r.cells.slice(0, 4))).toEqual([
      ['tests/a-line-catch.test.ts', 'not classified yet', 0, 1],
      ['tests/a-queue-catch.test.ts', 'not classified yet', 1, 0],
    ])
    expect(JSON.stringify(report.data.blocks.find((b) => b.id === 'old-count'))).toContain('2026-10-01')
    for (const shown of [said, answer.says, JSON.stringify(report)]) {
      for (const folder of [root, folders.queue, folders.work, folders.sandboxes]) expect(shown).not.toContain(folder)
    }
  })

  it('5b. writes the report\'s short forms, current, with its level-1 name and one part for each block', async () => {
    theNamedTestsTool()
    const doors = doorsFor(aStandInReader().exec)
    await testCatchesTick(doors, folders)
    await theDailyFirings(1)
    await testCatchesTick(doors, folders)
    const [filed] = reports()
    const read = await app.inject({ method: 'GET', url: `/api/records/${filed!.id}/short-forms`, headers: PERSON })
    expect(read.statusCode, read.body).toBe(200)
    const levels = (JSON.parse(read.body) as { levels: { rung: string; state: string; text: string | null; parts: { written: boolean; count: number | null } | null }[] }).levels
    expect(levels.find((one) => one.rung === 'label')).toMatchObject({ state: 'current', text: 'Test catches, week of 2026-10-12' })
    const byPart = levels.filter((one) => one.parts !== null)
    expect(byPart).toHaveLength(3)
    for (const one of byPart) expect(one, one.rung).toMatchObject({ state: 'current', parts: { written: true, count: 5 } })
  })

  it('5c. stops loudly and files nothing while the named-tests tool has no record, and files once it has one', async () => {
    const doors = doorsFor(aStandInReader().exec)
    await testCatchesTick(doors, folders)
    const [firing] = await theDailyFirings(1)
    await expect(testCatchesTick(doors, folders)).rejects.toThrow(`GET /api/toolset/${THE_TEST_FILES_TOOL} with 404`)
    expect(reports()).toEqual([])
    expect(existsSync(join(folders.work, 'week-2026-10-12.json'))).toBe(false)
    expect((await theAnswerOf(firing!.id, firing!.seq)).finished).toBe(false)
    const tool = theNamedTestsTool()
    await testCatchesTick(doors, folders)
    const filed = reports()
    expect(filed).toHaveLength(1)
    expect(aboutOf(filed[0]!.id)).toEqual([firing!.id, tool].sort())
  })

  it('6. reads again the next day and files no second report for the same week', async () => {
    theNamedTestsTool()
    const reader = aStandInReader()
    const doors = doorsFor(reader.exec)
    await testCatchesTick(doors, folders)
    await theDailyFirings(1)
    await testCatchesTick(doors, folders)
    const [next] = await theDailyFirings(1)
    await testCatchesTick(doors, folders)
    expect(reader.calls.map((args) => args.slice(3))).toEqual([
      ['--since', '2026-10-12', '--out', join(folders.work, 'queue-2026-10-22.json')],
      ['--since', '2026-10-12', '--out', join(folders.work, 'queue-2026-10-23.json')],
    ])
    expect(reports()).toHaveLength(1)
    const answer = await theAnswerOf(next!.id, next!.seq)
    expect(answer.finished).toBe(true)
    expect(answer.ids).toEqual([])
  })

  it('7. after Monday 00:00 the newest of three firings files the new week, and the two older are answered as not run', async () => {
    theNamedTestsTool()
    const reader = aStandInReader()
    const doors = doorsFor(reader.exec)
    await testCatchesTick(doors, folders)
    await theDailyFirings(2)
    await testCatchesTick(doors, folders)
    const [oldest, middle, newest] = await theDailyFirings(3)
    expect(new Date(clock).getDay(), 'the newest firing is on a Monday').toBe(1)
    await testCatchesTick(doors, folders)
    expect(reader.calls).toHaveLength(2)
    expect(reader.calls[1]!.slice(3)).toEqual(['--since', '2026-10-19', '--out', join(folders.work, 'queue-2026-10-26.json')])
    const filed = reports()
    expect(filed.map((one) => (JSON.parse(one.data) as { date: string }).date)).toEqual(['2026-10-12', '2026-10-19'])
    expect((await theAnswerOf(newest!.id, newest!.seq)).ids).toEqual([filed[1]!.id])
    for (const older of [oldest!, middle!]) {
      const answer = await theAnswerOf(older.id, older.seq)
      expect(answer.finished).toBe(true)
      expect(answer.ids).toEqual([])
      expect(answer.says).toMatch(/^Not run/)
      expect(answer.says).toContain(`firing ${String(newest!.seq)} is newer`)
    }
  })

  it('8. answers a reader that failed with its status and its error cut to 300 characters, and files nothing', async () => {
    const stderr = `test-catches-in-the-queue.mjs: a made-up failure before anything was read. ${'x'.repeat(400)}`
    const reader = aStandInReader({ fails: { status: 1, stderr } })
    const doors = doorsFor(reader.exec)
    await testCatchesTick(doors, folders)
    const [firing] = await theDailyFirings(1)
    await testCatchesTick(doors, folders)
    expect(reader.calls).toHaveLength(1)
    const answer = await theAnswerOf(firing!.id, firing!.seq)
    expect(answer.finished).toBe(true)
    expect(answer.ids).toEqual([])
    expect(answer.says).toContain('status 1')
    expect(answer.says).toContain(stderr.slice(0, 300))
    expect(answer.says).not.toContain(stderr.slice(0, 301))
    expect(reports()).toEqual([])
    expect(existsSync(join(folders.work, 'week-2026-10-12.json'))).toBe(false)
  })

  it('8b. names a folder the reader\'s error gives by its flag, never by its path', async () => {
    const reader = aStandInReader({ fails: { status: 1, stderr: `${folders.queue} is not there, so there is no merge queue to read.\n` } })
    const doors = doorsFor(reader.exec)
    await testCatchesTick(doors, folders)
    const [firing] = await theDailyFirings(1)
    const said = await testCatchesTick(doors, folders)
    const answer = await theAnswerOf(firing!.id, firing!.seq)
    expect(answer.says).toContain('--queue is not there, so there is no merge queue to read.')
    for (const shown of [said, answer.says]) expect(shown).not.toContain(root)
  })
})

describe('the registered job', () => {
  it('9. is on the office list, and its counter fires every 24 hours and takes no additions', async () => {
    expect(TEST_CATCHES_JOB).toBe('test-catches.daily')
    expect(Object.isFrozen(TEST_CATCHES_COUNTER)).toBe(true)
    expect(TEST_CATCHES_COUNTER).toMatchObject({ mayAdd: { anyone: false, who: [] }, triggers: [{ kind: 'every', hours: 24 }], action: { kind: 'job', job: TEST_CATCHES_JOB } })
    expect(jobs.theOfficeJobNamed(TEST_CATCHES_JOB)).not.toBeNull()
    const filed = await app.inject({ method: 'POST', url: '/api/counters', headers: keeper, payload: { title: 'Synthetic counter naming the test catches job', counts: 'Synthetic requests for a reading.', triggers: [{ kind: 'count', n: 1 }], action: { kind: 'job', job: TEST_CATCHES_JOB } } })
    expect(filed.statusCode, filed.body).toBe(201)
  })
})
