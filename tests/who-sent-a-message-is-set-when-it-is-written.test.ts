// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHO SENT A MESSAGE IS SET WHEN IT IS WRITTEN, AND NO LATER WRITE CHANGES IT. Problem KBKHHtTTnaMY, found by the
 * inspector's check of run yYI5r-EONy9M on 29 September 2026: an agent's PATCH naming `sentBy` on its own message was
 * answered 200, so a message could be made to say Mole Office sent it after it was written. A second road to the same
 * place: a kind that does not hold `sentBy` keeps it in `extra`, and a change of kind into a message brought it back, so
 * a note could become a message from anybody.
 *
 * WHAT IS REAL: the office's own doors, POST and PATCH /api/records, on a throwaway database, with two agents the person
 * registered and the person themselves.
 *
 *   1. The writer may not set, change or take off the sender of its own message. A patch naming `sentBy` (Mole Office,
 *      another agent, or null) and a whole `data` that changes it or leaves it out are each refused with the one
 *      sentence, and the stored sender is still the writer. A whole `data` that sends the stored sender back is answered
 *      200.
 *   2. Nor may the person, on an agent's message.
 *   3. A note whose `extra` names Mole Office as its sender may not become a message, and stays a note. One whose
 *      `extra` names its own writer may.
 *
 * ---------------------------------------------------------------------------------------
 * MUTATION PROOF (after a green control), each alone in refuseASenderThisWriteWouldChange, src/server/lib/records.ts
 * ---------------------------------------------------------------------------------------
 *
 *   h. A message's sender not asked about on the update path, as before: cases 1 and 2 go red.
 *   i. A record that becomes a message not asked about its sender, as before: case 3 goes red.
 */

import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { A_RECORD_BECOMES_A_MESSAGE_FROM_ITS_WRITER, WHO_SENT_A_MESSAGE_IS_SET_WHEN_WRITTEN } from '../src/shared/messages.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { apiApp, freshDb, type TestDb } from './helpers.ts'

let t: TestDb
let app: FastifyInstance

const AS_THE_PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

function asAgent(handle: string, key: string): Record<string, string> {
  return {
    'content-type': 'application/json',
    'x-mole-office-workspace': 'default',
    'x-mole-office-actor-type': 'agent',
    'x-mole-office-actor-id': handle,
    'x-mole-office-key': key,
  }
}

async function ask(method: 'POST' | 'PATCH', url: string, headers: Record<string, string>, payload: unknown): Promise<{ status: number; body: Record<string, unknown> }> {
  const reply = await app.inject({ method, url, headers, payload: payload as never })
  return { status: reply.statusCode, body: reply.json() as Record<string, unknown> }
}

async function register(handle: string): Promise<string> {
  const made = await ask('POST', '/api/agents/started', AS_THE_PERSON, { handle, name: handle, runtime: 'claude-code' })
  expect(made.status, JSON.stringify(made.body)).toBe(201)
  return String((made.body['whatToGiveIt'] as { key?: string } | undefined)?.key)
}

function idOf(handle: string): string {
  return (t.client.sqlite.prepare('SELECT id FROM agents WHERE handle = ? AND retired = 0').get(handle) as { id: string }).id
}

/** A record's kind and data, as stored. */
function asStored(id: string): { kind: string; data: Record<string, unknown> } {
  const row = t.client.sqlite.prepare('SELECT kind, data FROM records WHERE id = ?').get(id) as { kind: string; data: string }
  return { kind: row.kind, data: JSON.parse(row.data) as Record<string, unknown> }
}

async function filed(headers: Record<string, string>, record: Record<string, unknown>, expected = 201): Promise<string> {
  const made = await ask('POST', '/api/records', headers, record)
  expect(made.status, JSON.stringify(made.body)).toBe(expected)
  return String((made.body['record'] as { id?: string }).id)
}

