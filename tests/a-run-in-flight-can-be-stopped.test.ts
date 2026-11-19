// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { withoutInheritedEffort } from './without-inherited-effort.ts'
/**
 * A RUN THE PRODUCT STARTED CAN BE STOPPED FROM THE PRODUCT, WHILE IT IS STILL RUNNING.
 *
 * Criterion M9 of design/messages/ACCEPTANCE.md, and proposal
 * `LVH7c4IrtwIE`: a run Mole Office starts can be stopped from the product. Until 4 September 2026
 * `POST /api/runtime/stop` refused every row whose owning session had not ended, which for a run is
 * every row that matters — a run whose session has ended is a run that is already over.
 *
 * THE OWNER'S F1 RULE IS UNTOUCHED AND THIS FILE PROVES IT: the product still refuses to stop anything that
 * does not say Mole Office started it, and still refuses a live session that is doing other work.
 * What changed is one case, where the session record IS the process.
 *
 * Criterion M4 is here too: an agent with a run in flight reads as online, because a process
 * serving it is on this machine. Before this the run was registered by the worker, so the agent
 * looked offline while it was answering.
 */

import type { AddressInfo } from 'node:net'
import { spawn, type ChildProcess } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, URL } from 'node:url'

import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { THE_PERSON } from '../src/shared/person.ts'
import { onePass, type WorkerSettings } from '../src/worker/index.ts'
import { apiApp, freshDb, one, type TestDb } from './helpers.ts'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { aCheckoutForATestRun } from './a-checkout-for-a-test-run.ts'

const FAKE = fileURLToPath(new URL('./fake-runtime.mjs', import.meta.url))

let t: TestDb
let app: FastifyInstance
let outputs: string
let settings: WorkerSettings
const watching: Parameters<typeof onePass>[1] = []

const AS_THE_OWNER = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

async function post(path: string, body: unknown, headers = AS_THE_OWNER): Promise<Record<string, unknown>> {
  const reply = await app.inject({ method: 'POST', url: path, headers, payload: body as object })
  return JSON.parse(reply.body === '' ? '{}' : reply.body) as Record<string, unknown>
}

async function get(path: string): Promise<Record<string, unknown>> {
  const reply = await app.inject({ method: 'GET', url: path, headers: AS_THE_OWNER })
  return JSON.parse(reply.body === '' ? '{}' : reply.body) as Record<string, unknown>
}

let agentId: string
let messageId: string
let runSession: string
let resourceId: string

beforeAll(async () => {
  t = await freshDb()
  const built = await apiApp()
  app = built.app
  await app.ready()
  await app.listen({ host: '127.0.0.1', port: 0 })
  const api = `http://127.0.0.1:${String((app.server.address() as AddressInfo).port)}`
  outputs = mkdtempSync(join(tmpdir(), 'mole-office-stop-runs-'))
  settings = {
    api,
    workspace: 'default',
    session: null,
    stopWithPid: null,
    checkout: aCheckoutForATestRun(),
    runs: 2,
    hops: 3,
    outputRoot: outputs,
    env: { ...withoutInheritedEffort(), MOLE_OFFICE_FAKE_RUNTIME: FAKE },
  }

  await post('/api/records', { kind: 'agent', title: 'builder-w', data: { handle: 'builder-w', runtime: 'claude-code', state: 'active' } })
  const listed = (await get('/api/participants')) as { agents?: { id: string; handle: string }[] }
  agentId = one((listed.agents ?? []).filter((a) => a.handle === 'builder-w'), 'the registry row').id

  // A MESSAGE THAT MAKES THE RUN HANG, so there is a run in flight to stop. The fake runtime reads
  // its own behaviour out of the prompt, so a test asks for one by writing a message.
  const filed = await post('/api/records', {
    kind: 'message',
    title: 'a message that hangs',
    data: { body: 'please hang while I decide whether to stop you', to: [{ kind: 'agent', id: agentId }] },
  })
  messageId = (filed['record'] as { id: string }).id
  // AND THE PERSON PRESSES TO START AN AGENT FOR IT. Criterion M78: this agent is fresh and has no
  // conversation here to pick up, so a message to it waits for the owner's press. This file is about
  // stopping a run that IS going, so the press is setup.
  await post(`/api/messages/${messageId}/start-an-agent`, {})

  const report = await onePass(settings, watching)
  runSession = one(report.started, 'the run that was started').session
  const rows = (await get('/api/resources')) as { resources?: { id: string; sessionRecordId: string; type: string }[] }
  resourceId = one(
    (rows.resources ?? []).filter((r) => r.sessionRecordId === runSession && r.type === 'process'),
    'the ledger row for the run',
  ).id
}, 60_000)

