// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE WAITING DOOR RETURNS THE SENDER AND ITS ORDER PUTS THE PERSON FIRST.
 *
 * Every row carries `sentBy`, read from the message record the query already joins. The order keeps
 * urgent messages first, then puts the person's messages ahead of agent receipts. Each group stays
 * oldest first. The worker and the waiter use the same server order.
 */

import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { THE_PERSON } from '../src/shared/person.ts'
import { apiApp, freshDb, one, type TestDb, theAnswerToAWriteInATestOffice } from './helpers.ts'

let t: TestDb
let app: FastifyInstance

const AS_THE_PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

const asAgent = (handle: string) => ({
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': handle,
})

async function post(
  path: string,
  body: unknown,
  headers = AS_THE_PERSON,
  expected: number = theAnswerToAWriteInATestOffice(headers, body),
): Promise<Record<string, unknown>> {
  const reply = await app.inject({ method: 'POST', url: path, headers, payload: body as object })
  const read = reply.json() as Record<string, unknown>
  expect(reply.statusCode, `POST ${path}: ${JSON.stringify(read)}`).toBe(expected)
  return read
}

async function get(path: string, headers: Record<string, string>): Promise<Record<string, unknown>> {
  const reply = await app.inject({ method: 'GET', url: path, headers })
  const read = reply.json() as Record<string, unknown>
  if (reply.statusCode !== 200) throw new Error(`GET ${path} answered ${String(reply.statusCode)}: ${JSON.stringify(read)}`)
  return read
}

async function anAgent(handle: string): Promise<string> {
  await post('/api/records', {
    kind: 'agent',
    title: handle,
    data: { handle, state: 'active', runtime: 'claude-code' },
  })
  const listed = (await get('/api/participants', AS_THE_PERSON)) as { agents?: { id: string; handle: string }[] }
  return one((listed.agents ?? []).filter((agent) => agent.handle === handle), `the registry row for ${handle}`).id
}

async function aMessage(
  body: string,
  targetId: string,
  sortOrder: number,
  fromAgent?: string,
  urgent = false,
): Promise<string> {
  const headers = fromAgent === undefined ? AS_THE_PERSON : asAgent(fromAgent)
  const message = {
    kind: 'message',
    title: body,
    data: { body, to: [{ kind: 'agent', id: targetId }], ...(urgent ? { urgent: true } : {}) },
  }
  // NOTHING HOLDS THE TARGET IN THE TEST OFFICE, so the office stores an agent's message to it, routes it and answers 409.
  // The message is stored all the same, and waits on the door read below.
  const filed = await post('/api/records', message, headers, fromAgent === undefined ? theAnswerToAWriteInATestOffice(headers, message) : 409)
  const id = (filed['record'] as { id: string }).id
  // Give the queue stable, distinct ages without waiting on wall-clock seconds.
  t.client.sqlite
    .prepare('UPDATE records SET created_at = ? WHERE id = ?')
    .run(`2026-09-01 10:00:${String(sortOrder).padStart(2, '0')}`, id)
  return id
}

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
}, 60_000)

afterAll(async () => {
  await app.close()
  t.close()
})

describe('the waiting list names its writers and keeps the requested order', () => {
  it('puts emergencies first, then the person, then agents, oldest first within each group', async () => {
    const target = await anAgent('waiting-target')
    const sender = await anAgent('receipt-writer')

    const olderAgentReceipt = await aMessage('older agent receipt', target, 1, 'receipt-writer')
    const olderPersonMessage = await aMessage('older person message', target, 2)
    const newerAgentReceipt = await aMessage('newer agent receipt', target, 3, 'receipt-writer')
    const newerPersonMessage = await aMessage('newer person message', target, 4)
    const urgentMessage = await aMessage('urgent agent message', target, 5, 'receipt-writer', true)

    const read = (await get('/api/handles/waiting-target/waiting', asAgent('waiting-target'))) as {
      waiting?: { messageId: string; urgent: boolean; sentBy: { kind: string; id: string } | null }[]
    }
    const waiting = read.waiting ?? []
    expect(waiting.map((row) => row.messageId)).toEqual([
      urgentMessage,
      olderPersonMessage,
      newerPersonMessage,
      olderAgentReceipt,
      newerAgentReceipt,
    ])
    expect(waiting.map((row) => row.sentBy)).toEqual([
      { kind: 'agent', id: sender },
      { kind: 'person', id: THE_PERSON },
      { kind: 'person', id: THE_PERSON },
      { kind: 'agent', id: sender },
      { kind: 'agent', id: sender },
    ])
    expect(waiting[0]?.urgent).toBe(true)
  })
})
