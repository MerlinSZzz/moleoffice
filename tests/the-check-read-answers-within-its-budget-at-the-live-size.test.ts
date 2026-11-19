// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * GET /api/checks/:run ANSWERS A RUN OF THE LIVE SIZE WITHIN ITS BUDGET, IN THE TIMING GROUP. Wave 13n round DM, the
 * requirement of 7 November 2026.
 *
 * The check tool asks this door at the start of every check and again before it posts its verdict. The requirement
 * counted 50.7 s in 44 calls on the live office, up to 15.0 s each. The server answers on one thread, so while the door
 * kept the thread nothing else was answered. This file holds two things of the door, each by its median of five asks:
 * how long one ask keeps the server's thread, and how many database statements it runs.
 *
 * THE OFFICE IS MADE UP at the counts of 4 November 2026: THE_LIVE_OFFICE_ON_4_NOVEMBER in
 * tests/the-office-at-the-live-scale.ts, with the guesses named beside it. The run is a round sealed in a made-up
 * repository (tests/a-seal-read-fixture.ts), and its agent is given a history of earlier rounds below. Every name and
 * word is made up.
 *
 * BEFORE THE FIX, on 20 processors at a load of 5 to 6, one ask kept the thread a median 372.5 ms and ran 7,484
 * statements. Almost all of it was the run's agent: every report of the project was read to find the agent's own, one
 * statement for each, and the records it wrote were found by walking the records before the change log. After the fix
 * one ask kept it about 81 ms and ran 49 statements.
 *
 * THE THREAD, NOT THE REPLY, is held, because a kept thread is what the rest of the office waits on. The door also
 * waits about 100 ms for the seal to be read on a thread of its own, and that wait keeps nobody else waiting.
 *
 * WHAT IT COSTS TO RUN. The hook builds the office: about 2 minutes on a quiet machine, and a database of about 1.4 GB
 * in the test's own folder, removed when the file ends. The timing group runs its files one after another, so it takes
 * about 2 minutes longer, and the temporary folder needs 1.4 GB free.
 *
 * IT RUNS ONLY IN THE TIMING GROUP (`node tools/run-named-tests.mjs --list timing`), on a quiet machine, as
 * tests/the-timing-tests.ts says.
 */
import { appendFileSync, mkdirSync } from 'node:fs'
import { monitorEventLoopDelay } from 'node:perf_hooks'
import { join } from 'node:path'

import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { aRepository, aSealedRun, asAgent, THE_INSPECTOR, theOfficesCheckers } from './a-seal-read-fixture.ts'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { buildTheOfficeAtAScale, THE_LIVE_OFFICE_ON_4_NOVEMBER } from './the-office-at-the-live-scale.ts'
import { TIMING_RESULTS_VARIABLE } from './the-timing-tests.ts'

/** The longest one ask may keep the server's thread: before the fix 372.5 ms, after it about 81 ms. */
const HOLDS_WITHIN_MS = 150
/** The most statements one ask may run, as its Server-Timing header counts them: before the fix 7,484, after it 49. */
const RUNS_WITHIN_STATEMENTS = 200
/** More reports than this in the project say the office was built at the live size: the made-up office holds 4,998. */
const AT_THE_LIVE_SIZE = 4_500

/**
 * THE HISTORY OF THE RUN'S AGENT, a long-lived agent of many rounds. One size was measured: a report body of 16,360
 * bytes is a real round report of this line as it was posted on 6 November 2026 (two others that day were 14,284 and
 * 16,973 bytes). Nobody measured the other counts, so each is a guess, and says so.
 */
const THE_AGENTS_HISTORY = {
  /** Measured, as above. */
  reportBytes: 16_360,
  /** A guess: the reports of the agent's earlier rounds. */
  earlierReports: 150,
  /** A guess: the messages the agent sent. */
  messages: 5_000,
  /** A guess: the decisions the agent filed in earlier rounds. */
  earlierDecisions: 40,
  /** A guess: the other records the agent filed. */
  otherRecords: 300,
  /** A guess: the decisions filed in this run. */
  runDecisions: 3,
  /** A guess: the reports filed in this run. */
  runReports: 1,
  /** A guess: the links to this run. */
  runLinks: 40,
  /** A guess: the messages sent in this run. */
  runMessages: 50,
} as const

const OUT = process.env[TIMING_RESULTS_VARIABLE] ?? ''

let t: TestDb
let app: FastifyInstance
let run = ''
let reportsInTheProject = 0
const asks: { holdMs: number; statements: number; ms: number }[] = []
let answer: { reports: { id: string }[]; decisions: { id: string }[]; wrote: unknown[] } | null = null
/** The most writings of the run's agent the answer lists, read from src/server/lib/inspection.ts after freshDb(). */
let theMostItLists: number | undefined

