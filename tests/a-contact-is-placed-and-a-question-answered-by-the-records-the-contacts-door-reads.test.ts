// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A CONTACT IS PLACED, AND A QUESTION IS ANSWERED, BY THE RECORDS THE CONTACTS DOOR READS (wave 13y round 91, gap 5 of
 * item 15e).
 *
 * The contacts door counts a message stored under an agent's own record as that agent's, by the agent's record in the
 * page's project, and names a delivery row stored under an agent's handle or own record as that agent (item 1). Two
 * other places read the person's messages with no record:
 *   - POST /api/messages/contact-placements orders the contacts it moves with no record, so a message stored under an
 *     agent's own record was a writer nobody registered there, and the agent's row was not where the chat drew it;
 *   - ?only=waiting-for-my-answer keys each question by its sender as stored and each answer by its recipient as
 *     stored, so a question stored under the agent's own record, or answered by a message stored under its handle,
 *     waited for an answer the person had given.
 *
 * THE CASES. Every request is asked from the project 'default', where each agent's own record is.
 *   1. THE CONTROL: messages stored under the registry id. The rows the move door answers with are the contacts door's.
 *   2. The newest message of an agent stored under its own record. The rows the move door answers with are the
 *      contacts door's.
 *   3. The same agent moved down by one place: it changes places with the row the contacts door drew after it.
 *   4. THE CONTROL: a question stored under the registry id waits until the person writes back to the agent.
 *   5. A question stored under the agent's own record waits until the person writes back to the agent.
 *   6. A question answered by a message whose delivery row stores the agent's handle waits no more.
 *
 * MUTATIONS, after a control run; the round's report says which case each turned red.
 *
 * THE WORLD IS ITS OWN: `freshDb` and `apiApp` make a database and a server for this file, every request is asked with
 * `inject`, and the agents and messages are made up here. A stored sender or recipient is given its shape by a write to
 * the file, as tests/seeing-a-message-moves-the-contacts-as-the-pages-project-reads-them.test.ts does, because the door
 * stores the registry id.
 */

import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import type { ParticipantRef } from '../src/shared/participants.ts'
import { participantKey } from '../src/shared/messages.ts'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { apiApp, freshDb, one, type TestDb } from './helpers.ts'

const HOME = 'default'
const THE_READER: ParticipantRef = { kind: 'person', id: THE_TEST_OFFICES_OWNER.id }

let t: TestDb
let app: FastifyInstance

function asThePerson(): Record<string, string> {
  return { 'x-mole-office-workspace': HOME, 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id }
}

