// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A CITIZEN'S PAGE DRAWS THE ROLE CARD IT HOLDS, AND THE CARD'S DESCRIPTION — CRITERION P71.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS ASKED FOR
 * ---------------------------------------------------------------------------------------
 *
 * P71: pressing into a citizen from the Embassy should show that role card and its description in the
 * Card section.
 *
 * WHAT WAS THERE BEFORE. The Card section held one line — Which card it holds: worker — and the
 * press that gives another. The word was the whole of it: no picture, no duties, nothing saying what
 * a worker is. A reader who did not already know the cards learnt nothing by pressing in.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS MEASURED
 * ---------------------------------------------------------------------------------------
 *
 *   · the profile reply carries the card itself — its name, its duties, its picture and its rung —
 *     read off the declaration and not off the row;
 *   · the picture is the CARD'S, from the card's own set, and is the same address the Role cards
 *     page draws for that card, so one card is one picture at both ends of the two-way lookup;
 *   · the duties are the declaration's own words, character for character;
 *   · an agent nobody gave a card to is drawn the worker card, and the page still says the word was
 *     nobody's choice — the reading is drawn, and it is still marked as a reading;
 *   · a row naming a card the declaration no longer holds says the card is gone rather than drawing
 *     an empty one;
 *   · the page draws the card beside the press that gives another, so P64's press is not lost.
 *
 * WHAT CHANGED ON 1 OCTOBER 2026, BY ANSWER 4 OF A DECISION: the card's duties and How it works left the
 * agent's page for the Role cards page. The page draws the card's name and picture
 * and a row that opens the Role cards page. So the drawing case that asked for the duties under
 * Duties now asks that they are NOT drawn and that the row to the Role cards page is; the reply
 * still carries the duties, and the reply cases still check them. The order case finds the card by
 * its picture rather than by the word Duties. Proved on 1 October 2026: the duties and the word
 * Duties put back into TheCardItself in TheirCard.tsx turn that case red ("the duties are not drawn
 * here"); the runs are in wave 13k round 19's proofs file.
 *
 * ---------------------------------------------------------------------------------------
 * THE MUTATIONS THAT TURN THIS RED, WITH A CONTROL RUN FIRST
 * ---------------------------------------------------------------------------------------
 *
 *   make `theCardDrawn` in src/server/api/participants.ts return null always → the reply cases and
 *     every drawing case go red.
 *   drop `<TheCardItself …/>` from src/web/components/TheirCard.tsx → the six drawing cases go red.
 *   read the card by `written` instead of `readAs` in `theCardTheyHold` → the case for an agent with
 *     no card goes red.
 *   put `<RetireThisAgent/>` back above `<TheirCard/>` in ProfilePage.tsx → the order case goes red on
 *     "the card comes first, because that is what a citizen is", expected 4190 to be greater than
 *     5158. Measured 7 September 2026.
 *
 * THE FLOW CASE ADDED FOR F11-F13 (design/flows/ACCEPTANCE.md), same proof. Control run green on
 * both new and old cases. Mutation: in `theCardDrawn` in src/server/api/participants.ts, change
 * `flow: card.flow ?? null` to `flow: null` → "says the flow in the declaration's own words,
 * character for character" goes red, expected the worker card's F13 text and got null. Reverted,
 * green again. Measured 11 September 2026.
 */

import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'

import { THE_TEST_OFFICES_SECRETARY } from './a-page-of-a-test-office.ts'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { PROFILE_WORDS, type TheCardDrawn } from '../src/shared/profile.ts'
import { theFirstPortraitOf } from '../src/shared/portraits.ts'

type ProfileModule = typeof import('../src/web/pages/ProfilePage.tsx')

let t: TestDb
let app: FastifyInstance
let pp: ProfileModule

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

async function profileOf(handle: string): Promise<Record<string, unknown>> {
  const reply = await app.inject({
    method: 'GET',
    url: `/api/participants/agent/${handle}/profile`,
    headers: AS_THE_PERSON,
  })
  expect(reply.statusCode, reply.body).toBe(200)
  return reply.json() as Record<string, unknown>
}

/** The card the reply carries, or a failure naming what came back instead. */
function cardIn(said: Record<string, unknown>): TheCardDrawn {
  const held = said['theCardTheyHold'] as Record<string, unknown> | null
  expect(held, 'an agent page carries the card panel').not.toBeNull()
  const card = (held as Record<string, unknown>)['card']
  expect(card, 'the reply carries the card itself').not.toBeNull()
  return card as TheCardDrawn
}


/** The profile page's own half, drawn with what the server actually said. */
function drawnProfile(said: Record<string, unknown>): string {
  return renderToStaticMarkup(
    h(pp.TheProfile, { said, onChanged: () => {} } as unknown as Parameters<ProfileModule['TheProfile']>[0]),
  )
}

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  await register(AS_THE_PERSON, { handle: THE_TEST_OFFICES_SECRETARY.handle, name: THE_TEST_OFFICES_SECRETARY.name, role: 'secretary' })
  await register(asAgent(THE_TEST_OFFICES_SECRETARY.handle), { handle: 'builder-one', name: 'Builder One', role: 'worker' })
  // AN AGENT NOBODY GAVE A CARD TO. `role` left out is the registration that writes no card at all,
  // which is the row every refusal reads as the worker card.
  await register(asAgent(THE_TEST_OFFICES_SECRETARY.handle), { handle: 'builder-two', name: 'Builder Two' })

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
})

