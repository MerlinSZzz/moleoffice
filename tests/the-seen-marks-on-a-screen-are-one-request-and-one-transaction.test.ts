// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE SEEN MARKS FOR WHAT IS ON A SCREEN ARE SENT IN ONE REQUEST AND WRITTEN IN ONE TRANSACTION.
 *
 * Opening a conversation with 25 unread messages sent 25 seen marks, one request for each, and the page was quiet
 * only once the last of them had come back. Round 85 of wave 13y measured 1,144 ms from the click to a quiet page,
 * with 150 ms a request. The chat now sends the marks together, to POST /api/messages/seen. This file holds that
 * door to three things:
 *
 *   1. IT MARKS AND ANNOUNCES AS THE DOOR FOR ONE MESSAGE DOES. Each message is marked seen, and each mark that moved
 *      is announced as its own `delivery.changed`, in the order asked. Each event carries that message's delivery
 *      row and the reader's contact row as that one mark leaves it, so the unread count falls one at a time. The case
 *      first marks 25 messages one by one through POST /api/messages/:id/mark and holds those events to the same
 *      expectation, so the expectation is what that door does. A second send moves nothing and announces nothing.
 *   2. ONE TRANSACTION. When one message in the list cannot be marked, the door refuses, names that message, marks
 *      none of the others and announces nothing.
 *   3. AN EMPTY LIST, AND A LIST LONGER THAN `SEEN_MARKS_IN_ONE_REQUEST_AT_MOST`, ARE REFUSED, and nothing is written.
 *
 * MUTATIONS, after a control run. This round's report says which case each one turned red:
 *   - the transaction taken out of `markManySeen` in src/server/lib/messages.ts → case 2;
 *   - one event announced for the whole list, as `markManyDelivered` does for delivered marks → case 1;
 *   - the most a list may hold taken off the door's body → case 3.
 *
 * THE WORLD IS ITS OWN: `freshDb` and `apiApp` make a database and a server for this file, and every request is
 * asked with `inject`. The agents and messages are made up here.
 */

import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import type { ParticipantRef } from '../src/shared/participants.ts'
import type { DeliveryChanged } from '../src/shared/events.ts'
import { SEEN_MARKS_IN_ONE_REQUEST_AT_MOST, participantKey } from '../src/shared/messages.ts'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { apiApp, freshDb, one, type TestDb } from './helpers.ts'

const WORKSPACE = 'default'
const THE_READER: ParticipantRef = { kind: 'person', id: THE_TEST_OFFICES_OWNER.id }
const AS_THE_READER = {
  'x-mole-office-workspace': WORKSPACE,
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id,
}

/** How many unread messages the first case marks through each door: as many as round 85 measured. */
const UNREAD = 25

let t: TestDb
let app: FastifyInstance
let events: typeof import('../src/server/lib/events.ts')

async function ask(method: 'GET' | 'POST', url: string, headers: Record<string, string>, payload?: unknown): Promise<{ status: number; body: Record<string, unknown> }> {
  const reply = await app.inject({ method, url, headers, ...(payload === undefined ? {} : { payload: payload as never }) })
  return { status: reply.statusCode, body: reply.json() as Record<string, unknown> }
}

