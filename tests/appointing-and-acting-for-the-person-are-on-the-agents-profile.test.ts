// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * APPOINTING A ROLE AND LETTING A SECRETARY ACT FOR THE PERSON ARE ON THE AGENT'S PROFILE — CRITERION P64.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THE PERSON MET
 * ---------------------------------------------------------------------------------------
 *
 * Appointing a secretary does not belong on the role cards page; those describe. Appointing a role,
 * and choosing for how long, belong on the role profile reached from the Embassy — and pressing into
 * that profile today changes nothing.
 *
 * Both were true. The elevation press was on the Role cards page, and there was no door at all for
 * giving an agent a card: its role was written once at registration and could then only be changed
 * by patching the agent record by hand.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS MEASURED, BOTH DIRECTIONS
 * ---------------------------------------------------------------------------------------
 *
 *   · the door exists, writes the card on the agent's own record, and the registry row follows;
 *   · it is the person's, and an agent's only by its own rank and with its own key: a claim to be
 *     an agent that carries no key is refused and nothing is written. A suite proving only that the
 *     press works would pass with the door wide open. The refusal names the act and whose it is, and
 *     gives no name of the person. What each rank may give is measured in
 *     an-agent-gives-a-card-by-its-own-rank.test.ts;
 *   · a word no agent card holds is refused with the words that are cards;
 *   · the profile reply carries the card, what else it could be given, and — only on the card the
 *     declaration lets act for the person — the elevation rule and whatever it holds;
 *   · the profile page draws both presses, and the Role cards page draws neither while keeping the
 *     declaration's description of what acting for the person is.
 *
 * ---------------------------------------------------------------------------------------
 * THE MUTATIONS THAT TURN THIS RED, WITH A CONTROL RUN FIRST
 * ---------------------------------------------------------------------------------------
 *
 *   let `theAgentGivingByItsRank` in src/server/api/roles.ts take a claim with no key as the agent
 *     it names → the refusal case goes red. (Until 23 October 2026 the door refused every caller but
 *     the person, and the mutation was to delete that refusal.)
 *   drop `<TheirCard …/>` from ProfilePage.tsx → the four drawing cases go red.
 *   put the press (`thePress`) back on the Role cards page → the case that says that page appoints nobody goes
 *     red.
 *   make `theCardTheyHold` fill `elevation` in for every card → the case that says a worker is
 *     offered no elevation goes red.
 *   write the person's name into the refusal of POST /api/roles/card/:handle → the refusal case
 *     goes red, at the line that says it gives no name.
 *   write the act in that refusal as the owner's own and not the person's → the refusal case goes
 *     red, at the line that names the act and whose it is.
 */

import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'

import { apiApp, freshDb, thePersonsKeyHeader, type TestDb } from './helpers.ts'
import { THE_TEST_OFFICES_SECRETARY } from './a-page-of-a-test-office.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { PROFILE_WORDS } from '../src/shared/profile.ts'
import { END_IT } from '../src/shared/elevation.ts'
import { thePress } from '../src/shared/the-press.ts'
import type { WhatTheRolesSay } from '../src/shared/roles.ts'

type ProfileModule = typeof import('../src/web/pages/ProfilePage.tsx')
type RolesModule = typeof import('../src/web/pages/RolesPage.tsx')

let t: TestDb
let app: FastifyInstance
let pp: ProfileModule
let rp: RolesModule

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

async function register(headers: Record<string, string>, body: Record<string, unknown>): Promise<number> {
  const reply = await app.inject({ method: 'POST', url: '/api/agents/started', headers, payload: body })
  expect(reply.statusCode, reply.body).toBe(201)
  return reply.statusCode
}

async function profileOf(handle: string): Promise<Record<string, unknown>> {
  const reply = await app.inject({
    method: 'GET',
    url: `/api/participants/agent/${handle}/profile`,
    headers: AS_THE_PERSON,
  })
  expect(reply.statusCode, reply.body).toBe(200)
  return reply.json() as Record<string, unknown>
}

async function theRoles(): Promise<WhatTheRolesSay> {
  const reply = await app.inject({ method: 'GET', url: '/api/roles', headers: AS_THE_PERSON })
  expect(reply.statusCode, reply.body).toBe(200)
  return reply.json() as WhatTheRolesSay
}