afterAll(async () => {
  await app.close()
  t.close()
})

// ============================================================ 1. what the reply carries

describe('the profile reply', () => {
  it('carries the card itself: its name, its duties, its picture and its rung', async () => {
    const card = cardIn(await profileOf('builder-one'))
    expect(card.name).toBe('worker')
    expect(card.duties.length, 'the duties are the card\'s description').toBeGreaterThan(20)
    expect(card.portrait).toBe(theFirstPortraitOf('worker'))
    expect(card.rung, 'the worker card is the first rung of the tree').toBe(1)
  })



  it('draws the card of a secretary from the secretary’s own set', async () => {
    const card = cardIn(await profileOf(THE_TEST_OFFICES_SECRETARY.handle))
    expect(card.name).toBe('secretary')
    expect(card.portrait).toBe(theFirstPortraitOf('secretary'))
    expect(card.portrait, 'not the worker picture').not.toBe(theFirstPortraitOf('worker'))
  })

  /**
   * WHAT THIS MEASURED UNTIL 8 SEPTEMBER 2026. It read `role` NULL on a row nobody carded, which is
   * what criterion P65 wrote. Criterion P75 writes the worker card instead and marks it as the
   * rule's, so what says "nobody chose this" is the mark rather than the absence. `builder-two` is
   * registered through the started-agents door in this file, so it now carries both.
   */
  it('gives an agent nobody carded the worker card, and says the rule chose it', async () => {
    const said = await profileOf('builder-two')
    const held = said['theCardTheyHold'] as Record<string, unknown>
    expect(held['role'], 'the card is written rather than left absent').toBe('worker')
    expect(held['chosenBy'], 'and the mark says nobody chose it').toEqual({ how: 'the-rule', who: null })
    expect(cardIn(said).name, 'the card drawn is the one every refusal reads the row as').toBe('worker')
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

// ============================================================ 2. what the page draws

describe('the citizen’s page', () => {
  it('draws the card’s name and its picture, and a row to the Role cards page instead of its duties', async () => {
    const said = await profileOf('builder-one')
    const card = cardIn(said)
    const drawn = drawnProfile(said)
    expect(drawn, 'the picture, from the card’s own set').toContain(card.portrait)
    // THE DECISION'S ANSWER 4: the duties and How it works are on the Role cards page now.
    expect(drawn, 'the duties are not drawn here').not.toContain(card.duties.split('.')[0])
    expect(drawn).not.toContain(PROFILE_WORDS.cardDuties)
    expect(drawn, 'the row that opens the Role cards page').toContain('Its duties and how it works, on the Role cards page')
    expect(drawn).toContain('href="#/roles"')
  })

  it('draws the card beside the press that gives another, not instead of it', async () => {
    const drawn = drawnProfile(await profileOf('builder-one'))
    expect(drawn, 'criterion P64’s press stays').toContain(PROFILE_WORDS.appoint)
    expect(drawn).toContain(PROFILE_WORDS.whichCard)
  })

  /**
   * WHAT THE HANDBACK PICTURE FOUND on 7 September 2026: the press that closes an agent opened this
   * page, above the card, so the first thing said about a citizen was a press to close it. Nobody
   * has to close a row, and the sixth rule weighs a thing by whether somebody must act on it.
   */
  it('draws the card above the press that closes the row, which nobody has to press', async () => {
    const drawn = drawnProfile(await profileOf('builder-one'))
    const card = drawn.indexOf('class="tc-card-portrait"')
    const trips = drawn.indexOf(PROFILE_WORDS.visits)
    const closes = drawn.indexOf(PROFILE_WORDS.retire)
    expect(card, 'the card is drawn').toBeGreaterThan(-1)
    expect(closes, 'and so is the press').toBeGreaterThan(-1)
    expect(closes, 'the card comes first, because that is what a citizen is').toBeGreaterThan(card)
    expect(closes, 'and the press is last, below even the trips').toBeGreaterThan(trips)
  })

  it('draws the worker card on an agent nobody carded, and the mark saying nobody chose it', async () => {
    // Plan 7FEOshq3mBGG keeps the stored chooser's provenance in developer mode.
    const mode = await import('../src/web/lib/mode.ts')
    mode.setMode('inspect')
    const drawn = drawnProfile(await profileOf('builder-two'))
    mode.setMode('normal')
    expect(drawn, 'the card is drawn').toContain(theFirstPortraitOf('worker'))
    // AND THE SENTENCE SAYING NOBODY CHOSE IT. It was `PROFILE_WORDS.cardReadAs` until 8 September
    // 2026, which was drawn because the row held no word at all; criterion P75 writes the word and
    // the mark, so the page says who chose it instead of saying what the absence is read as.
    expect(drawn, 'and the page says nobody chose it').toContain('nobody chose this card')
  })

  it('draws the secretary’s own card on the secretary', async () => {
    // THE CARD'S OWN PICTURE ELEMENT, and not merely the address. An agent that chose no picture of
    // its own already shows its card's first portrait as its FACE at the top of this page (criterion
    // M75), so an assertion on the address alone would pass with the card panel deleted — measured
    // on 7 September 2026, when it did exactly that under the mutation that removes the card.
    const drawn = drawnProfile(await profileOf(THE_TEST_OFFICES_SECRETARY.handle))
    // ITS SMALL COPY, which is what the page draws; a press opens the whole picture (wave 13x round 11).
    expect(drawn).toContain(`class="tc-card-portrait" src="${theFirstPortraitOf('secretary')}?size=small"`)
    expect(drawn).toContain('The secretary card')
  })

  it('says the card is gone where the declaration holds none by that name', async () => {
    // THE ONE THAT HAS HAPPENED: the investigator rung left the tree, and a row written while it existed
    // still names it. The reply is built from the word on the row, so a row carrying that word is
    // exactly this case.
    const said = await profileOf('builder-one')
    const held = said['theCardTheyHold'] as Record<string, unknown>
    const gone = { ...said, theCardTheyHold: { ...held, role: 'investigator', readAs: 'investigator', card: null } }
    const drawn = drawnProfile(gone)
    expect(drawn).toContain(PROFILE_WORDS.cardNotDeclared)
  })

  it('draws nothing of the card on a person, whose own card is the panel beside it', async () => {
    const reply = await app.inject({
      method: 'GET',
      url: `/api/participants/person/${THE_PERSON}/profile`,
      headers: AS_THE_PERSON,
    })
    const drawn = drawnProfile(reply.json() as Record<string, unknown>)
    expect(drawn).not.toContain(PROFILE_WORDS.cardDuties)
    expect(drawn).not.toContain('class="tc-card-portrait"')
  })
})
