// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A SCREEN OF SEEN MARKS READS EACH CONVERSATION ONCE, NOT ONCE FOR EACH MARK (wave 13y round 91, item 23).
 *
 * A mark reaching `seen` is announced with the reader's contact rows as that mark leaves them (`seenLeaves`), worked
 * out from the person's messages with the other side of each conversation the mark is in. The door for a screen
 * (POST /api/messages/seen) marks each message in turn, and each mark read that conversation again: the person's whole
 * pool, once for every mark. On the made-up office of round 91 one such read took about 160 ms, so a screen of 25 took
 * about 4 s. Now the request reads each conversation once, and each mark reads again only the delivery rows of the
 * message it marked. The events must not change: each mark still carries the rows as that one mark leaves them.
 *
 * HOW THE READS ARE COUNTED. Every statement prepared during the request is kept.
 * Reading a conversation reads the delivery rows of
 * every message of the person's at once, so its SQL carries one placeholder per message. The person is sent 20
 * messages before any case, so a statement reading the delivery rows of 20 messages or more is a read of a
 * conversation, and no other read in a mark names that many.
 *
 * THE CASES. Two agents each send the person 6 messages, which are marked seen in one request, the two conversations
 * taking turns.
 *   1. THE CONTROL: one mark through the door for one message reads its conversation once.
 *   2. A screen of 12 marks reads each of the two conversations once, and each mark is announced with its sender's row
 *      one lower than the mark before it in that conversation.
 *   3. The same with the person's pages open in two projects: still once for each conversation, not once for each
 *      project (gap 4 of item 15e), and each page is told the rows falling one at a time.
 *   4. One mark with the person's pages open in two projects reads its conversation once.
 *
 * MUTATIONS, after a control run; the round's report says which case each turned red.
 *
 * THE WORLD IS ITS OWN: `freshDb` and `apiApp` make a database and a server for this file, every request is asked with
 * `inject`, and the agents and messages are made up here.
 */

import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import type { DeliveryChanged } from '../src/shared/events.ts'
import type { ParticipantRef } from '../src/shared/participants.ts'
import { participantKey } from '../src/shared/messages.ts'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { apiApp, freshDb, one, type TestDb } from './helpers.ts'

const HOME = 'default'
const ELSEWHERE = 'example-second-project'
const THE_READER: ParticipantRef = { kind: 'person', id: THE_TEST_OFFICES_OWNER.id }
/** How many messages the person is sent before any case, so that a read of a conversation names at least this many. */
const THE_POOL_AT_LEAST = 20
/** How many messages each of the two agents of a case sends the person. */
const EACH = 6

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

/** Register a made-up agent, and give back the participant its messages are sent as. */
async function anAgent(handle: string): Promise<ParticipantRef> {
  const made = await ask('POST', '/api/records', asThePerson(), { kind: 'agent', title: `${handle} (made up)`, data: { handle, runtime: 'claude-code', state: 'active' } })
  expect(made.status, JSON.stringify(made.body)).toBe(201)
  const listed = await ask('GET', '/api/participants', asThePerson())
  return { kind: 'agent', id: one(((listed.body['agents'] ?? []) as { id: string; handle: string }[]).filter((a) => a.handle === handle), `the registry row of ${handle}`).id }
}

/** File `count` messages from `handle` to the person, and give back their ids in the order they were written. */
async function messagesFrom(handle: string, count: number): Promise<string[]> {
  const ids: string[] = []
  for (let n = 0; n < count; n += 1) {
    const body = `Message ${String(n)} from ${handle} about the orchard.`
    const filed = await ask('POST', '/api/records', asAgent(handle), { kind: 'message', title: body, data: { body, to: [THE_READER] } })
    expect(filed.status, JSON.stringify(filed.body)).toBe(201)
    ids.push((filed.body['record'] as { id: string }).id)
  }
  return ids
}

