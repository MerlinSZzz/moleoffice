// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE PROJECT BOARD COUNTS ONLY THE RUNS THAT REALLY ACT, AND SORTS ITS ROWS BY WHAT EACH ONE NEEDS. Wave 13u round
 * 216, package BV, points BV-2 and BV-4.
 *
 * A RUN ACTS when it sent the office a request within `idleReminderHours()`, one hour unless the owner set
 * MOLE_OFFICE_IDLE_REMINDER_HOURS. A run that has ended does not act,
 * and nor does a run that runs no model (the round launcher, the merge tool), whatever it sent.
 *
 * WHAT THIS FILE PROVES, in its own empty office, where every record and request is made up:
 *   1. Before a master is marked, the board says "unmarked" and has no rows. A project that is not there is the
 *      master reader's coded 404.
 *   2. With the master marked: only the two runs with a request in the last hour count. A quiet run whose newest
 *      request is two hours old, a round launcher's run and a finished run each sent a request too, and each is
 *      linked to the row nobody is on, which stays "nobody-on-it". A run counts under a row through a pipeline two
 *      levels down. Rows come in group order, and a row with no pipeline is last.
 *   3. A step blocked with no live pause is stalled; one whose pause still holds is not; one whose pause date has
 *      passed is again. The row with a stalled step and a run on it is "stalled".
 *   4. A run under no row makes the row nobody is on "not-known", since that run may be on it. Linked to a module
 *      that implements a step of the row, the run is counted there, and the row is "moving-or-done".
 *   5. A step's age is counted in whole days from the change that put it in its state, or from its own updated
 *      stamp when no change records one, and the board says which.
 *   6. View B names each line once, and "line not recorded" (null) last. The landings say the project has no
 *      repository, and no row claims a landing count.
 *
 * WHERE THE RULES LIVE: src/server/lib/project-board.ts (the reading), src/shared/work.ts
 * (`theWorkHasStoppedShort`) and src/shared/attention.ts (`sinceARecordHeldItsState`).
 *
 * MUTATIONS, each after a control run, each file copied first and restored with cp and checked with cmp. The cases
 * share one office, so a run wrongly counted in case 2 is still counted in cases 4 and 6:
 *   1. in the reading, read requests from any time rather than the last `withinHours`: cases 2, 4 and 6 go red.
 *   2. in the reading, drop the test of a run that runs no model: cases 2, 4 and 6 go red.
 *   3. in the reading, drop the test of a run that has ended: cases 2, 4 and 6 go red.
 *   4. in the reading, walk one level down only: cases 2 and 4 go red.
 *   5. in work.ts, let no pause hold: case 3 goes red.
 *   6. in the reading, put a row with no run on it in "nobody-on-it" even when a run is under no row: case 4 goes red.
 *   7. in attention.ts, date a record with no change row from its creation: case 5 goes red.
 */
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { THE_PERSON } from '../src/shared/person.ts'
import type { ProjectBoard } from '../src/shared/project-board.ts'
import { apiApp, freshDb, type TestDb } from './helpers.ts'

let t: TestDb
let app: FastifyInstance

const AS_THE_PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

const HOUR = 3_600_000
const DAY = 24 * HOUR

async function theBoard(project = 'default'): Promise<ProjectBoard> {
  const reply = await app.inject({ method: 'GET', url: `/api/projects/${project}/board`, headers: AS_THE_PERSON })
  expect(reply.statusCode, reply.body.slice(0, 400)).toBe(200)
  return reply.json() as ProjectBoard
}

/** One made-up request from a run, `agoMs` before now. */
let calls = 0
function aRequestFrom(run: string, agoMs: number): void {
  calls += 1
  t.client.sqlite
    .prepare(
      'INSERT INTO api_calls (id, at_ms, method, status, ms, actor_type, actor_id, session_id, workspace_id, ' +
        "identity_source) VALUES (?, ?, 'GET', 200, 1, 'agent', 'made-up-agent', ?, 'default', 'none')",
    )
    .run(`made-up-call-${calls}`, Date.now() - agoMs, run)
}

const id: Record<string, string> = {}

function aRun(name: string, data: Record<string, unknown>): string {
  id[name] = t.api.createRecord({ kind: 'session', title: `A made-up run, ${name}`, workspaceId: 'default', origin: 'fixture', actor: t.api.HUMAN, data }).id
  return id[name]
}

function link(fromId: string, toId: string, type: 'part_of' | 'relates_to' | 'implements'): void {
  t.api.createLink({ fromId, toId, type, actor: t.api.HUMAN })
}

function row(board: ProjectBoard, name: string) {
  const found = board.rows.find((one) => one.id === id[name])
  if (found === undefined) throw new Error(`The board has no row for ${name}.`)
  return found
}

