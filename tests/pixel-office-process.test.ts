// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * Synthetic, isolated regression cases for the process reading used by Pixel Office.
 * No provider, preview server or OS process is started. Only listResources is mocked;
 * workerRuns still queries the real freshDb session corpus and applies its own filters.
 */
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { freshDb, type TestDb } from './helpers.ts'
import type { ResourceReport } from '../src/server/lib/resources.ts'

let database: TestDb
let worker: typeof import('../src/server/lib/worker.ts')
let resources: typeof import('../src/server/lib/resources.ts')

beforeEach(async () => {
  database = await freshDb()
  resources = await import('../src/server/lib/resources.ts')
  worker = await import('../src/server/lib/worker.ts')
})

afterEach(() => {
  vi.restoreAllMocks()
  database?.close()
})

/** Insert fixture rows directly so setup does not dispatch a message or launch any work. */
function session(id: string, createdAt: string, deliveringMessage?: string): void {
  database.client.sqlite.prepare(
    `INSERT INTO records (owner_id, id, workspace_id, kind, title, summary, data, created_at, updated_at, origin) VALUES ('${THE_TEST_OFFICES_OWNER.id}', ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(id, 'default', 'session', 'Synthetic process regression: ' + id,
    'Fixture data for workerRuns filtering. No process was started.',
    JSON.stringify({ state: 'running', runtime: 'codex', servingAgent: 'synthetic-pixel-worker',
      ...(deliveringMessage === undefined ? {} : { deliveringMessage }) }),
    createdAt, createdAt, 'fixture')
}

/** Complete resource-reader output with explicitly synthetic liveness evidence. */
function aliveProcess(sessionRecordId: string): ResourceReport {
  return {
    id: 'synthetic-resource:' + sessionRecordId, sessionRecordId, type: 'process',
    key: 'synthetic-pid-never-probed', pgid: null, osStartedAt: null,
    detail: 'Synthetic alive process supplied by the test; no OS probe ran.',
    registeredAt: '2026-09-08 08:00:00', registeredBy: 'synthetic-test',
    releasedAt: null, releasedBy: null, releaseNote: null, world: null,
    // THE MARK THE WORKER PUTS ON THE ROW OF A RUN IT STARTS (`startOne` in src/worker/index.ts), which
    // is the row `workerRuns` reads a run's life from.
    startedByTheProduct: true,
    liveness: { state: 'alive', detail: 'Controlled synthetic liveness.' },
    age: { seconds: 0, human: '0 seconds' },
    session: { recordId: sessionRecordId, title: 'Synthetic running session', state: 'running',
      ended: false, endedAt: null, endedAtSource: null, note: null },
    orphanedFor: null, gpuMemory: null,
  }
}

it('keeps an older executing message run after more than 200 newer unrelated sessions', () => {
  const oldRun = 'synthetic-old-message-run'
  session(oldRun, '2026-09-08 08:00:00', 'synthetic-trigger')
  database.client.sqlite.transaction(() => {
    for (let index = 0; index < 205; index++) {
      session('synthetic-newer-manual-' + index, '2026-09-08 09:00:00')
    }
  })()
  const list = vi.spyOn(resources, 'listResources').mockImplementation(options =>
    options.sessionRecordId === oldRun ? [aliveProcess(oldRun)] : [])

  expect(worker.workerRuns().inFlight.map(run => run.session)).toEqual([oldRun])
  expect(list).toHaveBeenCalledWith(expect.objectContaining({ workspaceId: 'default', sessionRecordId: oldRun }))
})

it('does not treat a manual session with an alive preview process as an executing message run', () => {
  const manual = 'synthetic-manual-with-preview'
  const messageRun = 'synthetic-message-run-control'
  session(manual, '2026-09-08 09:00:00')
  session(messageRun, '2026-09-08 08:00:00', 'synthetic-trigger')
  const list = vi.spyOn(resources, 'listResources').mockImplementation(options =>
    options.sessionRecordId === manual || options.sessionRecordId === messageRun
      ? [aliveProcess(options.sessionRecordId)] : [])

  // Prove the configured preview evidence is alive; exclusion is not a dead-process stub.
  expect(list({ workspaceId: 'default', sessionRecordId: manual })[0]?.liveness.state).toBe('alive')
  const inFlight = worker.workerRuns().inFlight.map(run => run.session)
  expect(inFlight).toContain(messageRun)
  expect(inFlight).not.toContain(manual)
})