function asAgent(handle: string): Record<string, string> {
  return { ...asThePerson(), 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': handle }
}

async function ask(method: 'GET' | 'POST', url: string, headers: Record<string, string>, payload?: unknown): Promise<{ status: number; body: Record<string, unknown> }> {
  const reply = await app.inject({ method, url, headers, ...(payload === undefined ? {} : { payload: payload as never }) })
  return { status: reply.statusCode, body: reply.json() as Record<string, unknown> }
}

type Agent = { handle: string; who: ParticipantRef; record: string }

/** A made-up agent, filed in 'default': its registry participant and its own record there. */
async function anAgent(handle: string): Promise<Agent> {
  const made = await ask('POST', '/api/records', asThePerson(), { kind: 'agent', title: `${handle} (made up)`, data: { handle, runtime: 'claude-code', state: 'active' } })
  expect(made.status, JSON.stringify(made.body)).toBe(201)
  const record = (made.body['record'] as { id: string }).id
  const listed = await ask('GET', '/api/participants', asThePerson())
  const row = one(((listed.body['agents'] ?? []) as { id: string; handle: string; record?: string | null }[]).filter((a) => a.handle === handle), `the registry row of ${handle}`)
  // THE CONTROL: the list of 'default' carries this record as the agent's own, and it is not the registry id.
  expect([row.record, row.id === record], JSON.stringify(row)).toEqual([record, false])
  return { handle, who: { kind: 'agent', id: row.id }, record }
}

/** One message from the agent to the person, filed through the door, then stored under `storedAs` as its sender. */
async function aMessage(agent: Agent, body: string, storedAs: 'registry' | 'record', asksThePerson = false): Promise<string> {
  const filed = await ask('POST', '/api/records', asAgent(agent.handle), { kind: 'message', title: body, data: { body, to: [THE_READER], ...(asksThePerson ? { asksThePerson } : {}) } })
  expect(filed.status, JSON.stringify(filed.body)).toBe(201)
  const id = (filed.body['record'] as { id: string }).id
  const db = t.client.sqlite
  const stored = db.prepare("SELECT json_extract(data, '$.sentBy') AS sentBy FROM records WHERE id = ?").get(id) as { sentBy: string }
  // THE CONTROL: the door stored the registry id, so the record below is made here and not found.
  expect(JSON.parse(stored.sentBy), `what the door stored for "${body}"`).toEqual(agent.who)
  if (storedAs === 'record') db.prepare("UPDATE records SET data = json_set(data, '$.sentBy.id', ?) WHERE id = ?").run(agent.record, id)
  return id
}

/** The person writes back to the agent by its registry id, and the reply's recipient is then stored as `storedAs`. */
async function aReply(agent: Agent, body: string, storedAs: 'registry' | 'handle'): Promise<void> {
  const filed = await ask('POST', '/api/records', asThePerson(), { kind: 'message', title: body, data: { body, to: [agent.who] } })
  // A PERSON'S SEND TO AN AGENT NOTHING HOLDS ANSWERS 409, with the letter stored and routed (decision 60sbc5I-bwKx).
  expect(filed.status, JSON.stringify(filed.body)).toBe(409)
  const id = (filed.body['record'] as { id: string }).id
  const db = t.client.sqlite
  // THE CONTROL: the door stored the registry id in the reply's one delivery row.
  expect(db.prepare('SELECT recipient_kind AS kind, recipient_id AS id FROM message_delivery WHERE message_id = ?').all(id), `the rows of "${body}"`).toEqual([agent.who])
  if (storedAs === 'handle') {
    db.prepare('UPDATE message_delivery SET recipient_id = ? WHERE message_id = ?').run(agent.handle, id)
    db.prepare("UPDATE records SET data = json_set(data, '$.to', json(?)) WHERE id = ?").run(JSON.stringify([{ kind: 'agent', id: agent.handle }]), id)
  }
}

type Row = { key: string; group: string; at: number }

/** The person's contact rows in 'default' as the contacts door draws them: each row's key, group and place. */
async function theContactsDoor(): Promise<Row[]> {
  const read = await ask('GET', '/api/messages/contacts', asThePerson())
  expect(read.status, JSON.stringify(read.body)).toBe(200)
  return ((read.body['contacts'] ?? []) as Row[]).map(({ key, group, at }) => ({ key, group, at })).sort((a, b) => a.key.localeCompare(b.key))
}

/** Move a contact through the move door, and give back the rows it answers with, as `theContactsDoor` gives them. */
async function aMove(key: string, what: { group: string } | { moveBy: 1 | -1 }): Promise<Row[]> {
  const moved = await ask('POST', '/api/messages/contact-placements', asThePerson(), { contact: key, ...what })
  expect(moved.status, JSON.stringify(moved.body).slice(0, 600)).toBe(200)
  return ((moved.body['contacts'] ?? []) as Row[]).map(({ key: k, group, at }) => ({ key: k, group, at })).sort((a, b) => a.key.localeCompare(b.key))
}

/** The keys of one group, in the order the contacts door draws them. */
function inOrder(rows: readonly Row[], group: string): string[] {
  return rows.filter((row) => row.group === group).sort((a, b) => a.at - b.at).map((row) => row.key)
}

async function waitingForTheAnswer(): Promise<string[]> {
  const read = await ask('GET', '/api/messages?only=waiting-for-my-answer', asThePerson())
  expect(read.status, JSON.stringify(read.body).slice(0, 600)).toBe(200)
  return ((read.body['messages'] ?? []) as { id: string }[]).map((m) => m.id)
}

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
}, 60_000)

