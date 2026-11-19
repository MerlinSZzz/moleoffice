// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A SUPERVISOR'S RUN LISTS THE WORKERS IT ASKED FOR, READ FOR A PAGE. Wave 13j round loop-4, item 0: Normal mode drew
 * nothing of a run's `workerRuns`, and Developer mode drew it only as stored JSON. The record's answer now carries
 * `workers` on a run: for each worker, who it is, the model, the ask's state, and the worker's own run with its state,
 * its model, whether it sealed and its receipt's cost. src/server/lib/worker-runs.ts reads it, in `theWorkersARunStarted`.
 *
 * EVERY RECORD HERE IS MADE UP. The entries under `workerRuns` and the seals and receipts on the worker runs are written
 * straight into the test office with `writeDataBypassingTheGate`, because only the office's own doors write them, and
 * those doors are proved in tests/a-supervisor-starts-its-own-worker.test.ts. This test proves the reading of what they
 * keep.
 *
 * What is proved:
 *   1. A run with nine entries answers eight workers, oldest ask first, and counts the ninth, which does not read as an
 *      ask: a sealed run with a cost; a running run with no receipt; a receipt that gives no cost; a wanted ask; a failed
 *      ask; a starting ask with the model its launcher was given; a run that was deleted; a run in another project. The
 *      registry's name is given where the registry holds the worker, and null where it does not.
 *   2. A run that asked for no worker answers `workers: null`, and a record that is not a run has no `workers` key.
 *
 * Mutations, one at a time, restored with cp and checked with cmp:
 *   A. src/server/lib/worker-runs.ts, `theWorkersARunStarted` keeps a deleted run: case 1 goes red.
 *   B. src/server/lib/worker-runs.ts, `theWorkersARunStarted` keeps a run in another project: case 1 goes red.
 *   C. src/server/lib/worker-runs.ts, `sealed` is read as `true`: case 1 goes red.
 *   D. src/server/lib/worker-runs.ts, a receipt with no cost is read as no receipt: case 1 goes red.
 *   E. src/server/lib/worker-runs.ts, an entry that does not read is dropped without being counted: case 1 goes red.
 *   F. src/server/api/records.ts, `workers` is answered on every kind: case 2 goes red.
 */
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { apiApp, freshDb, writeDataBypassingTheGate, type TestDb } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import type { TheWorkerRun, TheWorkersARunStarted } from '../src/shared/worker-runs.ts'

let t: TestDb
let app: FastifyInstance

const AS_THE_PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  // The first one loads the whole server, which on a busy machine takes longer than the default ten seconds.
}, 120_000)

afterAll(async () => {
  await app.close()
  t.close()
})

/** Register a made-up agent through the door, and give back its registry id. */
async function anAgent(handle: string, name: string): Promise<string> {
  const started = await app.inject({ method: 'POST', url: '/api/agents/started', headers: AS_THE_PERSON, payload: { handle, name, role: 'worker' } })
  expect(started.statusCode, started.body.slice(0, 300)).toBe(201)
  return (t.client.sqlite.prepare('SELECT id FROM agents WHERE handle = ?').get(handle) as { id: string }).id
}

/** A made-up run, with what is stored on it written as the office would keep it. */
function aRun(title: string, data: Record<string, unknown>, workspaceId = 'default'): string {
  const id = t.api.createRecord({ kind: 'session', title, data: { state: 'running', runtime: 'claude-code' }, workspaceId, actor: t.api.HUMAN }).id
  writeDataBypassingTheGate(t, id, { runtime: 'claude-code', ...data })
  return id
}

/** One stored ask, as the worker-run door keeps it, at the minute given. */
function anAsk(handle: string, minute: number, rest: Partial<TheWorkerRun>): TheWorkerRun {
  return {
    state: 'wanted',
    askedAt: `2026-10-13 09:${String(minute).padStart(2, '0')}:00`,
    askedBy: { who: { kind: 'agent', id: 'made-up-supervisor' }, session: 'made-up-run' },
    handle,
    brief: { path: '/made/up/briefs/one.md', sha256: 'a'.repeat(64), bytes: 120 },
    sandbox: { folder: '/made/up', instance: 'made-up', container: 'made-up-container' },
    ...rest,
  }
}

const startingWith = (model: string) => ({
  at: '2026-10-13 09:30:00',
  wrapper: 'made-up-launcher',
  runtime: 'claude-code',
  model,
  casting: 1,
  castingSays: 'A made-up Casting row.',
  effort: null,
  effortFrom: 'none' as const,
  effortSays: 'No effort is cast.',
})

async function theAnswerFor(id: string): Promise<Record<string, unknown>> {
  const reply = await app.inject({ method: 'GET', url: `/api/records/${id}`, headers: AS_THE_PERSON })
  expect(reply.statusCode, reply.body.slice(0, 400)).toBe(200)
  return reply.json() as Record<string, unknown>
}

