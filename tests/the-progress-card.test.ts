// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE PROJECT'S PROGRESS, READ FROM ITS POINTS AND ITS INSIDE BRIEFS. Wave 13s round 235, on a decision and the design
 * report 1NH-LLi6LGb-.
 *
 * WHAT IS REAL: a scratch office in process (`freshDb` and `apiApp`), never the live office, with a project of its own
 * for each case. Every decision, line, point, title and reason here is made up.
 *
 * THE CASES, in order:
 *   1. four points in the four states and one with no state read 1/1/1/1 and one gap, the gap is not `todo`, and
 *      PATCHing the `todo` point to `doing` moves the counts to `todo` 0 and `doing` 2;
 *   2. a brief moves through waiting, taken, aligned, handed back and checked, and a later hand-back with a refused
 *      check counts `checkedRefused` 1;
 *   3. a point carried through three inside briefs is counted until it is marked done, when the count falls to 0;
 *   4. a point with no state, and a stored state that is not one of the four, are both gaps and never `todo`;
 *   5. a read writes no record, a POST to the read's address is 404, and there is no `progress` record kind;
 *   6. `?line` narrows the points to exactly that line and is echoed; without it every live point is counted.
 *
 * MUTATIONS, each run alone after a green control and restored after:
 *   - the gap is counted into `todo`: case 1 and case 4 go red on the counts;
 *   - or the `done`/`dropped` guard is dropped from `carriedThreeBriefs`: case 3 goes red after the point is marked done.
 */

import { aMadeUpModuleForPackage, injectedPackageFixture } from './module-package-fixture.ts'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import type { ProjectProgress } from '../src/shared/progress.ts'
import { THE_MESSAGE_WORKER_ID } from '../src/shared/participants.ts'
import { RECORD_KINDS } from '../src/shared/types.ts'
import { apiApp, freshDb, theOfficesKeyHeader, type TestDb } from './helpers.ts'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'

let t: TestDb
let app: FastifyInstance
let workspace = ''
let caseNumber = 0

const human = (): Record<string, string> => ({
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id,
  'x-mole-office-workspace': workspace,
})

const asAgent = (handle: string): Record<string, string> => ({
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': handle,
  'x-mole-office-workspace': workspace,
})

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
}, 60_000)

afterAll(async () => {
  await app.close()
  t.close()
})

beforeEach(async () => {
  caseNumber += 1
  workspace = `progress-case-${String(caseNumber)}`
  const made = await app.inject({ method: 'POST', url: '/api/workspaces', payload: { id: workspace, title: 'Progress' } })
  expect(made.statusCode, made.body).toBe(201)
})

/** File one record through the route and hand back its id. A decision says it replaces none, as the door requires. */
async function file(
  kind: string,
  title: string,
  data: Record<string, unknown> = {},
  headers: Record<string, string> = human(),
): Promise<string> {
  const withReplaces = kind === 'decision' && !Object.hasOwn(data, 'replaces') ? { replaces: [], ...data } : data
  const res = await app.inject({ method: 'POST', url: '/api/records', headers, payload: { kind, title, data: withReplaces } })
  expect(res.statusCode, res.body).toBe(201)
  return (res.json() as { record: { id: string } }).record.id
}

/** Register a durable agent through the route and hand back the registry id it gave. */
async function register(handle: string): Promise<string> {
  const res = await app.inject({
    method: 'POST',
    url: '/api/agents/started',
    headers: human(),
    payload: { handle, name: handle },
  })
  expect(res.statusCode, res.body).toBe(201)
  const row = t.client.sqlite.prepare('SELECT id FROM agents WHERE handle = ?').get(handle) as { id: string } | undefined
  expect(row, `no registry row for ${handle}`).toBeDefined()
  return row!.id
}

/**
 * File a running run of the agent as the office files one, so the run has a key, and hand back the agent's headers in
 * that run. The hand-back door takes a hand-back only from the run that did the work, sent with that run's key.
 */
