// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A ROLE CARD IS A BLOCK, THE SHIPPED ONES ARE MARKED AS DEFAULTS, AND A NEW ONE IS ADDED HERE.
 *
 * Criteria P48, P49, P50 and P51 of design/permissions/ACCEPTANCE.md section 9:
 *
 *   A role card is laid out as blocks, not as text, with a large portrait, a story, and its powers
 *   and duties. The shipped cards are the defaults. A new card is added on the same page: a black mole
 *   with a large question mark or plus, its other parts empty until it is opened.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS MEASURED, AND THE ONE MEASUREMENT THAT DECIDES WHAT A CARD MADE HERE IS WORTH
 * ---------------------------------------------------------------------------------------
 *
 *   · P48 — a card is drawn as a block: a picture, the story, both permission lines and the rung;
 *   · P49 — every shipped card carries the mark saying it is a Mole Office default;
 *   · P50 — the add block draws a mole in black with a plus in it, has nothing else filled in, and
 *     is a press;
 *   · P51 — a card written in the product is stored, comes back, and is drawn like a default one.
 *
 * AND THE MEASUREMENT THE CRITERION ASKS FOR BY NAME: does the enforcement read a stored card? It
 * does NOT, and this file proves it rather than asserting it — a card called `chronicler` is stored
 * as the product's own door stored it, and `POST /api/agents/started` with `role: "chronicler"` is
 * then REFUSED, naming the five roles the declaration holds. That is why each such card carries the
 * server's one line saying nothing enforces it.
 *
 * ---------------------------------------------------------------------------------------
 * P51'S DOOR IS SWITCHED OFF. Wave 13r round 5, item 1: a decision of the owner's, and the secretary's
 * AWhlI0gV62Ep and t9qYGYdZcolq.
 * ---------------------------------------------------------------------------------------
 *
 * THE OLD WORDING, P51: "A new card is filled in on its own page and kept. Name, story, duties and
 * permissions, and portraits are written on the card's page and stored. The defaults stay in
 * roles.json; a card made in the product is stored in the database and drawn like a default one."
 * The door's note said: "Write a role card somebody defined in Mole Office itself, criterion P51. …
 * IT GRANTS NOTHING".
 *
 * THE NEW WORDING: POST /api/roles/cards refuses every write, 410, with "Role cards are no longer
 * written here. Add an office role on the Role cards page, where it takes effect at once. Nothing
 * was written." It writes nothing. The cards stay and are drawn as before under their heading, each
 * carrying the short state "Nothing enforces this card." The old form (TheForm in
 * src/web/pages/RoleCardNewPage.tsx) and its call (api.writeARoleCard) are gone.
 *
 * UNTIL NOVEMBER 2026 the page drew a sentence above those cards, "Role cards are no longer written
 * here. Add an office role above; it takes effect at once.", and each card's line went on "because
 * the old door wrote it. To make a role Mole Office enforces, add it above as an office role." Both
 * were taken off the page with the explanations, as decided: the add block above the cards is where
 * a role is added.
 *
 * WHY THE DOOR AND THE PAGE DO NOT SAY THE SAME WORDS. The door's caller is not on the page, so the
 * door names the page to go to and adds "Nothing was written." GET /api/roles answers each old
 * card's note in the door's own words for the same reason, so the card on the page is held to the
 * page's words key here, and the door's sentence is held in
 * tests/the-role-cards-page-draws-the-cards-the-old-door-wrote.test.ts.
 * WHY the change at all: such a card took effect nowhere, and an office role added on the Role cards
 * page takes effect at once. The first answer had the sentence point to
 * Settings, because the secretary's recommendation assumed added cards lived there. They do not, so the secretary
 * corrected it to the Role cards page, the name the reader sees in the sidebar and on the page.
 *
 * ---------------------------------------------------------------------------------------
 * THE MUTATIONS THAT TURN THIS RED, WITH A CONTROL RUN FIRST
 * ---------------------------------------------------------------------------------------
 *
 *   make `Block` in RolesPage.tsx draw only the name and the story again → the block cases go red.
 *   drop the `mark` line from `Block` → the defaults case goes red.
 *   make `AddBlock` render nothing → the add-block cases go red.
 *   make `cardsMadeIn` in src/server/api/roles.ts return [] → the stored-card cases go red.
 *   let POST /api/roles/cards write again → the door's case goes red.
 *   draw the door's sentence on the page → the heading case goes red.
 */

import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { WRITTEN_AT } from './a-role-card-the-old-door-wrote.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { sayInEnglish } from '../src/shared/i18n.ts'
import { powerNamesOn } from '../src/shared/roles.ts'
import type { RoleCard, WhatTheRolesSay } from '../src/shared/roles.ts'

type RolesModule = typeof import('../src/web/pages/RolesPage.tsx')

let t: TestDb
let app: FastifyInstance
let rp: RolesModule

