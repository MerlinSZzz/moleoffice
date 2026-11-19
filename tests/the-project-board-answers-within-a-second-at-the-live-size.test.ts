// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * GET /api/projects/:project/board ANSWERS WITHIN A SECOND AT THE LIVE SIZE, IN THE TIMING GROUP. Wave 13u round 216,
 * package BV, point BV-2: the speed is
 * measured at today's live size.
 *
 * The board is worked out each time it is asked and nothing is stored, so each ask pays for the whole reading. This
 * file holds two things of the door, each by its median of five asks: how long one ask takes to answer, and how many
 * database statements it runs.
 *
 * THE OFFICE IS MADE UP at the counts of 13 November 2026: THE_LIVE_OFFICE_ON_13_NOVEMBER in
 * tests/the-office-at-the-live-scale.ts, 196,852 records and 73,549 links, with the guesses named beside it. On it
 * this file writes a made-up board, with the sizes in THE_BOARD below. Every name and word is made up.
 *
 * THE LANDINGS ARE NOT READ HERE. The made-up repository has no folder, so the board says `no-folder` and runs no git.
 * On the live office the board also reads main's first-parent commits of 7 days with git. That read took 118 to 147 ms
 * on this line's checkout on 13 November (196 commits), and it is measured there, not here.
 *
 * WHAT IT COSTS TO RUN. The hook builds the office: about 3 minutes on a quiet machine, and a database of about 2 GB in
 * the test's own folder, removed when the file ends.
 *
 * IT RUNS ONLY IN THE TIMING GROUP (`node tools/run-named-tests.mjs --list timing`), on a quiet machine, as
 * tests/the-timing-tests.ts says.
 *
 * MUTATIONS, each after a control run, each file copied first and restored with cp and checked with cmp. They were run
 * on 13 November, before this file was put on the timing list, while it could still be named. The control answered
 * in a median of 58 ms with 27 statements.
 *   1. in the reading, hold the thread for 1,100 ms of work: the answer case goes red (median 1,161 ms).
 *   2. in the reading, read the steps of each pipeline one record at a time: the statements case goes red.
 *
 * WHAT THIS FILE DOES NOT CATCH. Three mutations that make the reading wider stayed under the second, so this file
 * passed with each of them:
 *   - the requests read with no index (`+at_ms` and `+session_id`): 120 ms;
 *   - every record of the project of every kind but `message` read: 945 ms;
 *   - every record of the project read and parsed with JSON.parse: 390 ms.
 * tests/the-project-board-reads-no-whole-table.test.ts holds the door to the indexes, at any size.
 */
import { appendFileSync } from 'node:fs'
import { monitorEventLoopDelay } from 'node:perf_hooks'

import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { THE_PERSON } from '../src/shared/person.ts'
import type { ProjectBoard } from '../src/shared/project-board.ts'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { buildTheOfficeAtAScale, THE_LIVE_OFFICE_ON_13_NOVEMBER } from './the-office-at-the-live-scale.ts'
import { TIMING_RESULTS_VARIABLE } from './the-timing-tests.ts'

/** BV-2: the board answers within a second. */
const ANSWERS_WITHIN_MS = 1_000
/** The most statements one ask may run, as its Server-Timing header counts them. */
const RUNS_WITHIN_STATEMENTS = 200

/**
 * THE MADE-UP BOARD. The 151 modules were counted on the live office on 13 November 2026. Nobody counted the rest for
 * the board the owner will use, because its rows are being written in this round, so each is a guess, and says so.
 */
