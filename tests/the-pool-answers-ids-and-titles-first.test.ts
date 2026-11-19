// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { afterAll, beforeAll, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'

let office: TestDb
let app: FastifyInstance
let messageId: string
const person = {
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

beforeAll(async () => {
  office = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  const made = await app.inject({
    method: 'POST', url: '/api/records', headers: person,
    payload: { kind: 'message', title: 'A delivery to read', data: { body: 'The whole delivery has words.', to: [{ kind: 'person', id: THE_PERSON }] } },
  })
  expect(made.statusCode).toBe(201)
  messageId = (made.json() as { record: { id: string } }).record.id
})

afterAll(async () => {
  await app.close()
  office.close()
})

it('answers ids and titles first and keeps the full record on request', async () => {
  const read = async (url: string) => {
    const response = await app.inject({ method: 'GET', url, headers: person })
    expect(response.statusCode).toBe(200)
    return response.json() as { messages: Record<string, unknown>[] }
  }
  const narrow = (await read('/api/messages')).messages.find((one) => one.id === messageId)
  const full = (await read('/api/messages?full=1')).messages.find((one) => one.id === messageId)
  expect(full).toMatchObject({ id: messageId, title: 'A delivery to read', body: 'The whole delivery has words.' })
  expect(Array.isArray(full?.deliveries)).toBe(true)
  expect(narrow).toEqual({ id: full?.id, title: full?.title, wordsMayChangeUntil: full?.wordsMayChangeUntil })
  expect((await read('/api/messages?narrow=1')).messages.find((one) => one.id === messageId)).toEqual(narrow)
})

it('answers queued agent ids without embedding message entries', async () => {
  const response = await app.inject({ method: 'GET', url: '/api/messages/queued-agent-ids', headers: person })
  expect(response.statusCode).toBe(200)
  const body = response.json() as Record<string, unknown>
  expect(Object.keys(body).filter((key) => key !== 'narrowedByPermission')).toEqual(['agentIds'])
  expect(Array.isArray(body.agentIds)).toBe(true)
})