const AS_THE_PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}
const AS_AN_AGENT = { ...AS_THE_PERSON, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': 'builder-pa' }

/**
 * A card written the way the page writes one: the eight parts, nothing enforced.
 *
 * IT CHANGED WITH CRITERIA P56 AND P57. It used to carry `whatItIsFor`, a `may` list, a `mayNot`
 * list and `saidButNotChecked`; the card has none of those now. What it carries instead is `duties`
 * and its powers — this one stands on no step of the tree, so it names its own, which is the shape
 * the form writes for the option that holds nothing.
 */
const A_CARD_OF_THEIR_OWN = {
  name: 'chronicler',
  rung: null,
  duties: 'It writes down what happened, and it changes nothing.',
  powers: ['Reading everything'],
  appointedBy: 'the person',
  appoints: 'nobody',
  mustRead: { chapters: [{ chapter: 10, level: 'full' }], andWhatItsStarterNames: null },
  reportsTo: 'The person.',
  whatEndsIt: 'Only the person retires it.',
}

async function theRoles(): Promise<WhatTheRolesSay> {
  const reply = await app.inject({ method: 'GET', url: '/api/roles', headers: AS_THE_PERSON })
  expect(reply.statusCode, reply.body).toBe(200)
  return reply.json() as WhatTheRolesSay
}

/** The same escaping React gives a text node: duties that hold an apostrophe (a starter's decision)
    reach the markup as &#x27;, so a declaration's words are looked for as React writes them. */
function escaped(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#x27;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/** The page's own half, drawn with what the server actually said. */
function drawn(said: WhatTheRolesSay, portraits: Record<string, { set: string; of: string; name: string; address: string }[]> | null): string {
  return renderToStaticMarkup(
    h(rp.TheCards, { said, portraits } as Parameters<RolesModule['TheCards']>[0]),
  )
}

beforeAll(async () => {
  t = await freshDb()
  const built = await apiApp()
  app = built.app
  await app.ready()
  // The runner's environment is `node` and this project has ruled out jsdom, so a window stand-in is
  // installed before the module is imported, exactly as tests/shell-nav.test.ts does it.
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
  rp = (await import('../src/web/pages/RolesPage.tsx')) as RolesModule
})

afterAll(async () => {
  await app.close()
  t.close()
})

// ============================================================ P48: a block, not a run of lines

describe('a role card on the page', () => {
  it('is a block carrying a picture, the duties, the powers as names and the rung', async () => {
    const said = await theRoles()
    const html = drawn(said, {
      worker: [{ set: 'role', of: 'worker', name: 'worker-1', address: '/api/portraits/role/worker/worker-1' }],
    })
    // The block itself, and the picture in it: its small copy, which a press opens whole
    // (tests/a-portrait-is-drawn-from-a-small-copy.test.ts).
    expect(html).toContain('class="rol-block"')
    expect(html).toContain('class="rol-portrait" src="/api/portraits/role/worker/worker-1?size=small"')
    // The duties, in the declaration's own words.
    const worker = said.cards.find((one) => one.name === 'worker')
    expect(worker, 'the declaration holds no worker card').toBeDefined()
    expect(html).toContain(escaped(String(worker?.duties)))
    expect(html).toContain(rp.ROLES_WORDS.powers)
    expect(html).toContain(`${rp.ROLES_WORDS.rung} 1`)
    // AND THE POWERS LINE REALLY CARRIES THE NAMES, rather than a heading over nothing. Criterion
    // P56: names and no acts, so there is no May or May-not list on a block any more.
    const held = powerNamesOn(said, worker as RoleCard)
    expect(held.length, 'the worker card holds no power').toBeGreaterThan(0)
    for (const one of held) expect(html).toContain(one)
  })

  it('says nobody has painted one where a role has no picture, rather than drawing none quietly', async () => {
    const html = drawn(await theRoles(), {})
    expect(html).toContain(rp.ROLES_WORDS.noPortrait)
  })
})

// ============================================================ P49: the shipped ones are defaults

describe('the cards Mole Office ships with', () => {
  it('are each marked as a default, one mark per card', async () => {
    const said = await theRoles()
    const html = drawn(said, null)
    const marks = html.split(rp.ROLES_WORDS.aDefault).length - 1
    expect(marks, 'a card was drawn without the mark saying where it came from').toBe(
      said.cards.length + said.personCards.length,
    )
  })
})

// ============================================================ P50: the add block

describe('the block that makes a card', () => {
  it('draws a mole in black with a plus in the middle, and nothing else is filled in', async () => {
    const html = drawn(await theRoles(), null)
    expect(html).toContain('class="rol-block rol-add"')
    // The picture is drawn in the page rather than fetched, so the shape itself is in the markup.
    expect(html).toContain('<svg')
    expect(html).toContain('A mole in black with a large plus')
    // NOTHING IS FILLED IN. The block carries its own name and the press, and no story and no act.
    expect(html).toContain(rp.ROLES_WORDS.addName)
    expect(html).toContain(rp.ROLES_WORDS.addPress)
  })

  it('is a press and not a link, because pressing into the block is what was asked for', async () => {
    const html = drawn(await theRoles(), null)
    expect(html).toContain('class="rol-add-press"')
  })
})

// ============================================================ P51: a card written here, which the door no longer does

/** What the door says to every write, whole. The page does not draw these words: its caller is on the page. */
const THE_DOOR_SAYS =
  'Role cards are no longer written here. Add an office role on the Role cards page, where it takes effect at once. Nothing was written.'

/** Every role card in the database, and every change row, so a refusal that wrote anything is seen. */
function stored(): { cards: number; changes: number } {
  const count = (sql: string) => (t.client.sqlite.prepare(sql).get() as { n: number }).n
  return { cards: count("SELECT COUNT(*) AS n FROM records WHERE kind = 'role_card'"), changes: count('SELECT COUNT(*) AS n FROM changes') }
}

describe('a card written in the product before its door was switched off', () => {
  it('is kept, comes back on its own list, and is drawn like a default one', async () => {
    // AS THE DOOR STORED IT. No door writes one any more, so the test writes the record the old door wrote.
    t.api.createRecord({
      kind: 'role_card',
      title: 'The chronicler role card',
      summary: A_CARD_OF_THEIR_OWN.duties,
      data: { roleName: 'chronicler', card: A_CARD_OF_THEIR_OWN, madeHere: true, madeAt: WRITTEN_AT, portrait: '/api/portraits/role/worker/worker-2' },
      workspaceId: 'default',
      actor: { type: 'agent', id: 'builder-pa' },
    })

    const said = await theRoles()
    const held = said.madeHere.find((one) => one.role === 'chronicler')
    expect(held, 'the card written here did not come back').toBeDefined()
    expect(held?.card.duties).toBe(A_CARD_OF_THEIR_OWN.duties)
    expect(held?.portrait).toBe('/api/portraits/role/worker/worker-2')

    const html = drawn(said, null)
    expect(html).toContain('chronicler')
    expect(html).toContain(rp.ROLES_WORDS.written)
    // AND THE ONE LINE SAYING NOTHING ENFORCES IT, on the card itself, in the page's own words.
    expect(html).toContain(sayInEnglish('addedRoles.notEnforced'))
  })

  it('is not read by the enforcement, and this is the measurement rather than the claim', async () => {
    // The card is stored — the case above wrote it — so if anything enforced a stored card, an agent
    // could be registered under its name. It cannot.
    const refused = await app.inject({
      method: 'POST',
      url: '/api/agents/started',
      headers: AS_THE_PERSON,
      payload: { handle: 'a-chronicler', name: 'A chronicler', role: 'chronicler' },
    })
    expect(refused.statusCode, refused.body).toBe(400)
    expect(refused.body).toContain('worker')
    expect(refused.body).toContain('supervisor')
  })

  it("is drawn under its heading, and the page never draws the door's sentence", async () => {
    const html = drawn(await theRoles(), null)
    const heading = html.indexOf(rp.ROLES_WORDS.madeHere)
    const firstCard = html.indexOf('chronicler', heading)
    expect(heading, 'the list of cards written here has no heading').toBeGreaterThan(-1)
    expect(firstCard, 'the card written here is not under its heading').toBeGreaterThan(heading)
    // Nobody pressed anything here, so nothing was refused.
    expect(html).not.toContain(THE_DOOR_SAYS)
  })
})

describe('the door that wrote them', () => {
  it('refuses every write with one sentence, from an agent and from the person, and writes nothing', async () => {
    const bodies = [
      { card: { ...A_CARD_OF_THEIR_OWN, name: 'archivist' } },
      { card: { ...A_CARD_OF_THEIR_OWN, name: 'archivist' }, portrait: '/api/portraits/role/worker/worker-2' },
      { card: { ...A_CARD_OF_THEIR_OWN, name: 'worker' } },
      { card: {} },
      {},
    ]
    for (const headers of [AS_AN_AGENT, AS_THE_PERSON]) {
      for (const payload of bodies) {
        const before = stored()
        const no = await app.inject({ method: 'POST', url: '/api/roles/cards', headers, payload })
        expect(no.statusCode, no.body).toBe(410)
        expect((no.json() as { error: string }).error).toBe(THE_DOOR_SAYS)
        expect(stored(), `a refused write left something behind: ${JSON.stringify(payload)}`).toEqual(before)
      }
    }
    expect((await theRoles()).madeHere.map((one) => one.role)).toEqual(['chronicler'])
  })

  it('has no form left that writes through it, and no call', async () => {
    const page = await import('../src/web/pages/RoleCardNewPage.tsx')
    expect(Object.keys(page)).not.toContain('TheForm')
    const { api } = await import('../src/web/api.ts')
    expect(Object.keys(api)).not.toContain('writeARoleCard')
  })
})
