// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { randomUUID } from 'node:crypto'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { validateData } from '../src/shared/kinds.ts'
import { formatValidationErrors } from '../src/shared/validation-errors.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { apiApp, freshDb, type TestDb } from './helpers.ts'

let db: TestDb
let app: FastifyInstance
let recipient: string
let source: string
const headers = { 'content-type': 'application/json', 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON }

beforeAll(async () => {
  db = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  const handle = randomUUID()
  const agent = await app.inject({ method: 'POST', url: '/api/agents/started', headers, payload: { handle, name: handle, runtime: 'claude-code' } })
  expect(agent.statusCode, agent.body).toBe(201)
  recipient = agent.json().agent.id
  const record = await app.inject({ method: 'POST', url: '/api/records', headers, payload: { kind: 'problem', title: 'Made-up quote source', data: {} } })
  expect(record.statusCode, record.body).toBe(201)
  source = record.json().record.id
}, 60_000)

afterAll(async () => { await app.close(); db.close() })

it('refuses null positions at creation and stores no message', async () => {
  const count = () => (db.client.sqlite.prepare("SELECT count(*) AS n FROM records WHERE kind = 'message'").get() as { n: number }).n
  const data = { body: 'words', to: [{ kind: 'agent', id: recipient }], quotes: [{ target: { kind: 'record', recordId: source, workspaceId: 'default' } }], quotePositions: null }
  const before = count()
  const response = await app.inject({ method: 'POST', url: '/api/records', headers, payload: { kind: 'message', title: 'Made-up null positions', data } })
  expect(response.statusCode, response.body).toBe(400)
  const checked = validateData('message', data)
  expect(checked.ok).toBe(false)
  if (!checked.ok) expect(response.json().error).toBe(formatValidationErrors('message', checked.errors))
  expect(count()).toBe(before)
})

it('returns positions beside quotes from the message doors', async () => {
  const quote = { target: { kind: 'record', recordId: source, workspaceId: 'default' } }
  const make = (title: string, extra: Record<string, unknown>) => app.inject({ method: 'POST', url: '/api/records', headers, payload: { kind: 'message', title, data: { body: title, to: [{ kind: 'agent', id: recipient }], quotes: [quote], ...extra } } })
  const absent = await make('Made-up absent positions', {})
  expect([201, 409], absent.body).toContain(absent.statusCode)
  const placed = await make('Made-up placed quote', { quotePositions: [3] })
  expect([201, 409], placed.body).toContain(placed.statusCode)
  const expected = [
    { id: absent.json().record.id, positions: null },
    { id: placed.json().record.id, positions: [3] },
  ]
  for (const one of expected) {
    const read = await app.inject({ method: 'GET', url: `/api/messages/${one.id}`, headers })
    expect(read.statusCode, read.body).toBe(200)
    expect(read.json().message.quotes).toHaveLength(1)
    expect(read.json().message.quotePositions).toEqual(one.positions)
  }
  for (const url of ['/api/messages?full=1', `/api/messages/conversation?kind=agent&id=${recipient}`]) {
    const read = await app.inject({ method: 'GET', url, headers })
    expect(read.statusCode, read.body).toBe(200)
    for (const one of expected) {
      const message = read.json().messages.find((entry: { id: string }) => entry.id === one.id)
      expect(message?.quotes).toHaveLength(1)
      expect(message?.quotePositions).toEqual(one.positions)
    }
  }
})

it('returns null beside quotes for agent thread messages', async () => {
  const context = { target: { kind: 'record', recordId: source, workspaceId: 'default' } }
  const thread = await app.inject({ method: 'POST', url: '/api/agent/threads', headers, payload: { title: 'Made-up conversation', mode: 'direct' } })
  expect(thread.statusCode, thread.body).toBe(201)
  const id = thread.json().thread.id
  const added = await app.inject({ method: 'POST', url: `/api/agent/threads/${id}/messages`, headers, payload: { intent: 'discuss', body: 'Made-up thread words', context, recipient: { kind: 'new' } } })
  expect(added.statusCode, added.body).toBe(201)
  expect(added.json().message.quotes).toHaveLength(1)
  expect(added.json().message.quotePositions).toBeNull()
  const read = await app.inject({ method: 'GET', url: `/api/agent/threads/${id}`, headers })
  expect(read.statusCode, read.body).toBe(200)
  expect(read.json().messages[0].quotes).toHaveLength(1)
  expect(read.json().messages[0].quotePositions).toBeNull()
})
