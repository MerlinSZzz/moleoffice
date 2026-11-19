// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * ANY FLOW AN AGENT ENTERS IS ON ITS CHECKLIST UNTIL IT IS DONE. The item is marked done when the flow is done,
 * from an event or by hand. This follows a decision and a message.
 * Wave 13j round 52.
 *
 * WHAT THIS FILE PROVES, in its own empty office with made-up records:
 *   1. POST /api/flows/<id>/enter files a flow run that names the flow, its revision and the run, and puts one item on
 *      the checklist of the agent the run serves. The office makes the checklist, and the item says the office put it.
 *      The run's own flow run is still the one the office finds for the run.
 *   2. The checklist's reading carries the flow the item stands for, and the checklists page draws it on the row.
 *   3. Done by an event: the run ends, and the office ticks the item with the run as evidence and ends the flow run.
 *      A seal ends a flow that ends on the seal, and leaves one that ends on the release open.
 *   4. Done by hand: the agent ticks it; the flow run says who and when. A person may enter a flow for an agent.
 *   5. Anybody else ticking the item is refused with flowItemTickedByAnother, and nothing is written. Round 52b: the
 *      flow is read from the item as stored, so a tick that replaces the links, or one after the link was taken away,
 *      is refused too; and any other change by anybody else is refused with flowItemChangedByAnother, field by field.
 *      The agent and the person still may, and the agent's tick that replaces the links still ends the flow.
 *   6. The door's refusals, each with its code, and nothing written by any of them.
 *
 * PROVED BY CHAPTER 5'S THREE RUNS (tools/run-named-tests.mjs, logs under .logs/, recorded on run 1mfb4K2k5q0s).
 * CONTROL: every case passed (named-tests-2026-10-11T05-59-09-776). Each mutation below, alone, turned the named cases
 * red, and was restored; RESTORE: every case passed (named-tests-2026-10-11T05-59-37-023).
 *   M1. `fileAnEnteredFlowRun` does not write `entered` on the flow run: cases 1 to 5 go red (05-57-10-992).
 *   M2. `theFlowRunOf` no longer leaves out an entered flow run: case 1 goes red (a run with no flow run of its own
 *       has the entered one taken for it) (05-59-27-786).
 *   M3. `endTheFlowsARunWasIn` returns at once: both cases of 3 go red (05-57-27-724).
 *   M4. `anItemOfAFlowTickedByHand` lets anybody tick: case 5 goes red, and so does case 3, whose item the other agent
 *       then ticked (05-57-36-974).
 *   M5. `theFlowsOnAChecklist` returns nothing: case 2 goes red, and so does case 3, which reads the ending there
 *       (05-57-45-927).
 *   M6. `enterAFlow` takes any caller for any run: case 6 goes red, on flowEnteredForAnother (05-57-54-664).
 *
 * ROUND 52b (check pgPCts6JVPZ9), recorded on run FDSx1w5iEC2O, this file with the planning file and the coded-refusals
 * file. CONTROL: all passed (named-tests-2026-10-11T07-00-22-326). RESTORE: all passed (07-01-50-377).
 *   MA. `changeAnItem` hands the guard the item as the change leaves it, which was round 52's fault: case 5's tick that
 *       replaces the links, the link taken away first, and the agent's tick that replaces the links go red; so do case
 *       3, whose item the other agent had unlinked, and the planning file's 5b and 6 (07-00-49-148).
 *   MB. `anItemOfAFlowChangedByHand` lets anybody else make a change that is not a tick: case 5's every-field case goes
 *       red on each field, and so do the link taken away first and case 3 (07-01-04-263). The guard does not look at
 *       which keys a change names, so one mutation reaches every field.
 */

import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { createElement } from 'react'
import { apiApp, freshDb, theOfficesOwnId, type TestDb } from './helpers.ts'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import type { RecordKind } from '../src/shared/types.ts'
import { ENTERED_STEP_DOES, OFFICE_STEP_DOES } from '../src/shared/flow-run.ts'
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
/** The office's own agent, read from this test office's row when it is used: a fresh office draws its id new each time. */
const office = () => ({ kind: 'agent', id: theOfficesOwnId(t) })
const agentRef = (handle: string) => ({ kind: 'agent', id: idOf[handle]! })

