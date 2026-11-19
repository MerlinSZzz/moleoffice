// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** A settled office sender can still have notices about pairs not yet found. */
import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import type { ShortBetweenAgentsRow } from '../src/shared/short-lists.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { buildTheChatOffice } from './the-chat-office-of-the-live-shape.ts'

const PERSON = { 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON }
const stamp = (seconds: number): string => new Date(Date.UTC(2029, 0, 1) + seconds * 1_000).toISOString().slice(0, 19).replace('T', ' ')
let db: TestDb
let app: FastifyInstance

beforeAll(async () => {
  db = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  buildTheChatOffice(db.client.sqlite, THE_PERSON, {
    agents: 80, retired: 0, theConversation: 0, otherContacts: 0, otherPersonMessages: 0,
    betweenAgents: 0, groups: 0, groupsWithThePerson: 0, membersPerGroup: 0,
    groupMessages: 0, officeLines: 0, sessions: 0, otherRecords: 0,
  })
  const sqlite = db.client.sqlite
  const agents = sqlite.prepare("select id from agents where retired = 0 and handle <> 'mole-office' order by id limit 72").all() as { id: string }[]
  const office = sqlite.prepare("select id from agents where handle = 'mole-office' and retired = 0").get() as { id: string }
  const add = sqlite.prepare("insert into records (id, workspace_id, owner_id, created_at, updated_at, kind, title, data, origin) values (?, 'message-centre', ?, ?, ?, 'message', ?, ?, 'fixture')")
  const delivery = sqlite.prepare('insert into message_delivery (id, message_id, recipient_kind, recipient_id, mark, at) values (?, ?, ?, ?, ?, ?)')
  const original: string[] = []
  for (let pair = 0; pair < 36; pair++) {
    const from = agents[pair * 2]!.id, to = agents[pair * 2 + 1]!.id
    for (let n = 0; n < 40; n++) {
      const id = randomUUID(), at = stamp(pair * 100 + n)
      add.run(id, THE_PERSON, at, at, 'Made-up message', JSON.stringify({ body: 'Made-up message', sentBy: { kind: 'agent', id: from }, to: [{ kind: 'agent', id: to }], writtenIn: { project: 'default' } }))
      delivery.run(randomUUID(), id, 'agent', to, 'seen', at)
      if (n === 0) original.push(id)
    }
  }
  const notice = (aboutMessage: string, at: string): void => {
    const id = randomUUID()
    add.run(id, THE_PERSON, at, at, 'Made-up notice', JSON.stringify({ body: 'Made-up notice', sentBy: { kind: 'agent', id: office.id }, to: [{ kind: 'person', id: THE_PERSON }], aboutMessage, writtenIn: { project: 'default' } }))
    delivery.run(randomUUID(), id, 'person', THE_PERSON, 'seen', at)
  }
  // Notice order opposes original order. The newest 140 notices name just the first pair.
  for (let pair = 1; pair < original.length; pair++) notice(original[pair]!, stamp(10_000 - pair))
  for (let n = 0; n < 140; n++) notice(original[0]!, stamp(20_000 + n))
}, 120_000)

afterAll(async () => { await app?.close(); db?.close() })

async function read(query: URLSearchParams) {
  const response = await app.inject({ method: 'GET', url: `/api/messages/between-agents?${query}`, headers: PERSON })
  expect(response.statusCode).toBe(200)
  return response.json() as { conversations: ShortBetweenAgentsRow[]; page?: { next: string | null } }
}

it('keeps the order of pairs named by notices after the office sender is settled', async () => {
  const whole = (await read(new URLSearchParams({ shape: 'page' }))).conversations
  expect(whole.length).toBe(36)
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
