// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * AN UNREADABLE MESSAGE DOES NOT STOP AN AGENT'S START.
 *
 * WHAT THIS PROVES. An agent can register with a card while the office holds a message whose stored
 * data is not valid JSON. The registration answers 201, and the agent is handed the card message that
 * belongs to it.
 *
 * THE FAULT IT WAS WRITTEN FOR. The office looks for the message that already carried a card's
 * handbook by walking every message's `data`. SQLite raises "malformed JSON" on a message whose data
 * it cannot read, so the walk stopped the registration with a 500 even though the unreadable message
 * had nothing to do with the agent being started. The walk now tests that a message's data is valid
 * JSON before it reads any field out of it.
 *
 * THE MUTATION PROOF. The guard on the walk was taken out on 23 October 2026, and this case went red
 * on the status: the registration answered 500 instead of 201. The guard was put back and the case
 * went green again.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { FastifyInstance, InjectOptions } from 'fastify'

import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'

let t: TestDb
let app: FastifyInstance

const AS_THE_PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

async function inject(
  method: 'GET' | 'POST',
  url: string,
  payload?: InjectOptions['payload'],
): Promise<{ status: number; json: Record<string, unknown>; text: string }> {
  const options: InjectOptions = { method, url, headers: AS_THE_PERSON }
  if (payload !== undefined) options.payload = payload
  const reply = await app.inject(options)
  let json: Record<string, unknown> = {}
  try {
    json = reply.json() as Record<string, unknown>
  } catch {
    json = {}
  }
  return { status: reply.statusCode, json, text: reply.body }
}

beforeEach(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
})

afterEach(async () => {
  await app.close()
  t.close()
})

describe('an agent can start beside a message whose data cannot be read', () => {
  it('registers with a card and is handed its card message', async () => {
    const written = await inject('POST', '/api/records', {
      kind: 'message',
      title: 'A made-up note',
      data: { body: 'A made-up note.', to: [{ kind: 'person', id: THE_PERSON }] },
    })
    expect(written.status, written.text).toBe(201)
    const brokenMessage = (written.json['record'] as { id: string }).id

    t.client.sqlite.prepare('UPDATE records SET data = ? WHERE id = ?').run('{ not json', brokenMessage)
    const held = t.client.sqlite.prepare('SELECT json_valid(data) AS valid FROM records WHERE id = ?').get(brokenMessage) as
      | { valid?: number }
      | undefined
    expect(held?.valid, 'the test does not hold a message whose data is unreadable').toBe(0)

    const handle = 'made-up-supervisor'
    const started = await inject('POST', '/api/agents/started', {
      handle,
      name: 'Made-up supervisor',
      role: 'supervisor',
    })
    expect(started.status, started.text).toBe(201)

    const waiting = await inject('GET', `/api/handles/${handle}/waiting`)
    expect(waiting.status, waiting.text).toBe(200)
    const waitingFor = (waiting.json as { waiting: { messageId: string }[] }).waiting
    expect(waitingFor.length, 'the agent was handed no card message').toBe(1)

    const cardMessage = await inject('GET', `/api/records/${waitingFor[0]!.messageId}`)
    expect(cardMessage.status, cardMessage.text).toBe(200)
    const record = cardMessage.json['record'] as { kind: string; data: Record<string, unknown> }
    expect(record.kind).toBe('message')
    const extra = (record.data['extra'] ?? {}) as Record<string, unknown>
    const mark = extra['handbookSent'] as { card?: string } | undefined
    expect(mark?.card, 'the waiting message is not the card message').toBe('supervisor')
  })
})
