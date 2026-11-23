// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE FIRST PAGE OF THE LIST BETWEEN AGENTS READS NO MESSAGE ROW THAT A PERSON SENT. Only a message an agent sent can be
 * in a pair. The page reads every message of each agent its scan names, and that read also takes every routed message
 * in the office, to anybody. It read each such row from the records table, the person's as well, and only then left
 * out the rows a person sent.
 *
 * The count is of message rows read by id, as in a-between-agent-page-reads-a-pairs-message-rows-once.test.ts. The
 * person routes 300 messages to one side of the office's one pair. On the old code both sides' reads took all 300 rows:
 * about 600 more.
 */
import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { THE_PERSON } from '../src/shared/person.ts'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { buildTheChatOffice } from './the-chat-office-of-the-live-shape.ts'

const PERSON = { 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON }
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

/** The first page as the chat asks for it: the message rows it read by id, and how many rows it holds. */
async function theFirstPage(): Promise<{ messageRows: number; rows: number }> {
  const sqlite = db.client.sqlite
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
  try {
    const response = await app.inject({ method: 'GET', url: '/api/messages/between-agents?shape=page&limit=25', headers: PERSON })
    expect(response.statusCode).toBe(200)
    return { messageRows, rows: (response.json() as { conversations: unknown[] }).conversations.length }
  } finally {
    prototype['all'] = original
  }
}

it('reads no more message rows when the person has routed many more messages to one side of a pair', async () => {
  const sqlite = db.client.sqlite
  const made = sqlite.prepare("select data from records where kind = 'message' and title = 'between two agents' limit 1").get() as { data: string }
  const to = (JSON.parse(made.data) as { to: { id: string }[] }).to[0]!.id
  const before = await theFirstPage()
  expect(before.rows).toBe(1)
  // The count reaches the pair's one message, so a change to how the reads are written cannot make it count nothing.
  expect(before.messageRows).toBeGreaterThanOrEqual(1)
  const add = sqlite.prepare("insert into records (id, workspace_id, owner_id, created_at, updated_at, kind, title, data, origin) values (?, 'message-centre', ?, ?, ?, 'message', ?, ?, 'fixture')")
  const delivery = sqlite.prepare("insert into message_delivery (id, message_id, recipient_kind, recipient_id, mark, at) values (?, ?, 'agent', ?, 'seen', ?)")
  const at = '2026-11-16 08:00:00'
  const routed = [{
    for: { kind: 'agent', id: to },
    because: 'Nothing is answering as this agent right now.',
    to: null,
    passedOver: [],
    line: 'This agent could not be reached when this was sent.',
  }]
  sqlite.transaction(() => {
    for (let i = 0; i < 300; i++) {
      const id = randomUUID()
      add.run(id, THE_PERSON, at, at, 'Made-up message', JSON.stringify({ body: 'Made-up message', sentBy: { kind: 'person', id: THE_PERSON }, to: [{ kind: 'agent', id: to }], writtenIn: { project: 'default' }, routed }))
      delivery.run(randomUUID(), id, to, at)
    }
  })()
  const after = await theFirstPage()
  expect(after.rows).toBe(1)
  expect(after.messageRows - before.messageRows, 'message rows read by id after the person routed 300 messages').toBeLessThan(30)
}, 120_000)
