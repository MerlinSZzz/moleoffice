// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * ONE PAGE OF THE LIST BETWEEN AGENTS READS THE MESSAGE ROWS OF A PAIR ONCE, NOT ONCE FROM EACH SIDE.
 *
 * The page asks the shared reader what each agent of its newest messages is in. The first agent of a busy pair reads
 * every message of the pair and finds the pair whole. The second agent's read needs none of those messages, but it
 * still read each of their rows from the records table and only then left them out. The row count below bounds the
 * work: message rows read by id for one pair of 401 messages must stay under 600, one and a half times the 400 the test adds after the first.
 *
 * The count must also reach the pair's messages once, so that a change to how the reads are written cannot make it
 * count nothing. The list's answer stays exact: the one row for the pair holds every one of its messages in
 * `newSince`, and its last line is the newest one.
 */
import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { THE_PERSON } from '../src/shared/person.ts'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { buildTheChatOffice } from './the-chat-office-of-the-live-shape.ts'

const PERSON = { 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON }
/** Messages added to the one pair the builder made, older than none of its one line. */
const ADDED = 400
let db: TestDb
let app: FastifyInstance

beforeAll(async () => {
  db = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  buildTheChatOffice(db.client.sqlite, THE_PERSON, {
    agents: 5, retired: 0, theConversation: 0, otherContacts: 0, otherPersonMessages: 0,
    betweenAgents: 1, groups: 0, groupsWithThePerson: 0, membersPerGroup: 0,
    groupMessages: 0, officeLines: 0, sessions: 1, otherRecords: 0,
  })
}, 120_000)

afterAll(async () => { await app?.close(); db?.close() })

it('reads the message rows of one pair once, and still counts every message in it', async () => {
  const sqlite = db.client.sqlite
  const made = sqlite.prepare("select data from records where kind = 'message' and title = 'between two agents' limit 1").get() as { data: string }
  const first = JSON.parse(made.data) as { sentBy: { id: string }; to: { id: string }[] }
  const a = first.sentBy.id
  const b = first.to[0]!.id
  const add = sqlite.prepare("insert into records (id, workspace_id, owner_id, created_at, updated_at, kind, title, data, origin) values (?, 'message-centre', ?, ?, ?, 'message', ?, ?, 'fixture')")
  const delivery = sqlite.prepare("insert into message_delivery (id, message_id, recipient_kind, recipient_id, mark, at) values (?, ?, 'agent', ?, 'seen', ?)")
  const at = '2026-11-16 08:00:00'
  let last = ''
  sqlite.transaction(() => {
    for (let i = 0; i < ADDED; i++) {
      const id = randomUUID()
      last = id
      add.run(id, THE_PERSON, at, at, 'Made-up message', JSON.stringify({ body: 'Made-up message', sentBy: { kind: 'agent', id: a }, to: [{ kind: 'agent', id: b }], writtenIn: { project: 'default' } }))
      delivery.run(randomUUID(), id, b, at)
    }
  })()
  const prototype = Object.getPrototypeOf(sqlite.prepare('SELECT 1')) as Record<string, unknown>
  const original = prototype['all'] as (this: { source: string }, ...args: unknown[]) => unknown
  let messageRows = 0
  prototype['all'] = function (this: { source: string }, ...args: unknown[]): unknown {
    const answer = original.apply(this, args)
    // A MESSAGE ROW READ BY ITS ID, whether the id is the read's only condition or the first of several.
    if (/ from "records" where \(?"records"\."id" in /.test(this.source)) {
      messageRows += Array.isArray(answer) ? answer.length : 0
    }
    return answer
  }
  let page: { conversations: { last: { id: string }; newSince: number }[]; page: { next: string | null } }
  try {
    const response = await app.inject({ method: 'GET', url: '/api/messages/between-agents?shape=page&limit=25', headers: PERSON })
    expect(response.statusCode).toBe(200)
    page = response.json()
  } finally {
    prototype['all'] = original
  }
  expect(page.conversations).toHaveLength(1)
  expect(page.conversations[0]!.last.id).toBe(last)
  expect(page.conversations[0]!.newSince).toBe(ADDED + 1)
  expect(page.page.next).toBeNull()
  expect(messageRows, 'message rows read by id: the pair holds 401 messages, and one side must read them all').toBeGreaterThanOrEqual(ADDED + 1)
  expect(messageRows, 'message rows read by id for the one pair, which holds 401 messages').toBeLessThan(ADDED * 1.5)
}, 120_000)
