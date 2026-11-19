// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE PLANNING FLOW'S FIRST REAL USE FOUND SEVEN FAULTS. Wave 13j round 51, on wave 13v's round 19 (report
 * FRsTZ627KvQQ: module IukdaXOxB9y2, pipeline mAXB3bHJs3PP, flow run XfQvoIHrTsbG, checklist H6WHao8t_3xs).
 *
 * WHAT THIS FILE PROVES, in its own empty office with made-up records, one case per fault:
 *   1. A module's planner is named, changed or dropped only by the person, a secretary or the module's maker; anybody
 *      else is refused with plannerNamedByAnother and nothing is written.
 *   2. The pipeline's blocks door takes a block's `summary`.
 *   3. POST /api/records/<module>/parts adds an empty part, and the line door then takes lines on it.
 *   4. The plan step records the revisions of the module, the pipeline and its blocks; the submit records them again
 *      and which records changed. A submit that changed nothing is taken and says so.
 *   5. The planning flow run carries its own `ended`, on a submit and on a hand tick.
 *   6. The checklist the office makes for a planner names the office in its create row, not the planner's run.
 *   7. The run's own flow run still says the run named no flow. That is the trigger a decision holds back, from the
 *      idea "each run names its flow". This case pins that it is left as
 *      it is, while the planning flow's own run names the flow.
 *
 * PROVED BY CHAPTER 5'S THREE RUNS. CONTROL: 8 passed. Each mutation below, alone, turned the named cases red, and
 * was restored; RESTORE: 8 passed.
 *   M1. the planner guard returns at once: fault 1 goes red.
 *   M2. the blocks door no longer knows `summary`: fault 2 goes red.
 *   M3. the parts door takes a part id already used: fault 3 goes red.
 *   M4. the submit says no record changed, whatever the revisions say: the second case of fault 4 goes red.
 *   M5. the planning flow run is not given `ended`: fault 5 goes red.
 *   M6. the checklist is made by the planner's own request: fault 6 goes red.
 *   M7. the planning flow run names no flow: fault 7 goes red.
 *   M8. the plan step records the module's revision before its own write: the check after the write refuses the plan
 *       step, and faults 4, 5, 6 and 7 go red.
 *   M9. M8 with that check taken out: the submit that changed nothing names the module, and faults 4 and 5 go red.
 *
 * ROUND 53, after merge entry smMwq8ejDGtz was refused (check o5g9VQbvoy_9): the examples GET /api/kinds served for
 * revisionsAtPlanStep and revisionsAtSubmit said `id` in each block where the office writes `block`. The case "the
 * revisions it stored have the keys GET /api/kinds shows" compares the two. CONTROL: green. M10, either example put back
 * to `id`: that case goes red. RESTORE: green.
 */

import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import type { RecordKind } from '../src/shared/types.ts'
import { NO_FLOW_NAMED } from '../src/shared/flow-run.ts'
import { moleOffice } from '../src/shared/participants.ts'
import { PLANNING_FLOW_CODE } from '../src/shared/planning-flow.ts'

let t: TestDb
let app: FastifyInstance
let flowRuns: typeof import('../src/server/lib/flow-runs.ts')

const THE_PERSON = { type: 'human', id: THE_TEST_OFFICES_OWNER.id } as const
const asPerson = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id,
}
const asAgent = (handle: string, session?: string): Record<string, string> => ({
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': handle,
  ...(session === undefined ? {} : { 'x-mole-office-session': session }),
})

const idOf: Record<string, string> = {}
const runOf: Record<string, string> = {}

const ANSWERS = {
  againstHisDecisions: 'Test answer: no decision of the person\'s is crossed.',
  alreadyDone: 'Test answer: nothing is done yet.',
  localFix: 'Test answer: no.',
  leastSure: 'Test answer: step 2.',
}

async function call(method: 'GET' | 'POST' | 'PATCH', url: string, headers: Record<string, string>, payload?: unknown): Promise<{ status: number; body: Record<string, any> }> {
  const r = await app.inject({ method, url, headers, ...(payload === undefined ? {} : { payload: payload as object }) })
  return { status: r.statusCode, body: JSON.parse(r.body) as Record<string, any> }
}

function make(kind: RecordKind, title: string, data: Record<string, unknown>): string {
  return t.api.createRecord({ workspaceId: 'default', kind, title, data, actor: THE_PERSON }).id
}

function dataOf(id: string): Record<string, any> {
  const row = t.client.sqlite.prepare('SELECT data FROM records WHERE id = ?').get(id) as { data: string }
  return JSON.parse(row.data) as Record<string, any>
}

function newestRevision(id: string): number {
  return (t.client.sqlite.prepare('SELECT max(seq) AS seq FROM revisions WHERE record_id = ?').get(id) as { seq: number }).seq
}

