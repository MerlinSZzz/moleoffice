// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A RUN THAT NAMES NO FLOW IS NAMED THE ONE FLOW THAT LISTS HOW IT STARTED. Wave 13r, point FR-1.
 *
 * A flow may list, in `starts_on`, the starts it follows, from a closed list: a supervisor's run, a worker's run, a check
 * and a landing on main. When the office files a run that names no flow of its own, it reads how the run started and
 * names the one live flow of the run's own project that lists that start. A run that names its own flow is not read.
 *
 * WHAT IS MEASURED, in a test world. Every record here is synthetic, and every title says so. Each case files in a
 * project of its own, so no case counts another's flows.
 *
 *   1. Three flows in one project list [a supervisor's run, a worker's run], [a check] and [a landing on main]. A run
 *      for an agent with the supervisor card, a check run and a landing run each name their flow and its newest
 *      revision, and carry the start that was read. GET /api/flows counts one run in 30 days for each flow.
 *   2. A worker's run is named the first flow too, and a check run filed again by the merge queue is named the second.
 *   3. A landing run that only pins, a landing run that checks a resolution, a round launcher's run, a worker
 *      launcher's run, a run for an agent with the secretary card and a run that names no agent fit no start: each says
 *      the run named no flow, and none carries a start.
 *   4. Two live flows list the same start: no flow is named, and the sentence names the start and both flows.
 *   5. A retired flow and a flow a live flow replaced list the start too; they are not counted, and the live one is named.
 *   6. A flow in another project lists the start; it is not named.
 *   7. A run that names its own flow keeps it, and no start is read for it.
 *   8. A run filed before any flow lists its start keeps its flow run unchanged after a flow is given that start, and
 *      a later run with the same start, which is named the flow, does not change it either.
 *   9. A flow whose `starts_on` holds a word outside the closed list is refused, on a POST and on a PATCH, and nothing
 *      is stored.
 *
 * HOW THE RUNS ARE FILED. A check run, a check run filed again and a landing run carry `extra.purpose` from the moment
 * they are filed, and the office files them itself: the message worker, src/worker/index.ts, and the merge queue,
 * src/server/lib/merge-state-machine.ts. So every run here is filed the way the office files a run it starts, through
 * `createRecord` with the office as the writer, which files the flow run in the same write a POST does. No door is asked
 * to take a purpose from an agent.
 *
 * MUTATIONS, each run once after a green control and put back, and each turns its case red:
 *   1. In `theFlowItNamed` (src/server/lib/flow-runs.ts), name the flow found by its start without its revision.
 *      Case 1 goes red, and so do 2 and 5.
 *   2. In `theStartOf` (src/server/lib/flow-runs.ts), read no start for a run whose agent holds the worker card.
 *      Case 2 goes red.
 *   3. In `theStartOf`, read every landing run as a landing on main, whatever `pinOnly` and `checkResolution` say.
 *      Case 3 goes red.
 *   4. In `theFlowItNamed`, name the first of the flows that list the start when there are two or more. Case 4 goes red.
 *   5. In `theLiveFlowsThatList` (src/server/lib/flow-runs.ts), leave out `isReplaced`. Case 5 goes red: two flows
 *      list the start, so none is named.
 *   6. In `theLiveFlowsThatList`, leave out the run's own project. Case 6 goes red.
 *   7. In `theFlowItNamed`, read the start before the run's own `flow`. Case 7 goes red.
 *   8. In `fileTheFlowRunOf` (src/server/lib/flow-runs.ts), after a run is named a flow by its start, also write that
 *      flow into every flow run of the project that carries the same start and names no flow. Case 8 goes red. No
 *      line of today's code fills in a past run, so this mutation adds the line the case exists to keep out.
 *   9. In src/shared/kinds/flow.ts, declare `starts_on` as `string[]`. Case 9 goes red: both writes are stored.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'

