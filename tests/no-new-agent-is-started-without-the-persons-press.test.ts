// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { withoutInheritedEffort } from './without-inherited-effort.ts'
/** Previously fake-runtime exits needed no submitted work. This fixture now registers a record area when absent and submits an explicit completion note through the real sealer; all original delivery and timing assertions remain. */
import { supplyRuntimeSubmissions } from './synthetic-submission-fixtures.ts'
/**
 * A MESSAGE THAT WOULD START A NEW AGENT WAITS FOR THE PERSON'S PRESS.
 *
 * Criterion M78 of design/messages/ACCEPTANCE.md section 41: a message to an agent that cannot be
 * reached must not start a new agent by itself.
 *
 * WHAT WENT WRONG. The person wrote to an agent whose tool lives on another machine. A run started here by
 * itself, could not reach Mole Office, and answered the person with a sentence about a run they had never
 * asked to exist.
 *
 * WHAT IS PROVED HERE, in four parts.
 *
 * 1. A message to an agent with no conversation of its own here starts no run. The delivery row
 *    says nothing is answering as it and that it is waiting for the press, rather than leaving a
 *    clock nobody can explain.
 * 2. The press is the person's. An agent asking for it is refused 403 and nothing is written.
 * 3. After the person's press the very next pass starts the run — so the press opens the ordinary path
 *    rather than a second one, and the message was never lost.
 * 4. An agent that HAS a conversation here is not asked about. This is the narrowing the secretary settled
 *    on 7 September after the first reading of M78 was measured against the suite: a message to an
 *    agent that has run before is picked up by that agent's own conversation, and a person writing
 *    into a group they are already talking in is not made to press for each agent in it.
 *
 * IT DRIVES THE REAL WORKER: `onePass` from src/worker/index.ts, with the fake runtime.
 *
 * ---------------------------------------------------------------------------------------
 * MUTATION, RUN AT THE MERGE COMMIT 300ea432 ON 8 SEPTEMBER 2026
 * ---------------------------------------------------------------------------------------
 *
 * A CONTROL RUN FIRST: 4 cases, all green. Then, in `whyNotNow` in src/worker/index.ts, the line
 * `if (one.nobodyIsAnsweringAsIt !== null) return one.nobodyIsAnsweringAsIt` was deleted, so the
 * worker stops holding a message that would start a new agent and starts one by itself.
 *
 * THE CASES THAT WENT RED, and they are the ones this criterion is about:
 *
 *   × starts no run, and the row says nothing is answering rather than leaving a clock
 *   × refuses an agent the press, so nothing but a person can start one
 *   × starts the run on the next pass once the person has pressed, and says on the row that they did
 *
 * The change was put back and the control run again: 4 cases, all green. So the test holds the
 * behaviour rather than passing beside it.
 */

import type { AddressInfo } from 'node:net'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, URL } from 'node:url'

import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { THE_PERSON } from '../src/shared/person.ts'
import { onePass, type WorkerSettings } from '../src/worker/index.ts'
import { apiApp, freshDb, one, type TestDb } from './helpers.ts'
import { aCheckoutForATestRun } from './a-checkout-for-a-test-run.ts'

const FAKE = fileURLToPath(new URL('./fake-runtime.mjs', import.meta.url))

let t: TestDb
let app: FastifyInstance
let api: string
let outputs: string
let settings: WorkerSettings
const watching: Parameters<typeof onePass>[1] = []

const AS_THE_OWNER = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

