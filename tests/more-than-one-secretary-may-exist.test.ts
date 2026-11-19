// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * MORE THAN ONE SECRETARY MAY EXIST — CRITERION P67.
 *
 * ---------------------------------------------------------------------------------------
 * THE RULE
 * ---------------------------------------------------------------------------------------
 *
 * The secretary is not unique: several secretaries may exist at once, and only the owner appoints
 * them.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT WAS ACTUALLY IN THE WAY, WHICH WAS NOT A REFUSAL
 * ---------------------------------------------------------------------------------------
 *
 * Nothing refused a second secretary: the tree says who APPOINTS one — the person — and never how
 * many there are. Two things said otherwise anyway. The card's first sentence read *It is the one
 * agent whose job is the person*, which is a card telling a reader something the rules do not
 * enforce. And the reply that says who is acting for the person answered with the FIRST of them, on the
 * reading that the product had one secretary — so a screen could say one agent held the person's acts while
 * another one also did, and nothing would have failed.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS MEASURED
 * ---------------------------------------------------------------------------------------
 *
 *   · the card no longer says there is one;
 *   · two agents may hold the secretary card at once, appointed by the person;
 *   · an agent still may not appoint one, which is the half of the rule that stays;
 *   · both may act for the person at once, each under its own grant with its own end, and the reply names
 *     both. That is the case that would have passed while the reply answered with the first;

 *
 * ---------------------------------------------------------------------------------------
 * THE MUTATIONS THAT TURN THIS RED, WITH A CONTROL RUN FIRST
 * ---------------------------------------------------------------------------------------
 *
 *   make `everybodyActingForYou` answer with the first grant only → two cases go red.
 *   put the sentence back on the secretary card in roles.json → the first case goes red.
 */

import { THE_TEST_OFFICES_SECRETARY } from './a-page-of-a-test-office.ts'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'

import { apiApp, freshDb, thePersonsKeyHeader, type TestDb } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { localStamp } from '../src/shared/time.ts'
import type { WhatTheRolesSay } from '../src/shared/roles.ts'

let t: TestDb
let app: FastifyInstance

/**
 * A TIME THIS RUN HAS NOT REACHED, in the stored form, worked out when the run starts.
 *
 * IT WAS THE STAMP THE OWNER PICKED — 2026-09-08 07:00:00, from their own test of the press on 7 September —
 * WRITTEN INTO THIS FILE. It passed for a day and went red at 07:00 on 8 September, on main, with
 * nothing in src/server/lib/elevation.ts or actingfor.ts changed: problem `EU-9VgOfmkA_`. An
 * elevation that ends at a time is compared to the clock on every request, which is the product
 * working, so a fixed stamp in a test is a test with an expiry date on it.
 *
 * `localStamp` is the product's own writer, so this is the same shape a person types into the box
 * and the same shape the reply hands back. A day is long enough that no run is near the edge of it,
 * and short enough that the value is plainly about this run rather than about a date somebody chose.
 */
const A_DAY = 24 * 60 * 60 * 1000
const ENDS_AFTER_THIS_RUN = localStamp(new Date(Date.now() + A_DAY))

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

async function post(headers: Record<string, string>, url: string, body: unknown): Promise<{ code: number; said: string }> {
  const reply = await app.inject({ method: 'POST', url, headers, payload: body as Record<string, unknown> })
  return { code: reply.statusCode, said: reply.body }
}

async function theRoles(): Promise<WhatTheRolesSay> {
  const reply = await app.inject({ method: 'GET', url: '/api/roles', headers: AS_THE_PERSON })
  expect(reply.statusCode, reply.body).toBe(200)
  return reply.json() as WhatTheRolesSay
}

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  expect((await post(AS_THE_PERSON, '/api/agents/started', { handle: THE_TEST_OFFICES_SECRETARY.handle, name: THE_TEST_OFFICES_SECRETARY.name, role: 'secretary' })).code).toBe(201)
  expect(
    (await post(AS_THE_PERSON, '/api/agents/started', { handle: 'ceres', name: 'Ceres', role: 'secretary' })).code,
    'the second is registered by the person, which is the only way one is appointed',
  ).toBe(201)
})

afterAll(async () => {
  await app.close()
  t.close()
})

describe('the card', () => {
  it('no longer says there is one agent whose job is the person', async () => {
    const said = await theRoles()
    const card = said.cards.find((one) => one.name === said.elevation.rule.onlyThisCardCanHoldIt)
    expect(card, 'the card that can act for the person').toBeDefined()
    expect(card?.duties, 'made-up text in place of the person’s words: secretary搬箱子')
      .not.toContain('the one agent whose job is the person')
  })
})

describe('two agents may hold the card', () => {
  it('and the office holds both', async () => {
    const said = await theRoles()
    expect(said.elevation.couldHoldIt).toContain(THE_TEST_OFFICES_SECRETARY.handle)
    expect(said.elevation.couldHoldIt).toContain('ceres')
  })

  it('and an agent still may not appoint one, which is the half of the rule that stays', async () => {
    const said = await post(asAgent(THE_TEST_OFFICES_SECRETARY.handle), '/api/agents/started', {
      handle: 'a-third',
      name: 'A Third',
      role: 'secretary',
    })
    expect(said.code).toBe(403)
    expect(said.said).toContain('Only the person appoints')
  })
})

describe('both may act for the person at once', () => {
  it('names both, each with its own end', async () => {
    expect((await post({ ...AS_THE_PERSON, ...thePersonsKeyHeader() }, `/api/roles/elevation/${THE_TEST_OFFICES_SECRETARY.handle}`, { reason: 'a test raises it', endsWhen: 'when you say' })).code).toBe(201)
    expect(
      (await post({ ...AS_THE_PERSON, ...thePersonsKeyHeader() }, '/api/roles/elevation/ceres', { reason: 'a test raises it', endsWhen: 'at a time', until: ENDS_AFTER_THIS_RUN }))
        .code,
    ).toBe(201)
    const said = await theRoles()
    const acting = said.elevation.holding.map((one) => one.agent).sort()
    expect(acting, 'both, and not the first of them').toEqual([THE_TEST_OFFICES_SECRETARY.handle, 'ceres'].sort())
    const ends = new Map(said.elevation.holding.map((one) => [one.agent, one.untilInWords]))
    expect(ends.get(THE_TEST_OFFICES_SECRETARY.handle)).toBe('you say so')
    expect(ends.get('ceres'), 'each grant keeps its own end').toBe(ENDS_AFTER_THIS_RUN)
  })

  it('goes on naming the other when the person ends one', async () => {
    // THE CASE A "FIRST OF THEM" READING GETS WRONG IN THE WORST DIRECTION. Ending the first grant
    // would have emptied the answer while the second agent still held the person's acts.
    const ended = await app.inject({ method: 'DELETE', url: `/api/roles/elevation/${THE_TEST_OFFICES_SECRETARY.handle}`, headers: AS_THE_PERSON })
    expect(ended.statusCode, ended.body).toBe(200)
    const said = await theRoles()
    expect(said.elevation.holding.map((one) => one.agent)).toEqual(['ceres'])
  })
})