afterAll(async () => {
  // Whatever this file did not stop, stop now, by the group each run wrote down. A run that has
  // already gone answers ESRCH, which is the thing this loop is trying to bring about.
  for (const run of watching) {
    try {
      run.adapter.stop(run.handle, 'the test file has finished')
    } catch {
      continue
    }
  }
  await app.close()
  t.close()
  rmSync(outputs, { recursive: true, force: true })
})

describe('an agent answering a message reads as online', () => {
  /**
   * WHAT THIS ASSERTED BEFORE CRITERION M79, and why the input changed.
   *
   * It read `a running process`: the run was green because the resources ledger held a live row the
   * worker had registered for it. That is still true, and it is no longer the STRONGEST thing true
   * of a run — since M79 a run takes the same hold on the agent's handle that a terminal takes and
   * beats it while it goes, and a hold is read before the ledger. The fault it mends:
   * an agent went offline the moment it had spoken, because a process ending is
   * not a run saying it has finished. What this case is about is unchanged: an agent a run is
   * answering for reads as green, from something measured and not from anything it declared.
   */
  it('is green because a run is answering as it, which is what the run says while it goes', async () => {
    const said = (await get(`/api/presence/agent/${agentId}`)) as { presence?: { colour: string; from: string | null; says: string } }
    expect(said.presence?.colour).toBe('green')
    expect(said.presence?.from).toBe('a run answering as it')
    expect(said.presence?.says).toContain('A run Mole Office started for this agent')
  })
})

describe('the runtime page has a row for the worker', () => {
  it('says this server started no worker, and which of the two reasons that is', async () => {
    // Nothing has TRIED here: these tests build the API in place and never run the start path. That
    // is a different answer from "it tried and could not", and the row says which.
    const record = (await get('/api/runtime')) as { worker?: { started: boolean; says: string; runs: { inFlight: unknown[] } } }
    expect(record.worker?.started).toBe(false)
    expect(record.worker?.says).toContain('Nothing has tried')
    // AND THE RUNS ARE STILL COUNTED, because they are rows and not something the worker told it.
    expect(record.worker?.runs.inFlight).toHaveLength(1)
  })
})

describe('a press stops the run, and the message says who stopped it and why', () => {
  it('stops it while its session is still running, because the session is the run', async () => {
    const said = await post('/api/runtime/stop', { resourceId, why: 'it was going nowhere' })
    expect(said['stopped'], JSON.stringify(said)).toBe(true)
    expect(said['stillAlive']).toBe(false)
  })

  it('writes who stopped it and why on the delivery row, beside the clock', async () => {
    const read = (await get(`/api/messages/${messageId}`)) as {
      message?: { deliveries?: { because: string | null }[] }
    }
    const stands = one(read.message?.deliveries ?? [], 'the delivery row')
    expect(stands.because).toContain(`${THE_TEST_OFFICES_OWNER.id} stopped the run serving this message`)
    expect(stands.because).toContain('it was going nowhere')
  })

  it('records in the change log that the run was interrupted rather than found finished', async () => {
    const rows = (await get('/api/resources?includeReleased=true')) as {
      resources?: { id: string; releaseNote: string | null }[]
    }
    const row = one((rows.resources ?? []).filter((r) => r.id === resourceId), 'the released row')
    expect(row.releaseNote).toContain('while it was still running')
    expect(row.releaseNote).toContain('because Mole Office started it')
  })
})

