// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** A read of one conversation between other agents returns one page. */
import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { THE_PERSON } from '../src/shared/person.ts'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { buildTheChatOffice } from './the-chat-office-of-the-live-shape.ts'

const PERSON = { 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON }
const TALK_PAGE = 50
// These made-up messages are short. This is a fixture bound, not a cap on arbitrary message bodies.
const FIXTURE_BYTES = 256 * 1024
let db: TestDb
let app: FastifyInstance
let pair: string

beforeAll(async () => {
  db = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  buildTheChatOffice(db.client.sqlite, THE_PERSON, {
    agents: 40, retired: 4, theConversation: 10, otherContacts: 3, otherPersonMessages: 12,
    betweenAgents: 900, groups: 2, groupsWithThePerson: 1, membersPerGroup: 3,
    groupMessages: 10, officeLines: 4, sessions: 20, otherRecords: 0,
  })
  const sqlite = db.client.sqlite
  const agents = sqlite.prepare('select id from agents where retired = 0 order by id limit 2').all() as { id: string }[]
  expect(agents).toHaveLength(2)
  pair = agents.map(one => one.id).join('~')
  const record = sqlite.prepare("insert into records (id, workspace_id, owner_id, created_at, updated_at, kind, title, data, origin) values (?, 'message-centre', ?, ?, ?, 'message', ?, ?, 'authored')")
  const delivery = sqlite.prepare("insert into message_delivery (id, message_id, recipient_kind, recipient_id, mark, at) values (?, ?, 'agent', ?, 'seen', ?)")
  sqlite.transaction(() => {
    for (let i = 0; i < 120; i++) {
      const id = randomUUID()
      const at = new Date(Date.UTC(2026, 10, 16, 0, 0, i)).toISOString().replace('T', ' ').slice(0, 19)
      const sender = agents[i % 2]!.id
      const recipient = agents[(i + 1) % 2]!.id
      record.run(id, THE_PERSON, at, at, 'Made-up message', JSON.stringify({ body: `Made-up message ${i}`, sentBy: { kind: 'agent', id: sender }, to: [{ kind: 'agent', id: recipient }], writtenIn: { project: 'default' } }))
      delivery.run(randomUUID(), id, recipient, at)
    }
  })()
}, 120_000)

afterAll(async () => { await app?.close(); db?.close() })

async function read(url: string) {
  const response = await app.inject({ method: 'GET', url, headers: PERSON })
  expect(response.statusCode).toBe(200)
  return { json: response.json() as { conversations?: { between: unknown }[]; messages?: { id: string }[]; page?: { olderRemain?: boolean } }, bytes: Buffer.byteLength(response.body) }
}

it('returns the newest messages of a pair and the preceding page only when asked', async () => {
  const url = `/api/messages/between/${encodeURIComponent(pair)}`
  const whole = await read(url)
  const messages = whole.json.messages!
  expect(messages.length).toBeGreaterThan(TALK_PAGE * 2)
  const newest = await read(`${url}?limit=${TALK_PAGE}`)
  expect(newest.json.messages).toHaveLength(TALK_PAGE)
  expect(newest.json.messages).toEqual(messages.slice(-TALK_PAGE))
  expect(newest.json.page?.olderRemain).toBe(true)
  expect(newest.bytes).toBeLessThan(FIXTURE_BYTES)
  const cursor = newest.json.messages![0]!.id
  const older = await read(`${url}?limit=${TALK_PAGE}&before=${encodeURIComponent(cursor)}`)
  expect(older.json.messages).toEqual(messages.slice(-TALK_PAGE * 2, -TALK_PAGE))
  expect(older.bytes).toBeLessThan(FIXTURE_BYTES)
})
