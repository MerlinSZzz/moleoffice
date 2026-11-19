// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE PROJECT GRAPH'S ONE READ, OVER THE ROUTE. Wave 13s round 241.
 *
 * WHAT IS REAL: a scratch office in process (`freshDb` and `apiApp`), never the live office, with a project of its own
 * for each case. Every module, block, plan, stopping point and sentence filed here is made up.
 *
 * THE PROJECT `aProject` FILES, through the routes: two modules; one pipeline of two blocks, the first module linked
 * to both blocks by `implements`; one trajectory of two planned states with a `plans_for` link to the first module; one
 * stopping point `about` the first module; one proposal and one decision. A block is filed through its pipeline's own
 * door, which is the only door a block has.
 *
 * THE CASES, in order:
 *   1. the modules, the pipeline, the blocks, and the module that carries each, as ids;
 *   2. the trajectory's planned states in their stored order, with their words, and its target;
 *   3. the stopping point's `about` ids and its `doing` and `next` words;
 *   4. a record created and then PATCHed has more than one real revision and is not a baseline, and a record only
 *      created has one real revision;
 *   5. when every revision row is a migration baseline, the reply says so, returns no real revision, and the model calls
 *      the past sparse;
 *   6. a project with nothing in it answers empty lists and says it is empty;
 *   7. the read writes no record, a write method at its address is 404, and a query word is refused;
 *   8. a direction that no lane holds keeps its real revisions: the model puts them in `unattached` and counts them at
 *      the second level (supervisor's review note 348mSpQNppW1, item 1);
 *   9. a plan with one line about a graph record and one line about nothing is returned with the one line, and the
 *      other is counted in `says` (the same note, item 2);
 *  10. a planned state that no trajectory names is counted in `says`;
 *  11. a record whose every revision is a migration baseline is baseline-only and counted in `says`, however many
 *      revisions it has (the check of round 241, item 1);
 *  12. the reply says whether the project has a source index, false on a fresh project and true after a rebuild, so the
 *      graph page can ask the coverage door only when there is one to read. When the stored skipped list is damaged, the
 *      reply says it cannot tell (null) and the graph read still answers, so the coverage door reports the damage.
 *
 * MUTATIONS, each run alone after a green control and restored after. The counts are in the round's report.
 *   1. `parentId` set when `carriedBy` holds no module instead of one: case 1 goes red;
 *   2. a trajectory's target read from an `about` link instead of `plans_for`: case 2 goes red;
 *   3. a stopping point's `about` ids read from links pointing at it instead of from it: case 3 goes red;
 *   4. `real` read as the baselines instead of the versions less the baselines: case 4 goes red;
 *   5. the baseline sentence asked for when real revisions exist instead of when none do: case 5 goes red;
 *   6. the empty sentence never said: case 6 goes red;
 *   7. the read registered for every method instead of GET: case 7 goes red;
 *   8. the model drops a revision whose record no lane holds: case 8 goes red;
 *   9. the left-out plan lines never said: case 9 goes red;
 *  10. the planned states that no trajectory names never said: case 10 goes red;
 *  11. the baseline-only count read as exactly one revision and one baseline: case 11 goes red.
 */

import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { PROJECT_GRAPH_SAYS, type ProjectGraphReply } from '../src/shared/project-graph.ts'
import {
  buildProjectGraph,
  marksAtLevel,
  type GraphLane,
  type ProjectGraphModel,
} from '../src/web/components/graph/project-graph-model.ts'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
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
  workspace = `project-graph-case-${String(caseNumber)}`
  const made = await app.inject({ method: 'POST', url: '/api/workspaces', payload: { id: workspace, title: 'Project graph' } })
  expect(made.statusCode, made.body).toBe(201)
})

/** File one record through the route and hand back its id. A decision says it replaces none, as the door requires. */
async function file(kind: string, title: string, data: Record<string, unknown>): Promise<string> {
  const withReplaces = kind === 'decision' && !Object.hasOwn(data, 'replaces') ? { replaces: [], ...data } : data
  const res = await app.inject({ method: 'POST', url: '/api/records', headers: human(), payload: { kind, title, data: withReplaces } })
  expect(res.statusCode, res.body).toBe(201)
  return (res.json() as { record: { id: string } }).record.id
}

/** File a block through its pipeline, the one door a block has, and hand back its id. */
async function block(pipeline: string, name: string): Promise<string> {
  const res = await app.inject({
    method: 'POST',
    url: `/api/records/${pipeline}/blocks`,
    headers: human(),
    payload: { name, state: 'doing' },
  })
  expect(res.statusCode, res.body).toBe(201)
  return (res.json() as { record: { id: string } }).record.id
}

