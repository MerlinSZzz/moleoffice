// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A RUN'S FLOW RUN IS SERVED AT ONE READ PER RUN AND IN THE BOOTSTRAP READ, AND A STEP DONE BY HAND IS RECORDED WITH
 * ITS WHY. Wave 1 of the office flow, M1 (report 4IoRUKizcZXb, section 4); the hand-step door is the secretary's ask. Wave 13p
 * round 25.
 *
 * WHAT IS MEASURED, in a test world. Every record here is synthetic:
 *
 *   · GET /api/sessions/<run>/flow-run answers that run's flow run, by the run's id; a run with no flow run (filed
 *     before wave 1, here one whose flow run a trigger in the test database would not let be written) answers null with the sentence
 *     saying why; an id that names no session record is refused 404;
 *   · POST /api/sessions/<run>/flow-run/steps adds a step and says back what it made of it: who (the caller, when the
 *     step named nobody) and when (the moment it was recorded, when the step named none);
 *   · a step done by hand with no why is refused (400), says why, and writes nothing; with a why it is stored;
 *   · the step door refuses nothing of the run's own work: the run's record is the same before and after a step;
 *   · GET /api/project/bootstrap carries `this_run`: the calling run's flow run, when the request names its run;
 *     a sentence saying the request named no run, when it names none;
 *   · the bootstrap read in one project, with a session header holding a run of another project, answers nothing of
 *     that run: no run, no flow run, and neither id anywhere in the reply. The same run asked in its own project is
 *     answered, so the run and its flow run are there (wave 13p round 25b, check UD7dt6P3ISh6).
 *
 * MUTATIONS (wave 13p round 25), each run once and put back:
 *   1. In SHAPE_CROSS_CHECKS.FlowRunStep (src/shared/kinds.ts), drop the rule that a step by hand says why. The
 *      no-why case goes red: the step is stored.
 *   2. In GET /sessions/:id/flow-run (src/server/api/sessions.ts), answer the newest flow run in the office instead
 *      of the run's own. The read case goes red.
 *   3. In `theCallingRunsFlowRun` (src/server/api/bootstrap.ts), answer null whatever the request named. The
 *      bootstrap case goes red.
 *
 * MUTATION (wave 13p round 25b), run once and put back:
 *   4. In `theCallingRunsFlowRun`, take the session record by its bare id again, before `resolveSessionRef`, which
 *      is the project check taken out. The across-projects case goes red: the other project's flow run is served.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'

import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { A_STEP_BY_HAND_SAYS_WHY, OFFICE_STEP_DOES } from '../src/shared/flow-run.ts'

let t: TestDb
let app: FastifyInstance

const WORKSPACE = 'default'
const ELSEWHERE = 'robotics'
const AS_THE_PERSON = { 'x-mole-office-workspace': WORKSPACE, 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON }
const asAgent = (id: string): Record<string, string> => ({ 'x-mole-office-workspace': WORKSPACE, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': id })

async function aRun(workspace: string = WORKSPACE): Promise<string> {
  const reply = await app.inject({ method: 'POST', url: '/api/records', headers: { ...asAgent('served-worker'), 'x-mole-office-workspace': workspace }, payload: { kind: 'session', title: 'A synthetic run', data: { state: 'running', servingAgent: 'served-worker' } } })
  expect(reply.statusCode, reply.body).toBe(201)
  return (reply.json() as { record: { id: string } }).record.id
}

async function read(run: string): Promise<{ code: number; said: Record<string, unknown> }> {
  const reply = await app.inject({ method: 'GET', url: `/api/sessions/${run}/flow-run`, headers: asAgent('served-worker') })
  return { code: reply.statusCode, said: reply.json() as Record<string, unknown> }
}

async function addStep(run: string, step: Record<string, unknown>): Promise<{ code: number; said: Record<string, unknown> }> {
  const reply = await app.inject({ method: 'POST', url: `/api/sessions/${run}/flow-run/steps`, headers: asAgent('served-worker'), payload: step })
  return { code: reply.statusCode, said: reply.json() as Record<string, unknown> }
}

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  const started = await app.inject({ method: 'POST', url: '/api/agents/started', headers: AS_THE_PERSON, payload: { handle: 'served-worker', name: 'Served worker', role: 'worker', workArea: ['work'] } })
  expect(started.statusCode, started.body).toBe(201)
  const made = await app.inject({ method: 'POST', url: '/api/workspaces', payload: { id: ELSEWHERE, title: 'Robotics' } })
  expect(made.statusCode, made.body).toBe(201)
})

afterAll(async () => {
  await app?.close()
  t?.close()
})

