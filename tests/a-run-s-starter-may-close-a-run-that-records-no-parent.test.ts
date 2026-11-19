// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE AGENT THAT STARTED A RUN'S AGENT MAY CLOSE THE RUN, WITH ITS OWN WORD, WHEN THE RUN RECORDS NO
 * PARENT ATTACHMENT. Problem `XtHehJ90C-hd`.
 *
 * Run viM4YJNkySRd was a worker whose candidate its supervisor had checked and adopted. The run never
 * closed itself and recorded no parent attachment. Its supervisor asked to close it as `parent-said`
 * and was refused, because that word means the attachment that started this one, and none was
 * recorded. Every other word would have named somebody who did not say it. So the run stayed open.
 *
 * Now there is a sixth word, `starter-said`. Only the starter recorded on the agent the run served
 * may use it, and it is not read as the run saying its work is finished, so it seals nothing.
 *
 * WHAT IS REAL HERE. The server, the close door (POST /api/attachments/<id>/close), the agent
 * registry and its `startedBy`. The run and the agents are synthetic fixtures; no process runs.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'

let t: TestDb
let app: FastifyInstance
let run: string

const asAgent = (id: string) => ({ 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': id })
const AS_THE_PERSON = { 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id }

async function close(by: Record<string, string>, how: string) {
  return app.inject({ method: 'POST', url: '/api/attachments/' + run + '/close', headers: by, payload: { how, because: 'The candidate was checked and adopted by the supervisor.' } })
}

beforeAll(async () => {
  t = await freshDb(); app = (await apiApp()).app
  for (const handle of ['close-supervisor', 'another-supervisor']) {
    const made = await app.inject({ method: 'POST', url: '/api/agents/started', headers: AS_THE_PERSON, payload: { handle, name: 'Synthetic ' + handle } })
    expect(made.statusCode, made.body).toBe(201)
  }
  const worker = await app.inject({ method: 'POST', url: '/api/agents/started', headers: asAgent('close-supervisor'),
    payload: { handle: 'adopted-worker', name: 'Synthetic worker whose candidate was adopted', workArea: ['work'] } })
  expect(worker.statusCode, worker.body).toBe(201)
  run = t.api.createRecord({ kind: 'session', title: 'Synthetic run with no parent attachment', workspaceId: 'default',
    actor: { type: 'agent', id: 'adopted-worker' }, origin: 'fixture', data: { state: 'idle', servingAgent: 'adopted-worker' } }).id
}, 60_000)

afterAll(async () => { await app?.close(); t?.close() })

describe('a run that records no parent attachment', () => {
  it('is still refused "parent-said", and the refusal names the word its starter may use', async () => {
    const refused = await close(asAgent('close-supervisor'), 'parent-said')
    expect(refused.statusCode, refused.body).toBe(400)
    expect(refused.body).toContain('starter-said')
    expect(t.api.getRecord(run)!.data['closedAt']).toBeUndefined()
  })

  it('is refused "starter-said" from an agent that did not start its agent, and nothing is written', async () => {
    const refused = await close(asAgent('another-supervisor'), 'starter-said')
    expect(refused.statusCode, refused.body).toBe(403)
    expect(t.api.getRecord(run)!.data['closedAt']).toBeUndefined()
  })

  it('is closed "starter-said" by the agent that started its agent', async () => {
    const closed = await close(asAgent('close-supervisor'), 'starter-said')
    expect(closed.statusCode, closed.body).toBe(200)
    const data = t.api.getRecord(run)!.data
    expect(data['closedHow']).toBe('starter-said')
    expect(typeof data['closedAt']).toBe('string')
  })

  it('is not read as the run saying its work is finished, so nothing was sealed', () => {
    expect(t.api.getRecord(run)!.data['sealedTip']).toBeUndefined()
  })
})
