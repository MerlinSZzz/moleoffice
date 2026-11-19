// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** Following an agent includes its returned reminders without building everyone else's offers. */
import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { THE_PERSON } from '../src/shared/person.ts'
import { apiApp, freshDb, type TestDb } from './helpers.ts'

const PERSON = { 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON }
const followed = { kind: 'agent', id: randomUUID() }
const another = { kind: 'agent', id: randomUUID() }
const office = { kind: 'agent', id: randomUUID() }
const made = [randomUUID(), randomUUID()]
let db: TestDb
let app: FastifyInstance

beforeAll(async () => {
  db = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  const sqlite = db.client.sqlite
  const record = sqlite.prepare("insert into records (id, workspace_id, owner_id, created_at, updated_at, kind, title, data, origin) values (?, 'message-centre', ?, ?, ?, 'message', ?, ?, 'authored')")
  const delivery = sqlite.prepare("insert into message_delivery (id, message_id, recipient_kind, recipient_id, mark, at) values (?, ?, 'person', ?, 'delivered', ?)")
  sqlite.transaction(() => {
    for (let i = 0; i < 602; i++) {
      const id = made[i] ?? randomUUID()
      const sentBy = i === 0 ? followed : i === 1 ? office : another
      const extra = i === 1 ? { backAsYouAsked: { from: followed } } : undefined
      const at = new Date(Date.UTC(2026, 10, 16, 0, 0, i)).toISOString().replace('T', ' ').slice(0, 19)
      record.run(id, THE_PERSON, at, at, 'Made-up offer', JSON.stringify({ body: `Made-up offer ${i}`, sentBy, extra, lead: { target: { kind: 'page', route: '/messages' } }, writtenIn: { project: 'default' } }))
      delivery.run(randomUUID(), id, THE_PERSON, at)
    }
  })()
}, 120_000)

afterAll(async () => { await app?.close(); db?.close() })

it('reads only the followed maker, including an office reminder, with bounded record work', async () => {
  const sqlite = db.client.sqlite as unknown as { prepare: (sql: string) => Record<string, unknown> }
  const original = sqlite.prepare
  let rows = 0
  sqlite.prepare = function (this: unknown, sql: string) {
    const statement = original.call(this, sql)
    if (/\bfrom\s+["`]?records["`]?\b/i.test(sql)) {
      for (const method of ['all', 'get'] as const) {
        const prior = statement[method] as (...args: unknown[]) => unknown
        statement[method] = function (this: unknown, ...args: unknown[]) {
          const found = prior.apply(this, args)
          rows += method === 'all' ? (found as unknown[]).length : found === undefined ? 0 : 1
          return found
        }
      }
    }
    return statement
  }
  let response: Awaited<ReturnType<FastifyInstance['inject']>>
  try {
    response = await app.inject({ method: 'GET', headers: PERSON, url: `/api/messages?only=waiting-for-me&leads=1&full=1&limit=50&offerFrom=${encodeURIComponent(`agent:${followed.id}`)}` })
  } finally { sqlite.prepare = original }
  expect(response.statusCode).toBe(200)
  expect(rows).toBeLessThanOrEqual(250)
  const reply = response.json() as { messages: { id: string }[]; matched: number }
  expect(reply.messages.map((one) => one.id)).toEqual([made[1], made[0]])
  expect(reply.matched).toBe(2)
})
