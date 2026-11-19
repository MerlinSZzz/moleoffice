// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** All agents, messages, settings and sentences here are made up. No run starts. */
import { fileURLToPath } from 'node:url'
import type { FastifyInstance } from 'fastify'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { whyNotNow, type WorkerSettings } from '../src/worker/index.ts'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'

let t: TestDb, app: FastifyInstance, agent: string, message: string
const headers = {'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id}
const settings: WorkerSettings = {api: 'http://made-up.invalid', workspace: 'default', session: null, stopWithPid: null, checkout: process.cwd(), outputRoot: process.cwd(), runs: 2, hops: 3, env: {...process.env, MOLE_OFFICE_FAKE_RUNTIME: fileURLToPath(new URL('./fake-runtime.mjs', import.meta.url))}}
const waiting = {messageId: 'made-up-message', workspaceId: 'default', to: {kind: 'agent', id: 'made-up-agent'}, handle: 'made-up-agent', runtime: 'claude-code', retired: false, sentBy: {kind: 'agent', id: 'made-up-writer'}, sentAt: '2026-10-20 10:00:00', resume: null, hops: 0, needsNoRun: null, conversationIsWaiting: null, runningAlready: null, heldByALiveSession: null, heldByAReview: null, nobodyIsAnsweringAsIt: null, urgent: false}
const sentence = '2 runs are already going, which is as many as this installation allows at once. This message starts as soon as one of them ends.'

beforeEach(async () => {
  vi.stubEnv('MOLE_OFFICE_WORKER_RUNS', '2')
  t = await freshDb(); app = (await apiApp()).app; await app.ready()
  const made = await app.inject({method: 'POST', url: '/api/agents/started', headers, payload: {handle: 'made-up-run-waiter', name: 'Made-up run waiter', role: 'worker'}})
  expect(made.statusCode, made.body).toBe(201); agent = made.json().agent.id
  const sent = await app.inject({method: 'POST', url: '/api/records', headers, payload: {kind: 'message', title: 'Made-up wait', data: {body: 'Made-up wait', to: [{kind: 'agent', id: agent}]}}})
  // A PERSON'S SEND TO AN AGENT NOTHING HOLDS ANSWERS 409, with the letter stored and routed (decision 60sbc5I-bwKx).
  expect(sent.statusCode, sent.body).toBe(409); message = sent.json().record.id
})
afterEach(async () => {await app.close(); t.close(); vi.unstubAllEnvs()})
function count() {return t.client.sqlite.prepare('SELECT would_stop, stopped, reminded FROM gate_counts WHERE gate = ?').get('worker-runs')}
async function hold(because: string, gate?: string, replacing?: string) {
  const reply = await app.inject({method: 'POST', url: `/api/worker/messages/${message}/held`, headers, payload: {to: {kind: 'agent', id: agent}, because, ...(gate === undefined ? {} : {gate}), ...(replacing === undefined ? {} : {replacing})}})
  expect(reply.statusCode, reply.body).toBe(200)
  return reply.json()
}

it('answers the runs sentence and worker-runs for an ordinary message and a check', () => {
  expect(whyNotNow(waiting, settings, settings.runs)).toEqual({because: sentence, gate: 'worker-runs'})
  expect(whyNotNow({...waiting, inspection: {} as NonNullable<Parameters<typeof whyNotNow>[0]['inspection']>}, settings, settings.runs)).toEqual({because: 'The check is queued until one of the 2 runs ends.', gate: 'worker-runs'})
  expect(whyNotNow(waiting, settings, 1)).toBeNull()
})
it('counts each new wait after the held door answers, including a reason changing away and back', async () => {
  expect((await hold(sentence, 'worker-runs')).written).toBe(true)
  expect(count()).toEqual({would_stop: 1, stopped: 0, reminded: 0})
  expect((await hold(sentence, 'worker-runs')).written).toBe(false)
  expect(count()).toEqual({would_stop: 1, stopped: 0, reminded: 0})
  await hold('Made-up other reason')
  await hold(sentence, 'worker-runs')
  expect(count()).toEqual({would_stop: 2, stopped: 0, reminded: 0})
})
it('keeps an untagged held write uncounted even when its words name the runs limit', async () => {
  await hold(sentence)
  expect(count()).toBeUndefined()
})
it('does not count a refused replacement or an unknown gate', async () => {
  await hold('Made-up other reason')
  expect((await hold(sentence, 'worker-runs', 'Made-up missing reason')).written).toBe(false)
  expect(count()).toBeUndefined()
  const refused = await app.inject({method: 'POST', url: `/api/worker/messages/${message}/held`, headers, payload: {to: {kind: 'agent', id: agent}, because: sentence, gate: 'made-up-unknown-gate'}})
  expect(refused.statusCode).toBe(400)
  expect(count()).toBeUndefined()
})