const MOLE_OFFICE = { kind: 'agent', id: 'mole-office' }
let byWriter: Record<string, string> = {}
let message = ''

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  byWriter = asAgent('a-writer', await register('a-writer'))
  await register('a-reader')
  // NOTHING HOLDS a-reader IN THE TEST OFFICE, so the office stores the message, routes it and answers 409. The message
  // is stored all the same, with the writer as its sender.
  message = await filed(byWriter, { kind: 'message', title: 'a message', data: { body: 'hello', to: [{ kind: 'agent', id: 'a-reader' }] } }, 409)
}, 60_000)

afterAll(async () => {
  await app.close()
  t.close()
})

describe('who sent a message is set when it is written', () => {
  it('the writer may not set, change or take off the sender of its own message, by a patch or by a whole data', async () => {
    const writer = { kind: 'agent', id: idOf('a-writer') }
    expect(asStored(message).data['sentBy']).toEqual(writer)
    const stored = asStored(message).data
    const { sentBy: _left, ...withoutASender } = stored
    const tries: [string, unknown][] = [
      ['a patch naming Mole Office', { dataPatch: { sentBy: MOLE_OFFICE } }],
      ['a patch naming another agent', { dataPatch: { sentBy: { kind: 'agent', id: 'a-reader' } } }],
      ['a patch taking it off', { dataPatch: { sentBy: null } }],
      ['a whole data naming Mole Office', { data: { ...stored, sentBy: MOLE_OFFICE } }],
      ['a whole data leaving it out', { data: withoutASender }],
    ]
    for (const [what, patch] of tries) {
      const said = await ask('PATCH', `/api/records/${message}`, byWriter, patch)
      expect(said.status, `${what}: ${JSON.stringify(said.body)}`).toBe(403)
      expect(said.body['error'], what).toBe(WHO_SENT_A_MESSAGE_IS_SET_WHEN_WRITTEN)
      expect(asStored(message).data['sentBy'], `${what} changed the stored sender`).toEqual(writer)
    }
    const roundTrip = await ask('PATCH', `/api/records/${message}`, byWriter, { data: stored })
    expect(roundTrip.status, JSON.stringify(roundTrip.body)).toBe(200)
    expect(asStored(message).data['sentBy']).toEqual(writer)
  })

  it('nor may the person, on an agent’s message', async () => {
    const said = await ask('PATCH', `/api/records/${message}`, AS_THE_PERSON, { dataPatch: { sentBy: { kind: 'person', id: THE_PERSON } } })
    expect(said.status, JSON.stringify(said.body)).toBe(403)
    expect(said.body['error']).toBe(WHO_SENT_A_MESSAGE_IS_SET_WHEN_WRITTEN)
    expect(asStored(message).data['sentBy']).toEqual({ kind: 'agent', id: idOf('a-writer') })
  })

  it('a record that becomes a message names no sender but its writer', async () => {
    const to = [{ kind: 'agent', id: 'a-reader' }]
    const forged = await filed(byWriter, { kind: 'note', title: 'a note', data: { body: 'not the office', extra: { sentBy: MOLE_OFFICE, to } } })
    const refused = await ask('PATCH', `/api/records/${forged}`, byWriter, { kind: 'message' })
    expect(refused.status, JSON.stringify(refused.body)).toBe(403)
    expect(refused.body['error']).toBe(A_RECORD_BECOMES_A_MESSAGE_FROM_ITS_WRITER)
    expect(asStored(forged).kind).toBe('note')

    const own = await filed(byWriter, { kind: 'note', title: 'a note of its own', data: { body: 'from me', extra: { sentBy: { kind: 'agent', id: idOf('a-writer') }, to } } })
    const changed = await ask('PATCH', `/api/records/${own}`, byWriter, { kind: 'message' })
    expect(changed.status, JSON.stringify(changed.body)).toBe(200)
    expect(asStored(own)).toMatchObject({ kind: 'message', data: { sentBy: { kind: 'agent', id: idOf('a-writer') } } })
  })
})