const plannerOf = (handle: string) => ({ kind: 'agent', id: idOf[handle]! })

/** A module the person made, naming the planner, with a pipeline that holds one block and is linked to the module. */
async function aPlannedModule(title: string): Promise<{ module: string; pipeline: string; block: string }> {
  const module = make('module', title, { state: 'active', planner: plannerOf('planner') })
  const pipeline = make('pipeline', `Test pipeline for ${title}`, { blockIds: [] })
  t.api.createLink({ fromId: pipeline, toId: module, type: 'relates_to', actor: THE_PERSON })
  const block = await call('POST', `/api/records/${pipeline}/blocks`, asPerson, { name: `Test step of ${title}`, state: 'todo' })
  expect(block.status, JSON.stringify(block.body)).toBe(201)
  return { module, pipeline, block: block.body['record'].id }
}

beforeAll(async () => {
  process.env.MOLE_OFFICE_BROADCAST_TIMES = '07:00,18:00'
  process.env.MOLE_OFFICE_BROADCAST_REPORT_TEMPLATE = ''
  t = await freshDb()
  flowRuns = await import('../src/server/lib/flow-runs.ts')
  app = (await apiApp()).app
  await app.ready()
  for (const [handle, role] of [
    ['planner', 'worker'],
    ['maker', 'worker'],
    ['other', 'worker'],
    ['clerk', 'secretary'],
  ] as const) {
    const r = await app.inject({ method: 'POST', url: '/api/agents/started', headers: asPerson, payload: { handle, name: handle, role } })
    expect(r.statusCode, r.body).toBe(201)
    idOf[handle] = (r.json() as { agent: { id: string } }).agent.id
    runOf[handle] = make('session', `Test run of ${handle}`, { state: 'running', servingAgent: handle, doing: 'Test: planning' })
  }
}, 60_000)

afterAll(async () => {
  await app?.close()
  t?.close()
})

describe('fault 1: who may name a planner', () => {
  it('refuses anybody but the person, a secretary and the maker, on set, change and drop', async () => {
    const theirs = await call('POST', '/api/records', asAgent('maker', runOf.maker), { kind: 'module', title: 'Test module: the maker made it', data: { state: 'active' } })
    expect(theirs.status, JSON.stringify(theirs.body)).toBe(201)
    const module = theirs.body['record'].id as string
    const patch = (handle: string | null, planner: unknown) =>
      call('PATCH', `/api/records/${module}`, handle === null ? asPerson : asAgent(handle, runOf[handle]), { dataPatch: { planner } })

    const set = await patch('other', plannerOf('other'))
    expect(set.status, JSON.stringify(set.body)).toBe(403)
    expect(set.body['code']).toBe('plannerNamedByAnother')
    expect(dataOf(module)['planner']).toBeUndefined()

    const byTheMaker = await patch('maker', plannerOf('planner'))
    expect(byTheMaker.status, JSON.stringify(byTheMaker.body)).toBe(200)
    expect(dataOf(module)['planner']).toEqual(plannerOf('planner'))

    for (const planner of [plannerOf('other'), null]) {
      const refused = await patch('other', planner)
      expect(refused.status, JSON.stringify(refused.body)).toBe(403)
      expect(refused.body['code']).toBe('plannerNamedByAnother')
    }
    expect(dataOf(module)['planner']).toEqual(plannerOf('planner'))

    // THE SAME VALUE SENT BACK IS NO NAMING, and an ordinary change by somebody else passes.
    const roundTrip = await call('PATCH', `/api/records/${module}`, asAgent('other', runOf.other), { title: 'Test module: renamed', dataPatch: { planner: plannerOf('planner') } })
    expect(roundTrip.status, JSON.stringify(roundTrip.body)).toBe(200)

    expect((await patch('clerk', plannerOf('maker'))).status).toBe(200)
    expect(dataOf(module)['planner']).toEqual(plannerOf('maker'))
    expect((await patch(null, plannerOf('planner'))).status).toBe(200)
    expect(dataOf(module)['planner']).toEqual(plannerOf('planner'))
  })
})

describe('fault 2: a block is filed with its summary', () => {
  it('takes summary on the blocks door, and refuses an empty one', async () => {
    const pipeline = make('pipeline', 'Test pipeline: blocks with summaries', { blockIds: [] })
    const filed = await call('POST', `/api/records/${pipeline}/blocks`, asPerson, { name: 'Test block with a summary', state: 'todo', summary: 'Test: what this step builds.' })
    expect(filed.status, JSON.stringify(filed.body)).toBe(201)
    expect(filed.body['record'].summary).toBe('Test: what this step builds.')
    const empty = await call('POST', `/api/records/${pipeline}/blocks`, asPerson, { name: 'Test block, empty summary', state: 'todo', summary: ' ' })
    expect(empty.status, JSON.stringify(empty.body)).toBe(400)
    expect(dataOf(pipeline)['blockIds']).toHaveLength(1)
  })
})