import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { THE_TEST_OFFICES_SECRETARY } from './a-page-of-a-test-office.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { THE_SECRETARY, THE_SUPERVISOR, THE_WORKER } from '../src/shared/roles.ts'
import { A_WORKER_LAUNCHER_PURPOSE } from '../src/shared/worker-runs.ts'
import {
  A_CHECKS_PURPOSES,
  A_LANDINGS_PURPOSE,
  FLOW_STARTING_EVENTS,
  NO_FLOW_NAMED,
  noFlowSeveralListTheStart,
  type FlowStartingEvent,
} from '../src/shared/flow-run.ts'

let t: TestDb
let app: FastifyInstance

const AS_THE_PERSON = { 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON }
const asAgent = (id: string): Record<string, string> => ({ 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': id })
const inProject = (project: string, headers: Record<string, string>): Record<string, string> => ({ ...headers, 'x-mole-office-workspace': project })
const THE_OFFICE = { type: 'agent' as const, id: 'mole-office/the-api-server' }

// The closed list, in its declared order: a supervisor's run, a worker's run, a check and a landing on main.
const [A_SUPERVISORS_RUN, A_WORKERS_RUN, A_CHECK, A_LANDING] = FLOW_STARTING_EVENTS
const [AN_INSPECTION, A_REINSPECTION] = A_CHECKS_PURPOSES

// THE THREE AGENTS THE RUNS SERVE, registered as tests/one-declaration-decides-what-a-role-may-do.test.ts registers
// them: the person registers the secretary, the secretary the supervisor, and the supervisor the worker.
const A_SUPERVISOR = 'synthetic-flow-starts-supervisor'
const A_WORKER = 'synthetic-flow-starts-worker'

const A_START_NO_LIST_HOLDS = 'a synthetic start no list holds'

async function post(url: string, payload: unknown, headers: Record<string, string>): Promise<{ code: number; said: Record<string, unknown> }> {
  const reply = await app.inject({ method: 'POST', url, headers, payload: payload as Record<string, unknown> })
  return { code: reply.statusCode, said: reply.json() as Record<string, unknown> }
}

let projects = 0
/** A project of this file's own, made as tests/a-retired-flow-is-folded-with-the-replaced.test.ts makes one, so a case reads only the flows it filed. */
async function aProject(): Promise<string> {
  projects += 1
  const id = `synthetic-flow-starts-${String(projects)}`
  const { createWorkspace } = await import('../src/server/lib/workspaces.ts')
  createWorkspace({ id, title: `A synthetic project of this test, ${String(projects)}` })
  return id
}

/** A synthetic record a step or a retired mark can name as its reason. */
const aReason = (project: string): string =>
  t.api.createRecord({ kind: 'report', title: 'A synthetic reason of this test', data: { blocks: [] }, workspaceId: project, actor: t.api.HUMAN }).id

/** The synthetic data every flow here holds. A step names why it is there and its sources, so its source is filed first. */
function aFlowsData(project: string): Record<string, unknown> {
  const source = aReason(project)
  return {
    declared_in: 'a synthetic flow of this test',
    runs: 'a synthetic runner',
    trigger: 'A synthetic run of this test starts.',
    stages: [{ n: 1, does: 'The synthetic runner does the work.', evidence: 'a synthetic record', why: 'Without it the synthetic work is not done.', sources: [source] }],
    leaves_behind: 'a synthetic record',
  }
}

/** A flow filed by the person, listing these starts, or none when `startsOn` is undefined. */
function aFlow(project: string, startsOn: readonly string[] | undefined): string {
  return t.api.createRecord({
    kind: 'flow',
    title: 'A synthetic flow of this test',
    data: { ...aFlowsData(project), ...(startsOn === undefined ? {} : { starts_on: [...startsOn] }) },
    workspaceId: project,
    actor: t.api.HUMAN,
  }).id
}

/** A run filed the way the office files a run it starts. */
function aRun(project: string, data: Record<string, unknown>): string {
  return t.api.createRecord({
    kind: 'session',
    title: 'A synthetic run of this test',
    workspaceId: project,
    actor: THE_OFFICE,
    data: { state: 'running', doing: 'Nobody ran it; this test filed it.', ...data },
  }).id
}

const aSupervisorsRun = (project: string) => aRun(project, { servingAgent: A_SUPERVISOR })
const aWorkersRun = (project: string) => aRun(project, { servingAgent: A_WORKER })
const aCheckRun = (project: string) => aRun(project, { servingAgent: A_WORKER, extra: { purpose: AN_INSPECTION, inspectionRun: 'a-synthetic-run' } })
const aLandingRun = (project: string, more: Record<string, unknown> = {}) => aRun(project, { extra: { purpose: A_LANDINGS_PURPOSE, mergeEntry: 'a-synthetic-entry', ...more } })

/** The one flow run of a run, read straight from the test database, so a second one would show. */
function theFlowRunOf(run: string): { id: string; data: Record<string, unknown> } {
  const held = (t.client.sqlite.prepare("SELECT id, data FROM records WHERE kind = 'flow_run' AND json_extract(data, '$.run') = ?").all(run) as { id: string; data: string }[])
  expect(held, `the flow runs of run ${run}`).toHaveLength(1)
  return { id: held[0]!.id, data: JSON.parse(held[0]!.data) as Record<string, unknown> }
}

function theNewestRevision(id: string): { seq: number; contentHash: string } {
  const row = t.client.sqlite.prepare('SELECT seq, content_hash AS contentHash FROM revisions WHERE record_id = ? ORDER BY seq DESC LIMIT 1').get(id) as { seq: number; contentHash: string }
  return { seq: row.seq, contentHash: row.contentHash }
}

function howManyRevisions(id: string): number {
  return Number((t.client.sqlite.prepare('SELECT count(*) AS n FROM revisions WHERE record_id = ?').get(id) as { n: number }).n)
}

/** The run is named this flow, at its newest revision, and carries the start that was read. */
function namedByItsStart(run: string, flow: string, start: FlowStartingEvent): void {
  const flowRun = theFlowRunOf(run).data
  expect({ flow: flowRun['flow'], flowRevision: flowRun['flowRevision'], noFlow: flowRun['noFlow'], startedAs: flowRun['startedAs'] }, `run ${run}`).toEqual({
    flow,
    flowRevision: theNewestRevision(flow),
    noFlow: undefined,
    startedAs: start,
  })
}

/** Each flow's run count over 30 days, as the flows page reads it for this project. */
async function runsIn30Days(project: string): Promise<Record<string, number>> {
  const reply = await app.inject({ method: 'GET', url: '/api/flows?limit=25', headers: inProject(project, AS_THE_PERSON) })
  expect(reply.statusCode, reply.body).toBe(200)
  const rows = (reply.json() as { flows: { id: string; runs30d: number }[] }).flows
  return Object.fromEntries(rows.map((row) => [row.id, row.runs30d]))
}

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  for (const [by, handle, name, role] of [
    [AS_THE_PERSON, THE_TEST_OFFICES_SECRETARY.handle, THE_TEST_OFFICES_SECRETARY.name, THE_SECRETARY],
    [asAgent(THE_TEST_OFFICES_SECRETARY.handle), A_SUPERVISOR, 'A synthetic supervisor', THE_SUPERVISOR],
    [asAgent(A_SUPERVISOR), A_WORKER, 'A synthetic worker', THE_WORKER],
  ] as const) {
    const started = await post('/api/agents/started', { handle, name, role }, by)
    expect(started.code, JSON.stringify(started.said)).toBe(201)
  }
})