async function call(method: 'GET' | 'POST' | 'PATCH', url: string, headers: Record<string, string>, payload?: unknown): Promise<{ status: number; body: Record<string, any> }> {
  const r = await app.inject({ method, url, headers, ...(payload === undefined ? {} : { payload: payload as object }) })
  return { status: r.statusCode, body: JSON.parse(r.body) as Record<string, any> }
}

function make(kind: RecordKind, title: string, data: Record<string, unknown>, workspaceId = 'default'): string {
  return t.api.createRecord({ workspaceId, kind, title, data, actor: THE_PERSON }).id
}

function dataOf(id: string): Record<string, any> {
  const row = t.client.sqlite.prepare('SELECT data FROM records WHERE id = ?').get(id) as { data: string }
  return JSON.parse(row.data) as Record<string, any>
}

function countOf(kind: string): number {
  return (t.client.sqlite.prepare('SELECT count(*) AS n FROM records WHERE kind = ?').get(kind) as { n: number }).n
}

/** A made-up flow, with its one stage's reason and source, and the event that ends it when there is one. */
function aFlow(title: string, extra: Record<string, unknown>): string {
  const source = make('report', `Test source for ${title}`, { blocks: [] })
  return make('flow', title, {
    declared_in: 'a made-up flow of this test',
    runs: 'a made-up worker',
    trigger: 'A made-up piece of work is asked for.',
    stages: [{ n: 1, does: 'The made-up worker does the work.', evidence: 'a made-up commit', why: 'Without it the work is not done.', sources: [source] }],
    leaves_behind: 'a made-up commit',
    governed_by: 'this test file',
    reviewed_at: '2026-10-11',
    ...extra,
  })
}

function theItem(checklist: string, item: string): Record<string, any> {
  return (dataOf(checklist)['items'] as Array<Record<string, any>>).find((one) => one.id === item)!
}

beforeAll(async () => {
  process.env.MOLE_OFFICE_BROADCAST_TIMES = '07:00,18:00'
  process.env.MOLE_OFFICE_BROADCAST_REPORT_TEMPLATE = ''
  t = await freshDb()
  flowRuns = await import('../src/server/lib/flow-runs.ts')
  app = (await apiApp()).app
  await app.ready()
  for (const handle of ['worker', 'other', 'sealer'] as const) {
    const r = await app.inject({ method: 'POST', url: '/api/agents/started', headers: asPerson, payload: { handle, name: handle, role: 'worker' } })
    expect(r.statusCode, r.body).toBe(201)
    idOf[handle] = (r.json() as { agent: { id: string } }).agent.id
    runOf[handle] = make('session', `Test run of ${handle}`, { state: 'running', servingAgent: handle, doing: 'Test: entering flows' })
  }
}, 60_000)

afterAll(async () => {
  await app?.close()
  t?.close()
})

let ending: { flow: string; about: string; flowRun: string; checklist: string; item: string }

