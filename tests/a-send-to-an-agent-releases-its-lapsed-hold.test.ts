// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A SEND TO AN AGENT RELEASES A HOLD ON IT THAT HAS LAPSED. Wave 13u round 38.
 *
 * A session holds an agent's handle while it beats. When it stops beating for longer than the lapse and grace
 * windows, the hold has lapsed, and the next reading of the hold that may write releases it (`theLiveHoldOn` in
 * src/server/lib/handles.ts). Until round 37 the check before a send asked that reading for the addressee. Since then,
 * with the setting that refuses an agent nothing answers as off, as it ships, the check reads the registry row and no
 * hold. The routing's reading of the addressee's reach still asks it (`theAnsweringReading` in src/server/lib/worker.ts),
 * so a send to the agent still releases the hold. This file holds that, for every door that sends a message to an
 * agent from outside the office's own timers.
 *
 * Every id, handle and sentence written here is made up for this file's throwaway office.
 *
 * WHAT IS PROVED HERE, each with a hold a day without a beat, and the setting off:
 *
 *   1. THE PERSON'S MESSAGE through POST /api/records releases the addressee's hold.
 *   2. AN AGENT'S MESSAGE through POST /api/records releases it.
 *   3. AN AGENT'S DRAFT sent as a message through POST /api/drafts/:id/send releases it.
 *   4. THE PERSON'S ANSWERS TO A REPORT, sent through POST /api/records/:id/answers/send to the agent that wrote the
 *      report, release it.
 *
 * THE LIMITS.
 *   · With the setting on, the check refuses an agent whose only hold has lapsed, and nothing is sent. This file does
 *     not hold what that refusal releases.
 *   · Two acts no longer release the hold since round 37, and this file does not hold that they do not: the ranking of
 *     whom a message can go to, which asks the check of each agent, and the check before the answers to a report are
 *     sent. The answers' message, case 4, releases the hold later in the same request.
 *
 * WHAT TURNS EACH RED, tried in wave 13u round 38:
 *   · every case: let `theAnsweringReading` in src/server/lib/worker.ts release no lapsed hold unless it is told to.
 */
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { THE_PERSON } from '../src/shared/person.ts'
import { localStamp } from '../src/shared/time.ts'
import { apiApp, freshDb, type TestDb } from './helpers.ts'

const PROJECT = 'default'
const AS_THE_PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': PROJECT,
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}
const SENDER = 'made-up-sender'

let t: TestDb
let app: FastifyInstance
let env: typeof import('../src/server/lib/env.ts')
let senderRun = ''

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  env = await import('../src/server/lib/env.ts')
  await anAgent(SENDER)
  senderRun = aSession(SENDER)
}, 60_000)

afterAll(async () => {
  await app?.close()
  t?.close()
})

const asAnAgent = (handle: string, session?: string): Record<string, string> => ({
  ...AS_THE_PERSON,
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': handle,
  ...(session === undefined ? {} : { 'x-mole-office-session': session }),
})

/** Register an agent through the real door. Gives back its registry id. */
async function anAgent(handle: string): Promise<string> {
  const r = await app.inject({ method: 'POST', url: '/api/agents/started', headers: AS_THE_PERSON, payload: { handle, name: `A made-up ${handle}` } })
  expect(r.statusCode, r.body).toBe(201)
  return (t.client.sqlite.prepare('SELECT id FROM agents WHERE handle = ?').get(handle) as { id: string }).id
}

/** A session record of this file's own, running for the agent it names. */
function aSession(handle: string): string {
  return t.api.createRecord({
    workspaceId: PROJECT,
    kind: 'session',
    title: 'A made-up session',
    actor: { type: 'agent', id: handle },
    data: { state: 'running', runtime: 'claude-code', servingAgent: handle },
  }).id
}

/** A terminal that took the agent's handle through the real door, and has not beaten for a day. */
async function aLapsedHoldOn(handle: string): Promise<void> {
  const session = t.api.createRecord({
    workspaceId: PROJECT,
    kind: 'session',
    title: 'A made-up terminal that went quiet',
    actor: t.api.HUMAN,
    data: { state: 'running', runtime: 'claude-code', doing: 'A made-up terminal that went quiet.' },
  }).id
  const r = await app.inject({ method: 'POST', url: `/api/handles/${handle}/hold`, headers: AS_THE_PERSON, payload: { session, machine: 'a-machine', runtime: 'claude-code' } })
  expect(r.statusCode, r.body).toBe(201)
  // A DAY WITHOUT A BEAT, which is past every window a hold has.
  t.client.sqlite.prepare('UPDATE handle_holds SET last_heard_at = ? WHERE session_record_id = ?').run(localStamp(new Date(Date.now() - 86_400_000)), session)
}