describe('fault 3: a part is added to a module', () => {
  it('adds an empty part, then takes lines on it, and refuses a part id already used', async () => {
    const module = make('module', 'Test module: a part is added', { state: 'active', parts: [{ id: 'work', name: 'Test: work', items: [] }] })
    const added = await call('POST', `/api/records/${module}/parts`, asAgent('other', runOf.other), { id: 'tool-plan', name: 'Test: the plan' })
    expect(added.status, JSON.stringify(added.body)).toBe(201)
    expect(added.body['part']).toEqual({ id: 'tool-plan', name: 'Test: the plan', items: [] })
    expect(dataOf(module)['parts'].map((part: { id: string }) => part.id)).toEqual(['work', 'tool-plan'])
    const line = await call('POST', `/api/records/${module}/checklist`, asAgent('other', runOf.other), { partId: 'tool-plan', id: 't-1', text: 'Test: step 1', state: 'todo' })
    expect(line.status, JSON.stringify(line.body)).toBe(201)

    const again = await call('POST', `/api/records/${module}/parts`, asAgent('other', runOf.other), { id: 'tool-plan', name: 'Test: again' })
    expect(again.status, JSON.stringify(again.body)).toBe(409)
    const note = make('note', 'Test note: not a module', { body: 'Test.' })
    expect((await call('POST', `/api/records/${note}/parts`, asPerson, { id: 'p', name: 'Test' })).status).toBe(400)
    const bare = make('module', 'Test module: no parts yet', { state: 'active' })
    expect((await call('POST', `/api/records/${bare}/parts`, asPerson, { id: 'first', name: 'Test: first part' })).status).toBe(201)
    expect(dataOf(bare)['parts']).toEqual([{ id: 'first', name: 'Test: first part', items: [] }])
  })
})

let unchanged: { module: string; pipeline: string; block: string }
let unchangedStep: Record<string, any>

