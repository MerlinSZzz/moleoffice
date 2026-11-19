// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE PROJECT BOARD READS NO WHOLE TABLE, AND WRITES NOTHING. Wave 13u round 216, package BV, point BV-2: a test
 * that no query visits a whole table.
 *
 * The board is worked out each time it is asked, from an office of about 200,000 records. So each of its reads must
 * name the ids or the time it wants and be answered by an index. A read that visits a whole table is quick in a test
 * office and slow in the person's.
 *
 * HOW THE READS ARE CAUGHT: while the board is read, `all`, `get`, `iterate` and `run` are wrapped on the prototype of
 * better-sqlite3's statements, so every statement is caught, a statement prepared and kept before the wrapper
 * included. Each caught read is then asked `EXPLAIN QUERY PLAN` with the values it was given, so the plan is of the
 * read that gave the answer.
 *
 * WHAT THIS FILE PROVES, in its own empty office, where every record and request is made up:
 *   1. No plan of any statement the reading runs has a step that scans a table. A step that scans `json_each`, a
 *      constant row or a subquery reads no table and is allowed. A search whose only limit is `IS NOT NULL` also
 *      reads nearly every row, and a plan does not show that, so case 1 cannot see it: case 2 names the index of the
 *      one read where SQLite was seen to choose such a search.
 *   2. The requests of the last hour are read through `api_calls_at_idx`, and the links through an index that starts
 *      with the end the read names, never through `links_type_idx`, which reads every link of a type. In a fresh
 *      office SQLite chose `links_type_idx` for the links into a list of ids asked with `eq` on the type; this case
 *      found that on 13 November, and the reading now asks `+type`.
 *   3. The reading ran every read case 1 judged: the master's column, the records by id, the links into and out of
 *      what it found, the changes of the unfinished steps, the requests, the repositories, the stated rows and the
 *      records by kind. And its answer shows the made-up office reached each part.
 *   4. The reading writes nothing: no statement it runs is a `run`.
 *
 * WHERE THE READS LIVE: src/server/lib/project-board.ts, and the readers it calls in src/server/lib/records/reading.ts,
 * src/server/lib/implementation.ts, src/server/lib/repositories.ts and src/server/lib/master-pipeline.ts.
 *
 * MUTATIONS, each after a control run, each file copied first and restored with cp and checked with cmp:
 *   1. in the reading, drop `INDEXED BY api_calls_at_idx` and write `+at_ms`, which no index answers: cases 2 and 3
 *      go red. Case 1 stays green, because SQLite then searches `api_calls_session_at_idx` for `session_id > ?`.
 *   2. in implementation.ts, write `+workspace_id` and `+repository_id` in the stated rows' read: case 1 goes red.
 *   3. in the reading, ask the type of the links into a list of ids with `eq` again: case 2 goes red.
 *   4. in the reading, write to each unfinished step as its age is read: case 4 goes red.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { ProjectBoard } from '../src/shared/project-board.ts'
import { freshDb, type TestDb } from './helpers.ts'

let t: TestDb
let board: typeof import('../src/server/lib/project-board.ts')

const id: Record<string, string> = {}

/** One statement the reading ran, with the values it was given and how. */
interface ACaughtStatement {
  text: string
  args: unknown[]
  how: 'all' | 'get' | 'iterate' | 'run'
}

/** A plan step that reads every row of a table. Scanning `json_each`, a constant row or a subquery reads no table. */
function aWholeTableStep(detail: string): boolean {
  return /^SCAN /u.test(detail) && !/VIRTUAL TABLE|^SCAN CONSTANT ROW|^SCAN \(subquery-\d+\)/u.test(detail)
}

