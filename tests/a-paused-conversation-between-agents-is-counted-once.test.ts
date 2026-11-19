// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** All agents, conversations, messages, settings and hold sentences here are made up. No run starts. */
import { fileURLToPath } from 'node:url'
import type { AddressInfo } from 'node:net'
import type { FastifyInstance } from 'fastify'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { onePass, whyNotNow, type WorkerSettings } from '../src/worker/index.ts'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { aCheckoutForATestRun } from './a-checkout-for-a-test-run.ts'

let t: TestDb, app: FastifyInstance, alpha: string, beta: string
const headers = {'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id}
const folder = aCheckoutForATestRun()
const settings: WorkerSettings = {api: 'http://made-up.invalid', workspace: 'default', session: null, stopWithPid: null, checkout: folder, outputRoot: folder, runs: 2, hops: 3, env: {...process.env, MOLE_OFFICE_FAKE_RUNTIME: fileURLToPath(new URL('./fake-runtime.mjs', import.meta.url))}}
const waiting = {messageId: 'made-up-message', workspaceId: 'default', to: {kind: 'agent', id: 'made-up-agent'}, handle: 'made-up-agent', runtime: 'claude-code', retired: false, sentBy: {kind: 'agent', id: 'made-up-writer'}, sentAt: '2026-10-20 10:00:00', resume: null, hops: 0, needsNoRun: null, conversationIsWaiting: null, runningAlready: null, heldByALiveSession: null, heldByAReview: null, nobodyIsAnsweringAsIt: null, urgent: false}
beforeEach(async () => {
  vi.stubEnv('MOLE_OFFICE_AGENT_HOPS', '3')
  t = await freshDb(); app = (await apiApp()).app; await app.ready()
  alpha = await agent('made-up-pause-alpha'); beta = await agent('made-up-pause-beta')
})
afterEach(async () => {await app.close(); t.close(); vi.unstubAllEnvs()})
async function agent(handle: string) {
  // A registry row without a starter exercises pauses that send no starter notice.
  const made = await app.inject({method: 'POST', url: '/api/records', headers, payload: {kind: 'agent', title: handle, data: {handle, state: 'active', runtime: 'claude-code', workArea: ['records']}}})
  expect(made.statusCode, made.body).toBe(201)
  const listed = await app.inject({method: 'GET', url: '/api/participants', headers})
  return listed.json().agents.find((one: {handle: string}) => one.handle === handle).id as string
}
function count() {return t.client.sqlite.prepare('SELECT would_stop, stopped, reminded FROM gate_counts WHERE gate = ?').get('agent-hops')}
async function message(from: string | null, to: string, group?: string, expected = 201) {
  const fromHeaders = from === null ? headers : {...headers, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': from}
  const sent = await app.inject({method: 'POST', url: '/api/records', headers: fromHeaders, payload: {kind: 'message', title: 'Made-up pause message', data: {body: 'Made-up pause message', ...(group === undefined ? {to: [{kind: 'agent', id: to}]} : {toGroup: group})}}})
  expect(sent.statusCode, sent.body).toBe(expected); return sent.json().record.id as string
}
async function atTheNumber(group?: string) {
  // Nothing holds either agent in the test office, so a message to one of them is stored, routed and answered 409; it is
  // stored all the same. A group message is not routed and keeps its 201.
  const expected = group === undefined ? 409 : 201
  await message(alpha, beta, group, expected); await message(beta, alpha, group, expected)
  return message(alpha, beta, group, expected)
}
async function hold(id: string, to: string, because = 'Made-up pause from either guard') {
  const held = await app.inject({method: 'POST', url: `/api/worker/messages/${id}/held`, headers, payload: {to: {kind: 'agent', id: to}, because, gate: 'agent-hops'}})
  expect(held.statusCode, held.body).toBe(200)
  return held.json()
}
it('answers agent-hops for both the server conversation guard and the worker chain guard', () => {
  expect(whyNotNow({...waiting, conversationIsWaiting: 'Made-up server pause sentence'}, settings, 0)).toEqual({because: 'Made-up server pause sentence', gate: 'agent-hops'})
  expect(whyNotNow({...waiting, hops: 3}, settings, 0)).toEqual({because: 'Agents have answered each other 3 times along one chain of replies since a person last said anything, and this installation allows 3. Nothing is started until somebody writes in this conversation. The messages are all here to read.', gate: 'agent-hops'})
})
it('counts each held delivery in a pair once until its sentence changes', async () => {
  const first = await atTheNumber()
  await hold(first, beta)
  expect(count()).toEqual({would_stop: 1, stopped: 0, reminded: 0})
  await hold(first, beta)
  expect(count()).toEqual({would_stop: 1, stopped: 0, reminded: 0})
  // Nothing holds alpha in the test office, so the message is stored, routed and answered 409; it is stored all the same.
  await hold(await message(beta, alpha, undefined, 409), alpha, 'Made-up chain guard sentence')
  expect(count()).toEqual({would_stop: 2, stopped: 0, reminded: 0})
  const other = await app.inject({method: 'POST', url: `/api/worker/messages/${first}/held`, headers, payload: {to: {kind: 'agent', id: beta}, because: 'Made-up different reason'}})
  expect(other.statusCode, other.body).toBe(200)
  await hold(first, beta)
  expect(count()).toEqual({would_stop: 3, stopped: 0, reminded: 0})
})
it('counts two held deliveries when one group message waits for two agents', async () => {
  const gamma = await agent('made-up-pause-gamma')
  const opened = await app.inject({method: 'POST', url: '/api/groups', headers, payload: {name: 'Made-up paused group', because: 'Made-up group purpose', members: [alpha, beta, gamma].map(id => ({who: {kind: 'agent', id}, because: 'Made-up member'}))}})
  expect(opened.statusCode, opened.body).toBe(201)
  const group = opened.json().group.id
  const id = await atTheNumber(group)
  await hold(id, beta); await hold(id, gamma)
  expect(count()).toEqual({would_stop: 2, stopped: 0, reminded: 0})
})
it('does not count three queue readings without a held write', async () => {
  const id = await atTheNumber()
  const {readMessage} = await import('../src/server/lib/messages.ts')
  const {whyThisConversationIsWaiting} = await import('../src/server/lib/worker.ts')
  for (let pass = 0; pass < 3; pass++) expect(whyThisConversationIsWaiting(readMessage(id, 'default'), {kind: 'agent', id: beta}, 'default')).toContain('installation allows 3')
  expect(count()).toBeUndefined()
})
it('does not count an untagged held write even when its sentence is the hops sentence', async () => {
  const id = await atTheNumber()
  const {readMessage} = await import('../src/server/lib/messages.ts')
  const {whyThisConversationIsWaiting} = await import('../src/server/lib/worker.ts')
  const because = whyThisConversationIsWaiting(readMessage(id, 'default'), {kind: 'agent', id: beta}, 'default')
  const held = await app.inject({method: 'POST', url: `/api/worker/messages/${id}/held`, headers, payload: {to: {kind: 'agent', id: beta}, because}})
  expect(held.statusCode, held.body).toBe(200)
  expect(count()).toBeUndefined()
})
it('counts a chain hold even when the current conversation is below its allowance', async () => {
  // Nothing holds beta in the test office, so the message is stored, routed and answered 409; it is stored all the same.
  const id = await message(alpha, beta, undefined, 409)
  await hold(id, beta, 'Made-up chain crossing conversations')
  await hold(id, beta, 'Made-up chain crossing conversations')
  expect(count()).toEqual({would_stop: 1, stopped: 0, reminded: 0})
})
it('carries the gate from the worker decision through HTTP to the held door', async () => {
  await atTheNumber()
  await app.listen({host: '127.0.0.1', port: 0})
  const worker = {...settings, api: `http://127.0.0.1:${(app.server.address() as AddressInfo).port}`}
  const report = await onePass(worker, [])
  expect(report.started).toEqual([])
  expect(count()).toEqual({would_stop: 3, stopped: 0, reminded: 0})
  await onePass(worker, [])
  expect(count()).toEqual({would_stop: 3, stopped: 0, reminded: 0})
})
