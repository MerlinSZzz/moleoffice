// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE FIRST PAGE OF THE LIST BETWEEN AGENTS RUNS AS MANY STATEMENTS WHEN A BUSY AGENT HAS WRITTEN TO 300 AGENTS AS
 * WHEN IT HAS WRITTEN TO 11. The page reads every message of each agent its scan names, and reads each side of each
 * pair as the door to one pair reads it. Asked one agent at a time, that was three statements for each agent the busy
 * agent had ever written to: 9,151 statements on a made-up office of 2,640 agents, against 192 for the contacts.
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
    agents: 302, retired: 0, theConversation: 0, otherContacts: 0, otherPersonMessages: 0,
    betweenAgents: 0, groups: 0, groupsWithThePerson: 0, membersPerGroup: 0,
    groupMessages: 0, officeLines: 0, sessions: 1, otherRecords: 0,
  })
}, 120_000)

afterAll(async () => { await app?.close(); db?.close() })

/** The first page as the chat asks for it: its statements, and how many rows it holds. */
async function theFirstPage(): Promise<{ statements: number; rows: number }> {
  const response = await app.inject({ method: 'GET', url: '/api/messages/between-agents?shape=page&limit=25', headers: PERSON })
  expect(response.statusCode).toBe(200)
  const match = /desc="(\d+) statements"/.exec(String(response.headers['server-timing']))
  expect(match).not.toBeNull()
  return { statements: Number(match![1]), rows: (response.json() as { conversations: unknown[] }).conversations.length }
}

it('runs no more statements when the busy agent on the first page has written to many more agents', async () => {
  const sqlite = db.client.sqlite
  const agents = (sqlite.prepare("select id from agents where handle = 'the-measured-agent' or handle like 'made-up-agent-%' order by id").all() as { id: string }[]).map((one) => one.id)
  expect(agents).toHaveLength(302)
  const [busy, partner, ...others] = agents as [string, string, ...string[]]
  const add = sqlite.prepare("insert into records (id, workspace_id, owner_id, created_at, updated_at, kind, title, data, origin) values (?, 'message-centre', ?, ?, ?, 'message', ?, ?, 'fixture')")
  const delivery = sqlite.prepare("insert into message_delivery (id, message_id, recipient_kind, recipient_id, mark, at) values (?, ?, 'agent', ?, 'seen', ?)")
  const at = (hour: number, seconds: number): string =>
    `2026-11-16 ${String(hour).padStart(2, '0')}:${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`
  const write = (to: readonly string[], hour: number): void => {
    sqlite.transaction(() => {
      for (const [i, one] of to.entries()) {
        const id = randomUUID()
        add.run(id, THE_PERSON, at(hour, i), at(hour, i), 'Made-up message', JSON.stringify({ body: 'Made-up message', sentBy: { kind: 'agent', id: busy }, to: [{ kind: 'agent', id: one }], writtenIn: { project: 'default' } }))
        delivery.run(randomUUID(), id, one, at(hour, i))
      }
    })()
  }
  // THE NEWEST 130 MESSAGES ARE THE BUSY AGENT'S TO ONE PARTNER, so the page's first scan of 128 names those two agents
  // alone, in both worlds. Its read of the busy agent then reaches every agent the busy agent ever wrote to.
  write(Array.from({ length: 130 }, () => partner), 10)
  write(others.slice(0, 10), 9)
  const few = await theFirstPage()
  expect(few.rows).toBe(11)
  // 290 MORE AGENTS, each written to once, before all of the above. The first page now holds 25 of 301 pairs.
  write(others.slice(10), 8)
  const many = await theFirstPage()
  expect(many.rows).toBe(25)
  // Asked one agent at a time, the 290 more agents were 870 more statements.
  expect(many.statements - few.statements).toBeLessThan(30)
}, 120_000)