describe('1. entering a flow files a flow run and puts one item on the agent’s checklist', () => {
  it('names the flow, its revision and the run, and the office made the checklist and the item', async () => {
    const flow = aFlow('Test flow: ends when the run ends', { ends_on: 'the run ends' })
    const about = make('note', 'Test note: what the flow is about', { body: 'Test.' })
    const entered = await call('POST', `/api/flows/${flow}/enter`, asAgent('worker', runOf.worker), { about })
    expect(entered.status, JSON.stringify(entered.body)).toBe(201)
    const flowRun = entered.body['flowRun'] as string
    const data = dataOf(flowRun)
    expect(data['run']).toBe(runOf.worker)
    expect(data['flow']).toBe(flow)
    expect(data['flowRevision']).toEqual({ seq: expect.any(Number), contentHash: expect.any(String) })
    expect(data['module']).toBeUndefined()
    expect(data['ended']).toBeUndefined()
    const checklist = entered.body['checklist'].id as string
    const item = entered.body['item'].id as string
    expect(data['entered']).toEqual({
      for: agentRef('worker'),
      by: agentRef('worker'),
      at: expect.any(String),
      about,
      checklistItem: { checklist, item },
      endsOn: 'the run ends',
    })
    expect(data['stepsTaken'].map((step: { does: string }) => step.does)).toEqual([ENTERED_STEP_DOES.entered])

    // THE CHECKLIST IS THE AGENT'S, AND THE OFFICE MADE IT AND THE ITEM (round 51's sixth fault, kept for every flow).
    expect(dataOf(checklist)['owner']).toEqual(agentRef('worker'))
    expect(entered.body['checklist'].because).toContain('the office made one')
    const made = t.client.sqlite.prepare("SELECT actor_type AS type, actor_id AS id FROM changes WHERE record_id = ? AND op = 'create'").all(checklist)
    expect(made).toEqual([{ type: 'system', id: moleOffice().id }])
    const stored = theItem(checklist, item)
    expect(stored.state).toBe('open')
    expect(stored.words).toContain('The office put this item here when the flow was entered.')
    expect(stored.words).toContain('The office ticks it when the run ends')
    expect(stored.links).toEqual([about, flowRun])

    // THE RUN'S OWN FLOW RUN IS STILL THE ONE THE OFFICE FINDS FOR THE RUN.
    const own = flowRuns.theFlowRunOf(runOf.worker!)
    expect(own).not.toBeNull()
    expect(own!.id).not.toBe(flowRun)
    expect(dataOf(own!.id)['entered']).toBeUndefined()

    ending = { flow, about, flowRun, checklist, item }
  })

  it('refuses the same flow about the same record from the same run while it is open', async () => {
    const before = countOf('flow_run')
    const again = await call('POST', `/api/flows/${ending.flow}/enter`, asAgent('worker', runOf.worker), { about: ending.about })
    expect(again.status, JSON.stringify(again.body)).toBe(409)
    expect(again.body['code']).toBe('flowAlreadyEntered')
    expect(countOf('flow_run')).toBe(before)
  })

  it('is never taken for the run’s own flow run, even when the run has none', async () => {
    // A RUN WITH NO FLOW RUN OF ITS OWN, as a run filed before the office kept flow runs is. Made here by taking its
    // flow run away, which no door does.
    const run = make('session', 'Test run with no flow run of its own', { state: 'running', servingAgent: 'sealer', doing: 'Test' })
    t.client.sqlite.prepare("UPDATE records SET deleted_at = '2026-10-11 06:00:00' WHERE kind = 'flow_run' AND json_extract(data, '$.run') = ?").run(run)
    expect(flowRuns.theFlowRunOf(run)).toBeNull()
    const flow = aFlow('Test flow: entered from a run with no flow run', {})
    const about = make('note', 'Test note: a run with no flow run', { body: 'Test.' })
    const entered = await call('POST', `/api/flows/${flow}/enter`, asPerson, { about, run })
    expect(entered.status, JSON.stringify(entered.body)).toBe(201)
    expect(flowRuns.theFlowRunOf(run)).toBeNull()
  })
})

describe('2. the agent’s checklist shows the flows it is in', () => {
  it('carries the flow in the checklist’s reading, and the page draws it on the item', async () => {
    const read = await call('GET', `/api/checklists/${ending.checklist}`, asPerson)
    expect(read.status, JSON.stringify(read.body)).toBe(200)
    expect(read.body['checklist'].flows).toEqual([
      {
        item: ending.item,
        flowRun: ending.flowRun,
        flow: ending.flow,
        flowTitle: 'Test flow: ends when the run ends',
        about: ending.about,
        aboutTitle: 'Test note: what the flow is about',
        endsOn: 'the run ends',
        ended: null,
      },
    ])
    const { ItemRow } = await import('../src/web/components/ChecklistParts.tsx')
    const list = read.body['checklist']
    const html = renderToStaticMarkup(createElement(ItemRow, { item: list.items[0], list }))
    expect(html).toContain('In flow Test flow: ends when the run ends, about Test note: what the flow is about.')
    expect(html).toContain(ending.flowRun)
    expect(html).toContain('Not ended yet.')
  })
})