/** Every statement that runs during `work`, caught on the statements' prototype. */
function theStatementsDuring<T>(work: () => T): { answer: T; caught: ACaughtStatement[] } {
  const prototype = Object.getPrototypeOf(t.client.sqlite.prepare('SELECT 1')) as Record<string, unknown>
  const originals = new Map<ACaughtStatement['how'], (...args: unknown[]) => unknown>()
  const caught: ACaughtStatement[] = []
  for (const how of ['all', 'get', 'iterate', 'run'] as const) {
    const original = prototype[how] as (...args: unknown[]) => unknown
    originals.set(how, original)
    prototype[how] = function (this: { source: string }, ...args: unknown[]) {
      caught.push({ text: this.source, args, how })
      return original.apply(this, args)
    }
  }
  try {
    return { answer: work(), caught }
  } finally {
    for (const [how, original] of originals) prototype[how] = original
  }
}

function thePlanOf(statement: ACaughtStatement): string[] {
  const plan = t.client.sqlite.prepare(`EXPLAIN QUERY PLAN ${statement.text}`).all(...(statement.args as never[])) as { detail: string }[]
  return plan.map((step) => step.detail)
}

let read: { answer: ProjectBoard; caught: ACaughtStatement[] }

beforeAll(async () => {
  delete process.env['MOLE_OFFICE_IDLE_REMINDER_HOURS']
  t = await freshDb()
  board = await import('../src/server/lib/project-board.ts')
  const { markTheMasterPipeline } = await import('../src/server/lib/master-pipeline.ts')
  const { registerRepository } = await import('../src/server/lib/repositories.ts')
  const { declareRelationship } = await import('../src/server/lib/implementation.ts')
  const record = (kind: 'pipeline' | 'module' | 'session' | 'task' | 'backlog_item', name: string, data: Record<string, unknown>) =>
    (id[name] = t.api.createRecord({ kind, title: `Made-up ${kind}, ${name}`, workspaceId: 'default', origin: 'fixture', actor: t.api.HUMAN, data }).id)
  const step = (inPipeline: string, name: string, state: 'todo' | 'doing' | 'done') =>
    (id[name] = t.blocks.addBlock(id[inPipeline]!, { name: `A made-up step, ${name}`, state }, t.api.HUMAN).block.id)
  const link = (from: string, to: string, type: 'part_of' | 'implements') => t.api.createLink({ fromId: id[from]!, toId: id[to]!, type, actor: t.api.HUMAN })

  // The master, two rows, and three levels under the first: a pipeline, a step of it, a pipeline under that step.
  record('pipeline', 'master', { blockIds: [] })
  step('master', 'row-one', 'done')
  step('master', 'row-two', 'done')
  record('pipeline', 'upper', { blockIds: [] })
  link('upper', 'row-one', 'part_of')
  step('upper', 'upper-step', 'todo')
  step('upper', 'upper-done', 'done')
  record('pipeline', 'lower', { blockIds: [] })
  link('lower', 'upper-step', 'part_of')
  step('lower', 'lower-step', 'doing')
  markTheMasterPipeline('default', id['master']!)

  // A module that implements the upper step, a stated place for it, and a backlog item and a package that reach it.
  record('module', 'module', {})
  link('module', 'upper-step', 'implements')
  const repository = registerRepository({ workspaceId: 'default', name: 'made-up-repository', root: null, actor: t.api.HUMAN })
  declareRelationship({ workspaceId: 'default', recordId: id['module']!, repositoryId: repository.id, pattern: 'src/made-up/**', actor: t.api.HUMAN })
  record('backlog_item', 'item', {
    line: '13x',
    number: '1',
    placedBy: { kind: 'person', id: t.api.HUMAN.id },
    why: 'Made-up: the made-up owner asked for it.',
    doneWhen: 'Made-up: the made-up page shows it.',
    state: 'todo',
    files: ['src/made-up/a.ts'],
  })
  record('task', 'package', {
    state: 'todo',
    package: {
      moduleIds: [id['module']!],
      pointIds: [id['item']!],
      lines: ['13x'],
      bundleId: 'madeUpBundle',
      forTheOutside: 'Made-up: nothing leaves.',
      acceptance: 'Made-up: nothing is judged.',
      at: '2026-11-13 12:00:00',
      by: { actorType: 'human', actorId: t.api.HUMAN.id },
    },
  })

  // One run that acts, under the lower pipeline, with a request five minutes ago.
  record('session', 'run', { state: 'running', servingAgent: 'wave-13x-supervisor' })
  t.api.createLink({ fromId: id['run']!, toId: id['lower']!, type: 'part_of', actor: t.api.HUMAN })
  t.client.sqlite
    .prepare(
      'INSERT INTO api_calls (id, at_ms, method, status, ms, actor_type, actor_id, session_id, workspace_id, ' +
        "identity_source) VALUES ('made-up-call', ?, 'GET', 200, 1, 'agent', 'made-up-agent', ?, 'default', 'none')",
    )
    .run(Date.now() - 5 * 60_000, id['run']!)

  read = theStatementsDuring(() => board.readTheProjectBoard('default'))
}, 120_000)

