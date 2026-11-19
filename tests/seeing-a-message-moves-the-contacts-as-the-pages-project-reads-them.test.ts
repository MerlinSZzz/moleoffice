// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * SEEING A MESSAGE MOVES THE READER'S CONTACT ROWS AS A FRESH READ IN THE PAGE'S OWN PROJECT GIVES THEM (wave 13y round
 * 91, gap 4 of item 15e).
 *
 * A mark reaching `seen` is announced with the reader's contact rows as that mark leaves them (`seenLeaves`), and a page
 * puts those counts in place instead of reading its whole contact list (tests/applied-events-equal-a-fresh-read.test.ts).
 * A contact list counts a message stored under an agent's own record as that agent's, by the agent's record in the
 * page's project. The rows announced were worked out with no record at all, so:
 *   - a mark on a message stored under the agent's own record was announced with no rows, and the page read its lists;
 *   - a mark on a message stored under the agent's registry id, in a conversation where another unread message is
 *     stored under the agent's own record, was announced with that agent's row one lower than the page's own read.
 *
 * THE CASES. The marks are asked from the project 'default', where each agent's own record is.
 *   1. THE CONTROL: messages stored under the agent's registry id. What the page in 'default' is told equals a fresh
 *      read of the contacts there.
 *   2. Messages stored under the agent's own record, marked through the door for one message and then through the door
 *      for a screen. What the page in 'default' is told equals a fresh read there, which names the agent.
 *   3. One message stored under the agent's own record and one under its registry id; the second is marked. What the
 *      page in 'default' is told equals a fresh read there.
 *   4. An unread line Mole Office wrote in the conversation, beside a message under the registry id; the message is
 *      marked. The row told counts nothing and is still bold, as a fresh read in 'default' gives it (criterion M33).
 *   5. Pages in three projects, and the agent has its own record in each. Only the record in 'default' is stored by a
 *      message: the unread one beside the message marked, as in case 3. 'default' is worked out with its records, and the
 *      other two projects share the rows worked out with none. Each page is told the rows a fresh read in its own project
 *      gives, and the two other pages are told rows that are not the rows of 'default'.
 *   In cases 2, 3 and 4 the person also has a page open in another project, where that record is not the agent's. That
 *   page is told no rows, or the rows a fresh read in its own project gives. In cases 3 and 4 it is told its rows, which
 *   in case 3 are not the rows of 'default'.
 *
 * MUTATIONS, after a control run; the round's report says which case each turned red.
 *
 * THE WORLD IS ITS OWN: `freshDb` and `apiApp` make a database and a server for this file, every request is asked with
 * `inject`, and the agents and messages are made up here. The stored sender is given its shape by a write to the
 * file, as tests/the-chat-never-draws-a-claimed-id-as-a-name.test.ts does, because the door stores the registry id.
 */

import type { FastifyInstance } from 'fastify'
import { nanoid } from 'nanoid'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import type { DeliveryChanged } from '../src/shared/events.ts'
import type { ParticipantRef } from '../src/shared/participants.ts'
import { participantKey } from '../src/shared/messages.ts'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { apiApp, freshDb, one, type TestDb } from './helpers.ts'

const HOME = 'default'
const ELSEWHERE = 'example-second-project'
const A_THIRD = 'example-third-project'
const THE_READER: ParticipantRef = { kind: 'person', id: THE_TEST_OFFICES_OWNER.id }

let t: TestDb
let app: FastifyInstance
let events: typeof import('../src/server/lib/events.ts')

function asThePerson(project: string = HOME): Record<string, string> {
  return { 'x-mole-office-workspace': project, 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id }
}

