// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A BIG PIECE OF WORK IS PLANNED, QUESTIONED BY ITS PLANNER AND SUBMITTED. Wave 13j round 49, on the flow
 * for planning a big piece of work.
 *
 * WHAT THIS FILE PROVES, in its own empty office with made-up records:
 *   1. The plan-step-done door refuses, with its code and with nothing written, a record that is not a module, a module
 *      with no planner, a caller who is not the planner, a request with no run, a module with no pipeline, a pipeline
 *      that is not the module's and a checklist that is not the planner's.
 *   2. The planner's plan step files a planning flow run about the module, puts an item on the planner's own
 *      checklist, sends the planner one waking message with the four questions, and records module.planning. The
 *      run's own flow run is still the one `theFlowRunOf` finds.
 *   3. A second plan step while the first waits is refused.
 *   4. module.planning is written only by the planning doors.
 *   5. Another agent may not tick the planning item.
 *   6. Submitting records that the plan was questioned, when and the answers, ends the flow run and ticks the item.
 *   7. The person may tick the item by hand instead, and that is recorded on the module and in the flow run.
 *
 * WHERE THE RULES LIVE: src/server/lib/planning-flow.ts, src/server/api/planning-flow.ts, src/shared/planning-flow.ts,
 * the guard `refuseAPlanningOutsideItsDoors` in src/server/lib/records.ts, and the hand-tick hook in
 * `changeAnItem` (src/server/lib/checklists.ts).
 *
 * PROVED BY CHAPTER 5'S THREE RUNS. CONTROL: 8 passed. Each mutation below, alone, turned the named cases red, and
 * was restored; RESTORE: 8 passed.
 *   M1. the guard on module.planning returns at once: cases 4, 5 and 6 go red.
 *   M2. `theFlowRunOf` no longer leaves planning flow runs out: case 7 goes red.
 *   M3. `changeAnItem` does not run the hand-tick write: case 7 goes red.
 *   M4. anybody may tick the planning item: cases 5 and 6 go red.
 *   M5. the prompt's notice is QUIET in the notices table: case 2 goes red.
 *   M6. the submit door does not set the item to done: case 6 goes red.
 *   M7. a pipeline that is not the module's is taken as its first pipeline: cases 1 and 2 go red.
 */

import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import type { RecordKind } from '../src/shared/types.ts'
import { NO_PLANNING_FLOW_RECORD, PLAN_QUESTIONS, PLAN_QUESTION_KEYS, PLANNING_FLOW_CODE } from '../src/shared/planning-flow.ts'

let t: TestDb
let app: FastifyInstance
let flowRuns: typeof import('../src/server/lib/flow-runs.ts')
let notices: typeof import('../src/server/lib/notices.ts')

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
  againstHisDecisions: 'Test answer: no decision of the person is crossed.',
  alreadyDone: 'Test answer: step 2 was done in an earlier round and is out.',
  localFix: 'Test answer: no, every step serves the goal.',
  leastSure: 'Test answer: step 4.',
}

async function call(method: 'GET' | 'POST' | 'PATCH', url: string, headers: Record<string, string>, payload?: unknown): Promise<{ status: number; body: Record<string, any> }> {
  const r = await app.inject({ method, url, headers, ...(payload === undefined ? {} : { payload: payload as object }) })
  return { status: r.statusCode, body: JSON.parse(r.body) as Record<string, any> }
}

function make(kind: RecordKind, title: string, data: Record<string, unknown>): string {
  return t.api.createRecord({ workspaceId: 'default', kind, title, data, actor: THE_PERSON }).id
}

function link(fromId: string, toId: string): void {
  t.api.createLink({ fromId, toId, type: 'relates_to', actor: THE_PERSON })
}

function dataOf(id: string): Record<string, any> {
  const row = t.client.sqlite.prepare('SELECT data FROM records WHERE id = ?').get(id) as { data: string }
  return JSON.parse(row.data) as Record<string, any>
}

function versionCount(id: string): number {
  return (t.client.sqlite.prepare('SELECT count(*) AS n FROM revisions WHERE record_id = ?').get(id) as { n: number }).n
}