afterAll(async () => {
  await app?.close()
  t?.close()
})

describe('one project with a flow for each start', () => {
  let project: string
  let ofRounds: string
  let ofChecks: string
  let ofLandings: string

  beforeAll(async () => {
    project = await aProject()
    ofRounds = aFlow(project, [A_SUPERVISORS_RUN, A_WORKERS_RUN])
    ofChecks = aFlow(project, [A_CHECK])
    ofLandings = aFlow(project, [A_LANDING])
  })

  it('1. names a supervisor\'s run, a check and a landing their flows at the newest revision, and the flows page counts them', async () => {
    namedByItsStart(aSupervisorsRun(project), ofRounds, A_SUPERVISORS_RUN)
    namedByItsStart(aCheckRun(project), ofChecks, A_CHECK)
    namedByItsStart(aLandingRun(project), ofLandings, A_LANDING)
    expect(await runsIn30Days(project)).toEqual({ [ofRounds]: 1, [ofChecks]: 1, [ofLandings]: 1 })
  })

  it('2. names a worker\'s run the first flow too, and a check filed again the check\'s flow', () => {
    namedByItsStart(aWorkersRun(project), ofRounds, A_WORKERS_RUN)
    namedByItsStart(aRun(project, { servingAgent: A_WORKER, extra: { purpose: A_REINSPECTION, mergeEntry: 'a-synthetic-entry' } }), ofChecks, A_CHECK)
  })

  it('3. names no flow, and reads no start, for a run that fits none of the starts', () => {
    const fitNone = {
      'a landing that only pins': aLandingRun(project, { pinOnly: true }),
      'a landing that checks a resolution': aLandingRun(project, { checkResolution: true }),
      'a round launcher\'s run': aRun(project, { servingAgent: A_SUPERVISOR, extra: { purpose: 'round', round: 'a-synthetic-round' } }),
      'a worker launcher\'s run': aRun(project, { servingAgent: A_SUPERVISOR, extra: { purpose: A_WORKER_LAUNCHER_PURPOSE } }),
      'a secretary\'s run': aRun(project, { servingAgent: THE_TEST_OFFICES_SECRETARY.handle }),
      'a run that names no agent': aRun(project, {}),
    }
    for (const [what, run] of Object.entries(fitNone)) {
      const flowRun = theFlowRunOf(run).data
      expect({ flow: flowRun['flow'], flowRevision: flowRun['flowRevision'], noFlow: flowRun['noFlow'], startedAs: flowRun['startedAs'] }, what).toEqual({
        flow: undefined,
        flowRevision: undefined,
        noFlow: NO_FLOW_NAMED,
        startedAs: undefined,
      })
    }
  })
})

