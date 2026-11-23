// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A LONG LIST KEEPS A MESSAGE ITS SENDER DELETED, AS A SHORT LIST DOES.
 *
 * WHAT WAS WRONG. The one rule of who may read a message is `thePartiesOfMany` in src/server/lib/messages.ts. It keeps
 * the sender of a deleted message as one of its parties. `theMessagesThisReaderMayRead` first narrows a list longer
 * than `A_SHORT_LIST`, by `theMessagesAReaderCouldBeAPartyTo`, to the messages the reader could be a party to. The
 * narrowing only saves time, so it may not change the answer. But its reads of the messages the reader sent, of the
 * routed messages and of the messages to its groups left the deleted messages out. Its read of the delivery rows kept
 * them. So an agent that sent a message and then deleted it, with no delivery row naming the agent, could read the
 * message through a short list and could not read it through a long one.
 *
 * WHAT THIS FILE HOLDS. In one test office, one agent writes a message to a second agent through the create door. Then
 * it deletes the message, as its writer, through the delete door. No delivery row on the message names the sender, so
 * the narrowing's read of the delivery rows cannot keep it. A third agent writes `A_SHORT_LIST` messages to the second
 * agent, and the sender is a party to none of them. They are real messages, so neither list depends on how an id that
 * is not a message is treated. The sender then asks the rule about the deleted message:
 *
 *   1. in a list of `A_SHORT_LIST` ids, which is not narrowed: the deleted message is kept, and nothing else is;
 *   2. in a list of one id more, which is narrowed first: the deleted message is kept as well, and nothing else is.
 *
 * RED ON MAIN: case 2 fails on main's code, because the narrowing drops the deleted message before its parties are
 * worked out. Case 1 passes on main too. It shows that the rule itself keeps the sender of a deleted message.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { freshDb, type TestDb } from './helpers.ts'
import type { ParticipantRef } from '../src/shared/participants.ts'
import { THE_PERSON } from '../src/shared/person.ts'

const HERE = 'default'
const AS_THE_OWNER = { type: 'human', id: THE_PERSON } as never
const SENDER = 'made-up-sender'
const ADDRESSEE = 'made-up-addressee'
const OTHER_WRITER = 'made-up-other-writer'

let t: TestDb
let messages: typeof import('../src/server/lib/messages.ts')
let participants: typeof import('../src/server/lib/participants.ts')
let sender: ParticipantRef
/** The message the sender wrote and then deleted. */
let deleted = ''
/** The messages the third agent wrote to the second, `A_SHORT_LIST` of them. */
const others: string[] = []

/** Register one agent, and give back the participant it answers to and the id of its record of kind `agent`. */
function anAgent(handle: string): { who: ParticipantRef; record: string } {
  const record = t.api.createRecord({
    kind: 'agent',
    title: handle,
    workspaceId: HERE,
    data: { handle, runtime: 'claude-code', state: 'active' },
    actor: AS_THE_OWNER,
  }).id
  const who = participants.participantForActor({ type: 'agent', id: handle })
  if (who === null) throw new Error(`the agent ${handle} was registered and no registry row answers to it`)
  return { who, record }
}

/** Write one message as the agent with this handle, to one addressee, and give back its id. */
function say(handle: string, body: string, to: ParticipantRef): string {
  return t.api.createRecord({
    kind: 'message',
    title: body,
    workspaceId: HERE,
    data: { body, to: [to] },
    actor: { type: 'agent', id: handle },
  }).id
}

/** The ids among these that the sender may read by the one rule, in the order asked. */
function whatTheSenderMayRead(ids: readonly string[]): string[] {
  const kept = messages.theMessagesThisReaderMayRead(messages.theMessageReader({ type: 'agent', id: sender.id }), ids)
  return ids.filter((id) => kept.has(id))
}

beforeAll(async () => {
  t = await freshDb()
  messages = await import('../src/server/lib/messages.ts')
  participants = await import('../src/server/lib/participants.ts')
  const theSender = anAgent(SENDER)
  sender = theSender.who
  const addressee = anAgent(ADDRESSEE).who
  anAgent(OTHER_WRITER)

  deleted = say(SENDER, 'A made-up note that its sender deletes.', addressee)
  t.api.deleteRecord(deleted, { type: 'agent', id: SENDER })
  for (let n = 1; n <= messages.A_SHORT_LIST; n += 1) {
    others.push(say(OTHER_WRITER, `A made-up note between two other agents, number ${String(n)}.`, addressee))
  }

  // THE MESSAGE IS DELETED.
  const row = t.client.sqlite.prepare('SELECT kind, deleted_at AS deletedAt FROM records WHERE id = ?').get(deleted) as
    | { kind: string; deletedAt: string | null }
    | undefined
  expect(row?.kind, 'the deleted message is a message').toBe('message')
  expect(row?.deletedAt ?? null, 'the message is deleted').not.toBeNull()
  // NO DELIVERY ROW ON IT NAMES THE SENDER, by its id, its handle or its record of kind `agent`, so the narrowing's read
  // of the delivery rows cannot keep it. Its addressee's row is there, so the message really was delivered.
  const deliveries = t.client.sqlite
    .prepare('SELECT recipient_kind AS kind, recipient_id AS id FROM message_delivery WHERE message_id = ?')
    .all(deleted) as { kind: string; id: string }[]
  const theSendersNames = [sender.id, SENDER, theSender.record]
  expect(deliveries.filter((one) => theSendersNames.includes(one.id)), 'delivery rows on the message naming the sender').toEqual([])
  expect(deliveries.some((one) => one.kind === 'agent' && one.id === addressee.id), 'the addressee has its delivery row').toBe(true)
  // THE SENDER READS ONLY THE MESSAGES IT IS A PARTY TO, so the lists below are asked of the rule and not passed whole.
  expect(messages.theMessageReader({ type: 'agent', id: sender.id }).readsEveryMessage).toBe(false)
}, 60_000)

afterAll(() => {
  t.close()
})

describe('a long list keeps a message its sender deleted, as a short list does', () => {
  it('1. in a list that is not narrowed, the sender may read the message it deleted', () => {
    const short = [deleted, ...others.slice(1)]
    expect(short.length, 'the list is not narrowed').toBeLessThanOrEqual(messages.A_SHORT_LIST)
    expect(whatTheSenderMayRead(short)).toEqual([deleted])
  })

  it('2. in a list that is narrowed first, the sender may read the message it deleted as well', () => {
    const long = [deleted, ...others]
    expect(long.length, 'the list is narrowed first').toBeGreaterThan(messages.A_SHORT_LIST)
    expect(whatTheSenderMayRead(long)).toEqual([deleted])
  })
})