async function giveACard(
  headers: Record<string, string>,
  handle: string,
  role: string,
): Promise<{ code: number; said: string }> {
  const reply = await app.inject({
    method: 'POST',
    url: `/api/roles/card/${handle}`,
    headers,
    payload: { role },
  })
  return { code: reply.statusCode, said: reply.body }
}

/** The profile page's own half, drawn with what the server actually said. */
function drawnProfile(said: Record<string, unknown>): string {
  return renderToStaticMarkup(
    h(pp.TheProfile, { said, onChanged: () => {} } as unknown as Parameters<ProfileModule['TheProfile']>[0]),
  )
}

/** The Role cards page's own half, drawn with what the server actually said. */
function drawnCards(said: WhatTheRolesSay): string {
  return renderToStaticMarkup(h(rp.TheCards, { said, portraits: null }))
}

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  await register(AS_THE_PERSON, { handle: THE_TEST_OFFICES_SECRETARY.handle, name: THE_TEST_OFFICES_SECRETARY.name, role: 'secretary' })
  await register(asAgent(THE_TEST_OFFICES_SECRETARY.handle), { handle: 'builder-one', name: 'Builder One', role: 'worker' })

  const store = new Map<string, string>()
  const storage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  }
  ;(globalThis as unknown as { window: unknown }).window = {
    localStorage: storage,
    sessionStorage: storage,
    location: { hash: '', search: '' },
    addEventListener: () => {},
    removeEventListener: () => {},
  }
  storage.setItem('mole-office.actor', JSON.stringify({ type: 'human', id: THE_PERSON }))
  pp = (await import('../src/web/pages/ProfilePage.tsx')) as ProfileModule
  rp = (await import('../src/web/pages/RolesPage.tsx')) as RolesModule
})

afterAll(async () => {
  await app.close()
  t.close()
})

// ============================================================ 1. the door that gives a card

describe('giving an agent a card', () => {
  it('writes the card, and the registry row follows the record', async () => {
    const said = await giveACard(AS_THE_PERSON, 'builder-one', 'supervisor')
    expect(said.code, said.said).toBe(201)
    const back = (await profileOf('builder-one'))['participant'] as Record<string, unknown>
    expect(back['role'], 'the registry row a refusal reads, not only the record').toBe('supervisor')
    // AND BACK, so the rest of the suite reads the agent as the worker it was registered as.
    expect((await giveACard(AS_THE_PERSON, 'builder-one', 'worker')).code).toBe(201)
  })

  it('refuses a claim to be an agent that carries no key, and writes nothing', async () => {
    const said = await giveACard(asAgent(THE_TEST_OFFICES_SECRETARY.handle), 'builder-one', 'secretary')
    expect(said.code).toBe(403)
    expect(said.said, 'the sentence names the act and whose it is').toContain("Giving an agent a role card is the person's act, and an agent's own act within its rank.")
    expect(said.said, 'and gives no name of the person').not.toContain(THE_PERSON)
    expect(said.said).toContain('Nothing was written')
    const back = (await profileOf('builder-one'))['participant'] as Record<string, unknown>
    expect(back['role'], 'the agent still holds what it held').toBe('worker')
  })

  it('refuses a word no agent card holds, with the words that are cards', async () => {
    const said = await giveACard(AS_THE_PERSON, 'builder-one', 'administrator')
    expect(said.code).toBe(400)
    expect(said.said, 'the word it was asked for').toContain('administrator')
    expect(said.said, 'and the cards an agent may hold').toContain('supervisor')
  })

  it('refuses a handle nothing is registered as', async () => {
    const said = await giveACard(AS_THE_PERSON, 'nobody-at-all', 'worker')
    expect(said.code).toBe(404)
    expect(said.said).toContain('nobody-at-all')
  })
})

// ============================================================ 2. what the profile reply carries

