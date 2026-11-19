// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A MESSAGE THE OFFICE ITSELF SENDS SAYS ITS ROLE IS THE OFFICE.
 *
 * Problem UJSKqVr6GK96, settled by item 6 of a decision: a message Mole Office sends read `sentByRole: 'worker'`,
 * because the office's own sender row holds no role card and a row with no card reads as the worker
 * card. It must say the office, not the worker.
 *
 * Every place the office writes a message goes through `writeASystemLine`, `writeASystemLineToOne` or
 * `writeASystemLineToTwo` (lib/groups.ts) or `writeAMessage` (lib/inspection.ts), and each stores the sender Mole Office.
 * The role is read when the message is read, from the sender, so one rule covers all of them; this proves it through
 * the one-participant line and through the pool door and the one-message door.
 *
 * ---------------------------------------------------------------------------------------
 * THE MUTATION THAT TURNS THIS RED, WITH A CONTROL RUN FIRST
 * ---------------------------------------------------------------------------------------
 *
 *   In `theRungAndTheChain` (lib/messages.ts), take out the line that answers THE_OFFICE_ROLE for Mole Office → the
 *   office's line reads `worker` again and the first case goes red.
 */

import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { THE_PERSON } from '../src/shared/person.ts'
import { apiApp, freshDb, theOfficesOwnId, type TestDb } from './helpers.ts'

let t: TestDb
let app: FastifyInstance
let groups: typeof import('../src/server/lib/groups.ts')
let workerId = ''

const THE_OFFICE = { type: 'agent', id: 'mole-office/the-api-server' } as const
const AS_THE_PERSON = { 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON }

beforeAll(async () => {
  t = await freshDb()
  groups = await import('../src/server/lib/groups.ts')
  app = (await apiApp()).app
  await app.ready()
  const made = await app.inject({
    method: 'POST',
    url: '/api/agents/started',
    headers: AS_THE_PERSON,
    payload: { handle: 'a-worker', name: 'A worker', role: 'worker' },
  })
  workerId = (made.json() as { agent: { id: string } }).agent.id
}, 60_000)

afterAll(async () => {
  await app.close()
  t.close()
})

describe('the office says it is the office', () => {
  it('reads sentByRole office on a line the office wrote, through the one-message door and the pool', async () => {
    const written = groups.writeASystemLineToOne({ kind: 'agent', id: workerId }, 'default', { line: 'Test: a reminder', said: 'Test: said in full.', notice: 'aCounterFired' }, THE_OFFICE)
    const one = await app.inject({ method: 'GET', url: `/api/messages/${written.id}`, headers: AS_THE_PERSON })
    expect(one.statusCode, one.body).toBe(200)
    const read = one.json() as { message?: { sentBy: unknown; sentByRole: string | null } } & { sentBy?: unknown; sentByRole?: string | null }
    const message = read.message ?? read
    expect(message.sentBy).toEqual({ kind: 'agent', id: theOfficesOwnId(t) })
    expect(message.sentByRole).toBe('office')
    const pool = await app.inject({ method: 'GET', url: '/api/messages?full=1', headers: AS_THE_PERSON })
    const entry = (pool.json() as { messages: { id: string; sentByRole: string | null }[] }).messages.find((m) => m.id === written.id)
    expect(entry?.sentByRole).toBe('office')
  })

  it('still reads worker for an agent with the worker card', async () => {
    const sent = await app.inject({
      method: 'POST',
      url: '/api/records',
      headers: { 'content-type': 'application/json', 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': 'a-worker' },
      payload: { kind: 'message', title: 'Test: from a worker', data: { body: 'Test: from a worker', to: [{ kind: 'person', id: THE_PERSON }] } },
    })
    expect(sent.statusCode, sent.body).toBe(201)
    const id = (sent.json() as { record: { id: string } }).record.id
    const one = await app.inject({ method: 'GET', url: `/api/messages/${id}`, headers: AS_THE_PERSON })
    const read = one.json() as { message?: { sentByRole: string | null } } & { sentByRole?: string | null }
    expect((read.message ?? read).sentByRole).toBe('worker')
  })
})