afterAll(() => {
  t?.close()
})

describe('the project board reads no whole table', () => {
  it('1. no plan of any statement it runs scans a table', () => {
    const whole = read.caught
      .filter((statement) => statement.how !== 'run')
      .map((statement) => ({ text: statement.text, plan: thePlanOf(statement) }))
      .filter((one) => one.plan.some(aWholeTableStep))
    expect(whole, JSON.stringify(whole, null, 1)).toEqual([])
  })

  it('2. the requests are read by api_calls_at_idx, and the links by the index of the end they name', () => {
    const calls = read.caught.filter((statement) => statement.text.includes('FROM api_calls'))
    expect(calls).toHaveLength(1)
    expect(thePlanOf(calls[0]!).join(' | ')).toMatch(/USING (COVERING )?INDEX api_calls_at_idx/u)
    const linkReads = read.caught.filter((statement) => /from "links"/u.test(statement.text))
    expect(linkReads.length).toBeGreaterThan(0)
    for (const statement of linkReads) {
      const plan = thePlanOf(statement).join(' | ')
      expect(plan, statement.text).toMatch(/USING (COVERING )?INDEX links_(to|from|pair)_idx/u)
      expect(plan, statement.text).not.toMatch(/links_type_idx/u)
    }
  })

  it('3. it ran every read case 1 judged, and its answer reached each part of the made-up office', () => {
    const texts = read.caught.map((statement) => statement.text)
    const ran = (pattern: RegExp) => texts.some((text) => pattern.test(text))
    expect(ran(/SELECT master_pipeline AS id FROM workspaces/u), 'the master').toBe(true)
    expect(ran(/from "records" where "records"\."id" in/u), 'records by id').toBe(true)
    expect(ran(/from "links" where \("links"\."to_id" in/u), 'links into what it found').toBe(true)
    expect(ran(/from "links" where \("links"\."from_id" in/u), 'links out of the runs').toBe(true)
    expect(ran(/from "changes"/u), 'the changes of the unfinished steps').toBe(true)
    expect(ran(/FROM api_calls INDEXED BY/u), 'the requests').toBe(true)
    expect(ran(/FROM repositories/u), 'the repositories').toBe(true)
    expect(ran(/FROM implementation_map/u), 'the stated rows').toBe(true)
    expect(ran(/"records"\."kind" in/u), 'the records by kind').toBe(true)

    const rowOne = read.answer.rows.find((row) => row.id === id['row-one'])
    expect(rowOne?.unfinished.map((step) => step.id).sort()).toEqual([id['upper-step'], id['lower-step']].sort())
    expect(rowOne?.acting.map((run) => run.id)).toEqual([id['run']])
    expect(rowOne?.backlog.map((item) => item.id)).toEqual([id['item']])
    expect(rowOne?.packages.map((one) => one.id)).toEqual([id['package']])
    expect(read.answer.landings).toEqual({ state: 'not-read', because: 'no-folder', detail: null })
  })

  it('4. it writes nothing', () => {
    expect(read.caught.filter((statement) => statement.how === 'run').map((statement) => statement.text)).toEqual([])
  })
})