describe('faults 4, 5 and 6: the plan step and the submit', () => {
  it('6. the checklist the office makes for the planner names the office in its create row', async () => {
    unchanged = await aPlannedModule('Test module: nothing revised')
    const step = await call('POST', `/api/modules/${unchanged.module}/plan-step-done`, asAgent('planner', runOf.planner), { pipeline: unchanged.pipeline })
    expect(step.status, JSON.stringify(step.body)).toBe(201)
    unchangedStep = step.body
    expect(step.body['checklist'].because).toContain('the office made one')
    const created = t.client.sqlite
      .prepare("SELECT actor_type AS actorType, actor_id AS actorId, session_id AS sessionId FROM changes WHERE record_id = ? AND op = 'create'")
      .get(step.body['checklist'].id) as { actorType: string; actorId: string; sessionId: string | null }
    expect(created).toEqual({ actorType: 'system', actorId: moleOffice().id, sessionId: null })
    expect(dataOf(step.body['checklist'].id)['owner']).toEqual(plannerOf('planner'))
  })

  it('4. the plan step records where the plan stood, and a submit that changed nothing is taken and says so', async () => {
    expect(dataOf(unchanged.module)['planning'].revisionsAtPlanStep).toEqual({
      module: newestRevision(unchanged.module),
      pipeline: newestRevision(unchanged.pipeline),
      blocks: [{ block: unchanged.block, seq: newestRevision(unchanged.block) }],
    })
    const done = await call('POST', `/api/modules/${unchanged.module}/plan`, asAgent('planner', runOf.planner), { answers: ANSWERS })
    expect(done.status, JSON.stringify(done.body)).toBe(200)
    const questioned = dataOf(unchanged.module)['planning'].questioned
    expect(questioned.revised).toEqual([])
    expect(questioned.revisionsAtSubmit).toEqual(dataOf(unchanged.module)['planning'].revisionsAtPlanStep)
    expect(done.body['says']).toContain('Nothing in the module, the pipeline or its blocks changed')
    const submitted = (dataOf(unchangedStep['flowRun'].id)['stepsTaken'] as Array<{ result?: string }>).at(-2)
    expect(submitted?.result).toContain('Nothing in the module, the pipeline or its blocks changed')
  })

  it('4. the revisions it stored have the keys GET /api/kinds shows in its examples, blocks included', async () => {
    const served = await call('GET', '/api/kinds/module', asPerson)
    expect(served.status, JSON.stringify(served.body).slice(0, 300)).toBe(200)
    const exampleOf = (shape: string, key: string): Record<string, any> =>
      (served.body['shapes'] as Array<{ name: string; fields: Array<{ key: string; example: Record<string, any> }> }>)
        .find((one) => one.name === shape)!.fields.find((one) => one.key === key)!.example
    const keysOf = (revisions: Record<string, any>) => ({ top: Object.keys(revisions).sort(), block: revisions['blocks'].map((one: object) => Object.keys(one).sort()) })
    const planning = dataOf(unchanged.module)['planning']
    expect(keysOf(planning.revisionsAtPlanStep)).toEqual(keysOf(exampleOf('ModulePlanning', 'revisionsAtPlanStep')))
    expect(keysOf(planning.questioned.revisionsAtSubmit)).toEqual(keysOf(exampleOf('PlanQuestioned', 'revisionsAtSubmit')))
  })

  it('4. a submit after the module, a block and the pipeline changed names each of them', async () => {
    const revisedPlan = await aPlannedModule('Test module: revised')
    const step = await call('POST', `/api/modules/${revisedPlan.module}/plan-step-done`, asAgent('planner', runOf.planner), { pipeline: revisedPlan.pipeline })
    expect(step.status, JSON.stringify(step.body)).toBe(201)
    expect((await call('PATCH', `/api/records/${revisedPlan.module}`, asAgent('planner', runOf.planner), { summary: 'Test: the plan, revised.' })).status).toBe(200)
    expect((await call('PATCH', `/api/records/${revisedPlan.block}`, asAgent('planner', runOf.planner), { summary: 'Test: step 1, revised.' })).status).toBe(200)
    const second = await call('POST', `/api/records/${revisedPlan.pipeline}/blocks`, asAgent('planner', runOf.planner), { name: 'Test: a step added', state: 'todo' })
    expect(second.status, JSON.stringify(second.body)).toBe(201)

    const done = await call('POST', `/api/modules/${revisedPlan.module}/plan`, asAgent('planner', runOf.planner), { answers: ANSWERS })
    expect(done.status, JSON.stringify(done.body)).toBe(200)
    expect(dataOf(revisedPlan.module)['planning'].questioned.revised).toEqual([revisedPlan.module, revisedPlan.pipeline, revisedPlan.block, second.body['record'].id])
    expect(done.body['says']).toContain("4 of the plan's records changed")
  })

  it('5. the planning flow run carries its own end, on a submit and on a hand tick', async () => {
    const flowRun = dataOf(unchangedStep['flowRun'].id)
    expect(flowRun['ended']).toEqual(dataOf(unchanged.module)['planning'].ended)
    expect(flowRun['ended']).toMatchObject({ how: 'submitted', by: plannerOf('planner') })

    const byHand = await aPlannedModule('Test module: ticked by hand')
    const step = await call('POST', `/api/modules/${byHand.module}/plan-step-done`, asAgent('planner', runOf.planner), { pipeline: byHand.pipeline })
    expect(step.status, JSON.stringify(step.body)).toBe(201)
    expect(dataOf(step.body['flowRun'].id)['ended']).toBeUndefined()
    const { checklist, item } = dataOf(byHand.module)['planning'].checklistItem
    const ticked = await call('PATCH', `/api/checklists/${checklist}/items/${item}`, asPerson, { state: 'done', addEvidence: [{ kind: 'run', record: runOf.planner }] })
    expect(ticked.status, JSON.stringify(ticked.body)).toBe(200)
    expect(dataOf(step.body['flowRun'].id)['ended']).toMatchObject({ how: 'ticked by hand', by: { kind: 'person', id: THE_TEST_OFFICES_OWNER.id } })
  })
})

describe('fault 7: the run names no flow, and that is the trigger held back', () => {
  it("leaves the run's own flow run as it is, while the planning flow run names its flow", async () => {
    const source = make('note', 'Test note: stands for the decision', { body: 'Test: a made-up source.' })
    const flow = make('flow', 'Test flow: planning', {
      declared_in: 'Test: this file',
      runs: 'the planner and the office',
      trigger: 'Test: the planner says the plan step is done.',
      stages: [{ n: 1, does: 'Test: the planner writes the plan.', evidence: 'module.planning', why: 'Test: the plan lives in the module.', sources: [source] }],
      leaves_behind: 'Test: module.planning and a planning flow run',
      governed_by: PLANNING_FLOW_CODE,
    })
    const plan = await aPlannedModule('Test module: the run names no flow')
    const step = await call('POST', `/api/modules/${plan.module}/plan-step-done`, asAgent('planner', runOf.planner), { pipeline: plan.pipeline })
    expect(step.status, JSON.stringify(step.body)).toBe(201)
    expect(dataOf(step.body['flowRun'].id)['flow']).toBe(flow)
    const own = flowRuns.theFlowRunOf(runOf.planner!)
    expect(dataOf(own!.id)['noFlow']).toBe(NO_FLOW_NAMED)
    expect(dataOf(own!.id)['flow']).toBeUndefined()
  })
})
