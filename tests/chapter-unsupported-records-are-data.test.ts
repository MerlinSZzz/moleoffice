// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { afterAll, beforeAll, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { apiApp, freshDb, thePersonsKeyHeader, type TestDb } from './helpers.ts'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { SHIPPED_CHAPTER_NUMBERS } from '../src/shared/chapter-check.ts'
let db: TestDb, app: FastifyInstance, person: Record<string, string>
beforeAll(async () => { db = await freshDb(); app = (await apiApp()).app; await app.ready(); person = { 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id, 'x-mole-office-workspace': 'default', ...thePersonsKeyHeader() }; const { copyTheDefaultRegulationsOnce } = await import('../src/server/lib/default-regulations.ts'); copyTheDefaultRegulationsOnce() })
afterAll(async () => { await app.close(); db.close() })
/** A number past the last shipped chapter, so the shipped file holds no chapter under it however many it ships. */
const UNSHIPPED = Math.max(...SHIPPED_CHAPTER_NUMBERS) + 1
const snapshot = () => JSON.stringify(['records', 'revisions', 'changes'].map(table => db.client.sqlite.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all()))

it('names an unsupported chapter record as data and in says, without changing the selected chapters or writing', async () => {
  const original = (await app.inject({ url: '/api/office-regulations/chapters', headers: person })).json(); expect(original.unsupported).toBeNull()
  const made = await app.inject({ method: 'POST', url: '/api/records', headers: person, payload: { kind: 'module', title: 'An invented unsupported chapter', summary: `Made up chapter ${String(UNSHIPPED)}.`, data: { state: 'active', parts: [], extra: { chapter: UNSHIPPED }, summaryBlocks: [{ id: 'r-1', type: 'text', heading: 'An invented rule', text: 'Made up words.' }] } } }); expect(made.statusCode, made.body).toBe(201)
  const before = snapshot(), reply = await app.inject({ url: '/api/office-regulations/chapters', headers: person }); expect(reply.statusCode).toBe(200)
  const selected = reply.json(); expect(selected.chapters).toEqual(original.chapters)
  expect(selected.unsupported.records).toEqual([made.json().record.id]); expect(selected.unsupported.problems).toEqual([expect.stringContaining(`Chapter ${String(UNSHIPPED)}`)])
  for (const problem of selected.unsupported.problems) expect(selected.says).toContain(problem)
  expect(selected.unsupported.problems[0]).toContain(made.json().record.id); expect(selected.records.some((one: { id: string }) => one.id === made.json().record.id)).toBe(false); expect(snapshot()).toBe(before)
})