describe('which flows are counted', () => {
  it('4. names no flow when two live flows list the start, and says the start and both flows', async () => {
    const project = await aProject()
    const one = aFlow(project, [A_CHECK])
    const two = aFlow(project, [A_LANDING, A_CHECK])
    const flowRun = theFlowRunOf(aCheckRun(project)).data
    expect(flowRun['flow']).toBeUndefined()
    expect(flowRun['flowRevision']).toBeUndefined()
    expect(flowRun['startedAs']).toBe(A_CHECK)
    expect(flowRun['noFlow']).toBe(noFlowSeveralListTheStart(A_CHECK, [one, two]))
    for (const said of [A_CHECK, one, two]) expect(String(flowRun['noFlow'])).toContain(said)
    expect(await runsIn30Days(project)).toEqual({ [one]: 0, [two]: 0 })
  })

  it('5. counts neither a retired flow nor a replaced one, and names the one live flow', async () => {
    const project = await aProject()
    const retired = aFlow(project, [A_CHECK])
    const replaced = aFlow(project, [A_CHECK])
    const live = aFlow(project, [A_CHECK])
    const retire = await app.inject({
      method: 'PATCH',
      url: `/api/records/${retired}`,
      headers: inProject(project, AS_THE_PERSON),
      payload: { dataPatch: { retired: { why: 'A synthetic flow of this test; nothing follows it.', at: '2026-11-21', by: 'this test', record: aReason(project) } } },
    })
    expect(retire.statusCode, retire.body).toBe(200)
    const supersede = await post('/api/links', { fromId: live, toId: replaced, type: 'supersedes' }, inProject(project, AS_THE_PERSON))
    expect(supersede.code, JSON.stringify(supersede.said)).toBe(201)
    namedByItsStart(aCheckRun(project), live, A_CHECK)
  })

  it('6. does not name a flow of another project', async () => {
    const elsewhere = await aProject()
    const project = await aProject()
    aFlow(elsewhere, [A_CHECK])
    const flowRun = theFlowRunOf(aCheckRun(project)).data
    expect({ flow: flowRun['flow'], noFlow: flowRun['noFlow'], startedAs: flowRun['startedAs'] }).toEqual({ flow: undefined, noFlow: NO_FLOW_NAMED, startedAs: A_CHECK })
  })

  it('7. keeps the flow a run names itself, and reads no start for it', async () => {
    const project = await aProject()
    aFlow(project, [A_CHECK])
    const itsOwn = aFlow(project, undefined)
    const flowRun = theFlowRunOf(aRun(project, { servingAgent: A_WORKER, flow: itsOwn, extra: { purpose: AN_INSPECTION, inspectionRun: 'a-synthetic-run' } })).data
    expect({ flow: flowRun['flow'], flowRevision: flowRun['flowRevision'], noFlow: flowRun['noFlow'], startedAs: flowRun['startedAs'] }).toEqual({
      flow: itsOwn,
      flowRevision: theNewestRevision(itsOwn),
      noFlow: undefined,
      startedAs: undefined,
    })
  })
})