describe('5. anybody else ticking or changing the item is refused', () => {
  const asOther = () => asAgent('other', runOf.other)
  const patchTheItem = (headers: Record<string, string>, payload: unknown) =>
    call('PATCH', `/api/checklists/${ending.checklist}/items/${ending.item}`, headers, payload)
  /** The item, the checklist's flows and the flow run's end are as they were: nothing was written. */
  async function nothingWasWritten(stored: Record<string, any>): Promise<void> {
    expect(theItem(ending.checklist, ending.item)).toEqual(stored)
    expect(dataOf(ending.flowRun)['ended']).toBeUndefined()
    const read = await call('GET', `/api/checklists/${ending.checklist}`, asPerson)
    expect(read.body['checklist'].flows.map((one: { flowRun: string }) => one.flowRun)).toEqual([ending.flowRun])
  }

  it('refuses another agent with flowItemTickedByAnother, and the item stays open', async () => {
    const tick = await patchTheItem(asOther(), { state: 'done', addEvidence: [{ kind: 'run', record: runOf.other }] })
    expect(tick.status, JSON.stringify(tick.body)).toBe(403)
    expect(tick.body['code']).toBe('flowItemTickedByAnother')
    expect(theItem(ending.checklist, ending.item).state).toBe('open')
    expect(dataOf(ending.flowRun)['ended']).toBeUndefined()
  })

  // ROUND 52b, CHECK pgPCts6JVPZ9: the guard read the item as the change would leave it, so a change that dropped the
  // flow run's link hid the flow from it. It reads the item as stored.
  it('refuses a tick that replaces the item’s links in the same request', async () => {
    const stored = theItem(ending.checklist, ending.item)
    const tick = await patchTheItem(asOther(), { state: 'done', addEvidence: [{ kind: 'run', record: runOf.other }], links: [ending.about] })
    expect(tick.status, JSON.stringify(tick.body)).toBe(403)
    expect(tick.body['code']).toBe('flowItemTickedByAnother')
    await nothingWasWritten(stored)
  })

  it('refuses taking the flow run’s link away first, and so the tick after it too', async () => {
    const stored = theItem(ending.checklist, ending.item)
    const unlink = await patchTheItem(asOther(), { links: [ending.about] })
    expect(unlink.status, JSON.stringify(unlink.body)).toBe(403)
    expect(unlink.body['code']).toBe('flowItemChangedByAnother')
    await nothingWasWritten(stored)
    const tick = await patchTheItem(asOther(), { state: 'done', addEvidence: [{ kind: 'run', record: runOf.other }] })
    expect(tick.status, JSON.stringify(tick.body)).toBe(403)
    expect(tick.body['code']).toBe('flowItemTickedByAnother')
    await nothingWasWritten(stored)
  })

  it('refuses another agent changing any field, with flowItemChangedByAnother', async () => {
    // ITS OWN FLOW AND ITEM, so what this case sees does not hang on the cases before it.
    const flow = aFlow('Test flow: every field guarded', {})
    const about = make('note', 'Test note: every field guarded', { body: 'Test.' })
    const entered = await call('POST', `/api/flows/${flow}/enter`, asAgent('sealer', runOf.sealer), { about })
    expect(entered.status, JSON.stringify(entered.body)).toBe(201)
    const checklist = entered.body['checklist'].id as string
    const item = entered.body['item'].id as string
    const flowRun = entered.body['flowRun'] as string
    const stored = theItem(checklist, item)
    const later = make('note', 'Test note: what would supersede the item', { body: 'Test.' })
    const changes: Array<[string, unknown]> = [
      ['words', { words: 'Test: words another agent wrote' }],
      ['links', { links: [about, flowRun, later] }],
      ['addLinks', { addLinks: [later] }],
      ['superseded', { state: 'superseded', supersededBy: later }],
      ['state', { state: 'in progress' }],
      ['fromMessage', { fromMessage: later }],
      ['evidence', { evidence: [{ kind: 'run', record: runOf.other }] }],
      ['addEvidence', { addEvidence: [{ kind: 'run', record: runOf.other }] }],
      ['mustBeInManual', { mustBeInManual: true }],
    ]
    const answers: Array<[string, number, unknown, boolean]> = []
    for (const [field, payload] of changes) {
      const r = await call('PATCH', `/api/checklists/${checklist}/items/${item}`, asOther(), payload)
      answers.push([field, r.status, r.body['code'], String(r.body['error']).includes('Nothing was changed.')])
    }
    expect(answers).toEqual(changes.map(([field]) => [field, 403, 'flowItemChangedByAnother', true]))
    expect(theItem(checklist, item)).toEqual(stored)
    expect(dataOf(flowRun)['ended']).toBeUndefined()
  })

  it('lets the agent in the flow and the person change it, and the agent’s tick that replaces the links still ends the flow', async () => {
    const flow = aFlow('Test flow: ticked with its links replaced', {})
    const about = make('note', 'Test note: the links are replaced on the tick', { body: 'Test.' })
    const entered = await call('POST', `/api/flows/${flow}/enter`, asAgent('sealer', runOf.sealer), { about })
    expect(entered.status, JSON.stringify(entered.body)).toBe(201)
    const url = `/api/checklists/${entered.body['checklist'].id as string}/items/${entered.body['item'].id as string}`
    const words = await call('PATCH', url, asPerson, { words: 'Test: the person reworded the item' })
    expect(words.status, JSON.stringify(words.body)).toBe(200)
    const tick = await call('PATCH', url, asAgent('sealer', runOf.sealer), { state: 'done', addEvidence: [{ kind: 'run', record: runOf.sealer }], links: [about] })
    expect(tick.status, JSON.stringify(tick.body)).toBe(200)
    expect(dataOf(entered.body['flowRun'] as string)['ended']).toEqual({ at: expect.any(String), how: 'ticked by hand', by: agentRef('sealer') })
  })
})