async function aRunOf(handle: string, agentId: string): Promise<Record<string, string>> {
  const res = await app.inject({
    method: 'POST',
    url: '/api/records',
    headers: { 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': THE_MESSAGE_WORKER_ID, 'x-mole-office-workspace': workspace, ...theOfficesKeyHeader() },
    payload: { kind: 'session', title: 'Made-up run', data: { state: 'running', runtime: 'claude-code', startedByMoleOffice: true, servingAgent: agentId } },
  })
  expect(res.statusCode, res.body).toBe(201)
  const body = res.json() as { record: { id: string }; runKey?: { key?: string } }
  return { ...asAgent(handle), 'x-mole-office-session': body.record.id, 'x-mole-office-key': String(body.runKey?.key ?? '') }
}

/** File one made-up point of a line. `extra` may leave `state` out or replace it, which the cases use. */
async function point(title: string, extra: Record<string, unknown> = {}): Promise<string> {
  return file('backlog_item', title, {
    line: '13s',
    number: title,
    placedBy: { kind: 'person', id: THE_TEST_OFFICES_OWNER.id },
    why: 'Made-up: the line needs this point.',
    doneWhen: 'Made-up: the point is true.',
    state: 'todo',
    ...extra,
  })
}

/** Read the progress door. A line of `undefined` asks for every line, with no query at all. */
async function progress(line?: string): Promise<ProjectProgress> {
  const query = line === undefined ? '' : `?line=${encodeURIComponent(line)}`
  const res = await app.inject({ method: 'GET', url: `/api/backlog/progress${query}`, headers: human() })
  expect(res.statusCode, res.body).toBe(200)
  return res.json() as ProjectProgress
}

const PACKAGE_WORDS = {
  forTheOutside: 'Made-up: do the work and bring its result back.',
  acceptance: 'Made-up: the work is done.',
}

/** Package a task as an inside brief: a parent and the points it carries. */
async function packageBrief(
  taskId: string,
  parent: { kind: 'decision' | 'task'; id: string },
  pointIds: string[],
  headers: Record<string, string> = human(),
): Promise<void> {
  const res = await app.inject({
    method: 'POST',
    url: `/api/delegation/${taskId}/package`,
    headers,
    payload: { ...PACKAGE_WORDS, parent, pointIds, moduleIds: [await aMadeUpModuleForPackage(injectedPackageFixture(app, workspace))] },
  })
  expect(res.statusCode, res.body).toBe(201)
}

/** One inside-brief step through its route, expecting the status the case names. */
async function step(
  taskId: string,
  door: string,
  payload: Record<string, unknown> = {},
  headers: Record<string, string> = human(),
): Promise<void> {
  const res = await app.inject({ method: 'POST', url: `/api/delegation/${taskId}/${door}`, headers, payload })
  expect(res.statusCode, res.body).toBe(201)
}

/** How many records the table holds, deleted or not. */
function recordsStored(): number {
  return (t.client.sqlite.prepare('SELECT count(*) AS n FROM records').get() as { n: number }).n
}

describe("the project's progress", () => {
  it('1. counts the four point states and one gap, and a point moving changes the counts', async () => {
    const todo = await point('todo point')
    await point('doing point', { state: 'doing' })
    await point('done point', { state: 'done' })
    await point('dropped point', { state: 'dropped' })
    await file('backlog_item', 'no state point', {
      line: '13s',
      number: 'none',
      placedBy: { kind: 'person', id: THE_TEST_OFFICES_OWNER.id },
      why: 'Made-up: somebody filed this one before saying where it stands.',
      doneWhen: 'Made-up: it is true.',
    })

    const before = await progress()
    expect(before.points).toMatchObject({
      total: 5,
      todo: 1,
      doing: 1,
      done: 1,
      dropped: 1,
      noState: 1,
    })
    // THE GAP IS NOT TODO, so the one `todo` above is the point filed in that state and not the gap beside it.
    expect(before.points.todo).toBe(1)
    expect(before.points.noState).toBe(1)
    // NO POINT HERE NAMES A BRIEF.
    expect(before.points.inNoBrief).toBe(5)

    const patched = await app.inject({
      method: 'PATCH',
      url: `/api/records/${todo}`,
      headers: human(),
      payload: { dataPatch: { state: 'doing' } },
    })
    expect(patched.statusCode, patched.body).toBe(200)

    const after = await progress()
    expect(after.points).toMatchObject({
      total: 5,
      todo: 0,
      doing: 2,
      done: 1,
      dropped: 1,
      noState: 1,
    })
  })

  it('2. counts a brief waiting, taken, aligned, handed back, returned and done, and a refused check', async () => {
    const parentAgent = `progress-parent-${String(caseNumber)}`
    const worker = `progress-worker-${String(caseNumber)}`
    await register(parentAgent)
    const workersRun = await aRunOf(worker, await register(worker))
    const carried = await point('brief point')
    const parent = await file('task', 'Made-up parent task', {}, asAgent(parentAgent))
    const brief = await file('task', 'Made-up brief task')
    await packageBrief(brief, { kind: 'task', id: parent }, [carried])

    let read = await progress()
    expect(read.briefs).toMatchObject({ total: 1, waiting: 1, taken: 0, aligned: 0 })
    expect(Object.keys(read.briefs).sort()).toEqual(['aligned', 'checkedRefused', 'done', 'handedBack', 'returned', 'taken', 'total', 'waiting'])
    expect(read.couldNotRead).toEqual([])

    await step(brief, 'take-inside', {}, asAgent(worker))
    read = await progress()
    expect(read.briefs).toMatchObject({ total: 1, waiting: 0, taken: 1, aligned: 0 })

    await step(brief, 'align', { restated: 'Made-up: I will do it.', plan: 'Made-up: build it.' }, asAgent(worker))
    await step(brief, 'align-answer', { answer: 'aligned', words: 'Made-up: yes.' })
    read = await progress()
    expect(read.briefs).toMatchObject({ total: 1, waiting: 0, taken: 0, aligned: 1 })

    await step(
      brief,
      'hand-back',
      { points: [{ pointId: carried, outcome: 'done', words: 'Made-up: it is finished.' }] },
      workersRun,
    )
    read = await progress()
    expect(read.briefs).toMatchObject({ total: 1, aligned: 0, handedBack: 1 })

    // A CHECK MOVES NO STATE: the brief stays handed back until its maker accepts or returns it.
    await step(brief, 'check', { answer: 'holds', words: 'Made-up: it holds.' })
    read = await progress()
    expect(read.briefs).toMatchObject({ total: 1, handedBack: 1 })
    expect(read.briefs.checkedRefused).toBe(0)

    // A LATER HAND-BACK AND A REFUSED CHECK: the check is the last entry of `package.checks`.
    await step(
      brief,
      'hand-back',
      { points: [{ pointId: carried, outcome: 'part', words: 'Made-up: one part still needs review.' }] },
      workersRun,
    )
    await step(brief, 'check', { answer: 'refused', words: 'Made-up: it does not hold yet.' })
    read = await progress()
    expect(read.briefs).toMatchObject({ total: 1, handedBack: 1, checkedRefused: 1 })

    // THE MAKER'S ANSWER: a returned point moves the brief to returned, and its last point accepted moves it to done.
    await step(brief, 'accept', { points: [{ pointId: carried, answer: 'returned', words: 'Made-up: finish the part first.' }] })
    read = await progress()
    expect(read.briefs).toMatchObject({ total: 1, handedBack: 0, returned: 1, done: 0 })

    await step(
      brief,
      'hand-back',
      { points: [{ pointId: carried, outcome: 'done', words: 'Made-up: the part is finished.' }] },
      workersRun,
    )
    await step(brief, 'accept', { points: [{ pointId: carried, answer: 'accepted' }] })
    read = await progress()
    expect(read.briefs).toMatchObject({ total: 1, handedBack: 0, returned: 0, done: 1 })
  })

  it('3. counts a point carried through three briefs until it is marked done', async () => {
    const decision = await file('decision', 'Made-up decision')
    const carried = await point('carried point')
    const parent = await file('task', 'Made-up parent task')
    const child = await file('task', 'Made-up child task')
    const grandchild = await file('task', 'Made-up grandchild task')
    await packageBrief(parent, { kind: 'decision', id: decision }, [carried])
    await packageBrief(child, { kind: 'task', id: parent }, [carried])
    await packageBrief(grandchild, { kind: 'task', id: child }, [carried])

    const stored = await app.inject({ method: 'GET', url: `/api/records/${carried}`, headers: human() })
    expect(stored.statusCode, stored.body).toBe(200)
    expect((stored.json() as { record: { data: Record<string, unknown> } }).record.data['briefsCarried']).toBe(3)

    let read = await progress()
    expect(read.briefs.total).toBe(3)
    expect(read.points.carriedThreeBriefs).toBe(1)
    // THE ONE POINT IS IN A BRIEF NOW.
    expect(read.points.inNoBrief).toBe(0)

    const patched = await app.inject({
      method: 'PATCH',
      url: `/api/records/${carried}`,
      headers: human(),
      payload: { dataPatch: { state: 'done' } },
    })
    expect(patched.statusCode, patched.body).toBe(200)

    read = await progress()
    expect(read.points.carriedThreeBriefs).toBe(0)
  })

  it('4. counts a point with no state, and a state that is not one of the four, as gaps and never as todo', async () => {
    await file('backlog_item', 'no state point', {
      line: '13s',
      number: 'one',
      placedBy: { kind: 'person', id: THE_TEST_OFFICES_OWNER.id },
      why: 'Made-up: this point was filed with no state at all.',
      doneWhen: 'Made-up: it is true.',
    })
    // A STORED WORD THE FOUR DO NOT NAME, written under the door rather than through it: a record filed by an older
    // spec, or changed by a hand the server did not see. It is still a gap and never `todo`.
    const odd = await point('odd state point')
    t.client.sqlite.prepare("UPDATE records SET data = json_set(data, '$.state', 'paused') WHERE id = ?").run(odd)

    const read = await progress()
    expect(read.points).toMatchObject({ total: 2, todo: 0, doing: 0, done: 0, dropped: 0, noState: 2 })
    expect(read.points.todo).toBe(0)
    expect(read.points.noState).toBe(2)
  })

  it('5. reads without writing, refuses a write method, and declares no progress record kind', async () => {
    await point('one point')
    const before = recordsStored()
    const first = await progress()
    const second = await progress()
    expect(first.points.total).toBe(1)
    expect(second.points.total).toBe(1)
    expect(recordsStored()).toBe(before)

    for (const method of ['POST', 'PUT', 'PATCH', 'DELETE'] as const) {
      const refused = await app.inject({ method, url: '/api/backlog/progress', headers: human(), payload: {} })
      expect(refused.statusCode, `${method}: ${refused.body}`).toBe(404)
    }
    expect(RECORD_KINDS).not.toContain('progress')
    expect(recordsStored()).toBe(before)
  })

  it('6. narrows to one line when line is given, and counts every live point when it is not', async () => {
    await point('13s todo point')
    await point('13s done point', { state: 'done' })
    const other = await point('13n doing point', { line: '13n', state: 'doing' })
    const decision = await file('decision', 'Made-up decision')
    const briefTask = await file('task', 'Made-up brief task')
    await packageBrief(briefTask, { kind: 'decision', id: decision }, [other])

    const all = await progress()
    expect(all.line).toBeNull()
    expect(all.points).toMatchObject({ total: 3, todo: 1, doing: 1, done: 1, noState: 0 })
    // THE BRIEF IS NOT NARROWED BY `line`; only the points are.
    expect(all.briefs.total).toBe(1)
    // The two 13s points name no brief; the 13n point does.
    expect(all.points.inNoBrief).toBe(2)
    expect(all.says).toContain('outside packages')
    expect(all.says).toContain('other projects')

    const narrowed = await progress('13s')
    expect(narrowed.line).toBe('13s')
    expect(narrowed.points).toMatchObject({ total: 2, todo: 1, doing: 0, done: 1, noState: 0 })
    expect(narrowed.briefs.total).toBe(1)
    expect(narrowed.points.inNoBrief).toBe(2)
    expect(narrowed.says).toContain('13s')
    expect(narrowed.says).toContain('outside packages')
  })
})
