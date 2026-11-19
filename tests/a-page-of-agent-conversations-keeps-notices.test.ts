// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** A page retains a notice about an agent pair and a message filed under an old registry id. */
import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { THE_PERSON } from '../src/shared/person.ts'
import type { ShortBetweenAgentsRow } from '../src/shared/short-lists.ts'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { buildTheChatOffice } from './the-chat-office-of-the-live-shape.ts'

const PERSON = { 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON }
const PAGE_SIZE = 25
let db: TestDb
let app: FastifyInstance
let notice: string

beforeAll(async () => {
  db = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  buildTheChatOffice(db.client.sqlite, THE_PERSON, {
    agents: 35, retired: 3, theConversation: 3, otherContacts: 2, otherPersonMessages: 4,
    betweenAgents: 500, groups: 1, groupsWithThePerson: 1, membersPerGroup: 3,
    groupMessages: 3, officeLines: 2, sessions: 5, otherRecords: 0,
  })
  const sqlite = db.client.sqlite
  const agents = sqlite.prepare("select id from agents where retired = 0 and handle <> 'mole-office' order by id limit 2").all() as { id: string }[]
  const office = sqlite.prepare("select id from agents where handle = 'mole-office' and retired = 0").get() as { id: string }
  const { fileRegistryAliases } = await import('../src/server/lib/registry-aliases/index.ts')
  fileRegistryAliases(sqlite, [{ namespace: 'agent-registry', aliasId: 'made-up-old-id', canonicalId: agents[0]!.id }])
  const add = sqlite.prepare("insert into records (id, workspace_id, owner_id, created_at, updated_at, kind, title, data, origin) values (?, 'message-centre', ?, ?, ?, 'message', ?, ?, 'fixture')")
  const delivery = sqlite.prepare('insert into message_delivery (id, message_id, recipient_kind, recipient_id, mark, at) values (?, ?, ?, ?, ?, ?)')
  const original = randomUUID()
  notice = randomUUID()
  const at = '2027-01-01 10:00:00'
  const later = '2027-01-01 10:00:01'
  add.run(original, THE_PERSON, at, at, 'Made-up message', JSON.stringify({ body: 'Made-up message', sentBy: { kind: 'agent', id: 'made-up-old-id' }, to: [{ kind: 'agent', id: agents[1]!.id }], writtenIn: { project: 'default' } }))
  delivery.run(randomUUID(), original, 'agent', agents[1]!.id, 'seen', at)
  add.run(notice, THE_PERSON, later, later, 'Made-up notice', JSON.stringify({ body: 'Made-up notice', sentBy: { kind: 'agent', id: office.id }, to: [{ kind: 'person', id: THE_PERSON }], aboutMessage: original, writtenIn: { project: 'default' } }))
  delivery.run(randomUUID(), notice, 'person', THE_PERSON, 'seen', later)
}, 120_000)

afterAll(async () => { await app?.close(); db?.close() })

async function read(query: string) {
  const response = await app.inject({ method: 'GET', url: `/api/messages/between-agents?${query}`, headers: PERSON })
  expect(response.statusCode).toBe(200)
  return response.json() as { conversations: ShortBetweenAgentsRow[]; page?: { next: string | null } }
}

it('shows the same notice and old-id pair as the whole list across page boundaries', async () => {
  const whole = (await read('shape=page')).conversations
  expect(whole.length).toBeGreaterThan(PAGE_SIZE)
  expect(whole[0]?.last.id).toBe(notice)
  const joined: ShortBetweenAgentsRow[] = []
  let cursor: string | null = null
  do {
    const query = new URLSearchParams({ shape: 'page', limit: String(PAGE_SIZE) })
    if (cursor !== null) query.set('cursor', cursor)
    const result = await read(query.toString())
    expect(result.conversations.length).toBeLessThanOrEqual(PAGE_SIZE)
    joined.push(...result.conversations)
    expect(result.page).toBeDefined()
    cursor = result.page!.next
    expect(joined.length).toBeLessThanOrEqual(whole.length)
  } while (cursor !== null)
  expect(joined).toEqual(whole)
}, 120_000)
