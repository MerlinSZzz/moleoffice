// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE MESSAGE POOL'S DOOR ANSWERS WITH EACH SENDER'S OWN WORDS (wave 13y round 49).
 *
 * GET /api/messages prints, on every message, who sent it and how that sender asks to be addressed. The door read each
 * sender once per answer through a map of its own, keyed by the stored kind and id. Round 48 wrote the same rule as
 * `theSendersReadOncePerAnswer` (src/server/lib/who-sent-it.ts) for the queue's door. Two copies of one rule can drift
 * with nothing failing (invariant 9), so the pool's door now uses that reader too.
 *
 * Both copies key the senders alike and call the same `theSenderForAHandOver`. So the answer and the number of reads
 * are the same before and after the change, and no case about the answer or a count can be red before it.
 *
 * One case, on an office of made-up rows this file builds:
 *
 * 1. THE WHOLE ANSWER. The pool's answer to the person digests to what it digested at the commit before the change
 *    (c69044fe9), the same in two runs there. Each message's two sender fields are what the per-message readers
 *    `whoSentItInWords` and `howTheSenderAsksToBeAddressedInWords` answer for its sender, for every sort of sender: an
 *    agent by id, a person, an agent by a stored handle, a retired one, a handle two agents bear, an id nobody has, a
 *    person nobody is, and no sender at all. MUTATION: key every sender alike, so the first sender's words are printed
 *    on every message, and this case is red. Every message now also says where its quotes stand, null here, and the
 *    digest is taken with that field out. MUTATION: print an empty list there for a message that gives none, and this
 *    case is red.
 *
 * Every row here is synthetic, in this file's own temporary test database.
 */
import { createHash } from 'node:crypto'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, expect, it } from 'vitest'

import { apiApp, freshDb, theOfficesOwnId, type TestDb } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { MOLE_OFFICE_HANDLE, type ParticipantRef } from '../src/shared/participants.ts'
import { buildTheChatOffice, type Shape } from './the-chat-office-of-the-live-shape.ts'

/** THE POOL'S ANSWER AT c69044fe9, before the change, as sha256 of the reply's body; the same in two runs there. */
const THE_ANSWER_BEFORE = '4f8184f925dd80524cb3576133b1499d40af02f2af2918aa3045b64227b91324'

const SHAPE: Shape = {
  agents: 30,
  retired: 10,
  theConversation: 10,
  otherContacts: 5,
  otherPersonMessages: 10,
  betweenAgents: 100,
  groups: 3,
  groupsWithThePerson: 2,
  membersPerGroup: 4,
  groupMessages: 20,
  officeLines: 10,
  sessions: 10,
  otherRecords: 10,
}
const AS_THE_PERSON = { 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON }

let t: TestDb
let app: FastifyInstance
// THE SERVER'S OWN READER, loaded after the test database is open: loading it opens a database.
let whoSentIt: typeof import('../src/server/lib/who-sent-it.ts')

const agent = (id: string): ParticipantRef => ({ kind: 'agent', id })
const person = (id: string): ParticipantRef => ({ kind: 'person', id })
/** The id of the made-up agent with this handle. */
const idOf = (handle: string): string => (t.client.sqlite.prepare('SELECT id FROM agents WHERE handle = ? ORDER BY rowid LIMIT 1').get(handle) as { id: string }).id

/** Write a message from every sort of sender, two each, straight into the tables, with fixed ids and stamps. */
function addTheSendersThisFileNeeds(): void {
  const sqlite = t.client.sqlite
  const addRecord = sqlite.prepare(
    `insert into records (id, workspace_id, owner_id, created_at, updated_at, kind, title, summary, data, deleted_at, origin)
     values (?, 'message-centre', 'owner', ?, ?, 'message', 'a made-up message', null, ?, null, 'fixture')`,
  )
  const addDelivery = sqlite.prepare(
    `insert into message_delivery (id, message_id, recipient_kind, recipient_id, mark, at, because, run, inferred_by)
     values (?, ?, ?, ?, 'queued', ?, null, null, null)`,
  )
  const second = idOf('made-up-agent-5')
  const reader = idOf('made-up-agent-7')
  // AN AGENT WHOSE NAME IS NOT ITS HANDLE, AND WHO HAS SAID HOW TO BE ADDRESSED; the person's own address is set too.
  sqlite.prepare(`UPDATE agents SET name = 'A made-up name', address_name = 'Five', address_title = 'made-up title' WHERE id = ?`).run(second)
  sqlite.prepare(`UPDATE people SET address_second_person = 'you' WHERE id = ?`).run(THE_PERSON)
  // A HANDLE TWO RETIRED AGENTS BEAR, so a message holding it names nobody.
  sqlite
    .prepare(
      `INSERT INTO agents (id, name, handle, avatar_asset_id, retired, retired_at, retired_because, created_at, started_by_kind, started_by_id, role, home_world, home_installation, citizen_since)
       SELECT 'r49-second-bearer-of-a-handle', name, handle, avatar_asset_id, 1, retired_at, retired_because, created_at, started_by_kind, started_by_id, role, home_world, home_installation, citizen_since
       FROM agents WHERE handle = 'made-up-agent-28'`,
    )
    .run()
  const senders: unknown[] = [
    person(THE_PERSON),
    agent(second),
    agent('made-up-agent-8'),
    agent('made-up-agent-25'),
    agent('made-up-agent-28'),
    agent('r49-nobody-has-this-id'),
    person('r49-nobody-by-this-name'),
    undefined,
  ]
  let m = 0
  for (const sentBy of senders) {
    for (let i = 0; i < 2; i++) {
      const id = `r49-message-${String(m).padStart(4, '0')}`
      const at = `2026-09-01 08:${String(m).padStart(2, '0')}:00`
      m++
      const data = {
        body: 'These words were made up for a test and say nothing.',
        to: [agent(reader)],
        writtenIn: { project: 'default' },
        writtenFrom: { how: 'this machine', machine: 'made-up-machine' },
        ...(sentBy === undefined ? {} : { sentBy }),
      }
      addRecord.run(id, at, at, JSON.stringify(data))
      addDelivery.run(`${id}-to-0`, id, 'agent', reader, at)
    }
  }
}

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  whoSentIt = await import('../src/server/lib/who-sent-it.ts')
  buildTheChatOffice(t.client.sqlite, THE_PERSON, SHAPE)
  addTheSendersThisFileNeeds()
}, 120_000)
afterAll(async () => {
  await app.close()
  t.close()
})