/** One ask as the inspector, with how long it kept this thread and how many statements its header counts. */
async function oneAsk(): Promise<{ holdMs: number; statements: number; ms: number; status: number; body: string }> {
  const held = monitorEventLoopDelay({ resolution: 1 })
  held.enable()
  const started = performance.now()
  const reply = await app.inject({ method: 'GET', url: `/api/checks/${run}`, headers: asAgent(THE_INSPECTOR) })
  const ms = performance.now() - started
  // The monitor records a kept thread only at its next timer turn, so one is let in before it is read.
  await new Promise((resolve) => setTimeout(resolve, 3))
  held.disable()
  const counted = /desc="(\d+) statements"/.exec(String(reply.headers['server-timing']))
  return { holdMs: held.max / 1e6, statements: counted === null ? Number.NaN : Number(counted[1]), ms, status: reply.statusCode, body: reply.body }
}

beforeAll(async () => {
  t = await freshDb()
  // inspection.ts reaches the database, so it is imported here, after freshDb(), and not at the top.
  theMostItLists = (await import('../src/server/lib/inspection.ts')).THE_MOST_WRITINGS_A_CHECK_LISTS
  const sqlite = t.client.sqlite
  buildTheOfficeAtAScale(sqlite, THE_TEST_OFFICES_OWNER.id, THE_LIVE_OFFICE_ON_4_NOVEMBER, new Date())
  app = (await apiApp()).app
  await app.ready()
  await theOfficesCheckers(app)
  const folder = join(t.file, '..', 'repositories')
  mkdirSync(folder, { recursive: true })
  run = (await aSealedRun(app, aRepository(join(folder, 'repository')), 'round')).run
  const agent = sqlite.prepare(`select id, handle from agents where handle = 'a-worker-round'`).get() as { id: string; handle: string }
  reportsInTheProject = (sqlite.prepare(`select count(*) as n from records where workspace_id = 'default' and kind = 'report'`).get() as { n: number }).n

  // THE AGENT'S HISTORY, written as the office writes it: each record with the change row that made it, in the run it
  // was made in. The earlier rounds are runs of the made-up office, never the run read: its random id sorts above their
  // ids about one time in eight, and report 0 and decision 0 would then be the run's own.
  const addRecord = sqlite.prepare(`insert into records (id, workspace_id, owner_id, created_at, updated_at, kind, title, summary, data, deleted_at, origin) values (?, ?, 'owner', ?, ?, ?, ?, null, ?, null, 'fixture')`)
  const addCreate = sqlite.prepare(`insert into changes (id, record_id, workspace_id, op, actor_type, actor_id, session_id, at) values (?, ?, 'default', 'create', 'agent', ?, ?, ?)`)
  const addLink = sqlite.prepare(`insert into links (id, workspace_id, owner_id, from_id, to_id, type, inferred, created_by, created_by_type, created_at, updated_at) values (?, 'default', 'owner', ?, ?, 'about', 0, ?, 'agent', ?, ?)`)
  const earlierRuns = (sqlite.prepare(`select id from records where kind = 'session' and workspace_id = 'default' and id != ? order by id desc limit 200`).all(run) as { id: string }[]).map((one) => one.id)
  const SENTENCE = 'These words were made up for a measurement and say nothing. '
  const aReport = JSON.stringify({
    for: 'made up for a measurement',
    date: '2026-11-01',
    blocks: Array.from({ length: 8 }, (_, b) => ({ id: `b-${String(b)}`, type: 'text', heading: 'A made-up part', text: SENTENCE.repeat(Math.round(THE_AGENTS_HISTORY.reportBytes / 8 / SENTENCE.length)) })),
  })
  const aDecision = JSON.stringify({ option_taken: SENTENCE.repeat(8), because: SENTENCE.repeat(3), decided_by: agent.handle, decided_on: '2026-11-01', authority: 'made up for a measurement', replaces: [] })
  const at = '2026-11-01 09:00:00'
  let changes = 0
  const filed = (id: string, workspace: string, kind: string, title: string, data: string, inRun: string): void => {
    addRecord.run(id, workspace, at, at, kind, title, data)
    addCreate.run(`made-up-create-${String(changes++)}`, id, agent.handle, inRun, at)
  }
  const anEarlierRun = (i: number): string => earlierRuns[i % earlierRuns.length] ?? run
  sqlite.transaction(() => {
    for (let i = 0; i < THE_AGENTS_HISTORY.earlierReports; i++) {
      filed(`made-up-report-${String(i)}`, 'default', 'report', `A made-up report ${String(i)}`, aReport, anEarlierRun(i))
      addLink.run(`made-up-report-link-${String(i)}`, `made-up-report-${String(i)}`, anEarlierRun(i), agent.handle, at, at)
    }
    for (let i = 0; i < THE_AGENTS_HISTORY.runReports; i++) {
      filed(`made-up-run-report-${String(i)}`, 'default', 'report', `The run's made-up report ${String(i)}`, aReport, run)
      addLink.run(`made-up-run-report-link-${String(i)}`, `made-up-run-report-${String(i)}`, run, agent.handle, at, at)
    }
    for (let i = 0; i < THE_AGENTS_HISTORY.earlierDecisions; i++) filed(`made-up-decision-${String(i)}`, 'default', 'decision', `A made-up decision ${String(i)}`, aDecision, anEarlierRun(i))
    for (let i = 0; i < THE_AGENTS_HISTORY.runDecisions; i++) filed(`made-up-run-decision-${String(i)}`, 'default', 'decision', `The run's made-up decision ${String(i)}`, aDecision, run)
    for (let i = 0; i < THE_AGENTS_HISTORY.messages; i++) {
      const message = JSON.stringify({ body: SENTENCE.repeat(10), to: [{ kind: 'person', id: THE_TEST_OFFICES_OWNER.id }], sentBy: { kind: 'agent', id: agent.id } })
      filed(`made-up-message-${String(i)}`, 'message-centre', 'message', `A made-up message ${String(i)}`, message, i < THE_AGENTS_HISTORY.runMessages ? run : anEarlierRun(i))
    }
    for (let i = 0; i < THE_AGENTS_HISTORY.otherRecords; i++) filed(`made-up-problem-${String(i)}`, 'default', 'problem', `A made-up problem ${String(i)}`, JSON.stringify({ body: SENTENCE.repeat(10) }), anEarlierRun(i))
    for (let i = 0; i < THE_AGENTS_HISTORY.runLinks; i++) addLink.run(`made-up-run-link-${String(i)}`, `made-up-message-${String(i)}`, run, agent.handle, at, at)
  })()

  // Asked once to warm it: the first ask starts the thread the seal is read on.
  const warm = await oneAsk()
  expect(warm.status, warm.body.slice(0, 400)).toBe(200)
  for (let i = 0; i < 5; i++) {
    const one = await oneAsk()
    expect(one.status, one.body.slice(0, 400)).toBe(200)
    asks.push({ holdMs: one.holdMs, statements: one.statements, ms: one.ms })
    answer = JSON.parse(one.body) as typeof answer
  }
}, 900_000)

