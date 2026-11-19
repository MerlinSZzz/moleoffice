// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * EVERY RUN THE OFFICE FILES GETS A FLOW RUN BESIDE IT, IN THE SAME WRITE. Wave 1 of the office flow, M1 (report
 * 4IoRUKizcZXb, section 4), on a decision: record first, no gates.
 * Wave 13p round 25.
 *
 * WHAT IS MEASURED, in a test world. Every record here is synthetic:
 *
 *   · a run that names a flow gets a flow run naming that flow and the flow's revision at the run's start, read from
 *     the flow's newest revision; a later revision of the flow does not move it;
 *   · a run that names no flow gets a flow run that says "This run named no flow." and names none;
 *   · a run that names an id no flow record has gets a flow run that says so, and names no revision;
 *   · the first step is the office's own "The run was filed.", by the office, done;
 *   · a run filed finished in one write (as the merge tool files a secretary's entry run) gets its "sealed" and
 *     "ended" steps in that same write;
 *   · THE CENSUS: every session record filed by every path in this file has exactly one flow run, and no flow run
 *     is left without its run;
 *   · A FLOW RUN THAT CANNOT BE WRITTEN STOPS NOTHING: with a trigger in the test database that aborts every insert of
 *     a flow run, a run is still filed (201), its answer says the flow run was not written and why, and an open
 *     problem about the run says so.
 *
 * MUTATIONS (wave 13p round 25), each run once and put back:
 *   1. In `theFlowItNamed` (src/server/lib/flow-runs.ts), answer a named flow with no revision. The first case goes red.
 *   2. In `fileTheFlowRunOf`, take out the savepoint and the catch around the write. The failing-write case goes red:
 *      the run itself is refused.
 *   3. In `file()` (src/server/lib/records.ts), skip `fileTheFlowRunOf`. The census goes red.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { FastifyInstance } from 'fastify'

import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { NO_FLOW_NAMED, OFFICE_STEP_DOES, OFFICE_STEP_EVIDENCE, noFlowRecordHas } from '../src/shared/flow-run.ts'

let t: TestDb
// A FOLDER THIS FILE MAKES, for the run filed finished: the office seals a finished run's git work. A home inside
// it, so git reads no configuration of the machine's.
const made = mkdtempSync(join(tmpdir(), 'a-run-gets-its-flow-run-'))
const work = join(made, 'work')
function git(...args: string[]): void {
  execFileSync('git', ['-C', work, ...args], { env: { ...process.env, HOME: join(made, 'home') } })
}
let app: FastifyInstance

const WORKSPACE = 'default'
const AS_THE_PERSON = { 'x-mole-office-workspace': WORKSPACE, 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON }
const asAgent = (id: string): Record<string, string> => ({ 'x-mole-office-workspace': WORKSPACE, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': id })
const THE_OFFICE = { type: 'agent' as const, id: 'mole-office/the-api-server' }

const A_FLOW_DATA = {
  declared_in: 'a synthetic flow of this test',
  runs: 'a synthetic worker',
  trigger: 'A synthetic piece of work is asked for.',
  stages: [{ n: 1, does: 'The synthetic worker does the work.', evidence: 'a synthetic commit' }],
  leaves_behind: 'a synthetic commit',
  governed_by: 'this test file',
  reviewed_at: '2026-10-04',
}

async function post(url: string, payload: unknown, headers: Record<string, string>): Promise<{ code: number; said: Record<string, unknown> }> {
  const reply = await app.inject({ method: 'POST', url, headers, payload: payload as Record<string, unknown> })
  return { code: reply.statusCode, said: reply.json() as Record<string, unknown> }
}

async function aRun(data: Record<string, unknown>): Promise<{ id: string; said: Record<string, unknown> }> {
  const { code, said } = await post('/api/records', { kind: 'session', title: 'A synthetic run', data: { state: 'running', servingAgent: 'flow-worker', ...data } }, asAgent('flow-worker'))
  expect(code, JSON.stringify(said)).toBe(201)
  return { id: (said['record'] as { id: string }).id, said }
}

/** The flow runs of a run, read straight from the test database, so a second one would show. */
function theFlowRunsOf(run: string): { id: string; data: Record<string, unknown> }[] {
  return (t.client.sqlite.prepare("SELECT id, data FROM records WHERE kind = 'flow_run' AND json_extract(data, '$.run') = ?").all(run) as { id: string; data: string }[]).map((row) => ({
    id: row.id,
    data: JSON.parse(row.data) as Record<string, unknown>,
  }))
}

function theOneFlowRunOf(run: string): Record<string, unknown> {
  const held = theFlowRunsOf(run)
  expect(held, `run ${run}`).toHaveLength(1)
  return held[0]!.data
}

function theNewestRevision(id: string): { seq: number; contentHash: string } {
  const row = t.client.sqlite.prepare('SELECT seq, content_hash AS contentHash FROM revisions WHERE record_id = ? ORDER BY seq DESC LIMIT 1').get(id) as { seq: number; contentHash: string }
  return { seq: row.seq, contentHash: row.contentHash }
}

beforeAll(async () => {
  mkdirSync(join(made, 'home'), { recursive: true })
  mkdirSync(join(work, 'work'), { recursive: true })
  git('init', '-q', '-b', 'main')
  git('config', 'user.email', 'fixture@example.invalid')
  git('config', 'user.name', 'Synthetic flow-run fixture')
  writeFileSync(join(work, 'work', 'a.txt'), 'a synthetic file\n')
  git('add', '.')
  git('commit', '-q', '-m', 'Synthetic baseline')
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  const started = await post('/api/agents/started', { handle: 'flow-worker', name: 'Flow worker', role: 'worker', workArea: ['work'] }, AS_THE_PERSON)
  expect(started.code, JSON.stringify(started.said)).toBe(201)
})

afterAll(async () => {
  await app?.close()
  t?.close()
  rmSync(made, { recursive: true, force: true })
})

describe('a run gets a flow run from the flow it names', () => {
  it('names the flow and its revision at the start, and a later revision of the flow does not move it', async () => {
    // A FLOW STEP NAMES WHY IT IS THERE AND ITS SOURCES, so the step's source is filed first.
    const source = await post('/api/records', { kind: 'report', title: 'A synthetic reason for the step', data: { blocks: [] } }, asAgent('flow-worker'))
    expect(source.code, JSON.stringify(source.said)).toBe(201)
    const sourceId = (source.said['record'] as { id: string }).id
    const stages = A_FLOW_DATA.stages.map((step) => ({ ...step, why: 'Without it the synthetic work is not done.', sources: [sourceId] }))
    const flow = await post('/api/records', { kind: 'flow', title: 'A synthetic flow', data: { ...A_FLOW_DATA, stages } }, asAgent('flow-worker'))
    expect(flow.code, JSON.stringify(flow.said)).toBe(201)
    const flowId = (flow.said['record'] as { id: string }).id
    const atStart = theNewestRevision(flowId)

    const { id, said } = await aRun({ flow: flowId })
    expect(said['flowRun']).toEqual({ written: true, id: expect.any(String) })
    const flowRun = theOneFlowRunOf(id)
    expect(flowRun['run']).toBe(id)
    expect(flowRun['flow']).toBe(flowId)
    expect(flowRun['flowRevision']).toEqual(atStart)
    expect(flowRun['noFlow']).toBeUndefined()
    expect((flowRun['stepsTaken'] as unknown[])[0]).toEqual({ does: OFFICE_STEP_DOES.started, actor: { kind: 'agent', id: expect.any(String) }, startedAt: expect.any(String), endedAt: expect.any(String), how: 'by an agent', outcome: 'done', evidence: OFFICE_STEP_EVIDENCE.started })

    const changed = await app.inject({ method: 'PATCH', url: `/api/records/${flowId}`, headers: asAgent('flow-worker'), payload: { dataPatch: { reviewed_at: '2026-10-05' } } })
    expect(changed.statusCode, changed.body).toBe(200)
    expect(theNewestRevision(flowId).seq).toBeGreaterThan(atStart.seq)
    expect(theOneFlowRunOf(id)['flowRevision']).toEqual(atStart)
  })

  it('says "no flow named" when the run names none, and never guesses one', async () => {
    const { id } = await aRun({})
    const flowRun = theOneFlowRunOf(id)
    expect(flowRun['noFlow']).toBe(NO_FLOW_NAMED)
    expect(flowRun['flow']).toBeUndefined()
    expect(flowRun['flowRevision']).toBeUndefined()
  })

  it('says so when the run names an id no flow record has', async () => {
    const { id } = await aRun({ flow: 'no-such-flow' })
    const flowRun = theOneFlowRunOf(id)
    expect(flowRun['flow']).toBe('no-such-flow')
    expect(flowRun['noFlow']).toBe(noFlowRecordHas('no-such-flow'))
    expect(flowRun['flowRevision']).toBeUndefined()
  })
})

describe('a run filed finished in one write, as the merge tool files one', () => {
  it('gets its started, sealed and ended steps in that write', () => {
    const run = t.api.createRecord({
      kind: 'session',
      title: "A synthetic run the office files finished, as it files a secretary's design/ entry",
      workspaceId: WORKSPACE,
      actor: THE_OFFICE,
      data: { state: 'finished', servingAgent: 'flow-worker', workingDirectory: work, doing: 'Nobody ran it.' },
    })
    const steps = theOneFlowRunOf(run.id)['stepsTaken'] as { does: string; how: string; outcome: string }[]
    expect(t.api.getRecord(run.id)!.data['sealedTip']).toEqual(expect.any(String))
    expect(steps.map((step) => step.does)).toEqual([OFFICE_STEP_DOES.started, OFFICE_STEP_DOES.sealed, OFFICE_STEP_DOES.ended])
    expect(steps.every((step) => step.how === 'by the office')).toBe(true)
    expect(steps.at(-1)!.outcome).toBe('done')
  })
})

describe('a flow run that cannot be written stops nothing', () => {
  it('files the run, says the flow run was not written and why, and files an open problem about the run', async () => {
    t.client.sqlite.exec("CREATE TRIGGER no_flow_run BEFORE INSERT ON records WHEN NEW.kind = 'flow_run' BEGIN SELECT RAISE(ABORT, 'a synthetic refusal of this test'); END")
    try {
      const { id, said } = await aRun({})
      expect(t.api.getRecord(id)?.kind).toBe('session')
      expect(theFlowRunsOf(id)).toHaveLength(0)
      const flowRun = said['flowRun'] as { written: boolean; because: string; problem: string | null }
      expect(flowRun.written).toBe(false)
      expect(flowRun.because).toContain('a synthetic refusal of this test')
      expect(flowRun.problem).toEqual(expect.any(String))
      const problem = t.api.getRecord(flowRun.problem!)!
      expect(problem.kind).toBe('problem')
      expect(problem.data['state']).toBe('open')
      expect(JSON.stringify(problem.data)).toContain(id)
    } finally {
      t.client.sqlite.exec('DROP TRIGGER no_flow_run')
    }
  })
})

describe('the census', () => {
  it('every run filed in this file has exactly one flow run, and every flow run has its run', () => {
    const runs = t.client.sqlite.prepare("SELECT id FROM records WHERE kind = 'session'").all() as { id: string }[]
    const unwritten = t.client.sqlite
      .prepare("SELECT json_extract(data, '$.symptom') AS symptom FROM records WHERE kind = 'problem'")
      .all() as { symptom: string }[]
    expect(runs.length).toBeGreaterThanOrEqual(5)
    const without = runs.filter((run) => theFlowRunsOf(run.id).length !== 1 && !unwritten.some((one) => one.symptom.includes(run.id)))
    expect(without).toEqual([])
    const orphans = t.client.sqlite
      .prepare("SELECT f.id FROM records f LEFT JOIN records s ON s.id = json_extract(f.data, '$.run') AND s.kind = 'session' WHERE f.kind = 'flow_run' AND s.id IS NULL")
      .all()
    expect(orphans).toEqual([])
  })
})
