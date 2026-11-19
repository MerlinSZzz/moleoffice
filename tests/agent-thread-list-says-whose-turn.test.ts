// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { afterEach, beforeEach, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { apiApp, freshDb, thePersonsKeyHeader, type TestDb } from './helpers.ts'

const PERSON = { 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id, 'x-mole-office-workspace': 'default' }
const WORKER = { 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': 'mole-office-agent-worker' }

let db: TestDb
let app: FastifyInstance

beforeEach(async () => {
  db = await freshDb()
  app = (await apiApp()).app
  await app.ready()
})

afterEach(async () => {
  await app.close()
  db.close()
})

it('the thread list says when the last word is an agent answer, and clears it after a person speaks', async () => {
  const opened = await app.inject({
    method: 'POST',
    url: '/api/agent/threads',
    headers: PERSON,
    payload: { title: 'A measuring note', mode: 'direct' },
  })
  expect(opened.statusCode, opened.body).toBe(201)
  const thread = (opened.json() as { thread: { id: string } }).thread.id

  const asked = await app.inject({
    method: 'POST',
    url: `/api/agent/threads/${thread}/messages`,
    headers: PERSON,
    payload: { intent: 'ask', body: 'Check the second reading.', recipient: { kind: 'new' } },
  })
  expect(asked.statusCode, asked.body).toBe(201)

  const dispatched = await app.inject({
    method: 'POST',
    url: `/api/agent/threads/${thread}/dispatch`,
    headers: { ...PERSON, ...thePersonsKeyHeader() },
  })
  expect(dispatched.statusCode, dispatched.body).toBe(201)
  const run = (dispatched.json() as { runs: { id: string }[] }).runs[0]?.id
  expect(run).toBeTruthy()

  const finished = await app.inject({
    method: 'POST',
    url: `/api/agent/runs/${run}/result`,
    headers: WORKER,
    payload: { result: { answer: 'The second reading is within range.' } },
  })
  expect(finished.statusCode, finished.body).toBe(200)

  const afterAnswer = await app.inject({ method: 'GET', url: '/api/agent/threads', headers: PERSON })
  expect(afterAnswer.statusCode, afterAnswer.body).toBe(200)
  let listed = (afterAnswer.json() as { threads: { id: string; lastWordIsAgent: boolean; needsYou: boolean; lastRunState: string | null; runCount: number }[] }).threads
    .find((one) => one.id === thread)
  expect(listed?.lastWordIsAgent, 'an answer produced by a finished run is the last word').toBe(true)
  expect(listed?.needsYou, 'the answered conversation is in the needs-you group').toBe(true)
  expect(listed?.lastRunState).toBe('finished')
  expect(listed?.runCount).toBe(1)

  const replied = await app.inject({
    method: 'POST',
    url: `/api/agent/threads/${thread}/messages`,
    headers: PERSON,
    payload: { intent: 'discuss', body: 'Thanks, I will use that reading.', recipient: { kind: 'new' } },
  })
  expect(replied.statusCode, replied.body).toBe(201)

  const afterPerson = await app.inject({ method: 'GET', url: '/api/agent/threads', headers: PERSON })
  expect(afterPerson.statusCode, afterPerson.body).toBe(200)
  listed = (afterPerson.json() as { threads: { id: string; lastWordIsAgent: boolean; needsYou: boolean; lastRunState: string | null; runCount: number }[] }).threads
    .find((one) => one.id === thread)
  expect(listed?.lastWordIsAgent, 'a later person message becomes the last word').toBe(false)
  expect(listed?.needsYou, 'the later person message does not leave an old turn marker behind').toBe(false)
})
