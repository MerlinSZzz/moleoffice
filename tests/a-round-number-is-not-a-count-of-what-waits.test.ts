// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A ROUND'S NUMBER BESIDE "NEEDS YOU" IS A NAME, AND THE COUNT GUARD LETS IT THROUGH. Problem ytvfmnKx5yeh.
 *
 * On 29 September wave 13q's round 11 report was refused by the office: "round 11" stood within six
 * words of "Needs you", and the guard read the 11 as a count of what waits on the person. The
 * sentence was true, and 13q reworded it to get past the guard.
 *
 * The guard now passes over a number that names one thing — after a naming noun such as "round", in
 * Chinese after 第 — and keeps reading. So this file asks the real door, as an agent, four things:
 * the round's number passes in English and in Chinese; a real count is still refused in both; and a
 * body holding a round's number AND a real count is refused for the count.
 *
 * Its mutations: take `namesSomething`'s naming-noun line out and the English sentence is refused;
 * take its 第 line out and the Chinese one is.
 */
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { apiApp, freshDb, type TestDb } from './helpers.ts'

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

/** What the door answered when an agent filed a report whose one block says `text`. */
async function fileAReportSaying(text: string): Promise<{ status: number; said: string }> {
  const res = await app.inject({
    method: 'POST',
    url: '/api/records',
    headers: AGENT,
    payload: {
      kind: 'report',
      title: 'A report about a round',
      data: { for: THE_TEST_OFFICES_OWNER.name, date: '2026-10-05', blocks: [{ id: 'b-1', type: 'text', text }] },
    },
  })
  return { status: res.statusCode, said: res.body }
}

describe('the count guard, on a number that names a round', () => {
  it('lets an agent write the round number beside "Needs you", in English', async () => {
    const { status, said } = await fileAReportSaying('Needs you: round 11 left the decisions on the report page open.')
    expect(status, said).toBe(201)
  })

  it('lets an agent write the round number beside "Needs you", in Chinese', async () => {
    const { status, said } = await fileAReportSaying('第 11 轮的报告页上还有决定 Needs you。')
    expect(status, said).toBe(201)
  })

  it('still refuses a real count, in English', async () => {
    const { status, said } = await fileAReportSaying('Nineteen things are waiting on you.')
    expect(status, said).toBe(403)
    expect(said).toContain('Nineteen')
  })

  it('still refuses a real count, in Chinese', async () => {
    const { status, said } = await fileAReportSaying('有 5 件事 Needs you。')
    expect(status, said).toBe(403)
    expect(said).toContain('“5”')
  })

  it('refuses a body with a round number and a real count, for the count', async () => {
    const { status, said } = await fileAReportSaying('In round 11, 5 things need you.')
    expect(status, said).toBe(403)
    expect(said).toContain('“5”')
  })
})
