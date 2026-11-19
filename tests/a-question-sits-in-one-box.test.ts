// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A QUESTION IN A REPORT SITS IN ONE BOX ONLY, AND A REPORT THAT PUTS ONE IN TWO IS REFUSED WHEN IT IS
 * WRITTEN. A block sits in one box only, so each answer leaves from one place.
 *
 * A box is a block that holds blocks, so a question can be in two boxes only when one box is inside
 * the other. A button is sent by its own press, so a button inside a box would sit in two scopes, and
 * that is refused too. A report whose questions each sit in one box is stored, and a module, which
 * keeps no answers, may hold no question at all.
 *
 * The rules are in `summaryBlocksSchema` and `checkModuleSummary` in src/server/lib/summary.ts, asked
 * of every write through the record door.
 *
 * MUTATIONS, proved on 2 October 2026:
 *   - the box-inside-a-box issue taken out of summaryBlocksSchema's walk: the first case goes red;
 *   - the button-inside-a-box issue taken out: the second case goes red;
 *   - the report-only rule in checkModuleSummary taken out: the fourth case goes red.
 */
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { THE_PERSON } from '../src/shared/person.ts'
import { apiApp, freshDb, type TestDb } from './helpers.ts'

let t: TestDb
let app: FastifyInstance

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
})

afterAll(async () => {
  await app.close()
  t.close()
})

const AS_AN_AGENT = {
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': 'claude-code',
  'x-mole-office-session': 'sess-test',
}
const AS_THE_PERSON = { 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON }

const A_CHOICE = {
  id: 'q-glaze',
  type: 'choice',
  question: 'Which glaze should the spring batch use?',
  options: [
    { id: 'a', label: 'Celadon', recommended: true },
    { id: 'b', label: 'Tenmoku' },
  ],
}

async function fileAReport(blocks: unknown[]): Promise<{ statusCode: number; body: string }> {
  return app.inject({
    method: 'POST',
    url: '/api/records',
    headers: AS_AN_AGENT,
    payload: { kind: 'report', title: 'Questions about the spring kiln', data: { for: 'Morgan Vale', date: '2026-10-02', blocks } },
  })
}

describe('a question sits in one box only', () => {
  it('refuses a box inside a box, which would put its question in two boxes', async () => {
    const reply = await fileAReport([
      { id: 'box-outer', type: 'box', title: 'The kiln', blocks: [{ id: 'box-inner', type: 'box', blocks: [A_CHOICE] }] },
    ])
    expect(reply.statusCode, reply.body).toBe(400)
    expect(reply.body).toContain('A block sits in one box only')
  })

  it('refuses a button inside a box, which is sent by its own press', async () => {
    const reply = await fileAReport([
      { id: 'box-kiln', type: 'box', blocks: [A_CHOICE, { id: 'q-fire', type: 'button', label: 'Fire the kiln' }] },
    ])
    expect(reply.statusCode, reply.body).toBe(400)
    expect(reply.body).toContain('A button is sent by its own press')
  })

  it('stores a report whose questions each sit in one box, or in none', async () => {
    const reply = await fileAReport([
      { id: 'box-kiln', type: 'box', title: 'The kiln', blocks: [A_CHOICE] },
      { id: 'q-note', type: 'fillin', asks: 'Anything the glazer should know?', lines: 'many' },
      { id: 'q-fire', type: 'button', label: 'Fire the kiln', confirm: 'Fire the kiln tonight?' },
    ])
    expect(reply.statusCode, reply.body).toBe(201)
  })

  it('refuses a question on a module, which keeps no answers', async () => {
    const reply = await app.inject({
      method: 'POST',
      url: '/api/records',
      headers: AS_THE_PERSON,
      payload: { kind: 'module', title: 'Kiln schedule', data: { summaryBlocks: [A_CHOICE] } },
    })
    expect(reply.statusCode, reply.body).toBe(400)
    expect(reply.body).toContain('answered only in a report')
  })
})
