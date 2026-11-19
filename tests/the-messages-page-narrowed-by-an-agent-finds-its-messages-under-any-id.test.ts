// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE MESSAGES PAGE NARROWED BY AN AGENT FINDS THAT AGENT'S MESSAGES UNDER WHATEVER ID THEY STORE (wave 13y round 91,
 * gap 6 of item 15e).
 *
 * The Messages page narrows GET /api/messages by a sender and by a contact, each sent as the participant's registry key.
 * The door compared the sender each message stores, and each recipient its delivery rows store, with that key as
 * stored. A message may store an agent's own record or its handle in either place, from before the door stored the
 * registry id, and the contacts door names those as the agent (item 1). So the page narrowed by an agent missed them.
 *
 * THE CASES. Every request is asked from the project 'default', where each agent's own record is.
 *   1. THE CONTROL: narrowed by the agent as sender, the messages stored under its registry id are kept.
 *   2. Narrowed by the agent as sender, a message stored under its own record is kept.
 *   3. Narrowed by the agent as sender, a message stored under its handle is kept.
 *   4. Narrowed by the agent's handle as sender, the messages under its registry id are kept, as under its registry key.
 *   5. THE CONTROL: narrowed by the agent as contact, the person's message whose delivery row stores its registry id is
 *      kept.
 *   6. Narrowed by the agent as contact, the person's messages whose delivery rows store its handle and its own record
 *      are kept.
 *   In every case a message of another agent's is not kept.
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
type Agent = { handle: string; who: ParticipantRef; record: string }
let fern: Agent
let moss: Agent
/** The messages of each case, by how they are stored: from the agent, or from the person to it. */
const from: Record<'registry' | 'record' | 'handle', string> = { registry: '', record: '', handle: '' }
const to: Record<'registry' | 'record' | 'handle', string> = { registry: '', record: '', handle: '' }
/** A message from another agent to the person, and from the person to that agent. */
let others: string[] = []

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

/** The id the stored sender or recipient takes for `storedAs`. */
function storedId(agent: Agent, storedAs: 'registry' | 'record' | 'handle'): string {
  return storedAs === 'registry' ? agent.who.id : storedAs === 'record' ? agent.record : agent.handle
}

/** One message from the agent to the person, filed through the door, then stored with `storedAs` as its sender. */
async function aMessageFrom(agent: Agent, body: string, storedAs: 'registry' | 'record' | 'handle'): Promise<string> {
  const filed = await ask('POST', '/api/records', asAgent(agent.handle), { kind: 'message', title: body, data: { body, to: [THE_READER] } })
  expect(filed.status, JSON.stringify(filed.body)).toBe(201)
  const id = (filed.body['record'] as { id: string }).id
  const db = t.client.sqlite
  const stored = db.prepare("SELECT json_extract(data, '$.sentBy') AS sentBy FROM records WHERE id = ?").get(id) as { sentBy: string }
  // THE CONTROL: the door stored the registry id.
  expect(JSON.parse(stored.sentBy), `what the door stored for "${body}"`).toEqual(agent.who)
  db.prepare("UPDATE records SET data = json_set(data, '$.sentBy.id', ?) WHERE id = ?").run(storedId(agent, storedAs), id)
  return id
}

/** One message from the person to the agent, filed through the door, then stored with `storedAs` as its recipient. */
async function aMessageTo(agent: Agent, body: string, storedAs: 'registry' | 'record' | 'handle'): Promise<string> {
  const filed = await ask('POST', '/api/records', asThePerson(), { kind: 'message', title: body, data: { body, to: [agent.who] } })
  // A PERSON'S SEND TO AN AGENT NOTHING HOLDS ANSWERS 409, with the letter stored and routed (decision 60sbc5I-bwKx).
  expect(filed.status, JSON.stringify(filed.body)).toBe(409)
  const id = (filed.body['record'] as { id: string }).id
  const db = t.client.sqlite
  // THE CONTROL: the door stored the registry id in the message's one delivery row.
  expect(db.prepare('SELECT recipient_kind AS kind, recipient_id AS id FROM message_delivery WHERE message_id = ?').all(id), `the rows of "${body}"`).toEqual([agent.who])
  const as = storedId(agent, storedAs)
  db.prepare('UPDATE message_delivery SET recipient_id = ? WHERE message_id = ?').run(as, id)
  db.prepare("UPDATE records SET data = json_set(data, '$.to', json(?)) WHERE id = ?").run(JSON.stringify([{ kind: 'agent', id: as }]), id)
  return id
}

/** The ids the door keeps narrowed by `narrowing` (sender or contact) to `key`, from 'default'. */
async function narrowedBy(narrowing: 'sender' | 'contact', key: string): Promise<string[]> {
  const read = await ask('GET', `/api/messages?${narrowing}=${encodeURIComponent(key)}&limit=200`, asThePerson())
  expect(read.status, JSON.stringify(read.body).slice(0, 600)).toBe(200)
  return ((read.body['messages'] ?? []) as { id: string }[]).map((m) => m.id).sort()
}

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  fern = await anAgent('fern-agent')
  moss = await anAgent('moss-agent')
  for (const storedAs of ['registry', 'record', 'handle'] as const) {
    from[storedAs] = await aMessageFrom(fern, `The ferns by the ${storedAs} wall are cut back.`, storedAs)
    to[storedAs] = await aMessageTo(fern, `Cut the ferns by the ${storedAs} wall back.`, storedAs)
  }
  others = [await aMessageFrom(moss, 'The moss on the north path is scraped.', 'registry'), await aMessageTo(moss, 'Scrape the moss off the north path.', 'registry')]
}, 60_000)

afterAll(async () => {
  await app?.close()
  t?.close()
})

describe('the Messages page narrowed by an agent', () => {
  it('1. the control: as sender, the messages under its registry id', async () => {
    const kept = await narrowedBy('sender', participantKey(fern.who))
    expect(kept, 'kept').toContain(from.registry)
    expect(kept.filter((id) => others.includes(id)), "another agent's").toEqual([])
  }, 60_000)

  it("2. as sender, a message stored under the agent's own record", async () => {
    expect(await narrowedBy('sender', participantKey(fern.who)), 'kept').toContain(from.record)
  }, 60_000)

  it("3. as sender, a message stored under the agent's handle", async () => {
    expect(await narrowedBy('sender', participantKey(fern.who)), 'kept').toContain(from.handle)
  }, 60_000)

  it("4. narrowed by the agent's handle as sender, the same messages as by its registry key", async () => {
    const byHandle = await narrowedBy('sender', participantKey({ kind: 'agent', id: fern.handle }))
    expect(byHandle, 'by the handle').toEqual(await narrowedBy('sender', participantKey(fern.who)))
    expect(byHandle, 'kept').toEqual([from.registry, from.record, from.handle].sort())
  }, 60_000)

  it('5. the control: as contact, a message whose delivery row stores its registry id', async () => {
    const kept = await narrowedBy('contact', participantKey(fern.who))
    expect(kept, 'kept').toContain(to.registry)
    expect(kept.filter((id) => others.includes(id)), "another agent's").toEqual([])
  }, 60_000)

  it("6. as contact, messages whose delivery rows store its handle and its own record", async () => {
    const kept = await narrowedBy('contact', participantKey(fern.who))
    expect(kept, 'kept').toEqual([to.registry, to.record, to.handle].sort())
  }, 60_000)
})