describe('the profile reply', () => {
  it('carries the card an agent holds and the cards it could be given', async () => {
    const card = (await profileOf('builder-one'))['theCardTheyHold'] as Record<string, unknown>
    expect(card['role']).toBe('worker')
    expect(card['cardsOnOffer'], 'the agent list, from the declaration').toContain('secretary')
    expect(card['cardsOnOffer'], 'and never a card only a person holds').not.toContain('administrator')
  })

  it('offers the elevation only on the card the declaration lets act for the person', async () => {
    const secretary = (await profileOf(THE_TEST_OFFICES_SECRETARY.handle))['theCardTheyHold'] as Record<string, unknown>
    const worker = (await profileOf('builder-one'))['theCardTheyHold'] as Record<string, unknown>
    expect(secretary['elevation'], 'the secretary card can hold one').not.toBeNull()
    expect(worker['elevation'], 'and the worker card cannot').toBeNull()
  })

  it('says nobody is acting for the person until they press, and says so after', async () => {
    const before = (await profileOf(THE_TEST_OFFICES_SECRETARY.handle))['theCardTheyHold'] as { elevation: { holding: unknown } }
    expect(before.elevation.holding).toBeNull()
    const press = await app.inject({
      method: 'POST',
      url: `/api/roles/elevation/${THE_TEST_OFFICES_SECRETARY.handle}`,
      headers: { ...AS_THE_PERSON, ...thePersonsKeyHeader() },
      payload: { reason: 'a test raises it', endsWhen: 'when you say' },
    })
    expect(press.statusCode, press.body).toBe(201)
    const after = (await profileOf(THE_TEST_OFFICES_SECRETARY.handle))['theCardTheyHold'] as {
      elevation: { holding: { agent: string; untilInWords: string } | null }
    }
    expect(after.elevation.holding?.agent).toBe(THE_TEST_OFFICES_SECRETARY.handle)
    expect(after.elevation.holding?.untilInWords, 'the end in the server’s own words').toBe('you say so')
  })

  it('says nothing about a card on a person, who is appointed by nobody', async () => {
    const reply = await app.inject({
      method: 'GET',
      url: `/api/participants/person/${THE_PERSON}/profile`,
      headers: AS_THE_PERSON,
    })
    expect(reply.statusCode, reply.body).toBe(200)
    expect((reply.json() as Record<string, unknown>)['theCardTheyHold']).toBeNull()
  })
})

// ============================================================ 3. where the presses are drawn

describe('the agent’s profile page', () => {
  it('draws the card it holds and the press that gives it another', async () => {
    const drawn = drawnProfile(await profileOf('builder-one'))
    expect(drawn).toContain(PROFILE_WORDS.whichCard)
    expect(drawn).toContain(PROFILE_WORDS.appoint)
  })

  it('draws the press that lets a secretary act for the person, on the secretary', async () => {
    // THE GRANT MADE ABOVE IS STILL HELD, so what is drawn is the standing and the press that ends
    // it. Both are the half of this panel a card page never carried.
    const drawn = drawnProfile(await profileOf(THE_TEST_OFFICES_SECRETARY.handle))
    expect(drawn).toContain(END_IT)
  })

  it('draws no elevation on an agent whose card cannot hold one', async () => {
    const drawn = drawnProfile(await profileOf('builder-one'))
    expect(drawn).not.toContain(thePress('Builder One'))
    expect(drawn).not.toContain(END_IT)
  })

  it('draws nothing of either on a person, whose own card is the panel beside it', async () => {
    const reply = await app.inject({
      method: 'GET',
      url: `/api/participants/person/${THE_PERSON}/profile`,
      headers: AS_THE_PERSON,
    })
    const drawn = drawnProfile(reply.json() as Record<string, unknown>)
    expect(drawn).not.toContain(PROFILE_WORDS.whichCard)
  })
})

// ============================================================ 4. the Role cards page appoints nobody

describe('the Role cards page', () => {
  it('carries neither press', async () => {
    const drawn = drawnCards(await theRoles())
    expect(drawn, 'the person’s words: role cards只是描述介绍').not.toContain(thePress(THE_TEST_OFFICES_SECRETARY.name))
    expect(drawn).not.toContain(END_IT)
  })

  it('keeps the declaration’s own description of what acting for the person is', async () => {
    const said = await theRoles()
    const drawn = drawnCards(said)
    // THE FIRST SENTENCE OF IT, because the whole paragraph carries an apostrophe the renderer
    // escapes; the sentence is enough to fail if the description were dropped with the press.
    const first = said.elevation.rule.whatItIs.en.split('.')[0] ?? ''
    expect(first.length, 'the declaration says what it is').toBeGreaterThan(20)
    expect(drawn).toContain(first)
  })
})