/** How many times a conversation of the person's was read while `act` ran: see the header. */
async function conversationsReadDuring(act: () => Promise<void>): Promise<number> {
  const sqlite = t.client.sqlite as unknown as { prepare: (sql: string) => unknown }
  const original = sqlite.prepare
  const seen: string[] = []
  sqlite.prepare = function (this: unknown, sql: string) {
    seen.push(sql)
    return original.call(this, sql)
  }
  try {
    await act()
  } finally {
    sqlite.prepare = original
  }
  return seen.filter((sql) => /from "message_delivery" where "message_delivery"\."message_id" in \(/.test(sql) && (sql.match(/\?/g) ?? []).length >= THE_POOL_AT_LEAST).length
}

/** Two agents' messages to the person, the two conversations taking turns, and each message's sender. */
async function twoConversations(first: string, second: string): Promise<{ list: string[]; senderOf: Map<string, ParticipantRef> }> {
  const a = await anAgent(first)
  const b = await anAgent(second)
  const fromA = await messagesFrom(first, EACH)
  const fromB = await messagesFrom(second, EACH)
  const list = fromA.flatMap((id, n) => [id, fromB[n]!])
  return { list, senderOf: new Map([...fromA.map((id): [string, ParticipantRef] => [id, a]), ...fromB.map((id): [string, ParticipantRef] => [id, b])]) }
}

/** The rows each mark of `list` is announced with to the person's page in `project`, in the order asked. */
function theRowsToldIn(project: string, list: readonly string[]): unknown[] {
  const told = events
    .since(0, project, THE_READER)
    .events.map((e) => e.event)
    .filter((e): e is DeliveryChanged => e.name === 'delivery.changed' && e.mark === 'seen' && e.messageIds.some((id) => list.includes(id)))
  return told.map((e) => (e.seenLeaves === null || e.seenLeaves === undefined ? e.seenLeaves : e.seenLeaves.map((row) => ({ key: row.key, unread: row.unread, anythingUnread: row.anythingUnread }))))
}

/** What each mark of `list` leaves its sender's row at: one lower than the mark before it in that conversation. */
function eachRowOneLower(list: readonly string[], senderOf: ReadonlyMap<string, ParticipantRef>): unknown[] {
  const left = new Map<string, number>()
  for (const id of list) left.set(participantKey(senderOf.get(id)!), (left.get(participantKey(senderOf.get(id)!)) ?? 0) + 1)
  return list.map((id) => {
    const key = participantKey(senderOf.get(id)!)
    const unread = left.get(key)! - 1
    left.set(key, unread)
    return [{ key, unread, anythingUnread: unread > 0 }]
  })
}

/** Empty the channel, and open the person's pages in `projects`, as tabs would be. */
function pagesIn(projects: readonly string[]): void {
  events.forgetTheChannel()
  for (const workspaceId of projects) events.pageOpened({ workspaceId, who: THE_READER, send: () => undefined })
}

async function aScreen(list: readonly string[]): Promise<void> {
  const marked = await ask('POST', '/api/messages/seen', asThePerson(), { messages: list })
  expect(marked.status, JSON.stringify(marked.body)).toBe(200)
  expect(((marked.body['marks'] ?? []) as { changed: boolean }[]).map((m) => m.changed), JSON.stringify(marked.body).slice(0, 400)).toEqual(list.map(() => true))
}

async function oneMark(messageId: string): Promise<void> {
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
  await anAgent('rowan-agent')
  await messagesFrom('rowan-agent', THE_POOL_AT_LEAST)
}, 60_000)

afterAll(async () => {
  await app?.close()
  t?.close()
})

describe('a screen of seen marks reads each conversation once', () => {
  it('1. the control: one mark reads its conversation once', async () => {
    await anAgent('quince-agent')
    const [first] = await messagesFrom('quince-agent', 2)
    pagesIn([])
    expect(await conversationsReadDuring(() => oneMark(first!)), 'the reads of a conversation').toBe(1)
  }, 60_000)

  it('2. a screen of 12 marks reads each of its two conversations once', async () => {
    const { list, senderOf } = await twoConversations('apple-agent', 'pear-agent')
    pagesIn([])
    expect(await conversationsReadDuring(() => aScreen(list)), 'the reads of a conversation').toBe(2)
    expect(theRowsToldIn(HOME, list), 'each mark leaves its row one lower').toEqual(eachRowOneLower(list, senderOf))
  }, 60_000)

  it('3. with pages open in two projects, still once for each conversation', async () => {
    const { list, senderOf } = await twoConversations('plum-agent', 'cherry-agent')
    pagesIn([HOME, ELSEWHERE])
    expect(await conversationsReadDuring(() => aScreen(list)), 'the reads of a conversation').toBe(2)
    expect(theRowsToldIn(HOME, list), 'the page in the asked project').toEqual(eachRowOneLower(list, senderOf))
    expect(theRowsToldIn(ELSEWHERE, list), 'the page in the other project').toEqual(eachRowOneLower(list, senderOf))
  }, 60_000)

  it('4. one mark with pages open in two projects reads its conversation once', async () => {
    await anAgent('medlar-agent')
    const [first] = await messagesFrom('medlar-agent', 2)
    pagesIn([HOME, ELSEWHERE])
    expect(await conversationsReadDuring(() => oneMark(first!)), 'the reads of a conversation').toBe(1)
  }, 60_000)
})
