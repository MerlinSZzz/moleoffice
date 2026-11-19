// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A REGISTRY ROW HOLDING A ROLE WORD NO CARD HOLDS IS REFUSED, AND THE REFUSAL QUOTES THE WORD.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT WAS WRONG, MEASURED
 * ---------------------------------------------------------------------------------------
 *
 * Note `c5W3ZBatgdpG`, 6 September 2026, third measurement: *A registry row holding a role word no
 * card holds is refused NOTHING by the role gate: `cardFor` returns null and `actsRefusedTo` returns
 * an empty map. Measured on a copy of the corpus on 6 September: no row holds investigator, so
 * removing that card migrated nothing. Had one held it, that agent would have become unrestricted
 * silently. Nothing guards this today.*
 *
 * The investigator card was taken out of the tree on 7 September 2026. So
 * the shape that produces this row is not hypothetical: a card can be removed, and any row still
 * holding its word becomes a row nothing can read.
 *
 * ---------------------------------------------------------------------------------------
 * THE TWO READINGS, AND WHY THIS ONE
 * ---------------------------------------------------------------------------------------
 *
 * Either read the word as the lowest rung and say it is unknown, or refuse every act and name it.
 * This is the second, on the fifth invariant: absence beats a guess. A row with NO role is read as a
 * worker, and that is a stated reading of an absence somebody wrote down. A row holding a word
 * nobody declared is not an absence — somebody wrote something — and calling it a worker would hand
 * a rung to a row nobody granted one, which is exactly what happens to every holder at once the day
 * a card is removed. So the office says it cannot read the word rather than deciding what it
 * probably meant, and the refusal quotes the word so the fix is findable.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THE ORDINARY ACTS ARE IN HERE AND NOT ONLY THE GOVERNANCE ONES
 * ---------------------------------------------------------------------------------------
 *
 * The gate skips the whole question for an act no role is refused, and the acts the lowest rung
 * holds — reading a record, writing one — are exactly those. So a version of this rule that fixed
 * only the governance acts would leave a row with an unreadable word holding precisely a worker's
 * powers, which is the guess this is here to refuse, arrived at by a different route. The case
 * about writing a record is what holds that.
 */

import { THE_TEST_OFFICES_SECRETARY } from './a-page-of-a-test-office.ts'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'

import { apiApp, freshDb, writeDataBypassingTheGate, type TestDb } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'

let t: TestDb
let app: FastifyInstance

const AS_THE_PERSON = { 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON }
const asAgent = (id: string): Record<string, string> => ({
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': id,
})

/** The word this office does not hold. It was a card until 7 September 2026, which is the point. */
const A_WORD_NO_CARD_HOLDS = 'investigator'

/** The worker this case gives a word no card holds; a new handle each case, because that changes its row. */
let WORKER = 'w-one'
let caseNumber = 0

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  await register(AS_THE_PERSON, { handle: THE_TEST_OFFICES_SECRETARY.handle, name: THE_TEST_OFFICES_SECRETARY.name, role: 'secretary' })
}, 60_000)

afterAll(async () => {
  await app.close()
  t.close()
})

beforeEach(async () => {
  caseNumber += 1
  WORKER = `w-one-${String(caseNumber)}`
  await register(asAgent(THE_TEST_OFFICES_SECRETARY.handle), { handle: WORKER, name: `Worker One ${String(caseNumber)}`, role: 'worker' })
})

async function register(headers: Record<string, string>, body: Record<string, unknown>): Promise<number> {
  const reply = await app.inject({ method: 'POST', url: '/api/agents/started', headers, payload: body })
  return reply.statusCode
}

/**
 * A row holding a word no card holds.
 *
 * IT IS WRITTEN PAST THE GATE ON PURPOSE, because the gate is not where this comes from.
 * `checkAgentRole` refuses such a word on the way in, and it cannot refuse a word that was legal
 * when it was written and stopped being legal when the card was removed. That is the row this file
 * is about, and the only honest way to make one is the way the corpus makes one.
 */
function aRowHoldingAWordNobodyDeclares(handle: string): void {
  // THE REGISTRY TABLE, WHICH IS WHAT THE GATE READS. `agentByHandle` answers from `agents`, and
  // the agent RECORD is kept in step with it — so both are written here, exactly as a card removed
  // from the declaration would leave them: a word that was legal when it was stored.
  const changed = t.client.sqlite
    .prepare('UPDATE agents SET role = ? WHERE handle = ?')
    .run(A_WORD_NO_CARD_HOLDS, handle)
  expect(changed.changes, `the ${handle} registry row exists before its word is changed`).toBe(1)
  const row = t.api
    .listRecords({ workspaceId: 'default', kind: 'agent' })
    .find((one) => (one.data as { handle?: string }).handle === handle)
  if (row !== undefined) writeDataBypassingTheGate(t, row.id, { ...row.data, role: A_WORD_NO_CARD_HOLDS })
}

