// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { randomUUID } from 'node:crypto'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { MESSAGE_QUOTE_POSITIONS_INVALID } from '../src/shared/refusal-codes.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { apiApp, freshDb, type TestDb } from './helpers.ts'

let db: TestDb
let app: FastifyInstance
let agent: string
let source: string
const headers = { 'content-type': 'application/json', 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON }
const quote = () => ({ target: { kind: 'record', recordId: source, workspaceId: 'default' } })
const send = (positions: number[]) => app.inject({ method: 'POST', url: '/api/records', headers, payload: { kind: 'message', title: 'Made-up letter', data: { body: 'abc', to: [{ kind: 'agent', id: agent }], quotes: [quote()], quotePositions: positions } } })

beforeAll(async () => {
  db = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  const handle = randomUUID()
  const registered = await app.inject({ method: 'POST', url: '/api/agents/started', headers, payload: { handle, name: handle, runtime: 'claude-code' } })
  expect(registered.statusCode).toBe(201)
  agent = registered.json().agent.id
  const made = await app.inject({ method: 'POST', url: '/api/records', headers, payload: { kind: 'problem', title: 'Made-up source', data: {} } })
  expect(made.statusCode).toBe(201)
  source = made.json().record.id
}, 60_000)
afterAll(async () => { await app.close(); db.close() })

it('gives both create and edit position refusals a page code', async () => {
  expect(MESSAGE_QUOTE_POSITIONS_INVALID).toBeTypeOf('string')
  const refused = await send([4])
  expect(refused.statusCode, refused.body).toBe(400)
  expect(refused.json().code).toBe(MESSAGE_QUOTE_POSITIONS_INVALID)
  const created = await send([1])
  expect(created.statusCode, created.body).toBe(409)
  const id = created.json().record.id
  const edited = await app.inject({ method: 'PATCH', url: `/api/records/${id}`, headers, payload: { dataPatch: { quotePositions: [4] } } })
  expect(edited.statusCode, edited.body).toBe(400)
  expect(edited.json().code).toBe(MESSAGE_QUOTE_POSITIONS_INVALID)
})
