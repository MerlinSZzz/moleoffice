// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** Counting new messages must not look up the office writer once per message. */
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

async function count(): Promise<number> {
  const response = await app.inject({ method: 'GET', url: '/api/messages/between-agents?shape=page', headers: PERSON })
  expect(response.statusCode).toBe(200)
  const match = /desc="(\d+) statements"/.exec(String(response.headers['server-timing']))
  expect(match).not.toBeNull()
  return Number(match![1])
}

it('counts many new messages in one pair without a statement for each message', async () => {
  const sqlite = db.client.sqlite
  const agents = sqlite.prepare('select id from agents where retired = 0 order by id limit 2').all() as { id: string }[]
  const add = sqlite.prepare("insert into records (id, workspace_id, owner_id, created_at, updated_at, kind, title, data, origin) values (?, 'message-centre', ?, ?, ?, 'message', ?, ?, 'fixture')")
  const delivery = sqlite.prepare("insert into message_delivery (id, message_id, recipient_kind, recipient_id, mark, at) values (?, ?, 'agent', ?, 'seen', ?)")
  const at = '2026-11-16 08:00:00'
  function addMessages(n: number): void {
    sqlite.transaction(() => {
      for (let i = 0; i < n; i++) {
        const id = randomUUID()
        add.run(id, THE_PERSON, at, at, 'Made-up message', JSON.stringify({ body: 'Made-up message', sentBy: { kind: 'agent', id: agents[0]!.id }, to: [{ kind: 'agent', id: agents[1]!.id }], writtenIn: { project: 'default' } }))
        delivery.run(randomUUID(), id, agents[1]!.id, at)
      }
    })()
  }
  addMessages(1)
  const first = await count()
  addMessages(150)
  const many = await count()
  expect(many - first).toBeLessThan(50)
}, 120_000)