describe("a supervisor's run lists the workers it asked for", () => {
  it('1: every ask is read with its own run, oldest first, and an entry that does not read is counted', async () => {
    const ada = await anAgent('ws-ada', 'Ada, a made-up builder')
    const bo = await anAgent('ws-bo', 'Bo, a made-up builder')
    const cy = await anAgent('ws-cy', 'Cy, a made-up tester')
    const di = await anAgent('ws-di', 'Di, a made-up writer')
    const ed = await anAgent('ws-ed', 'Ed, a made-up builder')
    const fy = await anAgent('ws-fy', 'Fy, a made-up builder')
    const { createWorkspace } = await import('../src/server/lib/workspaces.ts')
    createWorkspace({ id: 'other', title: 'Other' })

    const sealed = aRun('Made-up run: Ada builds the list', { state: 'finished', model: 'claude-opus-5-5', sealedTip: 'made-up-seal', usageReceipt: { inputTokens: 1000, costUsd: 1.25 } })
    const running = aRun('Made-up run: Bo builds the page', { state: 'running', model: 'deepseek-v4' })
    const noCost = aRun('Made-up run: Cy tests the page', { state: 'finished', model: 'luna-2', usageReceipt: { inputTokens: 500 } })
    const deleted = aRun('Made-up run: Ed, deleted', { state: 'finished', model: 'luna-2' })
    t.api.deleteRecord(deleted, t.api.HUMAN)
    const elsewhere = aRun('Made-up run: a run in another project', { state: 'finished', model: 'luna-2' }, 'other')

    const supervisor = aRun('Made-up run: the supervisor', {
      state: 'running',
      workerRuns: {
        [fy]: anAsk('ws-fy', 6, { state: 'starting', starting: startingWith('luna-2') }),
        [bo]: anAsk('ws-bo', 2, { state: 'started', starting: startingWith('deepseek-v4'), started: { at: '2026-10-13 09:31:00', run: running, runKeyId: 'k2' } }),
        [ada]: anAsk('ws-ada', 1, { state: 'started', starting: startingWith('claude-opus-5-5'), started: { at: '2026-10-13 09:31:00', run: sealed, runKeyId: 'k1' } }),
        [cy]: anAsk('ws-cy', 3, { state: 'started', starting: startingWith('luna-2'), started: { at: '2026-10-13 09:31:00', run: noCost, runKeyId: 'k3' } }),
        [di]: anAsk('ws-di', 4, {}),
        [ed]: anAsk('ws-ed', 5, { state: 'started', starting: startingWith('luna-2'), started: { at: '2026-10-13 09:31:00', run: deleted, runKeyId: 'k5' } }),
        'gone-agent': anAsk('ws-gone', 7, { state: 'started', starting: startingWith('luna-2'), started: { at: '2026-10-13 09:31:00', run: elsewhere, runKeyId: 'k7' } }),
        'failed-agent': anAsk('ws-failed', 8, { state: 'failed', failed: { at: '2026-10-13 09:40:00', says: 'The brief changed after it was asked for.' } }),
        'not-an-ask': { state: 'made-up', handle: 'nobody' },
      },
    })

    const answer = await theAnswerFor(supervisor)
    const workers = answer['workers'] as TheWorkersARunStarted
    const ask = { failedSays: null, package: null }
    expect(workers).toEqual({
      workers: [
        { ...ask, agent: ada, name: 'Ada, a made-up builder', handle: 'ws-ada', asked: 'started', modelGiven: 'claude-opus-5-5', runId: sealed,
          run: { title: 'Made-up run: Ada builds the list', state: 'finished', model: 'claude-opus-5-5', sealed: true, receipt: { costUsd: 1.25 } } },
        { ...ask, agent: bo, name: 'Bo, a made-up builder', handle: 'ws-bo', asked: 'started', modelGiven: 'deepseek-v4', runId: running,
          run: { title: 'Made-up run: Bo builds the page', state: 'running', model: 'deepseek-v4', sealed: false, receipt: null } },
        { ...ask, agent: cy, name: 'Cy, a made-up tester', handle: 'ws-cy', asked: 'started', modelGiven: 'luna-2', runId: noCost,
          run: { title: 'Made-up run: Cy tests the page', state: 'finished', model: 'luna-2', sealed: false, receipt: { costUsd: null } } },
        { ...ask, agent: di, name: 'Di, a made-up writer', handle: 'ws-di', asked: 'wanted', modelGiven: null, runId: null, run: null },
        { ...ask, agent: ed, name: 'Ed, a made-up builder', handle: 'ws-ed', asked: 'started', modelGiven: 'luna-2', runId: deleted, run: null },
        { ...ask, agent: fy, name: 'Fy, a made-up builder', handle: 'ws-fy', asked: 'starting', modelGiven: 'luna-2', runId: null, run: null },
        { ...ask, agent: 'gone-agent', name: null, handle: 'ws-gone', asked: 'started', modelGiven: 'luna-2', runId: elsewhere, run: null },
        { agent: 'failed-agent', name: null, handle: 'ws-failed', asked: 'failed', failedSays: 'The brief changed after it was asked for.', package: null, modelGiven: null, runId: null, run: null },
      ],
      unreadable: 1,
    })
  })

  it('2: a run that asked for no worker answers null, and a record that is not a run has no workers key', async () => {
    const quiet = aRun('Made-up run: asked for no worker', { state: 'running' })
    const answer = await theAnswerFor(quiet)
    expect(Object.hasOwn(answer, 'workers'), 'a run carries the key').toBe(true)
    expect(answer['workers']).toBeNull()

    const decision = t.api.createRecord({
      kind: 'decision',
      title: 'Made-up decision',
      data: { option_taken: 'A made-up option.', because: 'A made-up reason.' },
      workspaceId: 'default',
      actor: t.api.HUMAN,
    }).id
    expect(Object.hasOwn(await theAnswerFor(decision), 'workers'), 'a decision carries a workers key').toBe(false)
  })
})