const AS_AN_AGENT = { ...AS_THE_OWNER, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': 'some-builder' }

async function post(path: string, body: unknown, headers = AS_THE_OWNER) {
  return await app.inject({ method: 'POST', url: path, headers, payload: body as never })
}

async function get(path: string): Promise<Record<string, unknown>> {
  const reply = await app.inject({ method: 'GET', url: path, headers: AS_THE_OWNER })
  return reply.json() as Record<string, unknown>
}

async function anAgent(handle: string): Promise<string> {
  await post('/api/records', {
    kind: 'agent',
    title: handle,
    data: { handle, state: 'active', runtime: 'claude-code' },
  })
  const listed = (await get('/api/participants')) as { agents?: { id: string; handle: string }[] }
  return one((listed.agents ?? []).filter((a) => a.handle === handle), `the registry row for ${handle}`).id
}

async function messageTo(agentId: string, body: string): Promise<string> {
  const filed = await post('/api/records', {
    kind: 'message',
    title: body.slice(0, 60),
    data: { body, to: [{ kind: 'agent', id: agentId }] },
  })
  return ((filed.json() as { record: { id: string } }).record).id
}

async function delivery(messageId: string): Promise<{ mark: string; because: string | null; run: string | null }> {
  const read = (await get(`/api/messages/${messageId}`)) as {
    message?: { deliveries?: { mark: string; because: string | null; run: string | null }[] }
  }
  return one(read.message?.deliveries ?? [], `a delivery row for ${messageId}`)
}

beforeAll(async () => {
  t = await freshDb()
  const built = await apiApp()
  app = built.app
  supplyRuntimeSubmissions(t, app)
  await app.ready()
  await app.listen({ host: '127.0.0.1', port: 0 })
  api = `http://127.0.0.1:${String((app.server.address() as AddressInfo).port)}`
  outputs = mkdtempSync(join(tmpdir(), 'mole-office-press-'))
  settings = {
    api,
    workspace: 'default',
    session: null,
    stopWithPid: null,
    checkout: aCheckoutForATestRun(),
    runs: 4,
    hops: 3,
    outputRoot: outputs,
    env: { ...withoutInheritedEffort(), MOLE_OFFICE_FAKE_RUNTIME: FAKE },
  }
}, 60_000)

afterAll(async () => {
  for (const left of watching.splice(0, watching.length)) left.adapter.stop(left.handle, 'the test is over')
  await app.close()
  t.close()
  rmSync(outputs, { recursive: true, force: true })
})

describe('a message to an agent with no conversation of its own here', () => {
  let agentId: string
  let messageId: string

  it('starts no run, and the row says nothing is answering rather than leaving a clock', async () => {
    agentId = await anAgent('codex-on-the-other-machine')
    messageId = await messageTo(agentId, 'Can you look at the loquat logs?')

    const queue = (await get('/api/worker/queue?full=1')) as { queue?: Record<string, unknown>[] }
    const row = one(
      (queue.queue ?? []).filter((x) => x['messageId'] === messageId),
      'the message waiting',
    )
    expect(row['resume']).toBeNull()
    expect(String(row['nobodyIsAnsweringAsIt'])).toContain('Start a new agent?')

    const report = await onePass(settings, watching)

    expect(report.started.filter((run) => run.messageId === messageId)).toEqual([])
    const stands = await delivery(messageId)
    expect(stands.mark).toBe('queued')
    expect(stands.run).toBeNull()
    expect(String(stands.because)).toContain('Nothing is answering as "codex-on-the-other-machine"')
    expect(String(stands.because)).toContain('Nothing was started.')
  })

  it('refuses an agent the press, so nothing but a person can start one', async () => {
    const no = await post(`/api/messages/${messageId}/start-an-agent`, {}, AS_AN_AGENT)

    expect(no.statusCode).toBe(403)
    expect(String((no.json() as { error: string }).error)).toContain('some-builder')
    expect(String((no.json() as { error: string }).error)).toContain('Nothing was written')
    // AND THE MESSAGE IS STILL WAITING, so a refused press loses nothing.
    expect((await delivery(messageId)).mark).toBe('queued')
  })

  it('starts the run on the next pass once the person has pressed, and says on the row that they did', async () => {
    const pressed = await post(`/api/messages/${messageId}/start-an-agent`, {})
    expect(pressed.statusCode).toBe(200)
    expect(String((pressed.json() as { says: string }).says)).toContain('Nothing was started by this call')
    expect(String((await delivery(messageId)).because)).toContain('pressed to start an agent for this message')

    const after = await onePass(settings, watching)

    const started = one(
      after.started.filter((run) => run.messageId === messageId),
      'the run started after the press',
    )
    const stands = await delivery(messageId)
    expect(stands.mark).toBe('delivered')
    expect(stands.run).toBe(started.session)
  })
})

describe('an agent that has a conversation of its own here is not asked about', () => {
  it('starts a run with nobody pressing, because the run picks that conversation up', async () => {
    // THE FIRST MESSAGE MAKES THE CONVERSATION. It needs the press, and the run it starts leaves a
    // conversation behind on the agent's registry row.
    const agentId = await anAgent('has-run-here-before')
    const first = await messageTo(agentId, 'First thing I have ever said to you.')
    await post(`/api/messages/${first}/start-an-agent`, {})
    for (let i = 0; i < 200; i += 1) {
      const pass = await onePass(settings, watching)
      if (pass.answered.some((a) => a.messageId === first)) break
      await new Promise((go) => setTimeout(go, 50))
    }

    // AND THE SECOND ONE DOES NOT. Nothing is pressed here at all.
    const second = await messageTo(agentId, 'And here is the second.')
    const queue = (await get('/api/worker/queue?full=1')) as { queue?: Record<string, unknown>[] }
    const row = one(
      (queue.queue ?? []).filter((x) => x['messageId'] === second),
      'the second message waiting',
    )
    expect(row['resume']).not.toBeNull()
    expect(row['nobodyIsAnsweringAsIt']).toBeNull()

    const after = await onePass(settings, watching)
    expect(after.started.filter((run) => run.messageId === second)).toHaveLength(1)
  }, 40_000)
})