function planningFlowRuns(): Array<{ id: string; data: Record<string, any> }> {
  return (
    t.client.sqlite.prepare("SELECT id, data FROM records WHERE kind = 'flow_run' AND json_extract(data, '$.module') IS NOT NULL ORDER BY created_at, id").all() as Array<{
      id: string
      data: string
    }>
  ).map((row) => ({ id: row.id, data: JSON.parse(row.data) as Record<string, any> }))
}

function checklistsOf(handle: string): number {
  return (
    t.client.sqlite.prepare("SELECT count(*) AS n FROM records WHERE kind = 'checklist' AND json_extract(data, '$.owner.id') = ?").get(idOf[handle]) as { n: number }
  ).n
}

/** A module with a planner, and a pipeline linked to it. */
function aModuleWithAPipeline(title: string, planner: string | null): { module: string; pipeline: string } {
  const module = make('module', title, { state: 'active', ...(planner === null ? {} : { planner: { kind: 'agent', id: idOf[planner]! } }) })
  const pipeline = make('pipeline', `Test pipeline for ${title}`, { blockIds: [] })
  link(pipeline, module)
  return { module, pipeline }
}

beforeAll(async () => {
  process.env.MOLE_OFFICE_BROADCAST_TIMES = '07:00,18:00'
  process.env.MOLE_OFFICE_BROADCAST_REPORT_TEMPLATE = ''
  t = await freshDb()
  flowRuns = await import('../src/server/lib/flow-runs.ts')
  notices = await import('../src/server/lib/notices.ts')
  app = (await apiApp()).app
  await app.ready()
  for (const [handle, role] of [
    ['planner', 'worker'],
    ['other', 'worker'],
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

let first: { module: string; pipeline: string }
let firstStep: Record<string, any>

describe('1. the plan-step-done door refuses before it writes', () => {
  it('refuses each broken assumption with its code, and writes nothing', async () => {
    first = aModuleWithAPipeline('Test module: export pipeline', 'planner')
    const bare = make('module', 'Test module: nobody plans it', { state: 'active' })
    const noPipeline = make('module', 'Test module: no pipeline', { state: 'active', planner: { kind: 'agent', id: idOf.planner! } })
    const strayPipeline = make('pipeline', 'Test pipeline: not linked', { blockIds: [] })
    const notAModule = make('note', 'Test note', { body: 'Test: not a module.' })
    const othersChecklist = await call('POST', '/api/checklists', asAgent('other'), { title: "Test: other's checklist" })
    expect(othersChecklist.status, JSON.stringify(othersChecklist.body)).toBe(201)

    const step = (module: string, headers: Record<string, string>, body: object) => call('POST', `/api/modules/${module}/plan-step-done`, headers, body)
    const cases: Array<[Awaited<ReturnType<typeof step>>, number, string]> = [
      [await step(notAModule, asAgent('planner', runOf.planner), { pipeline: first.pipeline }), 409, 'planNotAModule'],
      [await step(bare, asAgent('planner', runOf.planner), { pipeline: first.pipeline }), 409, 'planModuleNamesNoPlanner'],
      [await step(first.module, asAgent('other', runOf.other), { pipeline: first.pipeline }), 403, 'planCallerIsNotThePlanner'],
      [await step(first.module, asPerson, { pipeline: first.pipeline }), 403, 'planCallerIsNotThePlanner'],
      [await step(first.module, asAgent('planner'), { pipeline: first.pipeline }), 400, 'planNeedsARun'],
      [await step(noPipeline, asAgent('planner', runOf.planner), { pipeline: first.pipeline }), 409, 'planModuleHasNoPipeline'],
      [await step(first.module, asAgent('planner', runOf.planner), { pipeline: strayPipeline }), 409, 'planPipelineNotTheModules'],
      [
        await step(first.module, asAgent('planner', runOf.planner), { pipeline: first.pipeline, checklist: othersChecklist.body['checklist'].id }),
        409,
        'planChecklistNotThePlanners',
      ],
    ]
    for (const [reply, status, code] of cases) {
      expect(reply.status, JSON.stringify(reply.body)).toBe(status)
      expect(reply.body['code']).toBe(code)
    }
    expect(versionCount(first.module)).toBe(1)
    expect(dataOf(first.module)['planning']).toBeUndefined()
    expect(planningFlowRuns()).toEqual([])
    expect(checklistsOf('planner')).toBe(0)
  })

  it('a pipeline that holds a record linked to the module counts as the module\'s', async () => {
    const module = make('module', 'Test module: through a block', { state: 'active', planner: { kind: 'agent', id: idOf.planner! } })
    const pipeline = make('pipeline', 'Test pipeline: holds the block', { blockIds: [] })
    const minted = await call('POST', `/api/records/${pipeline}/blocks`, asPerson, { name: 'Test block', state: 'todo' })
    expect(minted.status, JSON.stringify(minted.body)).toBe(201)
    const block = (dataOf(pipeline)['blockIds'] as string[])[0]!
    link(block, module)
    const lib = await import('../src/server/lib/planning-flow.ts')
    const records = await import('../src/server/lib/records.ts')
    expect(lib.thePipelinesOfAModule(records.getRecord(module)!).map((one) => one.id)).toEqual([pipeline])
  })
})

describe('2. the plan step is done', () => {
  it('files the flow run, puts the item, sends the waking prompt and records the planning', async () => {
    const reply = await call('POST', `/api/modules/${first.module}/plan-step-done`, asAgent('planner', runOf.planner), { pipeline: first.pipeline })
    expect(reply.status, JSON.stringify(reply.body)).toBe(201)
    firstStep = reply.body

    // THE FLOW RUN: about the module, in the planner's run, naming no flow because no flow record says it is governed.
    const [flowRun] = planningFlowRuns()
    expect(flowRun?.id).toBe(firstStep['flowRun'].id)
    expect(flowRun?.data['module']).toBe(first.module)
    expect(flowRun?.data['run']).toBe(runOf.planner)
    expect(flowRun?.data['noFlow']).toBe(NO_PLANNING_FLOW_RECORD)
    expect(flowRun?.data['stepsTaken'].map((step: { how: string }) => step.how)).toEqual(['by an agent', 'by the office'])

    // THE ITEM, on a checklist the office made for the planner, who owns it.
    expect(checklistsOf('planner')).toBe(1)
    const checklist = await call('GET', `/api/checklists/${firstStep['checklist'].id}`, asAgent('planner'))
    expect(checklist.body['checklist'].owner).toEqual({ kind: 'agent', id: idOf.planner })
    const item = checklist.body['checklist'].items[0]
    expect(item.state).toBe('open')
    expect(item.links).toEqual([first.module, first.pipeline, flowRun?.id])

    // THE PROMPT: one message to the planner alone, that wakes, with the four questions in order and the door.
    const prompt = dataOf(firstStep['prompt'].id)
    expect(prompt['to']).toEqual([{ kind: 'agent', id: idOf.planner }])
    expect(prompt['notice']).toBe('questionThePlan')
    expect(notices.NOTICES.questionThePlan.wakes).toBe(true)
    const said = String(prompt['saidInFull'])
    let from = 0
    for (const key of PLAN_QUESTION_KEYS) {
      const at = said.indexOf(PLAN_QUESTIONS[key], from)
      expect(at, key).toBeGreaterThan(from - 1)
      from = at
    }
    expect(said).toContain(`POST /api/modules/${first.module}/plan`)

    // THE PLANNING ON THE MODULE.
    expect(dataOf(first.module)['planning']).toMatchObject({
      pipeline: first.pipeline,
      flowRun: flowRun?.id,
      planStepDoneBy: { kind: 'agent', id: idOf.planner },
      prompt: firstStep['prompt'].id,
      checklistItem: { checklist: firstStep['checklist'].id, item: item.id },
    })

    // THE RUN'S OWN FLOW RUN is still the one found by the run's id.
    const own = flowRuns.theFlowRunOf(runOf.planner!)
    expect(own).not.toBeNull()
    expect(own?.id).not.toBe(flowRun?.id)
    expect(dataOf(own!.id)['module']).toBeUndefined()
  })

  it('3. a second plan step while the first waits is refused', async () => {
    const again = await call('POST', `/api/modules/${first.module}/plan-step-done`, asAgent('planner', runOf.planner), { pipeline: first.pipeline })
    expect(again.status, JSON.stringify(again.body)).toBe(409)
    expect(again.body['code']).toBe('planStepAlreadyDone')
    expect(planningFlowRuns()).toHaveLength(1)
  })
})

describe('4. module.planning is written only by the planning doors', () => {
  it('refuses a patch that sets, changes or drops it, and a new module that brings one', async () => {
    const before = versionCount(first.module)
    for (const planning of [null, { ...dataOf(first.module)['planning'], pipeline: 'made-up' }]) {
      const patched = await call('PATCH', `/api/records/${first.module}`, asPerson, { dataPatch: { planning } })
      expect(patched.status, JSON.stringify(patched.body)).toBe(403)
      expect(patched.body['code']).toBe('planWrittenOutsideItsDoors')
    }
    const made = await call('POST', '/api/records', asPerson, {
      kind: 'module',
      title: 'Test module: brings its own planning',
      data: { state: 'active', planning: dataOf(first.module)['planning'] },
    })
    expect(made.status, JSON.stringify(made.body)).toBe(403)
    expect(made.body['code']).toBe('planWrittenOutsideItsDoors')
    // AN ORDINARY CHANGE THAT LEAVES IT AS IT IS PASSES.
    expect(versionCount(first.module)).toBe(before)
    const ordinary = await call('PATCH', `/api/records/${first.module}`, asPerson, { title: 'Test module: export pipeline, renamed' })
    expect(ordinary.status, JSON.stringify(ordinary.body)).toBeLessThan(300)
    expect(dataOf(first.module)['planning'].pipeline).toBe(first.pipeline)
  })
})

describe('5 and 6. ticking and submitting', () => {
  it('5. another agent may not tick the planning item', async () => {
    const { checklist, item } = dataOf(first.module)['planning'].checklistItem
    const ticked = await call('PATCH', `/api/checklists/${checklist}/items/${item}`, asAgent('other', runOf.other), {
      state: 'done',
      addEvidence: [{ kind: 'run', record: runOf.other }],
    })
    expect(ticked.status, JSON.stringify(ticked.body)).toBe(403)
    expect(ticked.body['code']).toBe('planItemTickedByAnother')
    expect(dataOf(checklist)['items'][0].state).toBe('open')
  })

  // ROUND 52b, CHECK pgPCts6JVPZ9: the planning item is found from the item as stored, so replacing its links hides
  // nothing, and until the planning ends nobody but the person or the planner changes the item at all. Control green
  // (named-tests-2026-10-11T07-00-22-326). Red when `changeAnItem` hands the guard the item as changed (07-00-49-148),
  // and red alone when `aPlanningItemChangedByHand` lets another's change that is not a tick through (07-01-32-822).
  // Restore green (07-01-50-377).
  it('5b. another agent may not tick it by replacing its links, nor change it in any other way', async () => {
    const { checklist, item } = dataOf(first.module)['planning'].checklistItem
    const stored = dataOf(checklist)['items'][0]
    const url = `/api/checklists/${checklist}/items/${item}`
    const ticked = await call('PATCH', url, asAgent('other', runOf.other), { state: 'done', addEvidence: [{ kind: 'run', record: runOf.other }], links: [] })
    expect(ticked.status, JSON.stringify(ticked.body)).toBe(403)
    expect(ticked.body['code']).toBe('planItemTickedByAnother')
    for (const payload of [{ links: [] }, { words: 'Test: words another agent wrote' }, { state: 'in progress' }]) {
      const changed = await call('PATCH', url, asAgent('other', runOf.other), payload)
      expect(changed.status, JSON.stringify(changed.body)).toBe(403)
      expect(changed.body['code']).toBe('flowItemChangedByAnother')
    }
    expect(dataOf(checklist)['items'][0]).toEqual(stored)
    expect(dataOf(first.module)['planning'].ended).toBeUndefined()
  })

  it('6. submitting records the questioned plan, ends the flow run and ticks the item', async () => {
    const wrong = await call('POST', `/api/modules/${first.module}/plan`, asAgent('other', runOf.other), { answers: ANSWERS })
    expect(wrong.status).toBe(403)
    expect(wrong.body['code']).toBe('planCallerIsNotThePlanner')
    const short = await call('POST', `/api/modules/${first.module}/plan`, asAgent('planner', runOf.planner), { answers: { ...ANSWERS, leastSure: ' ' } })
    expect(short.status, JSON.stringify(short.body)).toBe(400)
    expect(dataOf(first.module)['planning'].questioned).toBeUndefined()

    const done = await call('POST', `/api/modules/${first.module}/plan`, asAgent('planner', runOf.planner), { answers: ANSWERS })
    expect(done.status, JSON.stringify(done.body)).toBe(200)
    const planning = dataOf(first.module)['planning']
    expect(planning.questioned).toMatchObject({ by: { kind: 'agent', id: idOf.planner }, answers: ANSWERS })
    expect(planning.questioned.at).toMatch(/^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d$/)
    expect(planning.ended).toMatchObject({ how: 'submitted', by: { kind: 'agent', id: idOf.planner } })

    const item = dataOf(planning.checklistItem.checklist)['items'][0]
    expect(item.state).toBe('done')
    expect(item.evidence).toEqual([{ kind: 'run', record: runOf.planner }])

    const steps = dataOf(planning.flowRun)['stepsTaken'] as Array<{ how: string; outcome: string }>
    expect(steps.map((step) => [step.how, step.outcome])).toEqual([
      ['by an agent', 'done'],
      ['by the office', 'done'],
      ['by an agent', 'done'],
      ['by the office', 'done'],
    ])

    const again = await call('POST', `/api/modules/${first.module}/plan`, asAgent('planner', runOf.planner), { answers: ANSWERS })
    expect(again.status).toBe(409)
    expect(again.body['code']).toBe('planNotOpen')
  })
})

describe('7. the person ticks the item by hand', () => {
  it('ends the planning as ticked by hand, with the flow named, and the flow run says why', async () => {
    const source = make('note', 'Test note: stands for the decision', { body: 'Test: a made-up source.' })
    const flow = make('flow', 'Test flow: planning a big piece of work', {
      declared_in: 'Test: this file',
      runs: 'the planner and the office',
      trigger: 'Test: the planner says the plan step is done.',
      stages: [{ n: 1, does: 'Test: the planner writes the plan.', evidence: 'module.planning', why: 'Test: the plan lives in the module.', sources: [source] }],
      leaves_behind: 'Test: module.planning and a planning flow run',
      governed_by: PLANNING_FLOW_CODE,
    })
    const second = aModuleWithAPipeline('Test module: ticked by hand', 'planner')
    // A RUN WHOSE OWN FLOW RUN IS GONE: the planning flow run names it, and is still not taken for its own.
    const bare = make('session', 'Test run with no flow run of its own', { state: 'running', servingAgent: 'planner', doing: 'Test: planning' })
    t.client.sqlite.prepare("UPDATE records SET deleted_at = '2026-01-01 00:00:00' WHERE kind = 'flow_run' AND json_extract(data, '$.run') = ?").run(bare)
    const step = await call('POST', `/api/modules/${second.module}/plan-step-done`, asAgent('planner', bare), { pipeline: second.pipeline })
    expect(step.status, JSON.stringify(step.body)).toBe(201)
    expect(step.body['flowRun'].flow).toBe(flow)
    expect(step.body['checklist'].because).toBe("the planner's only checklist in this project")
    expect(dataOf(step.body['flowRun'].id)['run']).toBe(bare)
    expect(flowRuns.theFlowRunOf(bare)).toBeNull()

    const { checklist, item } = dataOf(second.module)['planning'].checklistItem
    const ticked = await call('PATCH', `/api/checklists/${checklist}/items/${item}`, asPerson, {
      state: 'done',
      addEvidence: [{ kind: 'run', record: runOf.planner }],
    })
    expect(ticked.status, JSON.stringify(ticked.body)).toBe(200)
    const planning = dataOf(second.module)['planning']
    expect(planning.questioned).toBeUndefined()
    expect(planning.ended).toMatchObject({ how: 'ticked by hand', by: { kind: 'person', id: THE_TEST_OFFICES_OWNER.id } })
    const last = (dataOf(planning.flowRun)['stepsTaken'] as Array<{ how: string; why?: string; actor: unknown }>).at(-1)
    expect(last?.how).toBe('by hand')
    expect(last?.why).toContain('ticked the checklist item')
    expect(last?.actor).toEqual({ kind: 'person', id: THE_TEST_OFFICES_OWNER.id })

    const submit = await call('POST', `/api/modules/${second.module}/plan`, asAgent('planner', runOf.planner), { answers: ANSWERS })
    expect(submit.body['code']).toBe('planNotOpen')
  })
})