/** When each hold ever taken on the agent was released, or null for a hold not released. */
const releasedAt = (agentId: string): unknown[] =>
  (t.client.sqlite.prepare('SELECT released_at AS releasedAt FROM handle_holds WHERE agent_id = ?').all(agentId) as { releasedAt: unknown }[]).map((one) => one.releasedAt)

/** Make an agent with a lapsed hold, check the hold is there, run the send, and give back the hold after it. */
async function theHoldAfter(
  handle: string,
  send: (to: string) => Promise<{ statusCode: number; body: string }>,
  before?: (to: string) => Promise<void>,
  status = 201,
): Promise<unknown[]> {
  expect(env.theDoorRefusesAnAgentWithNoSessionAndNoRun(), 'this file runs with the setting off, as it ships').toBe(false)
  const to = await anAgent(handle)
  await before?.(to)
  await aLapsedHoldOn(handle)
  expect(releasedAt(to), 'the hold is there and not released before the send').toEqual([null])
  const sent = await send(to)
  expect(sent.statusCode, sent.body).toBe(status)
  return releasedAt(to)
}

const aMessageTo = (to: string, title: string) => ({ kind: 'message', title, data: { body: `${title}.`, to: [{ kind: 'agent', id: to }] } })

describe('a send to an agent releases a hold on it that has lapsed', () => {
  it('1. the person\'s message through the record door', async () => {
    // THE UNHELD 409 (decision 60sbc5I-bwKx): with the lapsed hold released there is nothing holding the handle, so
    // the person's send answers the error. What this case measures is that the send released the hold.
    const after = await theHoldAfter(
      'made-up-quiet-1',
      (to) => app.inject({ method: 'POST', url: '/api/records', headers: AS_THE_PERSON, payload: aMessageTo(to, 'A made-up question from the person') }),
      undefined,
      409,
    )
    expect(after).toEqual([expect.any(String)])
  })

  it('2. an agent\'s message through the record door', async () => {
    // THE UNHELD 409, AS IN CASE 1: with the lapsed hold released nothing holds the handle in the test office, so the
    // office stores the agent's message, routes it and answers 409. The message is stored all the same, and what this
    // case measures is that the send released the hold.
    const after = await theHoldAfter(
      'made-up-quiet-2',
      (to) => app.inject({ method: 'POST', url: '/api/records', headers: asAnAgent(SENDER, senderRun), payload: aMessageTo(to, 'A made-up question from an agent') }),
      undefined,
      409,
    )
    expect(after).toEqual([expect.any(String)])
  })

  it('3. an agent\'s draft sent as a message', async () => {
    const after = await theHoldAfter('made-up-quiet-3', async (to) => {
      const draft = await app.inject({
        method: 'POST',
        url: '/api/records',
        headers: asAnAgent(SENDER, senderRun),
        payload: { kind: 'draft', title: 'A made-up draft to an agent', data: { body: 'Made-up words.', for: [{ kind: 'agent', id: to }], becomes: 'message' } },
      })
      expect(draft.statusCode, draft.body).toBe(201)
      const id = (JSON.parse(draft.body) as { record: { id: string } }).record.id
      return app.inject({ method: 'POST', url: `/api/drafts/${id}/send`, headers: asAnAgent(SENDER, senderRun) })
    })
    expect(after).toEqual([expect.any(String)])
  })

  it('4. the person\'s answers to a report, sent to the agent that wrote it', async () => {
    const handle = 'made-up-quiet-4'
    let report = ''
    const after = await theHoldAfter(
      handle,
      () => app.inject({ method: 'POST', url: `/api/records/${report}/answers/send`, headers: AS_THE_PERSON, payload: { press: { scope: 'report' } } }),
      async () => {
        const filed = await app.inject({
          method: 'POST',
          url: '/api/records',
          headers: asAnAgent(handle),
          payload: {
            kind: 'report',
            title: 'A made-up report asking one question',
            data: {
              for: 'A made-up reader',
              date: '2026-10-19',
              blocks: [{ id: 'q-a', type: 'choice', question: 'Which made-up option?', options: [{ id: 'a', label: 'Made-up A' }, { id: 'b', label: 'Made-up B' }] }],
            },
          },
        })
        expect(filed.statusCode, filed.body).toBe(201)
        report = (JSON.parse(filed.body) as { record: { id: string } }).record.id
        const kept = await app.inject({ method: 'PUT', url: `/api/records/${report}/answers/q-a`, headers: AS_THE_PERSON, payload: { answer: { chosen: ['b'] } } })
        expect(kept.statusCode, kept.body).toBe(200)
      },
    )
    expect(after).toEqual([expect.any(String)])
  })
})
