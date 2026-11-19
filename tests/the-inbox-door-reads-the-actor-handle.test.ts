// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE INBOX DOOR READS THE HANDLE FROM THE AGENT'S OWN HEADER.
 *
 * Problem `nIZnViByUerv`. The supervisor procedure says to call `GET /api/agent/inbox` plainly, and
 * the door answered 400 `handle: expected string` unless `?handle=` was given, even though the
 * actor header already named the agent. An agent's plain call now answers its own inbox.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS PROVED, AND WHY THE REAL DOOR
 * ---------------------------------------------------------------------------------------
 *
 * The test world's real Fastify app is asked three ways and all three are measured:
 *
 *   1. with the agent's actor headers and NO query, the door answers that agent's own inbox;
 *   2. with `?handle=` present, it answers the same inbox as before;
 *   3. with a person's actor headers and no query, it refuses with a sentence that names both ways
 *      to ask, rather than the old bare `handle: expected string`.
 *
 * MUTATION, CONTROL RUN FIRST
 *
 * CONTROL: the case below passes with the mend in place.
 *
 * MUTATION: `handle` is put back to being required in `inboxQuery` (today's code). The plain agent
 * call answers 400 and the case goes red. The file is restored byte-for-byte (sha256 checked) and
 * the control run again: green.
 */

import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { apiApp, freshDb, thePersonsKeyHeader, type TestDb } from './helpers.ts'

const HANDLE = 'inbox-actor-handle'

const AS_THE_AGENT = {
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': HANDLE,
}

const AS_THE_PERSON = {
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id,
}

let t: TestDb
let app: FastifyInstance

beforeAll(async () => {
  t = await freshDb()
  const built = await apiApp()
  app = built.app
  await app.ready()
  await app.listen({ host: '127.0.0.1', port: 0 })

  const made = await app.inject({
    method: 'POST',
    url: '/api/records',
    headers: AS_THE_PERSON,
    payload: {
      kind: 'agent',
      title: 'Inbox actor handle',
      data: { handle: HANDLE, state: 'active', runtime: 'claude-code' },
    },
  })
  expect(made.statusCode, made.body).toBe(201)
  const agentId = (made.json() as { record: { id: string } }).record.id
  // ONE MESSAGE ADDRESSED TO IT AND SENT, so the inbox has something to answer for either call.
  const thread = await app.inject({
    method: 'POST',
    url: '/api/agent/threads',
    headers: AS_THE_PERSON,
    payload: { title: 'The plain call', mode: 'direct' },
  })
  expect(thread.statusCode, thread.body).toBe(201)
  const threadId = (thread.json() as { thread: { id: string } }).thread.id
  const said = await app.inject({
    method: 'POST',
    url: `/api/agent/threads/${threadId}/messages`,
    headers: AS_THE_PERSON,
    payload: {
      intent: 'ask',
      body: 'a message for the plain call',
      recipient: { kind: 'agent', agentId, why: 'It is the agent this call is about.' },
    },
  })
  expect(said.statusCode, said.body).toBe(201)
  const sent = await app.inject({
    method: 'POST',
    url: `/api/agent/threads/${threadId}/dispatch`,
    headers: { ...AS_THE_PERSON, ...thePersonsKeyHeader() },
  })
  expect(sent.statusCode, sent.body).toBe(201)
}, 60_000)

afterAll(async () => {
  await app.close()
  t.close()
})

describe('the inbox door reads the handle from the actor header', () => {
  it('answers the agent’s own inbox plainly, and with ?handle=, and refuses a call with neither', async () => {
    const byActor = await app.inject({ method: 'GET', url: '/api/agent/inbox', headers: AS_THE_AGENT })
    expect(byActor.statusCode, byActor.body).toBe(200)
    const actorReply = byActor.json() as { agent: { handle: string }; messages: { body: string }[] }
    expect(actorReply.agent.handle).toBe(HANDLE)
    expect(actorReply.messages.map((one) => one.body)).toContain('a message for the plain call')

    const byQuery = await app.inject({
      method: 'GET',
      url: `/api/agent/inbox?handle=${HANDLE}`,
      headers: AS_THE_AGENT,
    })
    expect(byQuery.statusCode, byQuery.body).toBe(200)
    expect(byActor.json()).toEqual(byQuery.json())

    const neither = await app.inject({ method: 'GET', url: '/api/agent/inbox', headers: AS_THE_PERSON })
    expect(neither.statusCode, neither.body).toBe(400)
    expect(neither.body).toContain('?handle=')
    expect(neither.body).toContain('x-mole-office-actor-id')
  })
})