describe('the owner’s rule of 3 September is untouched: the product never stops what it did not start', () => {
  it('refuses a row that does not say Mole Office started it', async () => {
    const session = (
      await post('/api/records', {
        kind: 'session',
        title: 'somebody else, still going',
        data: { state: 'running' },
      })
    )['record'] as { id: string }
    const row = (await post(
      '/api/resources',
      { sessionRecordId: session.id, type: 'process', key: String(process.pid), detail: 'this test process', adopting: 'this test process started before the session the test filed for it' },
    ))['resource'] as { id: string }
    const said = await app.inject({
      method: 'POST',
      url: '/api/runtime/stop',
      headers: AS_THE_OWNER,
      payload: { resourceId: row.id, why: 'because I want to' },
    })
    expect(said.statusCode).toBe(409)
    expect(said.body).toContain('does not say Mole Office started it')
  })

  it('refuses a live session that is doing other work, even when the product started the process', async () => {
    // The session record does NOT say `startedByMoleOffice`, so it is a session with a process in
    // it rather than a session that IS a process. This is the case the owner's rule is about.
    const session = (
      await post('/api/records', {
        kind: 'session',
        title: 'a session with a server of its own',
        data: { state: 'running' },
      })
    )['record'] as { id: string }
    const row = (await post('/api/resources', {
      sessionRecordId: session.id,
      type: 'process',
      key: String(process.pid),
      detail: 'a server this session started',
      startedByTheProduct: true,
      adopting: 'this test process started before the session the test filed for it',
    }))['resource'] as { id: string }
    const said = await app.inject({
      method: 'POST',
      url: '/api/runtime/stop',
      headers: AS_THE_OWNER,
      payload: { resourceId: row.id, why: 'because I want to' },
    })
    expect(said.statusCode).toBe(409)
    expect(said.body).toContain('still going')
  })
})

/**
 * THE MESSAGE WORKER'S OWN ROW, STOPPED FROM THE PRODUCT, ENDS ITS RECORD. Problem GOYE4Y8okQ-z.
 *
 * A run delivering a message was already ended by the press. The worker's own row delivers no
 * message, so `sayARunWasStopped` returned before it wrote anything and the record went on saying
 * `running`. The process here is a synthetic one this file starts in a group of its own; the
 * session record is shaped as src/server/index.ts files the worker's.
 */
describe('a press on the message worker\'s own row ends that row\'s record', () => {
  const started: ChildProcess[] = []

  afterAll(() => {
    for (const child of started) {
      if (child.pid === undefined || child.exitCode !== null || child.signalCode !== null) continue
      try { process.kill(-child.pid, 'SIGTERM') } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error
      }
    }
  })

  /** A session record shaped as the worker's own, a synthetic process, and its ledger row. */
  async function aWorkerRow(state: 'running' | 'finished'): Promise<{ session: string; resource: string }> {
    const session = ((await post('/api/records', {
      kind: 'session',
      title: 'Synthetic message worker',
      data: { state, runtime: 'mole-office', doing: 'taking the message queue', startedByMoleOffice: true },
    }))['record'] as { id: string }).id
    const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { detached: true, stdio: 'ignore' })
    started.push(child)
    const resource = ((await post('/api/resources', {
      sessionRecordId: session,
      type: 'process',
      key: String(child.pid),
      detail: 'a synthetic message worker',
      startedByTheProduct: true,
    }))['resource'] as { id: string }).id
    return { session, resource }
  }

  it('writes crashed, with who stopped it and why, on a record that said running', async () => {
    const row = await aWorkerRow('running')
    const said = await post('/api/runtime/stop', { resourceId: row.resource, why: 'the synthetic worker is not wanted' })
    expect(said['stopped'], JSON.stringify(said)).toBe(true)
    const read = (await get(`/api/records/${row.session}`)) as { record?: { data?: Record<string, unknown> } }
    expect(read.record?.data?.['state']).toBe('crashed')
    expect(String(read.record?.data?.['doing'])).toContain(`${THE_PERSON} stopped this run: the synthetic worker is not wanted`)
  })

  it('leaves a record that had already ended as it was', async () => {
    const row = await aWorkerRow('finished')
    const said = await post('/api/runtime/stop', { resourceId: row.resource, why: 'tidying what it left' })
    expect(said['stopped'], JSON.stringify(said)).toBe(true)
    const read = (await get(`/api/records/${row.session}`)) as { record?: { data?: Record<string, unknown> } }
    expect(read.record?.data?.['state']).toBe('finished')
    expect(read.record?.data?.['doing']).toBe('taking the message queue')
  })
})
