// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * READING A CONVERSATION MOVES NO AGENT'S MESSAGE. Criterion M127 of design/messages/ACCEPTANCE.md,
 * problem `B5V0J5CQnFh1`.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT WAS WRONG
 * ---------------------------------------------------------------------------------------
 *
 * GET /api/messages/conversation and GET /api/messages/unregistered marked every message still queued
 * for the reader delivered, whoever the reader was. When the reader was an agent, its queued messages
 * became `delivered`, and the waiter (`everythingWaitingFor`) and the worker (`theQueue`) look only for
 * `queued`. So a message an agent had merely listed was never handed to it. Measured on 11 September
 * 2026: 54 messages to zhixu were in that state, one of the owner's own questions among them.
 *
 * M127: a message to an agent is moved by the hand that gives it the words, and by nothing else. A
 * person's read is unchanged: what reached a person's screen still becomes delivered.
 *
 * ---------------------------------------------------------------------------------------
 * THE UNREGISTERED READ, AND HOW ITS MESSAGE IS MADE
 * ---------------------------------------------------------------------------------------
 *
 * By a decision of the owner's, a writer no registry holds can no longer write to an agent. The
 * refusal is `whyAnUnregisteredWriterIsRefused`, and the first case below holds that. So the messages this
 * read shows are ones written before that rule. Deleting the writer's agent record does not make one:
 * a deleted agent is still a contact the registries hold, measured while this file was written. The
 * message is made the way tests/every-message-is-in-a-conversation.test.ts makes one: a registered
 * agent writes it through the door, and its `sentBy` is then changed in this test's own database to
 * an id no registry holds, which is the shape such a row has.
 */

import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { unregisteredKey } from '../src/shared/messages.ts'
import type { ParticipantRef } from '../src/shared/participants.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { apiApp, freshDb, one, type TestDb, theAnswerToAWriteInATestOffice } from './helpers.ts'

let t: TestDb
let app: FastifyInstance

const AS_THE_OWNER = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

const asAgent = (handle: string): Record<string, string> => ({
  ...AS_THE_OWNER,
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': handle,
})

interface Delivery {
  to: ParticipantRef
  mark: string
}

interface Reply {
  status: number
  body: Record<string, unknown>
}

async function call(method: 'GET' | 'POST', url: string, headers: Record<string, string>, payload?: unknown): Promise<Reply> {
  const reply = await app.inject({ method, url, headers, ...(payload === undefined ? {} : { payload: payload as object }) })
  return { status: reply.statusCode, body: JSON.parse(reply.body === '' ? '{}' : reply.body) as Record<string, unknown> }
}

/** Register one agent and give back its record id. */
async function anAgent(handle: string): Promise<string> {
  const filed = await call('POST', '/api/records', AS_THE_OWNER, {
    kind: 'agent',
    title: handle,
    data: { handle, state: 'active', runtime: 'claude-code' },
  })
  expect(filed.status, JSON.stringify(filed.body)).toBe(201)
  return (filed.body['record'] as { id: string }).id
}

/** Send one message and give back its id; the send itself must be accepted. */
async function send(from: Record<string, string>, body: string, to: ParticipantRef, expected?: number): Promise<string> {
  const said = await call('POST', '/api/records', from, {
    kind: 'message',
    title: body.slice(0, 30),
    data: { body, to: [to] },
  })
  expect(said.status, JSON.stringify(said.body)).toBe(expected ?? theAnswerToAWriteInATestOffice(from, { kind: 'message', data: { to: [to] } }))
  return (said.body['record'] as { id: string }).id
}

/**
 * THE REGISTRY ID OF THE AGENT WITH ONE HANDLE. A delivery row names its recipient by registry id,
 * and since the mint (criterion I1 of design/agents/IDENTITY-ACCEPTANCE.md) a new agent's id is not
 * its handle.
 */
function idOf(handle: string): string {
  return (t.client.sqlite.prepare('SELECT id FROM agents WHERE handle = ?').get(handle) as { id: string }).id
}

/** Where the delivery of one message to one recipient stands, read through the product's own door. */
async function markFor(messageId: string, recipient: string): Promise<string> {
  const read = await call('GET', `/api/messages/${messageId}`, AS_THE_OWNER)
  expect(read.status, JSON.stringify(read.body)).toBe(200)
  const deliveries = (read.body['message'] as { deliveries: Delivery[] }).deliveries
  return one(deliveries.filter((d) => d.to.id === recipient), `the delivery row for ${recipient}`).mark
}

