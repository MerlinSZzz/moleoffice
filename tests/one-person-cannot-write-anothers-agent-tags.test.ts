// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** A body naming somebody else cannot redirect a person's agent-tag write. */
import { afterAll, beforeAll, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { THE_PERSON } from '../src/shared/person.ts'
import { apiApp, freshDb, type TestDb } from './helpers.ts'

let db: TestDb
let app: FastifyInstance
const OTHER = 'made-up-second-person'
const headers = (id: string) => ({ 'content-type': 'application/json', 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': id })
const own = { name: 'Made-up own tag', colour: '#7860a8', agents: [] }
const other = { name: 'Made-up other tag', colour: '#7860a8', agents: [] }
beforeAll(async () => {
  db = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  db.client.sqlite.prepare('INSERT INTO people (id, name, handle, avatar_asset_id, created_at) SELECT ?, ?, ?, avatar_asset_id, created_at FROM people WHERE id = ?').run(OTHER, 'Made-up person', OTHER, THE_PERSON)
}, 120_000)
afterAll(async () => { await app?.close(); db?.close() })

it('keeps the first person’s tags when another person names them in a write', async () => {
  const first = await app.inject({ method: 'PUT', url: '/api/agent-tags', headers: headers(THE_PERSON), payload: { tags: [own] } })
  expect(first.statusCode, first.body).toBe(200)
  const attempt = await app.inject({ method: 'PUT', url: '/api/agent-tags', headers: headers(OTHER), payload: { person: THE_PERSON, tags: [other] } })
  expect([200, 400, 403]).toContain(attempt.statusCode)
  const reading = await app.inject({ method: 'GET', url: '/api/agent-tags', headers: headers(THE_PERSON) })
  expect(reading.json().tags).toEqual([own])
  const theirs = await app.inject({ method: 'GET', url: '/api/agent-tags', headers: headers(OTHER) })
  expect(theirs.json().tags).not.toContainEqual(own)
})