describe('one read per run', () => {
  it("answers the run's own flow run, by the run's id, and no other", async () => {
    const run = await aRun()
    await aRun()
    const { code, said } = await read(run)
    expect(code, JSON.stringify(said)).toBe(200)
    const flowRun = said['flowRun'] as { kind: string; data: { run: string; stepsTaken: { does: string }[] } }
    expect(flowRun.kind).toBe('flow_run')
    expect(flowRun.data.run).toBe(run)
    expect(flowRun.data.stepsTaken[0]!.does).toBe(OFFICE_STEP_DOES.started)
  })

  it('a run with no flow run answers null and says why; an id that names no run is refused', async () => {
    // A RUN WITH NO FLOW RUN, made with a trigger in the test database that aborts the flow run's insert.
    t.client.sqlite.exec("CREATE TRIGGER no_flow_run BEFORE INSERT ON records WHEN NEW.kind = 'flow_run' BEGIN SELECT RAISE(ABORT, 'a synthetic refusal of this test'); END")
    let run = ''
    try {
      run = await aRun()
    } finally {
      t.client.sqlite.exec('DROP TRIGGER no_flow_run')
    }
    const { code, said } = await read(run)
    expect(code, JSON.stringify(said)).toBe(200)
    expect(said['flowRun']).toBeNull()
    expect(String(said['says'])).toContain(`Run ${run} has no flow run.`)
    expect((await read('no-such-run')).code).toBe(404)
    // AND THE STEP DOOR SAYS THE SAME, writing nothing.
    const added = await addStep(run, { does: 'Synthetic.', how: 'by an agent', outcome: 'done' })
    expect(added.code, JSON.stringify(added.said)).toBe(409)
  })
})

describe('the hand-step door', () => {
  it('adds a step and says back who and when it took, and changes nothing of the run itself', async () => {
    const run = await aRun()
    const before = JSON.stringify(t.api.getRecord(run))
    const { code, said } = await addStep(run, { does: 'Synthetic: quill rebased the branch by hand.', how: 'by hand', why: 'Synthetic: the queue was held.', outcome: 'done' })
    expect(code, JSON.stringify(said)).toBe(201)
    expect(said['position']).toBe(2)
    expect(String(said['says'])).toContain('(the caller, since the step named nobody)')
    expect(String(said['says'])).toContain('(the moment it was recorded, since the step named none)')
    const steps = ((await read(run)).said['flowRun'] as { data: { stepsTaken: Record<string, unknown>[] } }).data.stepsTaken
    expect(steps[1]).toMatchObject({ does: 'Synthetic: quill rebased the branch by hand.', how: 'by hand', why: 'Synthetic: the queue was held.', outcome: 'done', actor: { kind: 'agent' } })
    expect(JSON.stringify(t.api.getRecord(run))).toBe(before)
  })

  it('refuses a step done by hand that says no why, and writes nothing', async () => {
    const run = await aRun()
    const { code, said } = await addStep(run, { does: 'Synthetic: a step by hand with no why.', how: 'by hand', outcome: 'done' })
    expect(code, JSON.stringify(said)).toBe(400)
    expect(String(said['error'])).toContain(A_STEP_BY_HAND_SAYS_WHY)
    const steps = ((await read(run)).said['flowRun'] as { data: { stepsTaken: unknown[] } }).data.stepsTaken
    expect(steps).toHaveLength(1)
  })
})

describe('the bootstrap read', () => {
  it("carries the calling run's flow run when the request names its run", async () => {
    const run = await aRun()
    const reply = await app.inject({ method: 'GET', url: '/api/project/bootstrap', headers: { ...asAgent('served-worker'), 'x-mole-office-session': run } })
    expect(reply.statusCode, reply.body).toBe(200)
    const thisRun = (reply.json() as { this_run: { run: string; flowRun: { run: string; stepsTaken: { does: string }[] } | null } }).this_run
    expect(thisRun.run).toBe(run)
    expect(thisRun.flowRun?.run).toBe(run)
    expect(thisRun.flowRun?.stepsTaken[0]!.does).toBe(OFFICE_STEP_DOES.started)
  })

  it('says the request named no run when it names none', async () => {
    const reply = await app.inject({ method: 'GET', url: '/api/project/bootstrap', headers: AS_THE_PERSON })
    expect(reply.statusCode, reply.body).toBe(200)
    const thisRun = (reply.json() as { this_run: { run: null; flowRun: null; says: string } }).this_run
    expect(thisRun).toEqual({ run: null, flowRun: null, says: expect.stringContaining('This request named no run') })
  })

  it("answers nothing of a run in another project when the session header names it", async () => {
    const run = await aRun(ELSEWHERE)
    const inItsOwn = await app.inject({ method: 'GET', url: '/api/project/bootstrap', headers: { ...asAgent('served-worker'), 'x-mole-office-workspace': ELSEWHERE, 'x-mole-office-session': run } })
    expect(inItsOwn.statusCode, inItsOwn.body).toBe(200)
    const own = (inItsOwn.json() as { this_run: { run: string; flowRun: { id: string; run: string } | null } }).this_run
    expect(own.run).toBe(run)
    const flowRunId = own.flowRun?.id
    expect(flowRunId, 'the run has a flow run in its own project').toBeTruthy()

    const across = await app.inject({ method: 'GET', url: '/api/project/bootstrap', headers: { ...asAgent('served-worker'), 'x-mole-office-session': run } })
    expect(across.statusCode, across.body).toBe(200)
    const thisRun = (across.json() as { this_run: { run: string | null; flowRun: unknown; says?: string } }).this_run
    expect(thisRun.run).toBeNull()
    expect(thisRun.flowRun).toBeNull()
    expect(thisRun.says).toContain('another project')
    expect(JSON.stringify(thisRun)).not.toContain(flowRunId!)
    expect(across.body).not.toContain(flowRunId!)
  })
})
