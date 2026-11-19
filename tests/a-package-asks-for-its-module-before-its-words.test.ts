// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { THE_PERSON } from '../src/shared/person.ts'
import { apiApp, freshDb, thePersonsKeyHeader, type TestDb } from './helpers.ts'

let db: TestDb
let app: FastifyInstance
let person: Record<string, string>

beforeAll(async () => {
  db = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  person = { 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON, ...thePersonsKeyHeader() }
}, 120_000)
afterAll(async () => { await app?.close(); db?.close() })

it('asks for a module before missing package words and writes nothing', async () => {
  const made = await app.inject({ method: 'POST', url: '/api/records', headers: person, payload: { kind: 'task', title: 'Made-up package task', data: {} } })
  expect(made.statusCode, made.body).toBe(201)
  const id = String(made.json().record.id)
  const snapshot = () => JSON.stringify({
    records: db.client.sqlite.prepare('SELECT id, kind, data, updated_at FROM records ORDER BY id').all(),
    changes: db.client.sqlite.prepare('SELECT * FROM changes ORDER BY append_order').all(),
    links: db.client.sqlite.prepare('SELECT * FROM links ORDER BY id').all(),
  })
  const before = snapshot()
  const { A_PACKAGE_NEEDS_A_MODULE } = await import('../src/server/lib/module-requirements.ts')
  for (const payload of [{}, { forTheOutside: '' }]) {
    const answer = await app.inject({ method: 'POST', url: `/api/delegation/${id}/package`, headers: person, payload })
    expect(answer.statusCode, answer.body).toBe(400)
    expect(answer.json().error).toContain(A_PACKAGE_NEEDS_A_MODULE)
    expect(snapshot()).toBe(before)
  }
})
