// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A RUN THAT DECLARES NO SUBMISSION IS TOLD TO DECLARE ONE, AND HOW. Problems o8rBHt9RtUUJ and JF9q5cqiOPCS.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT WAS WRONG
 * ---------------------------------------------------------------------------------------
 *
 * A run whose work is records or files, not commits, has an agent with no work area. Patching it finished with no
 * `data.submission` was refused with "The run cannot finish: no registered work area can be sealed." The finish path
 * reads a missing submission as a git one, and git needs a work area. The work area was not what was missing, and the
 * sentence did not say what to send. So a starter left with a file-only worker's run (its report linked, its command
 * ended) had no way it was told of to finish it, and the run stayed open.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS FILE MEASURES
 * ---------------------------------------------------------------------------------------
 *
 * One registered worker with no work area, and its runs, each with a report linked about it.
 *   (a) finished with no submission: refused, and the sentence names the missing data.submission, the report linked
 *       to the run, and the exact write that finishes it. Nothing is written.
 *   (b) that write finishes it.
 *   (c) a run already written orphaned by its launcher is finished by its starter the same way.
 *   (d) a run that declares a git submission and has no work area is still told the work area is missing, because
 *       then that is what is missing.
 *   (e) a run that declares a mixed submission and has no work area is told the exact work-area write for its own
 *       agent, named by its registry id, and run, and the records submission; nothing is written.
 *
 * ---------------------------------------------------------------------------------------
 * MUTATION PROOF, after a green control
 * ---------------------------------------------------------------------------------------
 *
 * In `sealFinishedRun` (src/server/lib/sealed-tip.ts), throw the old work-area sentence whatever was declared. (a)
 * goes red. (b), (c) and (d) stay green, because they declare a submission.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'

let t: TestDb
let app: FastifyInstance
let workerId = ''
const WORKER = 'files-worker'
const asWorker = { 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': WORKER }
const actor = { type: 'agent' as const, id: WORKER }

/** A run of the worker, in the given state, with a report linked about it. */
function aRunWithItsReport(state: string): { run: string; report: string } {
  const run = t.api.createRecord({
    kind: 'session',
    title: 'Test: a run whose work is files',
    workspaceId: 'default',
    actor,
    origin: 'fixture',
    data: { state, servingAgent: WORKER },
  }).id
  const report = t.api.createRecord({
    kind: 'report',
    title: 'Test: what the files run did',
    workspaceId: 'default',
    actor,
    data: { blocks: [{ id: 'b-1', type: 'text', text: 'Test: the pictures are in out/files-worker/.' }] },
  }).id
  t.api.createLink({ fromId: report, toId: run, type: 'about', actor })
  return { run, report }
}

async function finishWith(id: string, dataPatch: Record<string, unknown>) {
  const res = await app.inject({ method: 'PATCH', url: `/api/records/${id}`, headers: asWorker, payload: { dataPatch } })
  return { status: res.statusCode, error: String((res.json() as Record<string, unknown>)['error'] ?? ''), body: res.body }
}

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  const person = { 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id }
  const starter = await app.inject({ method: 'POST', url: '/api/agents/started', headers: person, payload: { handle: 'test-starter', name: 'Test starter' } })
  expect(starter.statusCode, starter.body).toBe(201)
  const worker = await app.inject({
    method: 'POST',
    url: '/api/agents/started',
    headers: { ...asWorker, 'x-mole-office-actor-id': 'test-starter' },
    payload: { handle: WORKER, name: 'Test files worker', workArea: [] },
  })
  expect(worker.statusCode, worker.body).toBe(201)
  workerId = (worker.json() as { agent: { id: string } }).agent.id
})

afterAll(async () => {
  await app?.close()
  t?.close()
})

describe('a run whose agent has no work area', () => {
  it('(a) is told, when it declares no submission, what to declare and which report is linked to it', async () => {
    const { run, report } = aRunWithItsReport('running')
    const refused = await finishWith(run, { state: 'finished' })
    expect(refused.status, refused.body).toBe(409)
    expect(refused.error).toContain('declares no submission')
    expect(refused.error).toContain('data.submission')
    expect(refused.error).toContain(report)
    expect(refused.error).toContain(`{"kind":"records","records":["${report}"]}`)
    expect(refused.error).toContain('Nothing was written.')
    expect(refused.error, 'the missing thing is the submission, not a work area').not.toContain('no registered work area')
    expect(t.api.getRecord(run)?.data['state']).toBe('running')
  })

  it('(b) finishes with the records submission the refusal named', async () => {
    const { run, report } = aRunWithItsReport('running')
    const finished = await finishWith(run, { state: 'finished', submission: { kind: 'records', records: [report] } })
    expect(finished.status, finished.body).toBe(200)
    expect(t.api.getRecord(run)?.data['state']).toBe('finished')
  })

  it('(c) finishes the same way when its launcher already wrote it orphaned', async () => {
    const { run, report } = aRunWithItsReport('orphaned')
    const finished = await finishWith(run, { state: 'finished', submission: { kind: 'records', records: [report] } })
    expect(finished.status, finished.body).toBe(200)
    expect(t.api.getRecord(run)?.data['state']).toBe('finished')
  })

  it('(d) is told the work area is missing when it declares a git submission', async () => {
    const { run } = aRunWithItsReport('running')
    const refused = await finishWith(run, { state: 'finished', submission: { kind: 'git' } })
    expect(refused.status, refused.body).toBe(409)
    expect(refused.error).toContain('no registered work area')
  })

  it('(e) is told the work-area write for its own agent and run, and the records submission, when it declares a mixed submission', async () => {
    const { run, report } = aRunWithItsReport('running')
    const refused = await finishWith(run, { state: 'finished', submission: { kind: 'mixed', records: [report] } })
    expect(refused.status, refused.body).toBe(409)
    expect(refused.error).toContain('no registered work area')
    expect(refused.error).toContain('Nothing was written.')
    expect(refused.error).toContain(`POST /api/participants/agent/${workerId}/work-area`)
    expect(refused.error, 'a handle may be shared with a live agent once the run’s agent is retired').not.toContain('/agent/files-worker/')
    expect(refused.error).toContain(`"forRun":"${run}"`)
    expect(refused.error).toContain(`{"kind":"records","records":["${report}"]}`)
    expect(t.api.getRecord(run)?.data['state']).toBe('running')
  })
})
