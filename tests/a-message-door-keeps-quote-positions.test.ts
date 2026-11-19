// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { randomUUID } from 'node:crypto'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { THE_PERSON } from '../src/shared/person.ts'
import { whyQuotePositionsAreInvalid } from '../src/shared/messages.ts'
import { apiApp, freshDb, type TestDb } from './helpers.ts'

let db: TestDb
let app: FastifyInstance
let recipient: string
let quoted: string
const headers = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}
const quote = () => ({ target: { kind: 'record', recordId: quoted, workspaceId: 'default' } })
const count = () => (db.client.sqlite.prepare("SELECT count(*) AS n FROM records WHERE kind = 'message'").get() as { n: number }).n
const send = (data: Record<string, unknown>) => app.inject({ method: 'POST', url: '/api/records', headers, payload: { kind: 'message', title: 'Made-up message', data: { to: [{ kind: 'agent', id: recipient }], ...data } } })

beforeAll(async () => {
  db = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  const handle = randomUUID()
  const agent = await app.inject({ method: 'POST', url: '/api/agents/started', headers, payload: { handle, name: handle, runtime: 'claude-code' } })
  expect(agent.statusCode).toBe(201)
  recipient = agent.json().agent.id
  const record = await app.inject({ method: 'POST', url: '/api/records', headers, payload: { kind: 'problem', title: 'Made-up source', data: {} } })
  expect(record.statusCode).toBe(201)
  quoted = record.json().record.id
}, 60_000)
afterAll(async () => { await app.close(); db.close() })

describe('positions at the message door', () => {
  it.each([
    { body: 'abc', positions: [0], quotes: null },
    { body: 'abc', positions: [0], quotes: [] },
    { body: 'abc', positions: 'not a list', quotes: [1] },
    { body: 'abc', positions: [-1], quotes: [1] },
    { body: 'abc', positions: [4], quotes: [1] },
    { body: 'abc', positions: [1.5], quotes: [1] },
    { body: 'abc', positions: [2, 1], quotes: [1, 1] },
    { body: 'a😀b', positions: [2], quotes: [1] },
  ])('refuses invalid positions and stores nothing', async ({ body, positions, quotes }) => {
    const contexts = quotes?.map(() => quote()) ?? null
    const before = count()
    const response = await send({ body, ...(contexts === null ? {} : { quotes: contexts }), quotePositions: positions })
    expect(response.statusCode, response.body).toBe(400)
    expect(response.json().error).toContain(whyQuotePositionsAreInvalid(body, contexts, positions))
    expect(count()).toBe(before)
  })

  it('refuses positions on a target and stores nothing', async () => {
    const before = count()
    const response = await send({ body: 'abc', target: quote(), quotePositions: [0] })
    expect(response.statusCode, response.body).toBe(400)
    expect(response.json().error).toContain(whyQuotePositionsAreInvalid('abc', null, [0], quote()))
    expect(count()).toBe(before)
  })

  it('stores exact positions and returns them alongside quotes, with null for older messages', async () => {
    const created = await send({ body: 'a😀b', quotes: [quote(), quote()], quotePositions: [1, 3] })
    expect(created.statusCode, created.body).toBe(409)
    const record = created.json().record
    expect(record.data.quotePositions).toEqual([1, 3])
    const detail = await app.inject({ method: 'GET', url: `/api/messages/${record.id}`, headers })
    expect(detail.statusCode, detail.body).toBe(200)
    expect(detail.json().message.quotePositions).toEqual([1, 3])
    const without = await send({ body: 'old', quotes: [quote()] })
    const old = await app.inject({ method: 'GET', url: `/api/messages/${without.json().record.id}`, headers })
    expect(old.json().message.quotePositions).toBeNull()
    const conversation = await app.inject({ method: 'GET', url: `/api/messages/conversation?kind=agent&id=${recipient}`, headers })
    expect(conversation.statusCode, conversation.body).toBe(200)
    const messages = conversation.json().messages as Array<{ id: string; quotePositions: number[] | null }>
    expect(messages.find((m) => m.id === record.id)?.quotePositions).toEqual([1, 3])
    expect(messages.find((m) => m.id === without.json().record.id)?.quotePositions).toBeNull()
  })

  it('refuses to change quotes and keeps their positions', async () => {
    const created = await send({ body: 'abcd', quotes: [quote()], quotePositions: [2] })
    const id = created.json().record.id
    const response = await app.inject({ method: 'PATCH', url: `/api/records/${id}`, headers, payload: { dataPatch: { quotes: [quote(), quote()] } } })
    expect(response.statusCode, response.body).toBe(403)
    const stored = await app.inject({ method: 'GET', url: `/api/records/${id}`, headers })
    expect(stored.json().record.data.quotes).toEqual(created.json().record.data.quotes)
    expect(stored.json().record.data.quotePositions).toEqual([2])
  })

  it('replaces, drops, and preserves positions when words are edited', async () => {
    const created = await send({ body: 'abcd', quotes: [quote()], quotePositions: [2] })
    const id = created.json().record.id
    const patch = (dataPatch: Record<string, unknown>) => app.inject({ method: 'PATCH', url: `/api/records/${id}`, headers, payload: { dataPatch } })
    let response = await patch({ body: 'a😀b', quotePositions: [3] })
    expect(response.statusCode, response.body).toBe(200)
    expect(response.json().record.data.quotePositions).toEqual([3])
    response = await patch({ quotePositions: [2] })
    expect(response.statusCode, response.body).toBe(400)
    response = await patch({ body: 'changed' })
    expect(response.statusCode, response.body).toBe(200)
    expect(response.json().record.data.quotePositions ?? null).toBeNull()
    response = await patch({ quotePositions: [1] })
    expect(response.statusCode, response.body).toBe(200)
    response = await patch({ body: 'changed' })
    expect(response.statusCode, response.body).toBe(200)
    expect(response.json().record.data.quotePositions).toEqual([1])
    response = await patch({ quotePositions: [] })
    expect(response.statusCode, response.body).toBe(200)
    expect(response.json().record.data.quotePositions ?? null).toBeNull()
    response = await patch({ quotePositions: [1] })
    expect(response.statusCode, response.body).toBe(200)
    response = await patch({ quotePositions: null })
    expect(response.statusCode, response.body).toBe(200)
    expect(response.json().record.data.quotePositions ?? null).toBeNull()
  })
})