afterAll(async () => {
  await app?.close()
  t?.close()
})

/** The median of the five asks. */
function median(of: (one: (typeof asks)[number]) => number): number {
  return [...asks.map(of)].sort((a, b) => a - b)[2]!
}

function said(what: string): void {
  console.log(what)
  if (OUT !== '') appendFileSync(`${OUT}.check-read.log`, `${what}\n`)
}

describe('GET /api/checks/:run at the live office size', () => {
  it('reads a round run of the live size', () => {
    expect(reportsInTheProject, "the made-up project's reports, before the agent's own").toBeGreaterThan(AT_THE_LIVE_SIZE)
    expect(answer?.reports.map((one) => one.id), "the run's reports").toEqual(['made-up-run-report-0'])
    expect(answer?.decisions.map((one) => one.id).sort(), "the run's decisions").toEqual(['made-up-run-decision-0', 'made-up-run-decision-1', 'made-up-run-decision-2'])
    // The agent wrote 5,494 records, more than the answer may list, so it lists as many as it may: the newest.
    expect(answer?.wrote, 'what the agent wrote').toHaveLength(theMostItLists!)
  })

  it(`keeps the server's thread less than ${String(HOLDS_WITHIN_MS)} ms in one ask`, () => {
    const held = median((one) => one.holdMs)
    said(`[check read timing] held the thread: median ${held.toFixed(1)} ms of ${asks.map((one) => one.holdMs.toFixed(1)).join(', ')}; answered in ${asks.map((one) => String(Math.round(one.ms))).join(', ')} ms`)
    expect(held, 'the median time one ask kept the thread').toBeLessThan(HOLDS_WITHIN_MS)
  })

  it(`runs fewer than ${String(RUNS_WITHIN_STATEMENTS)} statements in one ask`, () => {
    const statements = median((one) => one.statements)
    said(`[check read timing] statements: median ${String(statements)} of ${asks.map((one) => String(one.statements)).join(', ')}`)
    expect(statements, "the median of the statements one ask's Server-Timing header counts").toBeLessThan(RUNS_WITHIN_STATEMENTS)
  })
})
