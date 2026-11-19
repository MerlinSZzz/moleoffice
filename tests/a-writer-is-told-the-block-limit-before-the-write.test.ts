// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A WRITER IS TOLD A BLOCK'S LIMIT BEFORE THE WRITE, BY THE DECLARATION THE REFUSAL READS. Problem jQayki_gIciU.
 *
 * A report block over 4,000 characters used to be refused only when the report was written: the
 * limit was a constant inside src/server/lib/summary.ts, and nothing an agent reads before writing
 * said it. It is now MAX_PROSE in src/shared/prose-cap.ts, and three places read it: the refusal, the
 * report kind's `blocks` description (GET /api/kinds/report), and the note on POST /api/records
 * (GET /api). This file asks all three through the real doors, so the limit told and the limit
 * enforced cannot drift apart with nothing failing.
 *
 * Its mutations: write a separate cap back into summary.ts and the refusal no longer falls at
 * MAX_PROSE + 1; take the sentence out of the report kind and the kind no longer tells the writer.
 */
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { MAX_PROSE, THE_PROSE_CAP_SENTENCE } from '../src/shared/prose-cap.ts'

const AGENT = {
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': 'claude-code',
  'x-mole-office-workspace': 'default',
}

let t: TestDb
let app: FastifyInstance

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
})

afterAll(async () => {
  await app.close()
  t.close()
})

async function fileAReportWithABlockOf(length: number): Promise<{ status: number; said: string }> {
  const res = await app.inject({
    method: 'POST',
    url: '/api/records',
    headers: AGENT,
    payload: {
      kind: 'report',
      title: 'A report with one long block',
      data: { for: THE_TEST_OFFICES_OWNER.name, date: '2026-10-05', blocks: [{ id: 'b-long', type: 'text', text: 'x'.repeat(length) }] },
    },
  })
  return { status: res.statusCode, said: res.body }
}

describe('the limit on one block of prose', () => {
  it('is said with the number the refusal reads', () => {
    expect(THE_PROSE_CAP_SENTENCE).toContain(MAX_PROSE.toLocaleString('en-GB'))
  })

  it('is told by the report kind, before the write', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/kinds/report', headers: AGENT })
    expect(res.statusCode, res.body).toBe(200)
    expect(res.body).toContain(THE_PROSE_CAP_SENTENCE)
  })

  it('is told by the door an agent writes a report through, before the write', async () => {
    const res = await app.inject({ method: 'GET', url: '/api', headers: AGENT })
    const endpoints = (res.json() as { endpoints: { method: string; path: string; description: string | null }[] }).endpoints
    const door = endpoints.find((one) => one.method === 'POST' && one.path === '/api/records')
    expect(door?.description ?? '', 'GET /api lists POST /api/records without the limit').toContain(THE_PROSE_CAP_SENTENCE)
  })

  it('lets a block of exactly that many characters through', async () => {
    const { status, said } = await fileAReportWithABlockOf(MAX_PROSE)
    expect(status, said).toBe(201)
  })

  it('refuses one character more, still, and says by how much', async () => {
    const { status, said } = await fileAReportWithABlockOf(MAX_PROSE + 3)
    expect(status, said).toBe(400)
    expect(said).toContain(`must be ${MAX_PROSE} characters or fewer`)
    expect(said).toContain(`this one is ${MAX_PROSE + 3}, 3 over`)
  })
})
