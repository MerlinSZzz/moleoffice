// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A CARD OFF THE POWER TREE IS THE OWNER'S TO RETIRE, AND NOBODY ELSE'S BY RANK. Criterion P82.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS IS ITS OWN CASE
 * ---------------------------------------------------------------------------------------
 *
 * design/permissions/roles.json gives the inspector `rung: null` — it is off the tree on purpose,
 * because it reads more than a worker and writes less than a supervisor and neither step fits. A
 * rank comparison against no rung has no answer, and the critic said so before this was built (note
 * IyKUXwTqwOTq, objection 4): *a rank comparison against null has no answer, so "one function both
 * the door and the page call" will either throw or silently answer no. Say what happens.*
 *
 * What happens is stated in both directions and neither is a guess:
 *
 *   a row holding an off-tree card  no card ranks above it, so it is the person's to retire, or a
 *                                   raised agent's, and no rank reaches it.
 *   an agent holding one            it has no rung, so it retires nothing by rank. It still retires
 *                                   what it started, because that rule is about the row and not
 *                                   about a card.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS MEASURED
 * ---------------------------------------------------------------------------------------
 *
 *   · a secretary is refused an inspector's row, and the refusal quotes the card's retirement words;
 *   · the person retires it;
 *   · an inspector is refused a worker's row by rank, and the refusal says it has no rung;
 *   · an inspector cannot be a starter at all, so no other rule reaches past the rank one.
 *
 * ---------------------------------------------------------------------------------------
 * THE MUTATION THAT TURNS THIS RED, WITH A CONTROL RUN FIRST
 * ---------------------------------------------------------------------------------------
 *
 *   Drop the declared appointedBy check in `whoMayRetire` (src/server/lib/participants.ts): the first
 *   refusal loses the card's retirement words. Give a null caller rung a rank instead of refusing:
 *   the inspector's refusal of a worker no longer says it has no rung.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'

import { THE_TEST_OFFICES_SECRETARY } from './a-page-of-a-test-office.ts'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'

let t: TestDb
let app: FastifyInstance

const AS_THE_PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}
const asAgent = (id: string): Record<string, string> => ({
  ...AS_THE_PERSON,
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': id,
})

async function register(headers: Record<string, string>, body: Record<string, unknown>): Promise<void> {
  const reply = await app.inject({ method: 'POST', url: '/api/agents/started', headers, payload: body })
  expect(reply.statusCode, reply.body).toBe(201)
}

async function retire(headers: Record<string, string>, handle: string): Promise<{ code: number; said: string }> {
  const reply = await app.inject({
    method: 'POST',
    url: `/api/participants/agent/${handle}/retire`,
    headers,
    payload: { because: 'measuring the off-tree card' },
  })
  return { code: reply.statusCode, said: reply.body }
}

async function isRetired(handle: string): Promise<unknown> {
  const reply = await app.inject({ method: 'GET', url: `/api/participants/agent/${handle}`, headers: AS_THE_PERSON })
  return ((reply.json() as Record<string, unknown>)['participant'] as Record<string, unknown>)['retired']
}

/**
 * WHICH CARD IS OFF THE TREE, ASKED OF THE SERVER AND NOT WRITTEN HERE.
 *
 * The role words live in design/permissions/roles.json and in no source file, and this test is not
 * going to be the exception. `GET /api/roles` publishes the cards this installation read at start,
 * with each card's rung, which is the same declaration the retire rule asks. If it ever holds no
 * single card off the tree, this says so rather than measuring a word nothing holds.
 *
 * A TOOL'S CARD IS OFF THE TREE TOO, and is not the one this file registers checkers under: the
 * mailer's card is refused everything else, so it is left out here as
 * `theCardOffTheTree` leaves it out. The mailer card left the declaration on 1 October 2026 by a decision, so today
 * no tool's card is declared; the rule above still holds for one.
 */
let offTheTree = ''
let whatEndsIt = ''

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  const published = await app.inject({ method: 'GET', url: '/api/roles', headers: AS_THE_PERSON })
  expect(published.statusCode, published.body).toBe(200)
  const cards = ((published.json() as Record<string, unknown>)['cards'] ?? []) as { name: string; rung: number | null; whatEndsIt: string; refusedEverythingElse?: true }[]
  const off = cards.filter((one) => one.rung === null && one.refusedEverythingElse !== true)
  expect(off.length, 'the declaration holds exactly one card off the tree that is not a tool’s').toBe(1)
  offTheTree = off[0]?.name ?? ''
  whatEndsIt = off[0]?.whatEndsIt ?? ''
  await register(AS_THE_PERSON, { handle: THE_TEST_OFFICES_SECRETARY.handle, name: THE_TEST_OFFICES_SECRETARY.name, role: 'secretary' })
  await register(AS_THE_PERSON, { handle: 'checker', name: 'The Checker', role: offTheTree })
  await register(AS_THE_PERSON, { handle: 'checker-two', name: 'The Other Checker', role: offTheTree })
  await register(AS_THE_PERSON, { handle: 'work-one', name: 'Worker One', role: 'worker' })
})

afterAll(async () => {
  await app.close()
  t.close()
})

describe('a row holding a card off the tree', () => {
  it('is refused to a secretary, and the refusal quotes the card', async () => {
    const said = await retire(asAgent(THE_TEST_OFFICES_SECRETARY.handle), 'checker')
    expect(said.code).toBe(403)
    expect(said.said, 'the card').toContain(offTheTree)
    expect(said.said, 'the office’s words').toContain(whatEndsIt)
    expect(said.said).toContain('Nothing was written')
    expect(await isRetired('checker'), 'nothing was written').toBe(false)
  })

  it('is the person’s to retire', async () => {
    const said = await retire(AS_THE_PERSON, 'checker')
    expect(said.code, said.said).toBe(200)
    expect(await isRetired('checker')).toBe(true)
  })
})

describe('an agent holding a card off the tree', () => {
  it('retires nothing by rank, and the refusal says it has no rung', async () => {
    const said = await retire(asAgent('checker-two'), 'work-one')
    expect(said.code).toBe(403)
    expect(said.said).toContain('off the power tree')
    expect(said.said).toContain('no rung')
    expect(await isRetired('work-one'), 'nothing was written').toBe(false)
  })

  /**
   * MEASURED WHILE WRITING THIS, and it is worth keeping: an off-tree card can never be a starter,
   * so the starter rule cannot rescue it. Registering an agent as the inspector is refused —
   * *An inspector appoints nobody. That is the inspector card's own line* — and the one other door
   * that writes a starter, PATCH /api/participants/agent/<id> with `startedBy`, refuses every agent
   * and always writes the person. So rank is the only rule that could ever have let an off-tree card
   * close somebody's row, and it does not.
   */
  it('cannot become a starter at all, so no other rule reaches past this one', async () => {
    const reply = await app.inject({
      method: 'POST',
      url: '/api/agents/started',
      headers: asAgent('checker-two'),
      payload: { handle: 'its-own', name: 'Its Own Worker', role: 'worker' },
    })
    expect(reply.statusCode).toBe(403)
    expect(reply.body).toContain('appoints nobody')
  })
})