async function tryTo(
  method: 'POST' | 'GET',
  url: string,
  headers: Record<string, string>,
  payload?: Record<string, unknown>,
): Promise<{ status: number; error: string }> {
  const reply = await app.inject({ method, url, headers, ...(payload === undefined ? {} : { payload }) })
  return { status: reply.statusCode, error: String((reply.json() as { error?: unknown }).error ?? '') }
}

// ================================================== it is refused, and it is refused everything

describe('a role word no card holds is refused every act, and the refusal names the word', () => {
  it('refuses a governance-adjacent act it would have been allowed before', async () => {
    aRowHoldingAWordNobodyDeclares(WORKER)
    const said = await tryTo('POST', '/api/groups', asAgent(WORKER), { title: 'A group' })
    expect(said.status).toBe(403)
    expect(said.error, 'the word itself, because the fix is one edit and is not findable without it').toContain(
      `"${A_WORD_NO_CARD_HOLDS}"`,
    )
    expect(said.error).toContain('no role card holds that word')
    expect(said.error, 'and the words this office does hold').toContain('worker')
  })

  it('refuses an act a worker may do, so the word is not quietly read as the lowest rung', async () => {
    aRowHoldingAWordNobodyDeclares(WORKER)
    const said = await tryTo('POST', '/api/records', asAgent(WORKER), {
      kind: 'note',
      title: 'A note a worker would have been allowed to write',
    })
    expect(said.status, 'writing a record is a worker’s own act and it is refused too').toBe(403)
    expect(said.error).toContain(`"${A_WORD_NO_CARD_HOLDS}"`)
  })

  it('says it is not reading the word as the lowest rung, rather than leaving it to be inferred', async () => {
    aRowHoldingAWordNobodyDeclares(WORKER)
    const said = await tryTo('POST', '/api/groups', asAgent(WORKER), { title: 'A group' })
    expect(said.error).toContain('not read as the lowest rung')
    expect(said.error, 'and it says what to do about it').toContain('roles.json')
  })

  it('publishes the same answer it enforces', async () => {
    aRowHoldingAWordNobodyDeclares(WORKER)
    const reply = await app.inject({ method: 'GET', url: '/api/access', headers: asAgent(WORKER) })
    expect(reply.statusCode).toBe(200)
    const caller = (reply.json() as { caller: Record<string, unknown> }).caller
    const refused = (caller['refusedByRole'] ?? []) as { act: string }[]
    const acts = refused.map((one) => one.act)
    expect(acts, 'and it names the acts rather than answering an empty list').toContain('group.open')
    expect(acts, 'including the ones a worker holds, which is what changed').toContain('record.write')
    expect(caller['role']).toBe(A_WORD_NO_CARD_HOLDS)
  })
})

// ================================================== and the two readings it must not disturb

describe('the two rows this rule must leave exactly as they were', () => {
  it('still reads a row with no role at all as a worker', async () => {
    const row = t.api
      .listRecords({ workspaceId: 'default', kind: 'agent' })
      .find((one) => (one.data as { handle?: string }).handle === WORKER)
    expect(row).toBeDefined()
    if (row === undefined) return
    const data = { ...(row.data as Record<string, unknown>) }
    delete data['role']
    writeDataBypassingTheGate(t, row.id, data)
    t.client.sqlite.prepare('UPDATE agents SET role = NULL WHERE handle = ?').run(WORKER)

    const allowed = await tryTo('POST', '/api/records', asAgent(WORKER), { kind: 'note', title: 'A note' })
    expect(allowed.status, 'an absence is read as a worker, and a worker may write a record').toBe(201)
    const refused = await tryTo('POST', '/api/groups', asAgent(WORKER), { title: 'A group' })
    expect(refused.status, 'and is refused what a worker is refused').toBe(403)
    expect(refused.error, 'in the ordinary refusal, not the one about an unreadable word').not.toContain(
      'no role card holds that word',
    )
  })

  it('still narrows nobody who never registered', async () => {
    // WRITING A RECORD IS THE CASE THAT MATTERS. `record.write` is now one of the acts the gate asks
    // about, because a word no card holds is refused it — so a caller no registry holds has to be
    // allowed through that question, or this rule would have narrowed rung 0 as a side effect. The
    // rule is: name it, never stop it.
    const wrote = await tryTo('POST', '/api/records', asAgent('nobody-registered-this-one'), {
      kind: 'note',
      title: 'A note from a caller nothing has registered',
    })
    expect(wrote.status, wrote.error).toBe(201)

    // AND WHEN A ROUTE OF ITS OWN REFUSES ONE, IT IS NOT THIS REFUSAL. Opening a group asks the
    // registry a question of its own and answers 403 to a caller it does not hold; that is a
    // different refusal, and it must not come to say a role word could not be read.
    const group = await tryTo('POST', '/api/groups', asAgent('nobody-registered-this-one'), { title: 'A group' })
    expect(group.error).not.toContain('no role card holds that word')
    expect(group.error).toContain('Nothing in either registry answers to')
  })
})