afterAll(async () => {
  await app?.close()
  t?.close()
})

describe('a contact is placed by the records the contacts door reads', () => {
  it('1. the control: messages stored under the registry id', async () => {
    const ash = await anAgent('ash-agent')
    await aMessage(ash, 'The ash by the gate is pruned.', 'registry')
    const drawn = await theContactsDoor()
    const row = one(drawn.filter((r) => r.key === participantKey(ash.who)), 'the agent row')
    expect(await aMove(row.key, { group: row.group }), 'the rows the move door answers with').toEqual(await theContactsDoor())
  }, 60_000)

  it("2. the newest message of an agent stored under its own record", async () => {
    const elm = await anAgent('elm-agent')
    const cedar = await anAgent('cedar-agent')
    await aMessage(elm, 'The elm walk is raked.', 'registry')
    await aMessage(cedar, 'The cedar hedge is clipped.', 'record')
    const drawn = await theContactsDoor()
    // THE CONTROL: the contacts door names the agent for the message under its record, and draws no writer for it.
    expect(drawn.map((r) => r.key).filter((key) => !key.startsWith('agent:') && !key.startsWith('person:')), 'rows of writers nobody registered').toEqual([])
    const row = one(drawn.filter((r) => r.key === participantKey(cedar.who)), 'the agent row')
    expect(await aMove(row.key, { group: row.group }), 'the rows the move door answers with').toEqual(await theContactsDoor())
  }, 60_000)

  it('3. moved down by one, the agent changes places with the row drawn after it', async () => {
    const cedar = participantKey({ kind: 'agent', id: one(((await ask('GET', '/api/participants', asThePerson())).body['agents'] as { id: string; handle: string }[]).filter((a) => a.handle === 'cedar-agent'), 'cedar').id })
    const before = await theContactsDoor()
    const group = one(before.filter((r) => r.key === cedar), 'the agent row').group
    const order = inOrder(before, group)
    const at = order.indexOf(cedar)
    // THE CONTROL: the newest message is the agent's, so it is drawn with a row after it to change places with.
    expect(at, JSON.stringify(order)).toBeLessThan(order.length - 1)
    await aMove(cedar, { moveBy: 1 })
    const swapped = [...order]
    swapped.splice(at, 2, order[at + 1]!, cedar)
    expect(inOrder(await theContactsDoor(), group), 'the group as the contacts door draws it after the move').toEqual(swapped)
  }, 60_000)
})

describe('a question is answered by the records the contacts door reads', () => {
  it('4. the control: a question stored under the registry id', async () => {
    const oak = await anAgent('oak-agent')
    const question = await aMessage(oak, 'May I fell the dead oak?', 'registry', true)
    expect(await waitingForTheAnswer(), 'before the person writes back').toContain(question)
    await aReply(oak, 'Yes, fell it.', 'registry')
    expect(await waitingForTheAnswer(), 'after the person writes back').not.toContain(question)
  }, 60_000)

  it("5. a question stored under the agent's own record", async () => {
    const pine = await anAgent('pine-agent')
    const question = await aMessage(pine, 'May I thin the pines?', 'record', true)
    expect(await waitingForTheAnswer(), 'before the person writes back').toContain(question)
    await aReply(pine, 'Thin every third one.', 'registry')
    expect(await waitingForTheAnswer(), 'after the person writes back').not.toContain(question)
  }, 60_000)

  it("6. a question answered by a message whose delivery row stores the agent's handle", async () => {
    const yew = await anAgent('yew-agent')
    const question = await aMessage(yew, 'May I shape the yews?', 'registry', true)
    expect(await waitingForTheAnswer(), 'before the person writes back').toContain(question)
    await aReply(yew, 'Shape them round.', 'handle')
    expect(await waitingForTheAnswer(), 'after the person writes back').not.toContain(question)
  }, 60_000)
})