const THE_BOARD = {
  /** Counted, as above. */
  modules: 151,
  /** A guess: the rows of the master pipeline. */
  rows: 30,
  /** A guess: the pipelines part of each row's step, and one more under the first step of the first of them. */
  pipelinesPerRow: 3,
  /** A guess: the steps of each pipeline. */
  stepsPerPipeline: 8,
  /** A guess: one step in this many is unfinished. */
  oneUnfinishedIn: 4,
  /** A guess: the change rows of each unfinished step besides the one that put it in its state. */
  otherChangesPerStep: 10,
  /** A guess: the steps each module implements. */
  stepsPerModule: 6,
  /** A guess: the stated rows of the implementation map. */
  statedRows: 1_500,
  /** A guess: the backlog items, and the files each names. */
  backlogItems: 800,
  filesPerItem: 3,
  /** A guess: the open packages. */
  packages: 60,
  /** A guess: the most acting runs linked to the board. */
  linkedRuns: 40,
} as const

const OUT = process.env[TIMING_RESULTS_VARIABLE] ?? ''

const AS_THE_PERSON = {
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

let t: TestDb
let app: FastifyInstance
const asks: { holdMs: number; statements: number; ms: number }[] = []
let board: ProjectBoard | null = null
let recordsInTheOffice = 0
let linksInTheOffice = 0

/** One ask as the person, with how long it took, how long it kept this thread, and how many statements it ran. */
async function oneAsk(): Promise<{ holdMs: number; statements: number; ms: number; status: number; body: string }> {
  const held = monitorEventLoopDelay({ resolution: 1 })
  held.enable()
  const started = performance.now()
  const reply = await app.inject({ method: 'GET', url: '/api/projects/default/board', headers: AS_THE_PERSON })
  const ms = performance.now() - started
  // The monitor records a kept thread only at its next timer turn, so one is let in before it is read.
  await new Promise((resolve) => setTimeout(resolve, 3))
  held.disable()
  const counted = /desc="(\d+) statements"/.exec(String(reply.headers['server-timing']))
  return { holdMs: held.max / 1e6, statements: counted === null ? Number.NaN : Number(counted[1]), ms, status: reply.statusCode, body: reply.body }
}

beforeAll(async () => {
  delete process.env['MOLE_OFFICE_IDLE_REMINDER_HOURS']
  t = await freshDb()
  const sqlite = t.client.sqlite
  const now = new Date()
  buildTheOfficeAtAScale(sqlite, THE_TEST_OFFICES_OWNER.id, THE_LIVE_OFFICE_ON_13_NOVEMBER, now)
  recordsInTheOffice = (sqlite.prepare('select count(*) as n from records').get() as { n: number }).n
  linksInTheOffice = (sqlite.prepare('select count(*) as n from links').get() as { n: number }).n

  // THE MADE-UP BOARD, written straight to the tables: the link door's containment check reads the whole project for
  // each `part_of`, which at this size would take the hook far longer than the reading it measures.
  const at = '2026-11-10 09:00:00'
  const addRecord = sqlite.prepare(
    `insert into records (id, workspace_id, owner_id, created_at, updated_at, kind, title, summary, data, deleted_at, origin) values (?, 'default', 'owner', ?, ?, ?, ?, null, ?, null, 'fixture')`,
  )
  const addLink = sqlite.prepare(
    `insert into links (id, workspace_id, owner_id, from_id, to_id, type, inferred, created_by, created_by_type, created_at, updated_at) values (?, 'default', 'owner', ?, ?, ?, 0, 'owner', 'human', ?, ?)`,
  )
  const addChange = sqlite.prepare(
    `insert into changes (id, record_id, workspace_id, op, actor_type, actor_id, session_id, field, old_value, new_value, at) values (?, ?, 'default', 'update', 'human', 'owner', null, ?, null, ?, ?)`,
  )
  let links = 0
  let changes = 0
  const link = (from: string, to: string, type: string): void => {
    addLink.run(`board-link-${String(links++)}`, from, to, type, at, at)
  }
  const steps: string[] = []
  const pipelines: string[] = []
  sqlite.transaction(() => {
    const aPipeline = (id: string, stepIds: string[]): void => {
      pipelines.push(id)
      addRecord.run(id, at, at, 'pipeline', `Made-up pipeline ${id}`, JSON.stringify({ blockIds: stepIds }))
      stepIds.forEach((stepId, i) => {
        const unfinished = steps.length % THE_BOARD.oneUnfinishedIn === 0
        const state = unfinished ? (i % 2 === 0 ? 'todo' : 'doing') : 'done'
        steps.push(stepId)
        addRecord.run(stepId, at, at, 'block', `Made-up step ${stepId}`, JSON.stringify({ state, pipelineId: id }))
        if (!unfinished) return
        addChange.run(`board-change-${String(changes++)}`, stepId, 'data.state', JSON.stringify(state), '2026-11-08 09:00:00')
        for (let c = 0; c < THE_BOARD.otherChangesPerStep; c++) addChange.run(`board-change-${String(changes++)}`, stepId, 'data.measured', '"made up"', at)
      })
    }
    const stepsOf = (pipeline: string): string[] => Array.from({ length: THE_BOARD.stepsPerPipeline }, (_, s) => `${pipeline}-step-${String(s)}`)
    const rowIds = Array.from({ length: THE_BOARD.rows }, (_, r) => `board-row-${String(r)}`)
    addRecord.run('board-master', at, at, 'pipeline', 'Made-up master pipeline', JSON.stringify({ blockIds: rowIds }))
    for (const row of rowIds) addRecord.run(row, at, at, 'block', `Made-up row ${row}`, JSON.stringify({ state: 'done', pipelineId: 'board-master' }))
    rowIds.forEach((row) => {
      for (let p = 0; p < THE_BOARD.pipelinesPerRow; p++) {
        const pipeline = `${row}-pipeline-${String(p)}`
        aPipeline(pipeline, stepsOf(pipeline))
        link(pipeline, row, 'part_of')
      }
      const deeper = `${row}-deeper`
      aPipeline(deeper, stepsOf(deeper))
      link(deeper, `${row}-pipeline-0-step-0`, 'part_of')
    })
    sqlite.prepare(`update workspaces set master_pipeline = 'board-master' where id = 'default'`).run()

    // The modules, each implementing steps across the board, and the stated places of their code.
    const modules = Array.from({ length: THE_BOARD.modules }, (_, m) => `board-module-${String(m)}`)
    modules.forEach((module, m) => {
      addRecord.run(module, at, at, 'module', `Made-up module ${String(m)}`, JSON.stringify({ body: 'Made up.' }))
      for (let s = 0; s < THE_BOARD.stepsPerModule; s++) link(module, steps[(m * 7 + s * 131) % steps.length]!, 'implements')
    })
    sqlite
      .prepare(`insert into repositories (id, workspace_id, name, note, root, created_at, updated_at, created_by) values ('board-repository', 'default', 'made-up-repository', null, null, ?, ?, 'owner')`)
      .run(at, at)
    const addStated = sqlite.prepare(
      `insert into implementation_map (id, workspace_id, record_id, repository_id, pattern, relation, provenance, note, revision_id, stated_at, stated_by, accepted_at, accepted_by, deleted_at) values (?, 'default', ?, 'board-repository', ?, 'implements', 'declared', null, null, ?, 'owner', null, null, null)`,
    )
    for (let i = 0; i < THE_BOARD.statedRows; i++) addStated.run(`board-stated-${String(i)}`, modules[i % modules.length]!, `src/made-up/${String(i % modules.length)}/${String(i)}/**`, at)

    // The backlog: half todo, one in ten doing, three in ten done, one in ten with no state.
    const items: string[] = []
    for (let i = 0; i < THE_BOARD.backlogItems; i++) {
      const state = ['todo', 'todo', 'todo', 'todo', 'todo', 'doing', 'done', 'done', 'done', null][i % 10]
      const files = Array.from({ length: THE_BOARD.filesPerItem }, (_, f) => `src/made-up/${String((i + f) % modules.length)}/${String((i * 3 + f) % THE_BOARD.statedRows)}/a.ts`)
      items.push(`board-item-${String(i)}`)
      addRecord.run(`board-item-${String(i)}`, at, at, 'backlog_item', `Made-up item ${String(i)}`, JSON.stringify({ line: `13${'abcdefghij'[i % 10]!}`, number: String(i), files, ...(state === null ? {} : { state }) }))
    }
    for (let i = 0; i < THE_BOARD.packages; i++) {
      const bundle = { moduleIds: [modules[i % modules.length], modules[(i * 5) % modules.length]], pointIds: [items[i * 3], items[i * 3 + 1], items[i * 3 + 2]], lines: [`13${'abcdefghij'[i % 10]!}`] }
      addRecord.run(`board-package-${String(i)}`, at, at, 'task', `Made-up package ${String(i)}`, JSON.stringify({ state: 'todo', package: bundle }))
    }

    // The runs that act: the built office's runs of this project with a request in the last hour, some on the board.
    const acting = sqlite
      .prepare(
        `select distinct c.session_id as id from api_calls c join records r on r.id = c.session_id where c.at_ms >= ? and r.kind = 'session' and r.workspace_id = 'default' limit ?`,
      )
      .all(now.getTime() - 3_600_000, THE_BOARD.linkedRuns) as { id: string }[]
    acting.forEach((run, i) => link(run.id, i % 2 === 0 ? pipelines[(i * 17) % pipelines.length]! : steps[(i * 29) % steps.length]!, i % 3 === 0 ? 'relates_to' : 'part_of'))
  })()

  app = (await apiApp()).app
  await app.ready()
  const warm = await oneAsk()
  expect(warm.status, warm.body.slice(0, 400)).toBe(200)
  for (let i = 0; i < 5; i++) {
    const one = await oneAsk()
    expect(one.status, one.body.slice(0, 400)).toBe(200)
    asks.push({ holdMs: one.holdMs, statements: one.statements, ms: one.ms })
    board = JSON.parse(one.body) as ProjectBoard
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
  if (OUT !== '') appendFileSync(`${OUT}.project-board.log`, `${what}\n`)
}

describe('GET /api/projects/:project/board at the live office size', () => {
  it('reads a board of the live size', () => {
    expect(recordsInTheOffice, 'the records of the built office').toBeGreaterThanOrEqual(196_852)
    expect(linksInTheOffice, 'the links of the built office').toBeGreaterThanOrEqual(73_549)
    expect(board?.master.state).toBe('marked')
    expect(board?.rows).toHaveLength(THE_BOARD.rows)
    const unfinished = board?.rows.reduce((sum, row) => sum + row.unfinished.length, 0) ?? 0
    expect(unfinished, 'the unfinished steps under the rows').toBeGreaterThan(200)
    const acting = (board?.rows.reduce((sum, row) => sum + row.acting.length, 0) ?? 0) + (board?.actingUnderNoRow.length ?? 0)
    expect(acting, 'the runs that act').toBeGreaterThan(0)
    expect(board?.rows.some((row) => row.backlog.length > 0 && row.packages.length > 0), 'a row with backlog items and packages').toBe(true)
    expect(board?.landings).toEqual({ state: 'not-read', because: 'no-folder', detail: null })
  })

  it(`answers in less than ${String(ANSWERS_WITHIN_MS)} ms`, () => {
    const answered = median((one) => one.ms)
    said(`[project board timing] answered: median ${answered.toFixed(1)} ms of ${asks.map((one) => one.ms.toFixed(1)).join(', ')}; held the thread ${asks.map((one) => one.holdMs.toFixed(1)).join(', ')} ms`)
    expect(answered, 'the median time one ask took to answer').toBeLessThan(ANSWERS_WITHIN_MS)
  })

  it(`runs fewer than ${String(RUNS_WITHIN_STATEMENTS)} statements in one ask`, () => {
    const statements = median((one) => one.statements)
    said(`[project board timing] statements: median ${String(statements)} of ${asks.map((one) => String(one.statements)).join(', ')}`)
    expect(statements, "the median of the statements one ask's Server-Timing header counts").toBeLessThan(RUNS_WITHIN_STATEMENTS)
  })
})