async function link(fromId: string, toId: string, type: string): Promise<void> {
  const res = await app.inject({ method: 'POST', url: '/api/links', headers: human(), payload: { fromId, toId, type } })
  expect(res.statusCode, res.body).toBe(201)
}

async function patch(id: string, dataPatch: Record<string, unknown>): Promise<void> {
  const res = await app.inject({ method: 'PATCH', url: `/api/records/${id}`, headers: human(), payload: { dataPatch } })
  expect(res.statusCode, res.body).toBe(200)
}

/** Read the graph through its route. */
async function graph(): Promise<ProjectGraphReply> {
  const res = await app.inject({ method: 'GET', url: '/api/project-graph', headers: human() })
  expect(res.statusCode, res.body).toBe(200)
  return res.json() as ProjectGraphReply
}

const idSet = (list: ReadonlyArray<{ id: string }>): Set<string> => new Set(list.map((one) => one.id))

/** The lane of one module, found by the module's id. */
const laneOf = (model: ProjectGraphModel, moduleId: string): GraphLane | undefined =>
  model.lanes.find((lane) => lane.module.id === moduleId)

/** How many records the table holds, deleted or not. */
function recordsStored(): number {
  return (t.client.sqlite.prepare('SELECT count(*) AS n FROM records').get() as { n: number }).n
}

const WORDS = {
  firstState: 'Made-up: the gripper closes on a 40 mm part.',
  secondState: 'Made-up: the reach envelope is measured.',
  doing: 'Made-up: wiring the second camera.',
  next: 'Made-up: calibrate the second camera.',
}

/** The project the header describes, filed through the routes, with the ids of what was filed. */
async function aProject(): Promise<{
  moduleA: string
  moduleB: string
  pipeline: string
  blockA: string
  blockB: string
  trajectory: string
  firstState: string
  secondState: string
  stop: string
}> {
  const moduleA = await file('module', 'Made-up gripper module', { context: 'Made-up: the gripper has to hold a part.', parts: [] })
  const moduleB = await file('module', 'Made-up camera module', { context: 'Made-up: the camera has to see the hand.', parts: [] })
  const pipeline = await file('pipeline', 'Made-up perception pipeline', { blockIds: [] })
  const blockA = await block(pipeline, 'Made-up segmentation')
  const blockB = await block(pipeline, 'Made-up grasp')
  await link(moduleA, blockA, 'implements')
  await link(moduleA, blockB, 'implements')

  const firstState = await file('planned_state', 'Made-up closed gripper', { what: WORDS.firstState })
  const secondState = await file('planned_state', 'Made-up measured reach', { what: WORDS.secondState })
  const trajectory = await file('trajectory', 'Made-up clamp, then reach', {
    plannedStateIds: [firstState, secondState],
    because: 'Made-up: the gripper has to be right before the reach means anything.',
  })
  await link(trajectory, moduleA, 'plans_for')

  const stop = await file('stopping_point', 'Made-up stop on the gripper', { doing: WORDS.doing, next: WORDS.next })
  await link(stop, moduleA, 'about')

  await file('proposal', 'Made-up proposal', {
    question: 'Made-up: should the gripper close faster?',
    options: ['Made-up: yes, by a third.', 'Made-up: no, keep it as it is.'],
  })
  await file('decision', 'Made-up decision', {})
  return { moduleA, moduleB, pipeline, blockA, blockB, trajectory, firstState, secondState, stop }
}