describe('3. done by an event', () => {
  it('the run ends: the office ticks the item with the run as evidence, and ends the flow run', async () => {
    const ended = await call('PATCH', `/api/records/${runOf.worker}`, asAgent('worker', runOf.worker), { dataPatch: { state: 'crashed' } })
    expect(ended.status, JSON.stringify(ended.body)).toBe(200)
    const item = theItem(ending.checklist, ending.item)
    expect(item.state).toBe('done')
    expect(item.evidence).toEqual([{ kind: 'run', record: runOf.worker }])
    const data = dataOf(ending.flowRun)
    expect(data['ended']).toEqual({ at: expect.any(String), how: 'the run ends', by: office() })
    expect(data['stepsTaken'].at(-1)).toMatchObject({ does: ENTERED_STEP_DOES.endedByEvent, how: 'by the office', outcome: 'done', evidence: `run ${runOf.worker}` })
    const read = await call('GET', `/api/checklists/${ending.checklist}`, asPerson)
    expect(read.body['checklist'].flows[0].ended).toEqual(data['ended'])
  })

  it('a seal ends the flow that ends on the seal, and leaves the one that ends on the release open', async () => {
    const onSeal = aFlow('Test flow: ends when the run is sealed', { ends_on: 'the run is sealed' })
    const onRelease = aFlow('Test flow: ends when the run is released', { ends_on: 'the run is released' })
    const about = make('note', 'Test note: sealed work', { body: 'Test.' })
    const sealed = await call('POST', `/api/flows/${onSeal}/enter`, asAgent('sealer', runOf.sealer), { about })
    const released = await call('POST', `/api/flows/${onRelease}/enter`, asAgent('sealer', runOf.sealer), { about })
    expect(sealed.status, JSON.stringify(sealed.body)).toBe(201)
    expect(released.status, JSON.stringify(released.body)).toBe(201)
    // THE OFFICE'S OWN READING OF A SEAL, as patchRecord calls it when a run's sealedTip is written.
    flowRuns.recordTheStepsOfAChange(runOf.sealer!, {}, { sealedTip: 'a'.repeat(40) }, { type: 'system', id: moleOffice().id }, '2026-10-11 07:00:00')
    expect(dataOf(sealed.body['flowRun'])['ended']).toEqual({ at: '2026-10-11 07:00:00', how: 'the run is sealed', by: office() })
    expect(theItem(sealed.body['checklist'].id, sealed.body['item'].id).state).toBe('done')
    expect(dataOf(released.body['flowRun'])['ended']).toBeUndefined()
    expect(theItem(released.body['checklist'].id, released.body['item'].id).state).toBe('open')
    expect(flowRuns.stepsOfAChange({}, { sealedTip: 'a'.repeat(40) }, { type: 'system', id: moleOffice().id }, '2026-10-11 07:00:00')[0]!.does).toBe(OFFICE_STEP_DOES.sealed)
  })
})

