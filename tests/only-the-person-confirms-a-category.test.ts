// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * ONLY THE PERSON CONFIRMS A TOOL CATEGORY, AND THEIR PRESS FILES ONE DECISION.
 *
 * POST /api/toolset/categories/:id/confirm (src/server/api/toolset.ts, `confirmACategory` in
 * src/server/lib/toolset.ts), on a decision: anyone may propose a category,
 * the secretary collects the proposals, and the owner confirms one.
 *
 * What it proves:
 *   - a registered agent is refused, and nothing is written: no decision, no change row, and the
 *     category still has no `confirmedBy`;
 *   - the person's press files one decision, linked `about` the category, whose words name the
 *     category and carry the person's why, and sets `confirmedBy` to it, in one step;
 *   - a second confirmation is refused, and so are an empty why and a record that is not a
 *     category, each with nothing written.
 */

import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { apiApp, freshDb, type TestDb } from './helpers.ts'

const PERSON = {
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id,
  'x-mole-office-workspace': 'default',
}
const AGENT = {
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': 'category-confirmer',
  'x-mole-office-workspace': 'default',
}

let t: TestDb
let app: FastifyInstance
let category: string
let note: string

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  // THE AGENT IS REGISTERED, so the refusal it meets is the decision guard's and not the refusal of
  // a writer no registry holds.
  const registered = await app.inject({
    method: 'POST',
    url: '/api/agents/started',
    headers: PERSON,
    payload: { handle: 'category-confirmer', name: 'The category confirmer' },
  })
  expect(registered.statusCode, registered.body).toBeLessThan(300)
}, 120_000)

afterAll(async () => {
  await app.close()
  t.close()
})

beforeEach(() => {
  // Each case makes its own category and its own note.
  category = t.api.createRecord({
    workspaceId: 'default',
    kind: 'tool_category',
    title: 'Pages and pictures',
    data: { says: "Tools that photograph or draw the office's pages." },
    actor: { type: 'agent', id: 'category-confirmer' },
  }).id
  note = t.api.createRecord({
    workspaceId: 'default',
    kind: 'note',
    title: 'A note, not a category',
    data: {},
    actor: { type: 'agent', id: 'category-confirmer' },
  }).id
})

async function confirm(
  id: string,
  body: Record<string, unknown>,
  as: Record<string, string>,
): Promise<{ status: number; body: Record<string, unknown> }> {
  const res = await app.inject({ method: 'POST', url: `/api/toolset/categories/${id}/confirm`, headers: as, payload: body })
  return { status: res.statusCode, body: res.json() as Record<string, unknown> }
}

/** What the database holds, as counts of the rows a write would add to. */
function counts(): { records: number; decisions: number; changes: number; links: number } {
  const n = (sql: string): number => (t.client.sqlite.prepare(sql).get() as { n: number }).n
  return {
    records: n('SELECT count(*) AS n FROM records'),
    decisions: n("SELECT count(*) AS n FROM records WHERE kind = 'decision'"),
    changes: n('SELECT count(*) AS n FROM changes'),
    links: n('SELECT count(*) AS n FROM links'),
  }
}

function confirmedBy(): unknown {
  return (t.api.getRecord(category)?.data as Record<string, unknown>)['confirmedBy']
}

describe('POST /api/toolset/categories/:id/confirm', () => {
  it('refuses an agent and writes nothing', async () => {
    const before = counts()
    const answer = await confirm(category, { why: 'An agent would like this confirmed.' }, AGENT)
    expect(answer.status, JSON.stringify(answer.body)).toBe(403)
    expect(String(answer.body['error'])).toContain("the owner's own act")
    expect(counts()).toEqual(before)
    expect(confirmedBy()).toBeUndefined()
  })

  it("files one decision on the person's press and sets confirmedBy to it in the same step", async () => {
    const before = counts()
    const answer = await confirm(category, { why: 'Screenshots are a kind of tool we keep needing.' }, PERSON)
    expect(answer.status, JSON.stringify(answer.body)).toBe(201)
    const decision = (answer.body['decision'] as { id: string }).id

    // ONE DECISION, AND THE CATEGORY NAMES IT.
    expect(counts().decisions).toBe(before.decisions + 1)
    expect(confirmedBy()).toBe(decision)

    // THE DECISION SAYS IN ITS OWN WORDS THAT IT CONFIRMS THE CATEGORY, NAMES IT, AND CARRIES THE PERSON'S WHY.
    const filed = t.api.getRecord(decision)
    expect(filed?.kind).toBe('decision')
    expect(filed?.title).toContain('Pages and pictures')
    expect(filed?.title).toContain('confirmed')
    const data = filed?.data as Record<string, unknown>
    expect(data['because']).toBe('Screenshots are a kind of tool we keep needing.')
    expect(String(data['option_taken'])).toContain(category)
    expect(data['decided_by']).toBe('the owner')

    // AND IT IS LINKED ABOUT THE CATEGORY.
    const about = t.client.sqlite
      .prepare("SELECT count(*) AS n FROM links WHERE from_id = ? AND to_id = ? AND type = 'about'")
      .get(decision, category) as { n: number }
    expect(about.n).toBe(1)

    // AND THE LIST NOW SAYS THE CATEGORY IS CONFIRMED BY THAT DECISION.
    const list = await app.inject({ method: 'GET', url: '/api/toolset', headers: PERSON })
    const listed = (list.json() as { categories: { id: string; confirmed: boolean; decision: string | null }[] }).categories
    expect(listed.find((one) => one.id === category)).toMatchObject({ confirmed: true, decision })
  })

  it('refuses a second confirmation, an empty why and a record that is not a category, writing nothing', async () => {
    const first = await confirm(category, { why: 'It is a real category.' }, PERSON)
    expect(first.status, JSON.stringify(first.body)).toBe(201)
    const decided = confirmedBy()

    const refusals: { what: string; id: string; body: Record<string, unknown>; status: number; says: string }[] = [
      { what: 'a second confirmation', id: category, body: { why: 'Again.' }, status: 409, says: 'already confirmed' },
      { what: 'an empty why', id: category, body: { why: '   ' }, status: 400, says: 'empty' },
      { what: 'a note', id: note, body: { why: 'Confirm a note.' }, status: 400, says: 'not a tool category' },
      { what: 'an id nothing has', id: 'no-such-record', body: { why: 'Confirm nothing.' }, status: 404, says: 'no-such-record' },
    ]
    for (const refusal of refusals) {
      const before = counts()
      const answer = await confirm(refusal.id, refusal.body, PERSON)
      expect(answer.status, `${refusal.what}: ${JSON.stringify(answer.body)}`).toBe(refusal.status)
      expect(String(answer.body['error']), refusal.what).toContain(refusal.says)
      expect(counts(), refusal.what).toEqual(before)
      expect(confirmedBy(), refusal.what).toBe(decided)
    }
  })
})