describe("the project graph's read", () => {
  it('1. reads the modules, the pipeline, the blocks and the module that carries each', async () => {
    const made = await aProject()
    const reply = await graph()

    // RECORDS MADE IN ONE SECOND COME BY ID, as every list of records does, so these two lists are compared as sets.
    expect(idSet(reply.modules)).toEqual(new Set([made.moduleA, made.moduleB]))
    expect(reply.modules.map((one) => one.parentId)).toEqual([null, null])
    expect(reply.pipelines.map((one) => one.id)).toEqual([made.pipeline])
    // A PIPELINE'S BLOCKS ARE IN THE ORDER IT STORES THEM.
    expect(reply.pipelines[0]?.blockIds).toEqual([made.blockA, made.blockB])
    expect(reply.pipelines[0]?.parentId).toBe(made.moduleA)
    expect(idSet(reply.blocks)).toEqual(new Set([made.blockA, made.blockB]))
    for (const one of reply.blocks) {
      expect(one.parentId, one.id).toBe(made.moduleA)
      expect(one.carriedBy, one.id).toEqual([made.moduleA])
    }

    // THE MODEL PUTS THEM IN THE FIRST MODULE'S LANE, and nothing is left outside a lane.
    const model = buildProjectGraph(reply)
    const laneA = laneOf(model, made.moduleA)
    const laneB = laneOf(model, made.moduleB)
    expect(idSet(laneA?.blocks ?? [])).toEqual(new Set([made.blockA, made.blockB]))
    expect(laneA?.pipelines.map((one) => one.id)).toEqual([made.pipeline])
    expect(laneB?.blocks).toEqual([])
    expect(model.unattached.blocks).toEqual([])
    expect(model.unattached.pipelines).toEqual([])
  })

  it("2. reads the trajectory's planned states in their stored order, and its target", async () => {
    const made = await aProject()
    const reply = await graph()

    expect(reply.futures.map((one) => one.id)).toEqual([made.trajectory])
    const [future] = reply.futures
    expect(future?.kind).toBe('trajectory')
    expect(future?.targetId).toBe(made.moduleA)
    expect(future?.states.map((one) => one.id)).toEqual([made.firstState, made.secondState])
    expect(future?.states.map((one) => one.what)).toEqual([WORDS.firstState, WORDS.secondState])
    expect(reply.counts.plannedStates).toBe(2)
    expect(laneOf(buildProjectGraph(reply), made.moduleA)?.futures.map((one) => one.id)).toEqual([made.trajectory])
  })

  it('3. reads the stopping point with what it is about, and its doing and next words', async () => {
    const made = await aProject()
    const reply = await graph()

    expect(reply.checkpoints).toHaveLength(1)
    const [stop] = reply.checkpoints
    expect(stop?.id).toBe(made.stop)
    expect(stop?.aboutIds).toEqual([made.moduleA])
    expect(stop?.doing).toBe(WORDS.doing)
    expect(stop?.next).toBe(WORDS.next)
    expect(laneOf(buildProjectGraph(reply), made.moduleA)?.checkpoints.map((one) => one.id)).toEqual([made.stop])
  })

  it('4. counts a changed record as real history, and a record only created as real too', async () => {
    const made = await aProject()
    await patch(made.moduleA, { context: 'Made-up: the gripper has to hold a part without slipping.' })
    await patch(made.trajectory, { because: 'Made-up: the reach means nothing until the gripper holds.' })
    const reply = await graph()

    const summaryOf = (id: string) => reply.revisions.summaries.find((one) => one.recordId === id)
    for (const changed of [made.moduleA, made.trajectory]) {
      expect(summaryOf(changed)?.real, changed).toBeGreaterThan(1)
      expect(summaryOf(changed)?.baselineOnly, changed).toBe(false)
    }
    // CREATED AND NEVER CHANGED: one revision, and it is real.
    expect(summaryOf(made.moduleB)).toMatchObject({ versions: 1, baselines: 0, real: 1, baselineOnly: false })
    expect(reply.revisions.entries.filter((one) => one.recordId === made.moduleA).length).toBeGreaterThan(1)
    expect(reply.counts.realRevisions).toBeGreaterThan(0)
    expect(buildProjectGraph(reply).sparsePast).toBe(false)
  })

  it('5. says a past of migration baselines in words, and returns no real revision', async () => {
    await aProject()
    t.client.sqlite.prepare("UPDATE revisions SET op = 'baseline' WHERE workspace_id = ?").run(workspace)
    const reply = await graph()

    expect(reply.counts.revisions).toBeGreaterThan(0)
    expect(reply.counts.realRevisions).toBe(0)
    expect(reply.revisions.entries).toEqual([])
    expect(reply.revisions.summaries.every((one) => one.real === 0)).toBe(true)
    expect(reply.says).toContain(PROJECT_GRAPH_SAYS.pastIsABaseline(reply.counts.revisions))
    const model = buildProjectGraph(reply)
    expect(model.sparsePast).toBe(true)
    expect(marksAtLevel(model, 'revisionsAndCheckpoints').revisions).toBe(0)
  })

  it('6. answers a project with nothing in it with empty lists, and says it is empty', async () => {
    const reply = await graph()

    expect(reply.workspaceId).toBe(workspace)
    for (const list of [
      reply.modules,
      reply.pipelines,
      reply.blocks,
      reply.checkpoints,
      reply.futures,
      reply.plans,
      reply.windows,
      reply.allocations,
      reply.links,
      reply.revisions.entries,
    ]) {
      expect(list).toEqual([])
    }
    expect(reply.says).toContain(PROJECT_GRAPH_SAYS.empty())
    expect(buildProjectGraph(reply).empty).toBe(true)
  })

  it('7. reads without writing, has no write door, and refuses a query word', async () => {
    await aProject()
    const before = recordsStored()
    await graph()
    await graph()
    expect(recordsStored()).toBe(before)

    for (const method of ['POST', 'PUT', 'PATCH', 'DELETE'] as const) {
      const refused = await app.inject({ method, url: '/api/project-graph', headers: human(), payload: {} })
      expect(refused.statusCode, `${method}: ${refused.body}`).toBe(404)
    }
    const asked = await app.inject({ method: 'GET', url: '/api/project-graph?level=summaries', headers: human() })
    expect(asked.statusCode, asked.body).toBe(400)
    expect(recordsStored()).toBe(before)
  })

  it('8. keeps the real revisions of a direction no lane holds, and counts them at the second level', async () => {
    await aProject()
    const direction = await file('direction', 'Made-up loose direction', { depth: 'noticed' })
    await patch(direction, { depth: 'read' })
    const reply = await graph()

    const its = reply.revisions.entries.filter((one) => one.recordId === direction)
    expect(its.length).toBeGreaterThan(1)
    const model = buildProjectGraph(reply)
    expect(model.unattached.futures.map((one) => one.id)).toEqual([direction])
    expect(model.unattached.revisions.entries.filter((one) => one.recordId === direction)).toEqual(its)
    expect(model.unattached.revisions.summaries.map((one) => one.recordId)).toContain(direction)
    // EVERY REAL REVISION THE REPLY HOLDS IS DRAWN, in a lane or outside every lane.
    expect(marksAtLevel(model, 'revisionsAndCheckpoints').revisions).toBe(reply.revisions.entries.length)
  })

  it('9. returns a plan with its line about a graph record, and counts its other line', async () => {
    const made = await aProject()
    const planned = await app.inject({
      method: 'POST',
      url: '/api/plans',
      headers: human(),
      payload: { title: 'Made-up plan', body: 'Made-up wrist direction\nMade-up line about nothing yet' },
    })
    expect(planned.statusCode, planned.body).toBe(201)
    const { plan, lines } = planned.json() as { plan: { id: string }; lines: Array<{ id: string }> }
    expect(lines).toHaveLength(2)
    const filed = await app.inject({
      method: 'POST',
      url: `/api/plans/${plan.id}/lines/${lines[0]?.id ?? ''}/file-as-work`,
      headers: human(),
      payload: { kind: 'direction', workspaceId: workspace, data: { depth: 'noticed' } },
    })
    expect(filed.statusCode, filed.body).toBe(201)
    const reply = await graph()

    const directions = reply.futures.filter((one) => one.kind === 'direction').map((one) => one.id)
    expect(directions).toHaveLength(1)
    expect(directions).not.toContain(made.trajectory)
    expect(reply.plans.map((one) => one.id)).toEqual([plan.id])
    expect(reply.plans[0]?.lines.map((one) => one.id)).toEqual([lines[0]?.id])
    expect(reply.plans[0]?.lines.map((one) => one.recordId)).toEqual(directions)
    expect(reply.says).toContain(PROJECT_GRAPH_SAYS.planLinesLeftOut(1))
  })

  it('10. says how many planned states no trajectory names', async () => {
    await aProject()
    await file('planned_state', 'Made-up loose state', { what: 'Made-up: a state nobody has planned a way to.' })
    const reply = await graph()

    expect(reply.counts.plannedStates).toBe(2)
    expect(reply.says).toContain(PROJECT_GRAPH_SAYS.statesWithoutAFuture(1))
  })

  it('12. says whether the project has a source index, and says it cannot tell when the stored index data is damaged', async () => {
    const before = await graph()
    expect(before.sourceIndexBuilt, 'a project with no source index says so').toBe(false)

    const rebuilt = await app.inject({ method: 'POST', url: '/api/source/reindex', headers: human(), payload: {} })
    expect(rebuilt.statusCode, rebuilt.body).toBe(200)

    const after = await graph()
    expect(after.sourceIndexBuilt, 'the project has one after a rebuild').toBe(true)

    t.client.sqlite
      .prepare("UPDATE source_index SET skipped = 'not the stored list' WHERE workspace_id = ?")
      .run(workspace)
    const damaged = await graph()
    expect(damaged.sourceIndexBuilt, 'an unreadable index is not a project with no index').toBeNull()
  }, 60_000)

  it('11. calls a record baseline-only when every one of its revisions is a baseline, not only one', async () => {
    const made = await aProject()
    // A second revision, then both of them marked as the migration's baseline. The record's real history is none.
    await patch(made.moduleA, { context: 'Made-up: the gripper has to hold a part without slipping.' })
    t.client.sqlite
      .prepare("UPDATE revisions SET op = 'baseline' WHERE workspace_id = ? AND record_id = ?")
      .run(workspace, made.moduleA)
    const reply = await graph()

    const summary = reply.revisions.summaries.find((one) => one.recordId === made.moduleA)
    expect(summary).toMatchObject({ versions: 2, baselines: 2, real: 0, baselineOnly: true })
    expect(reply.revisions.baselineOnlyRecords, 'the record is the only record whose every revision is a baseline').toBe(1)
    expect(reply.says).toContain(PROJECT_GRAPH_SAYS.someRecordsOnlyABaseline(1))
  })
})