beforeAll(async () => {
  delete process.env['MOLE_OFFICE_IDLE_REMINDER_HOURS']
  t = await freshDb()
  const built = await apiApp()
  app = built.app
  await app.ready()
  const pipeline = (name: string) =>
    (id[name] = t.api.createRecord({ kind: 'pipeline', title: `A made-up pipeline, ${name}`, workspaceId: 'default', origin: 'fixture', actor: t.api.HUMAN, data: { blockIds: [] } }).id)
  const step = (inPipeline: string, name: string, state: 'todo' | 'doing' | 'done' | 'blocked') =>
    (id[name] = t.blocks.addBlock(id[inPipeline]!, { name: `A made-up step, ${name}`, state }, t.api.HUMAN).block.id)

  // The master, and its five rows.
  pipeline('master')
  for (const name of ['row-with-a-run', 'row-nobody-is-on', 'row-with-a-stall', 'row-with-no-pipeline', 'row-done']) step('master', name, 'done')

  // Under the row with a run: a pipeline, and a second one two levels down, part of its step.
  pipeline('upper')
  link(id['upper']!, id['row-with-a-run']!, 'part_of')
  step('upper', 'upper-step', 'todo')
  pipeline('lower')
  link(id['lower']!, id['upper-step']!, 'part_of')
  step('lower', 'lower-step', 'doing')

  // Under the row nobody is on: one step, moved from todo to doing, so a change row dates it.
  pipeline('quiet-pipeline')
  link(id['quiet-pipeline']!, id['row-nobody-is-on']!, 'part_of')
  step('quiet-pipeline', 'quiet-step', 'todo')
  t.blocks.patchBlock(id['quiet-pipeline']!, id['quiet-step']!, { state: 'doing' }, t.api.HUMAN)

  // Under the row with a stall: blocked with no pause, blocked with a pause that holds, blocked with one run out.
  pipeline('stall-pipeline')
  link(id['stall-pipeline']!, id['row-with-a-stall']!, 'part_of')
  step('stall-pipeline', 'stalled-step', 'blocked')
  step('stall-pipeline', 'held-step', 'blocked')
  t.blocks.patchBlock(id['stall-pipeline']!, id['held-step']!, { paused: { since: '2026-11-01', why: 'Made-up: it waits on purpose.', until: { date: '2099-01-01' } } }, t.api.HUMAN)
  step('stall-pipeline', 'pause-ran-out-step', 'blocked')
  t.blocks.patchBlock(id['stall-pipeline']!, id['pause-ran-out-step']!, { paused: { since: '2026-01-01', why: 'Made-up: it waited.', until: { date: '2026-01-02' } } }, t.api.HUMAN)

  // Under the finished row: one step, done.
  pipeline('done-pipeline')
  link(id['done-pipeline']!, id['row-done']!, 'part_of')
  step('done-pipeline', 'done-step', 'done')

  // A module that implements the step of the row nobody is on.
  id['module'] = t.api.createRecord({ kind: 'module', title: 'A made-up module', workspaceId: 'default', origin: 'fixture', actor: t.api.HUMAN, data: {} }).id
  link(id['module']!, id['quiet-step']!, 'implements')

  // The runs. The two that act; three more that sent requests but do not act, each linked to the row nobody is on.
  aRun('acting-deep', { state: 'running', servingAgent: 'wave-13x-supervisor' })
  link(id['acting-deep']!, id['lower']!, 'part_of')
  aRequestFrom(id['acting-deep']!, 10 * 60_000)
  aRun('acting-on-a-stall', { state: 'running', servingAgent: 'w13y-r5-made-up-worker' })
  link(id['acting-on-a-stall']!, id['stalled-step']!, 'relates_to')
  aRequestFrom(id['acting-on-a-stall']!, 5 * 60_000)
  aRun('quiet', { state: 'running', servingAgent: 'wave-13q-supervisor' })
  link(id['quiet']!, id['quiet-pipeline']!, 'part_of')
  aRequestFrom(id['quiet']!, 2 * HOUR)
  aRun('launcher', { state: 'running', runtime: 'round-launcher' })
  link(id['launcher']!, id['quiet-pipeline']!, 'part_of')
  aRequestFrom(id['launcher']!, 60_000)
  aRun('finished', { state: 'finished' })
  link(id['finished']!, id['quiet-pipeline']!, 'part_of')
  aRequestFrom(id['finished']!, 60_000)

  // A second later, a note on the upper step that moves its updated stamp and not its state.
  await new Promise((resolve) => setTimeout(resolve, 1100))
  t.blocks.patchBlock(id['upper']!, id['upper-step']!, { measured: 'Made-up: a note written later.' }, t.api.HUMAN)
}, 120_000)

afterAll(async () => {
  await app?.close()
  t?.close()
})