describe('4. done by hand', () => {
  it('a person enters a flow for an agent, and the agent ticks it by hand', async () => {
    const flow = aFlow('Test flow: nothing the office sees ends it', {})
    const about = make('note', 'Test note: handed work', { body: 'Test.' })
    const noRun = await call('POST', `/api/flows/${flow}/enter`, asPerson, { about })
    expect(noRun.status, JSON.stringify(noRun.body)).toBe(400)
    expect(noRun.body['code']).toBe('flowNeedsARun')
    const entered = await call('POST', `/api/flows/${flow}/enter`, asPerson, { about, run: runOf.other })
    expect(entered.status, JSON.stringify(entered.body)).toBe(201)
    const flowRun = entered.body['flowRun'] as string
    expect(dataOf(flowRun)['entered']).toMatchObject({ for: agentRef('other'), by: { kind: 'person', id: THE_TEST_OFFICES_OWNER.id } })
    expect(dataOf(flowRun)['entered'].endsOn).toBeUndefined()
    const checklist = entered.body['checklist'].id as string
    const item = entered.body['item'].id as string
    expect(theItem(checklist, item).words).toContain('Tick it by hand when the flow is done.')

    const tick = await call('PATCH', `/api/checklists/${checklist}/items/${item}`, asAgent('other', runOf.other), { state: 'done', addEvidence: [{ kind: 'run', record: runOf.other }] })
    expect(tick.status, JSON.stringify(tick.body)).toBe(200)
    const data = dataOf(flowRun)
    expect(data['ended']).toEqual({ at: expect.any(String), how: 'ticked by hand', by: agentRef('other') })
    expect(data['stepsTaken'].at(-1)).toMatchObject({ does: ENTERED_STEP_DOES.tickedByHand, actor: agentRef('other'), how: 'by an agent', outcome: 'done' })
  })
})

describe('6. the door’s refusals', () => {
  it('refuses with a code and writes nothing', async () => {
    const flow = aFlow('Test flow: for the refusals', {})
    const about = make('note', 'Test note: for the refusals', { body: 'Test.' })
    const planning = aFlow('Test flow: the planning flow', { governed_by: PLANNING_FLOW_CODE })
    const made = await call('POST', '/api/checklists', asAgent('worker', runOf.worker), { title: 'Test checklist: the worker’s, not the other’s' })
    expect(made.status, JSON.stringify(made.body)).toBe(201)
    const theirs = made.body['checklist'].id as string
    const lonely = make('session', 'Test run that serves nobody', { state: 'running', doing: 'Test' })
    const cases: Array<[string, Record<string, string>, unknown, number, string]> = [
      [`/api/flows/${about}/enter`, asAgent('worker', runOf.worker), { about }, 409, 'flowNotAFlow'],
      [`/api/flows/${planning}/enter`, asAgent('worker', runOf.worker), { about }, 409, 'flowEnteredByItsOwnDoor'],
      [`/api/flows/${flow}/enter`, asAgent('worker', runOf.worker), { about: 'no-such-record' }, 409, 'flowAboutNotHere'],
      [`/api/flows/${flow}/enter`, asAgent('worker'), { about }, 400, 'flowNeedsARun'],
      [`/api/flows/${flow}/enter`, asPerson, { about, run: lonely }, 409, 'flowRunServesNoAgent'],
      [`/api/flows/${flow}/enter`, asAgent('other', runOf.other), { about, run: runOf.worker }, 403, 'flowEnteredForAnother'],
      [`/api/flows/${flow}/enter`, asAgent('other', runOf.other), { about, checklist: theirs }, 409, 'flowChecklistNotTheirs'],
    ]
    const afterSetup = { flowRuns: countOf('flow_run'), checklists: countOf('checklist') }
    for (const [url, headers, payload, status, code] of cases) {
      const r = await call('POST', url, headers, payload)
      expect(r.status, `${code}: ${JSON.stringify(r.body)}`).toBe(status)
      expect(r.body['code']).toBe(code)
      expect(r.body['error'] ?? r.body['message']).toContain('Nothing was changed.')
    }
    expect(countOf('flow_run')).toBe(afterSetup.flowRuns)
    expect(countOf('checklist')).toBe(afterSetup.checklists)
  })
})