/** What the waiter's door would hand this agent now. */
async function waitingFor(handle: string): Promise<string[]> {
  const read = await call('GET', `/api/handles/${handle}/waiting`, asAgent(handle))
  expect(read.status, JSON.stringify(read.body)).toBe(200)
  return (read.body['waiting'] as { messageId: string }[]).map((w) => w.messageId)
}

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
}, 120_000)

afterAll(async () => {
  await app?.close()
  t?.close()
})

describe('an agent reading its conversation with a person', () => {
  it('leaves the message queued, marks nothing, and the waiter still has it to hand over', async () => {
    await anAgent('reader-a')
    const asked = await send(AS_THE_OWNER, 'Is the mount calibrated?', { kind: 'agent', id: 'reader-a' })
    expect(await markFor(asked, idOf('reader-a')), 'the control: a fresh message waits').toBe('queued')
    expect(await waitingFor('reader-a'), 'the control: the waiter has it').toContain(asked)

    const read = await call('GET', `/api/messages/conversation?kind=person&id=${THE_PERSON}`, asAgent('reader-a'))
    expect(read.status, JSON.stringify(read.body)).toBe(200)
    const shown = (read.body['messages'] as { id: string }[]).map((m) => m.id)
    expect(shown, 'the read did show the agent the message').toContain(asked)

    expect(read.body['markedDelivered'], 'an agent reading marks nothing').toEqual([])
    expect(await markFor(asked, idOf('reader-a')), 'the whole defect was that this read delivered').toBe('queued')
    expect(await waitingFor('reader-a'), 'the waiter can still hand it over').toContain(asked)
  }, 60_000)
})

describe('an agent reading what a writer nobody registers any more sent it', () => {
  it('refuses a new message to an agent from a writer no registry holds', async () => {
    await anAgent('reader-b0')
    const refused = await call('POST', '/api/records', asAgent('nobody-registered-this'), {
      kind: 'message',
      title: 'hello',
      data: { body: 'hello', to: [{ kind: 'agent', id: 'reader-b0' }] },
    })
    expect(refused.status, JSON.stringify(refused.body)).toBe(400)
    expect(String(refused.body['error']), 'the refusal is the unregistered writer\'s').toContain(
      'Nothing is registered as the agent "nobody-registered-this"',
    )
    expect(await waitingFor('reader-b0'), 'nothing was written').toEqual([])
  }, 60_000)

  it('leaves the message queued, marks nothing, and the waiter still has it to hand over', async () => {
    await anAgent('reader-b')
    await anAgent('writer-b')
    // Nothing holds reader-b in the test office, so the office stores this message, routes it and answers 409. The
    // message is stored all the same, and waits for reader-b.
    const said = await send(asAgent('writer-b'), 'The arm is in the rack.', { kind: 'agent', id: 'reader-b' }, 409)
    const nobody: ParticipantRef = { kind: 'agent', id: 'a-writer-no-registry-holds' }
    t.client.sqlite
      .prepare("UPDATE records SET data = json_set(data, '$.sentBy', json(?)) WHERE id = ?")
      .run(JSON.stringify(nobody), said)
    const writer = unregisteredKey({ typed: null, said: nobody })
    expect(await markFor(said, idOf('reader-b')), 'the control: it waits').toBe('queued')
    expect(await waitingFor('reader-b'), 'the control: the waiter has it').toContain(said)

    const read = await call('GET', `/api/messages/unregistered?writer=${encodeURIComponent(writer)}`, asAgent('reader-b'))
    expect(read.status, JSON.stringify(read.body)).toBe(200)
    const shown = (read.body['messages'] as { id: string }[]).map((m) => m.id)
    expect(shown, 'the read did show the agent the message, so the writer really is unregistered now').toEqual([said])

    expect(read.body['markedDelivered'], 'an agent reading marks nothing').toEqual([])
    expect(await markFor(said, idOf('reader-b'))).toBe('queued')
    expect(await waitingFor('reader-b'), 'the waiter can still hand it over').toContain(said)
  }, 60_000)
})

describe('a person reading a conversation with an agent', () => {
  it('still moves what was queued for the person to delivered', async () => {
    await anAgent('writer-c')
    const said = await send(asAgent('writer-c'), 'The run finished.', { kind: 'person', id: THE_PERSON })
    expect(await markFor(said, THE_PERSON), 'the control: it waits').toBe('queued')

    const read = await call('GET', '/api/messages/conversation?kind=agent&id=writer-c', AS_THE_OWNER)
    expect(read.status, JSON.stringify(read.body)).toBe(200)
    expect(read.body['markedDelivered'], 'it reached the person’s screen').toEqual([said])
    expect(await markFor(said, THE_PERSON)).toBe('delivered')
  }, 60_000)
})