function asAgent(handle: string): Record<string, string> {
  return { ...AS_THE_READER, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': handle }
}

/** Register a made-up agent, and give back the participant its messages are sent as. */
async function anAgent(handle: string): Promise<ParticipantRef> {
  const made = await ask('POST', '/api/records', AS_THE_READER, {
    kind: 'agent',
    title: `${handle} (made up)`,
    data: { handle, runtime: 'claude-code', state: 'active' },
  })
  expect(made.status, JSON.stringify(made.body)).toBe(201)
  const listed = await ask('GET', '/api/participants', AS_THE_READER)
  const agents = (listed.body['agents'] ?? []) as { id: string; handle: string }[]
  return { kind: 'agent', id: one(agents.filter((a) => a.handle === handle), `the registry row of ${handle}`).id }
}

/** File `count` messages from `handle` to `to`, each answered `expected`, and give back their ids in the order they were written. */
async function messagesFrom(handle: string, count: number, to: ParticipantRef = THE_READER, expected = 201): Promise<string[]> {
  const ids: string[] = []
  for (let n = 0; n < count; n += 1) {
    const body = `Message ${String(n)} from ${handle} about the bench.`
    const filed = await ask('POST', '/api/records', asAgent(handle), { kind: 'message', title: body, data: { body, to: [to] } })
    expect(filed.status, JSON.stringify(filed.body)).toBe(expected)
    ids.push((filed.body['record'] as { id: string }).id)
  }
  return ids
}

/** `who`'s mark on each message, as the server holds it. The person reads it, as the person may read any message. */
async function theMarksOn(ids: readonly string[], who: ParticipantRef = THE_READER): Promise<string[]> {
  const marks: string[] = []
  for (const id of ids) {
    const read = await ask('GET', `/api/messages/${id}`, AS_THE_READER)
    expect(read.status, JSON.stringify(read.body)).toBe(200)
    const deliveries = (read.body['message'] as { deliveries: { to: ParticipantRef; mark: string }[] }).deliveries
    marks.push(deliveries.find((d) => d.to.kind === who.kind && d.to.id === who.id)?.mark ?? 'no delivery')
  }
  return marks
}

/**
 * WHAT WAS ANNOUNCED ABOUT THESE MESSAGES SINCE THE CHANNEL WAS LAST EMPTIED, with each message named by where it is in
 * `ids` and the sender's contact row named `the sender`, so that two lists of different messages can be compared.
 */
function theMarksAnnouncedFor(ids: readonly string[], sender: ParticipantRef): unknown[] {
  const where = new Map(ids.map((id, n) => [id, n]))
  const senderKey = participantKey(sender)
  return events
    .since(0, WORKSPACE, THE_READER)
    .events.map((one) => one.event)
    .filter((event): event is DeliveryChanged => event.name === 'delivery.changed' && event.messageIds.some((id) => where.has(id)))
    .map((event) => ({
      messages: event.messageIds.map((id) => where.get(id) ?? id),
      workspaceId: event.workspaceId,
      to: event.to,
      mark: event.mark,
      rows: event.rows === undefined || event.rows === null ? event.rows : event.rows.map((row) => ({ message: where.get(row.messageId) ?? row.messageId, mark: row.row.mark })),
      seenLeaves:
        event.seenLeaves === undefined || event.seenLeaves === null
          ? event.seenLeaves
          : event.seenLeaves.map((row) => ({ ...row, key: row.key === senderKey ? 'the sender' : row.key })),
    }))
}

/** What marking `count` unread messages from one sender seen announces, one mark at a time, in the order asked. */
function oneEventForEachMark(count: number, workspaceId: string): unknown[] {
  return Array.from({ length: count }, (_, n) => ({
    messages: [n],
    workspaceId,
    to: THE_READER,
    mark: 'seen',
    rows: [{ message: n, mark: 'seen' }],
    seenLeaves: [{ key: 'the sender', unread: count - 1 - n, anythingUnread: n < count - 1 }],
  }))
}

beforeAll(async () => {
  t = await freshDb()
  events = await import('../src/server/lib/events.ts')
  app = (await apiApp()).app
  await app.ready()
}, 60_000)

afterAll(async () => {
  await app?.close()
  t?.close()
})

describe('POST /api/messages/seen, the seen marks for what is on a screen', () => {
  it('marks each message seen and announces each mark as the door for one message does', async () => {
    // THE CONTROL: 25 marks sent one by one through the door for one message, which is what the chat did until now.
    const before = await anAgent('wren-agent')
    const oneByOne = await messagesFrom('wren-agent', UNREAD)
    events.forgetTheChannel()
    for (const id of oneByOne) {
      const marked = await ask('POST', `/api/messages/${id}/mark`, AS_THE_READER, { mark: 'seen' })
      expect(marked.status, JSON.stringify(marked.body)).toBe(200)
    }
    const announcedOneByOne = theMarksAnnouncedFor(oneByOne, before)
    const workspaceId = String((announcedOneByOne[0] as { workspaceId?: string } | undefined)?.workspaceId)
    expect(announcedOneByOne, 'the door for one message, which the expectation describes').toEqual(oneEventForEachMark(UNREAD, workspaceId))

    // THE SAME 25 MARKS IN ONE REQUEST, on another sender's 25 messages.
    const now = await anAgent('moss-agent')
    const together = await messagesFrom('moss-agent', UNREAD)
    expect(await theMarksOn(together), 'unread before the request').toEqual(together.map(() => 'queued'))
    events.forgetTheChannel()
    const marked = await ask('POST', '/api/messages/seen', AS_THE_READER, { messages: together })
    expect(marked.status, JSON.stringify(marked.body)).toBe(200)
    const answered = (marked.body['marks'] ?? []) as { messageId: string; changed: boolean; mark: string }[]
    expect(answered.map((m) => [m.messageId, m.changed, m.mark])).toEqual(together.map((id) => [id, true, 'seen']))
    expect(await theMarksOn(together)).toEqual(together.map(() => 'seen'))
    expect(theMarksAnnouncedFor(together, now), 'the same events as the door for one message').toEqual(announcedOneByOne)

    // A SECOND SEND MOVES NOTHING AND ANNOUNCES NOTHING, as a second mark through the door for one message does not.
    events.forgetTheChannel()
    const again = await ask('POST', '/api/messages/seen', AS_THE_READER, { messages: together })
    expect(again.status, JSON.stringify(again.body)).toBe(200)
    expect(((again.body['marks'] ?? []) as { changed: boolean }[]).map((m) => m.changed)).toEqual(together.map(() => false))
    expect(theMarksAnnouncedFor(together, now)).toEqual([])
  }, 120_000)

  it('marks none of the list and announces nothing when one message in it cannot be marked', async () => {
    // THE READER HERE IS AN AGENT, because no message here is one the person may read and cannot mark: a message
    // between two of these made-up agents is handed to the person too, since nothing answers for them. An agent may
    // read a message it sent itself, and it has no delivery of it to mark.
    const sender = await anAgent('fern-agent')
    const reader = await anAgent('sorrel-agent')
    // NOTHING HOLDS EITHER AGENT IN THE TEST OFFICE, so the office stores each message, routes it and answers 409. The
    // messages are stored all the same, each with its delivery to its addressee.
    const toTheReader = await messagesFrom('fern-agent', 4, reader, 409)
    const [itsOwn] = await messagesFrom('sorrel-agent', 1, sender, 409)
    const list = [toTheReader[0]!, toTheReader[1]!, itsOwn!, toTheReader[2]!, toTheReader[3]!]
    expect(await theMarksOn(toTheReader, reader), 'unread before the request').toEqual(toTheReader.map(() => 'queued'))
    events.forgetTheChannel()
    const refused = await ask('POST', '/api/messages/seen', asAgent('sorrel-agent'), { messages: list })
    expect(refused.status, JSON.stringify(refused.body)).toBe(404)
    expect(String(refused.body['error']), 'the refusal names the message that could not be marked').toContain(itsOwn!)
    // THE TWO BEFORE IT IN THE LIST WERE NOT KEPT, and nobody was told they were. The person is told of every event.
    expect(await theMarksOn(toTheReader, reader)).toEqual(toTheReader.map(() => 'queued'))
    expect(theMarksAnnouncedFor(list, sender)).toEqual([])
  }, 60_000)

  it('refuses an empty list and a list longer than one request may hold, and writes nothing', async () => {
    const sender = await anAgent('rush-agent')
    const [unread] = await messagesFrom('rush-agent', 1)
    events.forgetTheChannel()
    const empty = await ask('POST', '/api/messages/seen', AS_THE_READER, { messages: [] })
    expect(empty.status, JSON.stringify(empty.body)).toBe(400)
    const tooMany = Array.from({ length: SEEN_MARKS_IN_ONE_REQUEST_AT_MOST + 1 }, () => unread!)
    const refused = await ask('POST', '/api/messages/seen', AS_THE_READER, { messages: tooMany })
    expect(refused.status, JSON.stringify(refused.body)).toBe(400)
    expect(await theMarksOn([unread!])).toEqual(['queued'])
    expect(theMarksAnnouncedFor([unread!], sender)).toEqual([])
    // THE CONTROL: the most one request may hold is accepted, so the refusal above is the length and nothing else.
    const theMost = await ask('POST', '/api/messages/seen', AS_THE_READER, { messages: tooMany.slice(1) })
    expect(theMost.status, JSON.stringify(theMost.body)).toBe(200)
    expect(await theMarksOn([unread!])).toEqual(['seen'])
  }, 60_000)
})
