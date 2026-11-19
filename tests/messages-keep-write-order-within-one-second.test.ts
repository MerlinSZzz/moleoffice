// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import { THE_PERSON } from '../src/shared/person.ts'
import { apiApp, freshDb, one, type TestDb } from './helpers.ts'

const HANDLE = 'same-second-agent'
const WORKSPACE = 'default'
const AS_THE_OWNER = {
  'x-mole-office-workspace': WORKSPACE,
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

type Worker = typeof import('../src/server/lib/worker.ts')
type Handles = typeof import('../src/server/lib/handles.ts')

let t: TestDb
let app: FastifyInstance
let worker: Worker
let handles: Handles
let agentId = ''
let first = ''
let second = ''

async function post(path: string, payload: unknown) {
  const reply = await app.inject({ method: 'POST', url: path, headers: AS_THE_OWNER, payload: payload as never })
  return { status: reply.statusCode, body: reply.json() as Record<string, unknown> }
}

async function aMessage(body: string): Promise<string> {
  const filed = await post('/api/records', {
    kind: 'message',
    title: body,
    data: { body, to: [{ kind: 'agent', id: agentId }] },
  })
  // A PERSON'S SEND TO AN AGENT NOTHING HOLDS ANSWERS 409, with the letter stored and routed (decision 60sbc5I-bwKx).
  expect(filed.status, JSON.stringify(filed.body)).toBe(409)
  return (filed.body['record'] as { id: string }).id
}

function inOrder(ids: readonly string[]): string[] {
  return ids.filter((id) => id === first || id === second)
}

beforeAll(async () => {
  t = await freshDb()
  const built = await apiApp()
  app = built.app
  await app.ready()
  worker = await import('../src/server/lib/worker.ts')
  handles = await import('../src/server/lib/handles.ts')

  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-09-30T12:00:00.000Z'))

  const registered = await post('/api/records', {
    kind: 'agent',
    title: 'Same Second Agent',
    data: { handle: HANDLE, runtime: 'claude-code', state: 'active' },
  })
  expect(registered.status, JSON.stringify(registered.body)).toBe(201)
  const listed = (await app.inject({ method: 'GET', url: '/api/participants', headers: AS_THE_OWNER })).json() as {
    agents?: { id: string; handle: string }[]
  }
  agentId = one((listed.agents ?? []).filter((agent) => agent.handle === HANDLE), 'the registry row').id

  first = await aMessage('Written first.')
  second = await aMessage('Written second.')

  const stamps = t.client.sqlite
    .prepare('SELECT id, created_at AS createdAt FROM records WHERE id IN (?, ?) ORDER BY rowid')
    .all(first, second) as { id: string; createdAt: string }[]
  expect(stamps.map((row) => row.id)).toEqual([first, second])
  expect(stamps[0]?.createdAt).toBe(stamps[1]?.createdAt)

  // THE DELIVERY IDS SORT AGAINST WRITE ORDER, so a tie-break on their random values must fail.
  t.client.sqlite.prepare('UPDATE message_delivery SET id = ? WHERE message_id = ?').run('zzzzzzzzzzzz', first)
  t.client.sqlite.prepare('UPDATE message_delivery SET id = ? WHERE message_id = ?').run('aaaaaaaaaaaa', second)
  const deliveryIds = t.client.sqlite
    .prepare('SELECT message_id AS messageId, id FROM message_delivery WHERE message_id IN (?, ?)')
    .all(first, second) as { messageId: string; id: string }[]
  expect(deliveryIds.find((row) => row.messageId === first)?.id).toBe('zzzzzzzzzzzz')
  expect(deliveryIds.find((row) => row.messageId === second)?.id).toBe('aaaaaaaaaaaa')
}, 60_000)

afterAll(async () => {
  vi.useRealTimers()
  await app?.close()
  t?.close()
})

describe('same-second messages keep the order in which their records were written', () => {
  it('keeps that order in the worker queue', () => {
    expect(inOrder(worker.theQueue(WORKSPACE).map((row) => row.messageId))).toEqual([first, second])
  })

  it('keeps that order in the handle waiting list', () => {
    expect(inOrder(handles.everythingWaitingFor(agentId).map((row) => row.messageId))).toEqual([first, second])
  })

  it('keeps that order after both queued records become dead letters', async () => {
    for (const id of [first, second]) {
      const deleted = await app.inject({ method: 'DELETE', url: `/api/records/${id}`, headers: AS_THE_OWNER })
      expect(deleted.statusCode, deleted.body).toBe(200)
    }
    expect(inOrder(worker.deadLettersInTheQueue(WORKSPACE).map((row) => row.messageId))).toEqual([first, second])
  })
})