interface Entry {
  id: string
  sentBy: ParticipantRef | null
  whoSentIt: string
  howToAddressTheSender: string | null
}

it("the pool's door answers what it answered before the change, with each sender's words as the per-message readers give them", async () => {
  const reply = await app.inject({ method: 'GET', url: '/api/messages?full=1', headers: AS_THE_PERSON })
  expect(reply.statusCode, reply.body).toBe(200)
  // THE OFFICE'S OWN ID IS DRAWN NEW in each fresh office, where the commit before the change gave the office's row its
  // handle as its id. The answer names the office's lines by the id its row holds; then that id is put back to the
  // handle before the hash is taken.
  expect(reply.body, 'the answer does not name the office by its own id').toContain(JSON.stringify(theOfficesOwnId(t)))
  // WHERE A MESSAGE'S QUOTES STAND IN ITS WORDS came to every message the door prints after the pin was taken: a list
  // of places, or null when the message gives none. No message here gives any, so each must say null. Then that field
  // is taken out of each message and the rest is hashed. The answer is first checked to be what JSON.stringify writes,
  // so writing it again without the field changes no other byte.
  const asItCame = reply.body.replaceAll(theOfficesOwnId(t), MOLE_OFFICE_HANDLE)
  const answer = JSON.parse(asItCame) as { messages: { id: string; quotePositions?: unknown }[]; workspaceId: unknown; narrowedByPermission: unknown; returned: unknown; left: unknown; truncated: unknown; next: unknown }
  expect(JSON.stringify(answer), 'the answer is not what JSON.stringify writes').toBe(asItCame)
  for (const one of answer.messages) expect(one.quotePositions, `the quote positions of ${one.id}`).toBeNull()
  for (const one of answer.messages) delete one.quotePositions
  // EVERY READ OF THE POOL ANSWERS ONE PAGE since round 2 of line 14c, so this answer carries the page's numbers, which
  // the answer before the change did not. The hash is taken over the three fields that answer had, in its order, and
  // the numbers are checked apart: this one page is the whole pool.
  expect(Object.keys(answer), 'the answer holds a field this case does not check').toEqual(['messages', 'total', 'matched', 'returned', 'left', 'truncated', 'next', 'unreadForYou', 'workspaceId', 'narrowedByPermission'])
  const digest = createHash('sha256').update(JSON.stringify({ messages: answer.messages, workspaceId: answer.workspaceId, narrowedByPermission: answer.narrowedByPermission })).digest('hex')
  expect(digest, `the answer's sha256 is ${digest}`).toBe(THE_ANSWER_BEFORE)
  expect(
    { returned: answer.returned, left: answer.left, truncated: answer.truncated, next: answer.next },
    'the one page is not the whole pool',
  ).toEqual({ returned: answer.messages.length, left: 0, truncated: false, next: null })
  const entries = (reply.json() as { messages: Entry[] }).messages
  for (const one of entries) {
    expect(one.whoSentIt, one.id).toBe(whoSentIt.whoSentItInWords(one.sentBy))
    expect(one.howToAddressTheSender, one.id).toBe(whoSentIt.howTheSenderAsksToBeAddressedInWords(one.sentBy))
  }
  // EVERY SORT WAS THERE, more than once each.
  const found = new Map<string, number>()
  for (const one of entries) {
    const read = whoSentIt.theSenderAsRead(one.sentBy)
    const sort = read.found === 'an-agent' && read.retired ? 'a retired agent' : read.found
    found.set(sort, (found.get(sort) ?? 0) + 1)
  }
  for (const sort of ['an-agent', 'a retired agent', 'a-person', 'nobody-could-be-named', 'nobody-was-recorded']) {
    expect(found.get(sort) ?? 0, sort).toBeGreaterThanOrEqual(2)
  }
  expect(entries.filter((one) => one.howToAddressTheSender !== null && one.sentBy?.kind === 'agent').length).toBeGreaterThanOrEqual(2)
  expect(entries.filter((one) => one.howToAddressTheSender !== null && one.sentBy?.kind === 'person').length).toBeGreaterThanOrEqual(2)
  const stored = entries.map((one) => one.sentBy)
  expect(stored.filter((one) => one?.id === 'made-up-agent-8')).toHaveLength(2)
  expect(stored.filter((one) => one?.id === 'r49-nobody-has-this-id')).toHaveLength(2)
  expect(stored.filter((one) => one?.kind === 'person' && one.id === 'r49-nobody-by-this-name')).toHaveLength(2)
}, 60_000)