describe('a past run is not filled in', () => {
  it('8. leaves the flow run of a run filed before any flow listed its start as it was', async () => {
    const project = await aProject()
    const flow = aFlow(project, undefined)
    const before = aCheckRun(project)
    const filed = theFlowRunOf(before)
    expect({ flow: filed.data['flow'], noFlow: filed.data['noFlow'], startedAs: filed.data['startedAs'] }).toEqual({ flow: undefined, noFlow: NO_FLOW_NAMED, startedAs: A_CHECK })
    const revisions = howManyRevisions(filed.id)

    const given = await app.inject({ method: 'PATCH', url: `/api/records/${flow}`, headers: inProject(project, AS_THE_PERSON), payload: { dataPatch: { starts_on: [A_CHECK] } } })
    expect(given.statusCode, given.body).toBe(200)
    namedByItsStart(aCheckRun(project), flow, A_CHECK)

    expect(theFlowRunOf(before)).toEqual(filed)
    expect(howManyRevisions(filed.id)).toBe(revisions)
    expect(await runsIn30Days(project)).toEqual({ [flow]: 1 })
  })
})

describe('the closed list', () => {
  it('9. refuses a start outside the list on a POST and on a PATCH, and stores nothing', async () => {
    const project = await aProject()
    const flowsIn = () => Number((t.client.sqlite.prepare("SELECT count(*) AS n FROM records WHERE kind = 'flow' AND workspace_id = ?").get(project) as { n: number }).n)
    const kept = aFlow(project, [A_CHECK])
    const atFirst = { flows: flowsIn(), data: t.api.getRecord(kept)!.data, revision: theNewestRevision(kept) }

    const posted = await post('/api/records', { kind: 'flow', title: 'A synthetic flow of this test that lists a start no list holds', data: { ...aFlowsData(project), starts_on: [A_CHECK, A_START_NO_LIST_HOLDS] } }, inProject(project, AS_THE_PERSON))
    expect(posted.code, JSON.stringify(posted.said)).toBe(400)
    expect(String(posted.said['error'])).toContain('starts_on')

    const patched = await app.inject({ method: 'PATCH', url: `/api/records/${kept}`, headers: inProject(project, AS_THE_PERSON), payload: { dataPatch: { starts_on: [A_START_NO_LIST_HOLDS] } } })
    expect(patched.statusCode, patched.body).toBe(400)
    expect(String((patched.json() as { error?: unknown }).error)).toContain('starts_on')

    expect({ flows: flowsIn(), data: t.api.getRecord(kept)!.data, revision: theNewestRevision(kept) }).toEqual(atFirst)
  })
})
