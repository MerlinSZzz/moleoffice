// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** Equal message times keep the whole list's order across a page boundary. */
import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import type { ShortBetweenAgentsRow } from '../src/shared/short-lists.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { buildTheChatOffice } from './the-chat-office-of-the-live-shape.ts'

const PERSON = { 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON }
const AT = '2030-01-01 12:00:00'
let db: TestDb
let app: FastifyInstance
const ids: string[] = []

beforeAll(async () => {
  db = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  buildTheChatOffice(db.client.sqlite, THE_PERSON, {
    agents: 40, retired: 0, theConversation: 0, otherContacts: 0, otherPersonMessages: 0,
    betweenAgents: 0, groups: 0, groupsWithThePerson: 0, membersPerGroup: 0,
    groupMessages: 0, officeLines: 0, sessions: 0, otherRecords: 0,
  })
  const sqlite = db.client.sqlite
  const agents = sqlite.prepare("select id from agents where retired = 0 and handle <> 'mole-office' order by id limit 37").all() as { id: string }[]
  const add = sqlite.prepare("insert into records (id, workspace_id, owner_id, created_at, updated_at, kind, title, data, origin) values (?, 'message-centre', ?, ?, ?, 'message', ?, ?, 'fixture')")
  const delivery = sqlite.prepare('insert into message_delivery (id, message_id, recipient_kind, recipient_id, mark, at) values (?, ?, ?, ?, ?, ?)')
  for (let i = 1; i < agents.length; i++) {
    const id = randomUUID()
    ids.push(id)
    const recipient = agents[i]!.id
    add.run(id, THE_PERSON, AT, AT, 'Made-up message', JSON.stringify({ body: 'Made-up message', sentBy: { kind: 'agent', id: agents[0]!.id }, to: [{ kind: 'agent', id: recipient }], writtenIn: { project: i % 2 === 0 ? 'made-up-even' : 'made-up-odd' } }))
    delivery.run(randomUUID(), id, 'agent', recipient, 'seen', AT)
  }
}, 120_000)

afterAll(async () => { await app?.close(); db?.close() })

async function read(query: URLSearchParams) {
  const response = await app.inject({ method: 'GET', url: `/api/messages/between-agents?${query}`, headers: PERSON })
  expect(response.statusCode).toBe(200)
  return response.json() as { conversations: ShortBetweenAgentsRow[]; page?: { next: string | null } }
}

it('returns tied conversations in the same order, without repeats or omissions', async () => {
  const whole = (await read(new URLSearchParams({ shape: 'page' }))).conversations
  expect(whole.map((one) => one.last.id)).toEqual(ids)
  const joined: ShortBetweenAgentsRow[] = []
  let cursor: string | null = null
  do {
    const query = new URLSearchParams({ shape: 'page', limit: '25' })
    if (cursor !== null) query.set('cursor', cursor)
    const page = await read(query)
    expect(page.conversations.length).toBeLessThanOrEqual(25)
    joined.push(...page.conversations)
    cursor = page.page?.next ?? null
    expect(joined.length).toBeLessThanOrEqual(whole.length)
  } while (cursor !== null)
  expect(joined).toEqual(whole)
}, 120_000)
