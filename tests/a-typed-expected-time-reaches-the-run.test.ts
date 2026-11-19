// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { withoutInheritedEffort } from './without-inherited-effort.ts'
/**
 * A TYPED EXPECTED TIME REACHES THE RUN'S RECORD — criterion F10, the time half.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS ASKED AND WHAT IS BUILT
 * ---------------------------------------------------------------------------------------
 *
 * Design F10: the reminder triggers on
 * the step's expected time or tokens. The token half is NOT built and is not faked: F5 (budgets) and
 * F8 (the step log) were withdrawn on 11 September 2026, and a run's token count is known only after
 * the run exits — the usage receipt is parsed from the runtime's finished output by
 * src/worker/runtimes/usage.ts and written once by sayHowItEnded. Nothing reads a running run's
 * tokens. The time half is built against an expected time TYPED BY WHOEVER STARTS THE TASK: an
 * optional field at the start door and on the run's record. Where nobody typed one, nothing is
 * reminded, and this file proves that too rather than pretending the trigger fires.
 *
 * THE PATH PROVED HERE, end to end: the person presses start-an-agent for a message typing
 * {"expectedMinutes": 45}; the press writes it under `runWasAskedFor` on the message
 * (src/server/lib/worker.ts, askForARunFor); the message worker, starting the run, reads it once per
 * run start and files it on the run's session record (src/worker/index.ts,
 * theTypedExpectedMinutes); the office's reminder watcher reads it there
 * (src/server/lib/reminders.ts). A press that types a word instead of a whole number of minutes is
 * refused, because a duration nobody can read would be a deadline nobody set.
 *
 * ---------------------------------------------------------------------------------------
 * THE MUTATION THAT TURNS THIS RED, WITH A CONTROL RUN FIRST
 * ---------------------------------------------------------------------------------------
 *
 * A CONTROL RUN FIRST: 3 cases, all green. Then, in src/worker/index.ts,
 * `theTypedExpectedMinutes` was made to answer null without reading anything, so the worker starts
 * every run without the typed time — which is what the worker did before this criterion.
 *
 * THE CASE THAT WENT RED, and it is the one this criterion is about:
 *
 *   × carries the typed expected time onto the run's record
 *
 * The change was put back and the control run again: 3 cases, all green.
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
import { supplyRuntimeSubmissions } from './synthetic-submission-fixtures.ts'
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

async function post(path: string, body: unknown): Promise<{ code: number; json: Record<string, unknown> }> {
  const reply = await app.inject({ method: 'POST', url: path, headers: AS_THE_OWNER, payload: body as never })
  return { code: reply.statusCode, json: reply.json() as Record<string, unknown> }
}

async function get(path: string): Promise<Record<string, unknown>> {
  const reply = await app.inject({ method: 'GET', url: path, headers: AS_THE_OWNER })
  return reply.json() as Record<string, unknown>
}

/** The record whole, by id, through the door the worker itself reads through. */
async function theRecord(id: string): Promise<Record<string, unknown>> {
  const read = (await get(`/api/records/${id}`)) as { record?: { data?: Record<string, unknown> } }
  return (read.record?.data ?? {}) as Record<string, unknown>
}

/** One durable agent, registered the plain way, for the messages below to be addressed to. */
async function anAgent(handle: string): Promise<string> {
  await post('/api/records', {
    kind: 'agent',
    title: handle,
    data: { handle, state: 'active', runtime: 'claude-code' },
  })
  const listed = (await get('/api/participants')) as { agents?: { id: string; handle: string }[] }
  return one((listed.agents ?? []).filter((a) => a.handle === handle), `the registry row for ${handle}`).id as string
}

beforeAll(async () => {
  t = await freshDb()
  const built = await apiApp()
  app = built.app
  supplyRuntimeSubmissions(t, app)
  await app.ready()
  await app.listen({ host: '127.0.0.1', port: 0 })
  api = `http://127.0.0.1:${String((app.server.address() as AddressInfo).port)}`
  outputs = mkdtempSync(join(tmpdir(), 'mole-office-expected-time-'))
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
}, 60_000)

afterAll(async () => {
  for (const left of watching.splice(0, watching.length)) left.adapter.stop(left.handle, 'the test is over')
  await app.close()
  t.close()
  rmSync(outputs, { recursive: true, force: true })
})

describe('an expected time typed at the start door', () => {
  it('rides the press onto the message, and the worker carries it onto the run record', async () => {
    const agentId = await anAgent('timed-worker')
    const filed = await post('/api/records', {
      kind: 'message',
      title: 'a step with an expected time',
      data: { body: 'Please read the loquat logs.', to: [{ kind: 'agent', id: agentId }] },
    })
    const messageId = (filed.json['record'] as { id: string }).id
    const pressed = await post(`/api/messages/${messageId}/start-an-agent`, { expectedMinutes: 45 })
    expect(pressed.code).toBe(200)
    // THE PRESS WROTE IT ON THE MESSAGE, beside who pressed and when.
    const asked = (await theRecord(messageId))['runWasAskedFor'] as Record<string, unknown>
    expect(asked['expectedMinutes']).toBe(45)

    const started = one((await onePass(settings, watching)).started.filter((r) => r.messageId === messageId), 'the run')
    // AND THE WORKER CARRIED IT ONTO THE RUN'S RECORD, which is the one place the reminder reads.
    const run = await theRecord(started.session)
    expect(run['expectedMinutes']).toBe(45)
  }, 40_000)

  it('is refused when it is not a whole number of minutes', async () => {
    const agentId = await anAgent('timed-worker-two')
    const filed = await post('/api/records', {
      kind: 'message',
      title: 'a step typed badly',
      data: { body: 'Please read the loquat logs.', to: [{ kind: 'agent', id: agentId }] },
    })
    const messageId = (filed.json['record'] as { id: string }).id
    const pressed = await post(`/api/messages/${messageId}/start-an-agent`, { expectedMinutes: 'soon' })
    expect(pressed.code).toBe(400)
    expect(String(pressed.json['error'])).toContain('whole number of minutes')
    // AND NOTHING WAS WRITTEN: the press is the writer of that field, and a refused press wrote none.
    expect((await theRecord(messageId))['runWasAskedFor']).toBeUndefined()
  })

  it('starts a run with no expected time when nobody typed one, and nothing is invented', async () => {
    const agentId = await anAgent('timed-worker-three')
    const filed = await post('/api/records', {
      kind: 'message',
      title: 'a step with no expected time',
      data: { body: 'Please read the loquat logs.', to: [{ kind: 'agent', id: agentId }] },
    })
    const messageId = (filed.json['record'] as { id: string }).id
    const pressed = await post(`/api/messages/${messageId}/start-an-agent`, {})
    expect(pressed.code).toBe(200)
    const started = one((await onePass(settings, watching)).started.filter((r) => r.messageId === messageId), 'the run')
    const run = await theRecord(started.session)
    // ABSENT IS THE HONEST ANSWER: the criterion says plainly that nothing is reminded for a run
    // with no typed expected time. A guessed duration here would remind healthy runs about a
    // deadline nobody set.
    expect(run['expectedMinutes']).toBeUndefined()
  }, 40_000)
})
