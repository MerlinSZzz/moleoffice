// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A SUPERVISOR DOES NOT RETIRE ANOTHER SUPERVISOR, OR ITSELF. Criterion P82.
 *
 * ---------------------------------------------------------------------------------------
 * THE TRAP THIS EXISTS FOR
 * ---------------------------------------------------------------------------------------
 *
 * design/permissions/roles.json gives the supervisor and the secretary `appoints: "at or below its
 * own rung"`, so a supervisor may appoint another supervisor. The obvious way to write the retire
 * rule is to reuse that comparison, and it is wrong: the rule is downward only — a secretary may
 * retire a supervisor or a worker, and a supervisor may retire a worker — and at-or-below would let a
 * supervisor close a peer, and close itself.
 *
 * The critic named it before it was built (note IyKUXwTqwOTq, objection 4): *say strictly below, in
 * the design.* This is the test that holds it there.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS MEASURED
 * ---------------------------------------------------------------------------------------
 *
 *   · a supervisor is refused another supervisor's row, and the refusal names both rungs;
 *   · a supervisor is refused its OWN row, which at-or-below would also allow;
 *   · a secretary is refused another secretary's row because its card keeps retirement for the person;
 *   · nothing is written in any of the three.
 *
 * A ROW A SUPERVISOR STARTED IS NOT ONE OF THESE. The starter rule is untouched by this and stands
 * above the rank rule; every row here is started by the person. Rank answers for supervisor rows,
 * and the card answers for the secretary row.
 *
 * ---------------------------------------------------------------------------------------
 * THE MUTATION THAT TURNS THIS RED, WITH A CONTROL RUN FIRST
 * ---------------------------------------------------------------------------------------
 *
 *   change `mine.rung > theirs.rung` to `mine.rung >= theirs.rung` in `whoMayRetire`
 *   (src/server/lib/participants.ts) and the two supervisor refusals become 200.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'

import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'

let t: TestDb
let app: FastifyInstance
let secretaryCard: { name: string; whatEndsIt: string }

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
    payload: { because: 'measuring the rank rule' },
  })
  return { code: reply.statusCode, said: reply.body }
}

async function isRetired(handle: string): Promise<unknown> {
  const reply = await app.inject({ method: 'GET', url: `/api/participants/agent/${handle}`, headers: AS_THE_PERSON })
  return ((reply.json() as Record<string, unknown>)['participant'] as Record<string, unknown>)['retired']
}

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  const published = await app.inject({ method: 'GET', url: '/api/roles', headers: AS_THE_PERSON })
  expect(published.statusCode, published.body).toBe(200)
  secretaryCard = published.json().cards.find((card: { name: string }) => card.name === 'secretary')
  await register(AS_THE_PERSON, { handle: 'sup-one', name: 'Supervisor One', role: 'supervisor' })
  await register(AS_THE_PERSON, { handle: 'sup-two', name: 'Supervisor Two', role: 'supervisor' })
  await register(AS_THE_PERSON, { handle: 'sec-one', name: 'Secretary One', role: 'secretary' })
  await register(AS_THE_PERSON, { handle: 'sec-two', name: 'Secretary Two', role: 'secretary' })
})

afterAll(async () => {
  await app.close()
  t.close()
})

describe('a card retires strictly below itself', () => {
  it('refuses a supervisor another supervisor’s row, naming both rungs', async () => {
    const said = await retire(asAgent('sup-one'), 'sup-two')
    expect(said.code).toBe(403)
    expect(said.said, 'the rule in words').toContain('below its own rung')
    expect(said.said).toContain('supervisor card at rung 2')
    expect(said.said).toContain('Nothing was written')
    expect(await isRetired('sup-two'), 'nothing was written').toBe(false)
  })

  it('refuses a supervisor its own row', async () => {
    const said = await retire(asAgent('sup-one'), 'sup-one')
    expect(said.code).toBe(403)
    expect(await isRetired('sup-one'), 'nothing was written').toBe(false)
  })

  it('refuses a secretary another secretary’s row because its card keeps retirement for the person', async () => {
    const said = await retire(asAgent('sec-one'), 'sec-two')
    expect(said.code).toBe(403)
    expect(said.said).toContain(secretaryCard.name)
    expect(said.said).toContain(secretaryCard.whatEndsIt)
    expect(said.said).toContain('Nothing was written')
    expect(await isRetired('sec-two'), 'nothing was written').toBe(false)
  })
})
