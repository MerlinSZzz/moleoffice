// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A PERSON HOLDS A ROLE CARD TOO, AND EVERY CITIZEN HOLDS ONE.
 *
 * Criteria P45, P46 and P47 of design/permissions/ACCEPTANCE.md section 8: a person holds a role card
 * too, which says what they do and that they manage Mole Office; anybody else's reads by default as
 * their name and "manager of the Office"; every citizen already there gets a card; and the Mole role
 * card has a portrait.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS MEASURED
 * ---------------------------------------------------------------------------------------
 *
 * The declaration holds a second list and nothing reads across it: a person's role is never one an
 * agent can be registered as. A person's row says which card they hold, what they do and which
 * portrait is on it, and each of the three has a different rule about who may write it. And a card
 * a row is already read as may be written down by anybody, because writing down what the product
 * already believes changes nothing — which is the whole of the one-off act criterion P46 asks for.
 */

import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import {
  A_PERSON_WITH_NO_ROLE_READS_AS,
  isAPersonRole,
  isARole,
  theStandingLineFor,
  type RolesDeclaration,
} from '../src/shared/roles.ts'
import { theFirstPortraitOf } from '../src/shared/portraits.ts'

let t: TestDb
let app: FastifyInstance

const AS_THE_PERSON = { 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON }
const AS_AN_AGENT = { 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': 'a-builder' }

async function get(url: string, headers = AS_THE_PERSON): Promise<Record<string, unknown>> {
  const reply = await app.inject({ method: 'GET', url, headers })
  expect(reply.statusCode, reply.body).toBe(200)
  return reply.json() as Record<string, unknown>
}

async function patchThePerson(
  body: Record<string, unknown>,
  headers: Record<string, string>,
): Promise<{ code: number; said: string }> {
  const reply = await app.inject({
    method: 'PATCH',
    url: `/api/participants/person/${THE_PERSON}`,
    headers,
    payload: body,
  })
  return { code: reply.statusCode, said: reply.body }
}

/** The person's own row, as the wire carries it. */
async function thePerson(): Promise<Record<string, unknown>> {
  const said = await get(`/api/participants/person/${THE_PERSON}`)
  return said['participant'] as Record<string, unknown>
}

beforeAll(async () => {
  t = await freshDb()
  const built = await apiApp()
  app = built.app
  await app.ready()
  // THE AGENT THE WRITES BELOW COME FROM. A caller no registry holds is refused before any rule
  // about cards is reached, which is an older rule and a different sentence.
  await app.inject({
    method: 'POST',
    url: '/api/records',
    headers: AS_THE_PERSON,
    payload: { kind: 'agent', title: 'A Builder', data: { handle: 'a-builder', state: 'active', role: 'worker' } },
  })
}, 60_000)

afterAll(async () => {
  await app.close()
  t.close()
})

describe('the declaration holds the cards a person holds, in a list of their own', () => {
  it('serves them, and they are not roles an agent can be registered as', async () => {
    const said = await get('/api/roles')
    const cards = said['personCards'] as { name: string; standing: string }[]
    expect(cards.map((one) => one.name)).toEqual(['administrator'])
    expect(cards[0]?.standing).toBe('administrator of Mole Office')
    // NOTHING READS ACROSS THE TWO LISTS, which is the point of their being two.
    const decl = { cards: said['cards'], personCards: said['personCards'] } as unknown as RolesDeclaration
    expect(isARole(decl, 'administrator'), 'a person role is offered to an agent').toBe(false)
    expect(isAPersonRole(decl, 'worker'), 'an agent role is offered to a person').toBe(false)
    expect(isAPersonRole(decl, 'administrator')).toBe(true)
  })

  it('refuses to give an agent a role a person holds, and names the roles it may have', async () => {
    const reply = await app.inject({
      method: 'POST',
      url: '/api/agents/started',
      headers: AS_THE_PERSON,
      payload: { handle: 'not-an-administrator', name: 'Nobody', role: 'administrator' },
    })
    expect(reply.statusCode).toBe(400)
    expect(reply.body).toContain('worker')
  })

  it('copies the person card into the project like any other, so it can be read here', async () => {
    const done = await app.inject({ method: 'POST', url: '/api/roles/mirror', headers: AS_THE_PERSON })
    expect(done.statusCode).toBe(200)
    expect((done.json() as { written: string[] }).written).toContain('administrator')
    const said = await get('/api/roles')
    const copy = (said['mirror'] as { role: string; record: string | null; heldBy: string }[]).find(
      (one) => one.role === 'administrator',
    )
    expect(copy?.heldBy).toBe('person')
    expect(copy?.record).not.toBeNull()
    // AND IT CARRIES THE FIRST OF ITS THREE PORTRAITS, criterion P47.
    const record = t.api.getRecord(String(copy?.record))
    expect(record?.data['portrait']).toBe(theFirstPortraitOf('administrator'))
  })
})

describe('a person says which card they hold, what they do, and which portrait is on it', () => {
  it('starts with no card written, and is read as the administrator', async () => {
    const held = await thePerson()
    expect(held['role'], 'somebody has already written a card, so the default is not what is measured').toBeNull()
    expect(held['roleReadAs']).toBe(A_PERSON_WITH_NO_ROLE_READS_AS)
    expect(held['roleSays']).toBe('no role set')
    // AND THE STANDING LINE IS BUILT FROM THE CARD, in the one place that builds it.
    const said = await get('/api/roles')
    const card = (said['personCards'] as { name: string; standing: string }[])[0]
    expect(held['standing']).toBe(theStandingLineFor(String(held['name']), card as never))
    expect(held['occupation']).toBeNull()
    expect(held['portrait']).toBeNull()
  })

  it('lets an agent write down the card the row is already read as, because that changes nothing', async () => {
    // Criterion P46's one-off act. Every refusal, gate and screen already reads a row with no card
    // as the administrator; writing that word makes the row say what the product already believes.
    const done = await patchThePerson({ role: A_PERSON_WITH_NO_ROLE_READS_AS }, AS_AN_AGENT)
    expect(done.code, done.said).toBe(200)
    const held = await thePerson()
    expect(held['role']).toBe('administrator')
    expect(held['roleSays']).toBeNull()
  })

  it('refuses an agent moving somebody from one card to another', async () => {
    const done = await patchThePerson({ role: 'worker' }, AS_AN_AGENT)
    expect(done.code).toBe(403)
    expect(done.said).toContain('already holds the administrator card')
  })

  it('lets a person write their own occupation, which nothing checks', async () => {
    // The occupation is what the person does; the card says where the person stands.
    const done = await patchThePerson({ occupation: 'robotics engineer' }, AS_THE_PERSON)
    expect(done.code, done.said).toBe(200)
    expect((await thePerson())['occupation']).toBe('robotics engineer')
    // And an empty word puts the row back to nobody having written one, rather than to an empty job.
    await patchThePerson({ occupation: '' }, AS_THE_PERSON)
    expect((await thePerson())['occupation']).toBeNull()
    await patchThePerson({ occupation: 'robotics engineer' }, AS_THE_PERSON)
  })

  it('lets a person choose a portrait, and refuses one this product does not serve', async () => {
    // The owner's own is a picture they keep on this machine: data/portraits/custom/owner/, never committed.
    const chose = await patchThePerson({ portrait: `/api/portraits/custom/${THE_TEST_OFFICES_OWNER.id}/${THE_TEST_OFFICES_OWNER.id}-2` }, AS_THE_PERSON)
    expect(chose.code, chose.said).toBe(200)
    expect((await thePerson())['portrait']).toBe(`/api/portraits/custom/${THE_TEST_OFFICES_OWNER.id}/${THE_TEST_OFFICES_OWNER.id}-2`)

    const elsewhere = await patchThePerson({ portrait: 'https://example.invalid/a.png' }, AS_THE_PERSON)
    expect(elsewhere.code).toBe(400)
    expect(elsewhere.said).toContain('/api/portraits/')
    // And the refused write left the chosen one exactly as it was.
    expect((await thePerson())['portrait']).toBe(`/api/portraits/custom/${THE_TEST_OFFICES_OWNER.id}/${THE_TEST_OFFICES_OWNER.id}-2`)
  })

  it('refuses an agent writing what is on somebody else\'s card', async () => {
    const done = await patchThePerson({ occupation: 'whatever an agent says' }, AS_AN_AGENT)
    expect(done.code).toBe(403)
    expect(done.said).toContain('theirs to write')
  })
})

describe('the embassy says which card each citizen holds and draws it', () => {
  it('carries the card and the portrait on every citizen row', async () => {
    const said = await get('/api/office/embassy')
    const rows = said['rows'] as { who: { kind: string; id: string }; role: string | null; portrait: string | null; chosePortrait: boolean }[]
    const mine = rows.find((one) => one.who.kind === 'person' && one.who.id === THE_PERSON)
    expect(mine, 'the person is not on the roll').toBeDefined()
    expect(mine?.role).toBe('administrator')
    // THEIR OWN, because they chose one above. `chosePortrait` is what keeps a default from reading as
    // a choice, and this row is the choice.
    expect(mine?.portrait).toBe(`/api/portraits/custom/${THE_TEST_OFFICES_OWNER.id}/${THE_TEST_OFFICES_OWNER.id}-2`)
    expect(mine?.chosePortrait).toBe(true)
  })

  it('gives a citizen who has chosen nothing the first of their card\'s three', async () => {
    await app.inject({
      method: 'POST',
      url: '/api/agents/started',
      headers: AS_THE_PERSON,
      payload: { handle: 'a-fresh-worker', name: 'A Fresh Worker', role: 'worker' },
    })
    const said = await get('/api/office/embassy')
    const rows = said['rows'] as { who: { kind: string }; name: string | null; role: string | null; portrait: string | null; chosePortrait: boolean }[]
    const theirs = rows.find((one) => one.name === 'A Fresh Worker')
    expect(theirs, 'the agent that was just registered is not on the roll').toBeDefined()
    expect(theirs?.role).toBe('worker')
    expect(theirs?.portrait).toBe(theFirstPortraitOf('worker'))
    expect(theirs?.chosePortrait, 'a default is being reported as a choice').toBe(false)
  })
})