function asAgent(handle: string): Record<string, string> {
  return { ...asThePerson(), 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': handle }
}

async function ask(method: 'GET' | 'POST', url: string, headers: Record<string, string>, payload?: unknown): Promise<{ status: number; body: Record<string, unknown> }> {
  const reply = await app.inject({ method, url, headers, ...(payload === undefined ? {} : { payload: payload as never }) })
  return { status: reply.statusCode, body: reply.json() as Record<string, unknown> }
}

/** A made-up agent, filed in 'default': its registry participant and its own record there. */
async function anAgent(handle: string): Promise<{ who: ParticipantRef; record: string }> {
  const made = await ask('POST', '/api/records', asThePerson(), { kind: 'agent', title: `${handle} (made up)`, data: { handle, runtime: 'claude-code', state: 'active' } })
  expect(made.status, JSON.stringify(made.body)).toBe(201)
  const record = (made.body['record'] as { id: string }).id
  const listed = await ask('GET', '/api/participants', asThePerson())
  const row = one(((listed.body['agents'] ?? []) as { id: string; handle: string; record?: string | null }[]).filter((a) => a.handle === handle), `the registry row of ${handle}`)
  // THE CONTROL: the list of 'default' carries this record as the agent's own, and it is not the registry id.
  expect([row.record, row.id === record], JSON.stringify(row)).toEqual([record, false])
  return { who: { kind: 'agent', id: row.id }, record }
}

/** One message from the agent to the person, filed through the door, then stored under `storedAs` as its sender. */
async function aMessage(handle: string, agent: { who: ParticipantRef; record: string }, body: string, storedAs: 'registry' | 'record'): Promise<string> {
  const filed = await ask('POST', '/api/records', asAgent(handle), { kind: 'message', title: body, data: { body, to: [THE_READER] } })
  expect(filed.status, JSON.stringify(filed.body)).toBe(201)
  const id = (filed.body['record'] as { id: string }).id
  const db = t.client.sqlite
  const stored = db.prepare("SELECT json_extract(data, '$.sentBy') AS sentBy FROM records WHERE id = ?").get(id) as { sentBy: string }
  // THE CONTROL: the door stored the registry id, so the record below is made here and not found.
  expect(JSON.parse(stored.sentBy), `what the door stored for "${body}"`).toEqual(agent.who)
  if (storedAs === 'record') db.prepare("UPDATE records SET data = json_set(data, '$.sentBy.id', ?) WHERE id = ?").run(agent.record, id)
  return id
}

/** Each contact row's counts as a fresh read of the person's contacts in `project` gives them, by the row's key. */
async function aFreshRead(project: string): Promise<Map<string, { unread: number; anythingUnread: boolean }>> {
  const read = await ask('GET', '/api/messages/contacts', asThePerson(project))
  expect(read.status, JSON.stringify(read.body)).toBe(200)
  const rows = (read.body['contacts'] ?? []) as { key: string; unread: number; anythingUnread: boolean }[]
  return new Map(rows.map((row) => [row.key, { unread: row.unread, anythingUnread: row.anythingUnread }]))
}

/** The rows the person's page in `project` was told for the mark of `messageId`: absent, null or a list. */
function theRowsToldFor(messageId: string, project: string): { key: string; unread: number; anythingUnread: boolean }[] | null | undefined {
  const told = events
    .since(0, project, THE_READER)
    .events.map((e) => e.event)
    .filter((e): e is DeliveryChanged => e.name === 'delivery.changed' && e.mark === 'seen' && e.messageIds.includes(messageId))
  expect(told.length, `the events told to the page in ${project} about ${messageId}`).toBe(1)
  return told[0]!.seenLeaves
}

/** The rows told, each beside the same row in a fresh read of that project. */
async function toldBesideFresh(messageId: string, project: string): Promise<{ told: unknown; fresh: unknown }> {
  const told = theRowsToldFor(messageId, project)
  const fresh = await aFreshRead(project)
  return {
    told: told === null || told === undefined ? told : told.map((row) => ({ key: row.key, unread: row.unread, anythingUnread: row.anythingUnread })),
    fresh: told === null || told === undefined ? told : told.map((row) => ({ key: row.key, ...(fresh.get(row.key) ?? { unread: 'no row', anythingUnread: 'no row' }) })),
  }
}

/** A page in `project` is told no rows for the mark of `messageId`, or the rows a fresh read there gives. */
async function nothingOrAFreshRead(messageId: string, project: string): Promise<void> {
  const { told, fresh } = await toldBesideFresh(messageId, project)
  if (told === null || told === undefined) return
  expect(told, `what the page in ${project} is told`).toEqual(fresh)
}

/** Empty the channel, and open one page of the person's in the other project, as a second tab would be. */
function aChannelWithAPageElsewhere(): void {
  events.forgetTheChannel()
  events.pageOpened({ workspaceId: ELSEWHERE, who: THE_READER, send: () => undefined })
}

async function markSeen(messageId: string): Promise<void> {
  const marked = await ask('POST', `/api/messages/${messageId}/mark`, asThePerson(), { mark: 'seen' })
  expect(marked.status, JSON.stringify(marked.body)).toBe(200)
  expect(marked.body['changed'], JSON.stringify(marked.body)).toBe(true)
}

beforeAll(async () => {
  t = await freshDb()
  events = await import('../src/server/lib/events.ts')
  app = (await apiApp()).app
  await app.ready()
  const project = await app.inject({ method: 'POST', url: '/api/workspaces', payload: { id: ELSEWHERE, title: 'Example second project' } })
  expect(project.statusCode, project.body).toBe(201)
}, 60_000)

afterAll(async () => {
  await app?.close()
  t?.close()
})

describe('a seen mark tells the page the contact rows its own project reads', () => {
  it('1. the control: messages stored under the registry id', async () => {
    const lamp = await anAgent('lamp-agent')
    const first = await aMessage('lamp-agent', lamp, 'The lamps on the west stair are lit.', 'registry')
    await aMessage('lamp-agent', lamp, 'The lamps on the east stair are lit.', 'registry')
    events.forgetTheChannel()
    await markSeen(first)
    const { told, fresh } = await toldBesideFresh(first, HOME)
    expect(told, 'the rows told name the agent').toEqual([{ key: participantKey(lamp.who), unread: 1, anythingUnread: true }])
    expect(told, 'the rows told, beside a fresh read').toEqual(fresh)
  }, 60_000)

  it("2. messages stored under the agent's own record", async () => {
    const bell = await anAgent('bell-agent')
    const ids = [
      await aMessage('bell-agent', bell, 'The bell rang at noon.', 'record'),
      await aMessage('bell-agent', bell, 'The bell rope is new.', 'record'),
      await aMessage('bell-agent', bell, 'The bell tower is swept.', 'record'),
    ]
    // THE CONTROL: a fresh read in 'default' names the agent for these messages, and counts all three.
    expect((await aFreshRead(HOME)).get(participantKey(bell.who)), 'the agent row before any mark').toEqual({ unread: 3, anythingUnread: true })
    aChannelWithAPageElsewhere()
    await markSeen(ids[0]!)
    const byOne = await toldBesideFresh(ids[0]!, HOME)
    expect(byOne.told, 'the door for one message').toEqual([{ key: participantKey(bell.who), unread: 2, anythingUnread: true }])
    expect(byOne.told).toEqual(byOne.fresh)
    await nothingOrAFreshRead(ids[0]!, ELSEWHERE)
    // THE DOOR FOR A SCREEN, two marks in one request: each told as that mark leaves the row, the last as a fresh read.
    aChannelWithAPageElsewhere()
    const marked = await ask('POST', '/api/messages/seen', asThePerson(), { messages: [ids[1], ids[2]] })
    expect(marked.status, JSON.stringify(marked.body)).toBe(200)
    expect(theRowsToldFor(ids[1]!, HOME), 'the first mark of the screen').toEqual([{ key: participantKey(bell.who), unread: 1, anythingUnread: true }])
    const last = await toldBesideFresh(ids[2]!, HOME)
    expect(last.told, 'the last mark of the screen').toEqual([{ key: participantKey(bell.who), unread: 0, anythingUnread: false }])
    expect(last.told).toEqual(last.fresh)
    await nothingOrAFreshRead(ids[2]!, ELSEWHERE)
  }, 60_000)

  it("3. a message under the registry id, beside an unread one under the agent's own record", async () => {
    const wick = await anAgent('wick-agent')
    await aMessage('wick-agent', wick, 'The wicks are trimmed.', 'record')
    const second = await aMessage('wick-agent', wick, 'The oil is topped up.', 'registry')
    expect((await aFreshRead(HOME)).get(participantKey(wick.who)), 'the agent row before the mark').toEqual({ unread: 2, anythingUnread: true })
    aChannelWithAPageElsewhere()
    await markSeen(second)
    const { told, fresh } = await toldBesideFresh(second, HOME)
    expect(told, 'the row told counts the message under the record').toEqual([{ key: participantKey(wick.who), unread: 1, anythingUnread: true }])
    expect(told).toEqual(fresh)
    // THE OTHER PROJECT: the message under the record is not this agent's there, so its row has nothing unread.
    const away = await toldBesideFresh(second, ELSEWHERE)
    expect(away.told, 'the page in the other project is told its own row').toEqual([{ key: participantKey(wick.who), unread: 0, anythingUnread: false }])
    expect(away.told).toEqual(away.fresh)
  }, 60_000)

  it('4. an unread line Mole Office wrote in the conversation is not counted, and the row stays bold', async () => {
    const cord = await anAgent('cord-agent')
    // THE LINE, written by hand as tests/a-system-line-shows-without-counting.test.ts writes one: a message the person
    // files to the agent, given Mole Office's registry row as its sender and a delivery row to the person, unread.
    const line = await ask('POST', '/api/records', asThePerson(), { kind: 'message', title: 'Mole Office', data: { body: 'Agent run ended', to: [cord.who] } })
    // A PERSON'S SEND TO AN AGENT NOTHING HOLDS ANSWERS 409, with the letter stored and routed (decision 60sbc5I-bwKx).
    expect(line.status, JSON.stringify(line.body)).toBe(409)
    const db = t.client.sqlite
    const office = one(db.prepare("SELECT id FROM agents WHERE handle = 'mole-office' AND retired = 0").all() as { id: string }[], "Mole Office's registry row")
    db.prepare("UPDATE records SET data = json_set(data, '$.sentBy', json(?)) WHERE id = ?").run(JSON.stringify({ kind: 'agent', id: office.id }), (line.body['record'] as { id: string }).id)
    db.prepare('INSERT INTO message_delivery (id, message_id, recipient_kind, recipient_id, mark, at) VALUES (?, ?, ?, ?, ?, ?)').run(
      nanoid(12),
      (line.body['record'] as { id: string }).id,
      THE_READER.kind,
      THE_READER.id,
      'delivered',
      '2026-10-26 22:00:00',
    )
    const said = await aMessage('cord-agent', cord, 'The cords are spliced.', 'registry')
    // THE CONTROL: a fresh read counts the message and not the line.
    expect((await aFreshRead(HOME)).get(participantKey(cord.who)), 'the agent row before the mark').toEqual({ unread: 1, anythingUnread: true })
    aChannelWithAPageElsewhere()
    await markSeen(said)
    const { told, fresh } = await toldBesideFresh(said, HOME)
    expect(told, 'the row told counts nothing and is bold').toEqual([{ key: participantKey(cord.who), unread: 0, anythingUnread: true }])
    expect(told).toEqual(fresh)
    const away = await toldBesideFresh(said, ELSEWHERE)
    expect(away.told, 'the page in the other project is told the same row').toEqual([{ key: participantKey(cord.who), unread: 0, anythingUnread: true }])
    expect(away.told).toEqual(away.fresh)
  }, 60_000)

  it("5. pages in three projects, where only the agent's record in 'default' is stored by a message", async () => {
    const made = await app.inject({ method: 'POST', url: '/api/workspaces', payload: { id: A_THIRD, title: 'Example third project' } })
    expect(made.statusCode, made.body).toBe(201)
    const rope = await anAgent('rope-agent')
    // THE AGENT'S OWN RECORD IN EACH OTHER PROJECT, filed under the same handle, so it is the same registry row there.
    for (const project of [ELSEWHERE, A_THIRD]) {
      const filed = await ask('POST', '/api/records', asThePerson(project), { kind: 'agent', title: 'rope-agent (made up)', data: { handle: 'rope-agent', runtime: 'claude-code', state: 'active' } })
      expect(filed.status, JSON.stringify(filed.body)).toBe(201)
      const listed = await ask('GET', '/api/participants', asThePerson(project))
      const row = one(((listed.body['agents'] ?? []) as { id: string; handle: string; record?: string | null }[]).filter((a) => a.handle === 'rope-agent'), `the row of rope-agent in ${project}`)
      // THE CONTROL: the same agent, with a record of its own in this project that is not the record in 'default'.
      expect([row.id, row.record], JSON.stringify(row)).toEqual([rope.who.id, (filed.body['record'] as { id: string }).id])
    }
    await aMessage('rope-agent', rope, 'The ropes are coiled.', 'record')
    const second = await aMessage('rope-agent', rope, 'The pulleys are oiled.', 'registry')
    expect((await aFreshRead(HOME)).get(participantKey(rope.who)), "the agent row in 'default' before the mark").toEqual({ unread: 2, anythingUnread: true })
    for (const project of [ELSEWHERE, A_THIRD]) {
      expect((await aFreshRead(project)).get(participantKey(rope.who)), `the agent row in ${project} before the mark`).toEqual({ unread: 1, anythingUnread: true })
    }
    aChannelWithAPageElsewhere()
    events.pageOpened({ workspaceId: A_THIRD, who: THE_READER, send: () => undefined })
    await markSeen(second)
    const home = await toldBesideFresh(second, HOME)
    expect(home.told, "the page in 'default' counts the message under the record").toEqual([{ key: participantKey(rope.who), unread: 1, anythingUnread: true }])
    expect(home.told).toEqual(home.fresh)
    for (const project of [ELSEWHERE, A_THIRD]) {
      const away = await toldBesideFresh(second, project)
      expect(away.told, `the page in ${project} is told its own row`).toEqual([{ key: participantKey(rope.who), unread: 0, anythingUnread: false }])
      expect(away.told).toEqual(away.fresh)
    }
  }, 60_000)
})
