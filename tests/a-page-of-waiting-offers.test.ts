// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** A page of waiting offers builds only that page, and keeps the whole answer's order and counts. */
import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { THE_PERSON } from '../src/shared/person.ts'
import { apiApp, freshDb, type TestDb } from './helpers.ts'

const PERSON = { 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON }
const PAGE = 50
// A fixture bound, with short made-up bodies; a single real message can be larger.
const BYTES = 256 * 1024
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
    for (let i = 0; i < 700; i++) {
      const id = randomUUID()
      const at = new Date(Date.UTC(2026, 10, 16, 0, 0, i)).toISOString().replace('T', ' ').slice(0, 19)
      record.run(id, THE_PERSON, at, at, 'Made-up offer', JSON.stringify({ body: `Made-up offer ${i}`, lead: { target: { kind: 'page', route: '/messages' } }, writtenIn: { project: 'default' } }))
      delivery.run(randomUUID(), id, THE_PERSON, at)
    }
  })()
}, 120_000)

afterAll(async () => { await app?.close(); db?.close() })

it('returns one page without building every waiting message', async () => {
  const url = '/api/messages?only=waiting-for-me&leads=1&full=1'
  const whole = await app.inject({ method: 'GET', url, headers: PERSON })
  expect(whole.statusCode).toBe(200)
  const every = whole.json() as { messages: { id: string }[] }
  expect(every.messages.length).toBeGreaterThan(600)
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
  let first: Awaited<ReturnType<FastifyInstance['inject']>>
  try { first = await app.inject({ method: 'GET', url: `${url}&limit=${PAGE}&offset=0`, headers: PERSON }) }
  finally { sqlite.prepare = original }
  expect(first.statusCode).toBe(200)
  expect(rows).toBeLessThanOrEqual(250)
  const page = first.json() as { messages: { id: string }[]; matched: number; next: string | null }
  expect(page.messages).toEqual(every.messages.slice(0, PAGE))
  expect(page.matched).toBe(every.messages.length)
  expect(page.next).not.toBeNull()
  expect(Buffer.byteLength(first.body)).toBeLessThan(BYTES)
  const second = await app.inject({ method: 'GET', url: `${url}&limit=${PAGE}&offset=${PAGE}`, headers: PERSON })
  expect(second.statusCode).toBe(200)
  expect((second.json() as { messages: unknown[] }).messages).toEqual(every.messages.slice(PAGE, PAGE * 2))
})