describe('the project board', () => {
  it('1. has no rows before a master is marked, and a project that is not there is a coded 404', async () => {
    const board = await theBoard()
    expect(board.master).toEqual({ project: 'default', state: 'unmarked' })
    expect(board.rows).toEqual([])
    const missing = await app.inject({ method: 'GET', url: '/api/projects/no-such-project/board', headers: AS_THE_PERSON })
    expect(missing.statusCode).toBe(404)
    expect(missing.json()).toMatchObject({ code: 'masterPipelineNoSuchProject' })
  })

  it('2. counts only the runs with a request in the last hour that have not ended and run a model', async () => {
    const marked = await app.inject({ method: 'PUT', url: '/api/projects/default/master-pipeline', headers: AS_THE_PERSON, payload: { pipeline: id['master'] } })
    expect(marked.statusCode, marked.body.slice(0, 300)).toBe(200)
    const board = await theBoard()
    expect(board.actingWithinHours).toBe(1)
    const counted = [...board.rows.flatMap((one) => one.acting), ...board.actingUnderNoRow].map((run) => run.id).sort()
    expect(counted).toEqual([id['acting-deep'], id['acting-on-a-stall']].sort())
    expect(row(board, 'row-with-a-run').acting.map((run) => run.id)).toEqual([id['acting-deep']])
    expect(row(board, 'row-with-a-run').agents).toEqual(['wave-13x-supervisor'])
    expect(row(board, 'row-with-a-run').pipelines.map((one) => one.id).sort()).toEqual([id['upper'], id['lower']].sort())
    expect(row(board, 'row-with-a-run').unfinished.map((step) => step.id).sort()).toEqual([id['upper-step'], id['lower-step']].sort())
    expect(row(board, 'row-nobody-is-on')).toMatchObject({ group: 'nobody-on-it', acting: [] })
    expect(board.rows.map((one) => [one.title, one.group])).toEqual([
      ['A made-up step, row-nobody-is-on', 'nobody-on-it'],
      ['A made-up step, row-with-a-stall', 'stalled'],
      ['A made-up step, row-with-a-run', 'moving-or-done'],
      ['A made-up step, row-done', 'moving-or-done'],
      ['A made-up step, row-with-no-pipeline', 'no-pipeline'],
    ])
  })

  it('3. calls a blocked step stalled only when no live pause holds it', async () => {
    const steps = row(await theBoard(), 'row-with-a-stall').unfinished
    const stalled = Object.fromEntries(steps.map((step) => [step.id, step.stalled]))
    expect(stalled).toEqual({ [id['stalled-step']!]: true, [id['held-step']!]: false, [id['pause-ran-out-step']!]: true })
  })

  it('4. a run under no row makes a row nobody is on "not-known", and counts under the row of the module it is linked to', async () => {
    aRun('acting-nowhere', { state: 'running', servingAgent: 'clerk' })
    aRequestFrom(id['acting-nowhere']!, 60_000)
    const before = await theBoard()
    expect(before.actingUnderNoRow.map((run) => run.id)).toEqual([id['acting-nowhere']])
    expect(row(before, 'row-nobody-is-on').group).toBe('not-known')
    link(id['acting-nowhere']!, id['module']!, 'relates_to')
    const after = await theBoard()
    expect(after.actingUnderNoRow).toEqual([])
    expect(row(after, 'row-nobody-is-on')).toMatchObject({ group: 'moving-or-done', agents: ['clerk'] })
  })

  it("5. counts a step's age in whole days from the change into its state, or from its updated stamp", async () => {
    const { readTheProjectBoard } = await import('../src/server/lib/project-board.ts')
    const later = readTheProjectBoard('default', Date.now() + 3 * DAY + HOUR)
    const quiet = row(later, 'row-nobody-is-on').unfinished.find((step) => step.id === id['quiet-step'])
    expect(quiet).toMatchObject({ state: 'doing', sinceFrom: 'state-change', days: 3 })
    const upper = row(later, 'row-with-a-run').unfinished.find((step) => step.id === id['upper-step'])
    const { getRecord } = await import('../src/server/lib/records.ts')
    const record = getRecord(id['upper-step']!)!
    expect(record.updatedAt, 'the note moved the updated stamp away from the creation stamp').not.toBe(record.createdAt)
    expect(upper).toMatchObject({ state: 'todo', sinceFrom: 'record-updated', since: record.updatedAt, days: 3 })
  })

  it('6. view B names each line once and "line not recorded" last, and the landings say why they were not read', async () => {
    const board = await theBoard()
    expect(board.lines.map((one) => one.line)).toEqual(['13x', '13y', null])
    expect(board.lines.at(-1)!.now.map((run) => run.id)).toEqual([id['acting-nowhere']])
    expect(board.landings).toEqual({ state: 'not-read', because: 'no-repository', detail: null })
    expect(board.rows.map((one) => one.landings7Days)).toEqual(board.rows.map(() => null))
  })
})
