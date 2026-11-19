// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A ROLE CARD LISTS THE HANDBOOKS HUNG ON IT, ON THE ROLE CARDS PAGE.
 *
 * A handbook record (src/shared/handbooks.ts) may hang on a role card, and one in use is sent to an agent that takes the
 * card. The Role cards page, #/roles, says which handbooks hang on each card, so a person can see them where the card is.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS FILE MEASURES, THROUGH THE REAL DOORS, in a test office. Every record and text here is made up.
 * ---------------------------------------------------------------------------------------
 *
 *   a. GET /api/roles answers `handbooks`: by card word, every live handbook hung on the card, in any state, in the
 *      order they were filed, each with its state and the languages it is written in. One hung on two cards is under
 *      both. A deleted one is not listed, and a card none hangs on is not a key.
 *   b. The page draws, under the How it works of each agent card that has some, one line naming each handbook, linking
 *      to its page, with its state and its languages, or that it holds no text. A card with none is drawn exactly as it
 *      is with no `handbooks` key at all.
 *
 * The words are read from where the page builds them: the state words through `handbookStateKey`
 * (src/web/pages/HandbookPage.tsx), the language names from LANGUAGES, and the words of a text it lacks from the English
 * word list by key.
 *
 * ---------------------------------------------------------------------------------------
 * THE MUTATIONS THAT TURN THIS RED, WITH A CONTROL RUN FIRST
 * ---------------------------------------------------------------------------------------
 *
 *   1. src/server/api/roles.ts, GET /roles: answer no `handbooks` → a and b's first case red.
 *   2. src/server/lib/handbooks.ts, `theHandbooksOnTheCards`: keep only the ones in use → a and b's first case red.
 *   3. src/server/lib/handbooks.ts, `theHandbooksOnTheCards`: put each one under the first card it hangs on only → a
 *      and b's first case red.
 *   4. src/web/pages/RolesPage.tsx, `TheCards`: hand no card its handbooks → b's first case red.
 *   5. src/web/components/TheHandbooksOnACard.tsx: draw the line for a card with none → b's second case red.
 *   6. src/web/components/TheHandbooksOnACard.tsx: leave out the state → b's first case red.
 */

import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'

import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { LANGUAGES, WORD_LISTS, createI18n, type Language } from '../src/shared/i18n.ts'
import type { HandbookState } from '../src/shared/handbooks.ts'

type RolesModule = typeof import('../src/web/pages/RolesPage.tsx')
type HandbookPageModule = typeof import('../src/web/pages/HandbookPage.tsx')
type RouterModule = typeof import('../src/web/components/router.tsx')

let t: TestDb
let app: FastifyInstance
let rp: RolesModule
let hp: HandbookPageModule
let router: RouterModule

const AS_THE_PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

/** One handbook as the answer lists it. */
interface Listed {
  id: string
  title: string
  state: HandbookState | null
  languages: Language[]
}

/** File a handbook as the person, who needs no warrant to hang one on a card, and answer it as the answer lists it. */
async function aHandbook(title: string, state: HandbookState, text: Partial<Record<Language, string>>, cards: string[]): Promise<Listed> {
  const languages = Object.keys(text).sort() as Language[]
  const reply = await app.inject({
    method: 'POST',
    url: '/api/records',
    headers: AS_THE_PERSON,
    payload: {
      kind: 'handbook',
      title,
      data: {
        for: 'The made-up agent of this test.',
        state,
        hangs_on: cards.map((card) => ({ card })),
        // ONE WITH NO TEXT LEAVES THE TEXT OUT, and so has no change record.
        ...(languages.length === 0
          ? {}
          : {
              text: Object.fromEntries(Object.entries(text).map(([language, opening]) => [language, { opening }])),
              text_changes: [{ languages, why: 'MADE-UP: the first text.' }],
            }),
      },
    },
  })
  expect(reply.statusCode, reply.body).toBe(201)
  return { id: (reply.json() as { record: { id: string } }).record.id, title, state, languages }
}

/** GET /api/roles as the person. */
async function theRoles(): Promise<Record<string, unknown>> {
  const reply = await app.inject({ method: 'GET', url: '/api/roles', headers: AS_THE_PERSON })
  expect(reply.statusCode, reply.body).toBe(200)
  return reply.json() as Record<string, unknown>
}

/** The agent cards' blocks the page draws from an answer, by card word, in the order the answer lists the cards. */
function theBlocks(said: Record<string, unknown>): Map<string, string> {
  const drawn = renderToStaticMarkup(h(rp.TheCards, { said, portraits: null } as unknown as Parameters<RolesModule['TheCards']>[0]))
  const cards = (said['cards'] as { name: string }[]).map((card) => card.name)
  // THE AGENT CARDS' BLOCKS COME FIRST, in the answer's order; the person cards' blocks follow them.
  const blocks = drawn.split('<li class="rol-block">').slice(1)
  expect(blocks.length, 'the page drew fewer blocks than the answer has agent cards').toBeGreaterThanOrEqual(cards.length)
  return new Map(cards.map((card, i) => [card, blocks[i]!]))
}

/** The text of some markup, with its tags taken off and its characters read back. */
const textOf = (markup: string): string =>
  markup
    .replace(/<[^>]+>/g, '')
    .replaceAll('&quot;', '"')
    .replaceAll('&#x27;', "'")
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&amp;', '&')

let onTheWorker: Listed
let onBoth: Listed
let retired: Listed
let withNoText: Listed

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  // THE PAGES AFTER THE SERVER, because `freshDb` resets the modules.
  rp = await import('../src/web/pages/RolesPage.tsx')
  hp = await import('../src/web/pages/HandbookPage.tsx')
  router = await import('../src/web/components/router.tsx')
  onTheWorker = await aHandbook('MADE-UP handbook A on the worker card', 'in use', { en: 'MADE-UP opening.', zh: '虚构的开头。' }, ['worker'])
  onBoth = await aHandbook('MADE-UP handbook B on the worker and supervisor cards', 'draft', { en: 'MADE-UP draft opening.' }, ['worker', 'supervisor'])
  retired = await aHandbook('MADE-UP handbook C on the supervisor card', 'retired', { zh: '虚构的停用开头。' }, ['supervisor'])
  const gone = await aHandbook('MADE-UP handbook D on the worker card', 'in use', { en: 'MADE-UP deleted opening.' }, ['worker'])
  // A REQUEST WITH NO BODY SAYS NO CONTENT TYPE, because a JSON content type with an empty body is refused.
  const { 'content-type': _type, ...withoutABody } = AS_THE_PERSON
  expect((await app.inject({ method: 'DELETE', url: `/api/records/${gone.id}`, headers: withoutABody })).statusCode).toBe(200)
  withNoText = await aHandbook('MADE-UP handbook E on the worker card', 'in use', {}, ['worker'])
}, 60_000)

afterAll(async () => {
  await app.close()
  t.close()
})

describe('a. GET /api/roles lists every live handbook on each card', () => {
  it('names each one under every card it hangs on, in any state, with its languages, and no card none hangs on', async () => {
    const said = await theRoles()
    expect(said['handbooks']).toEqual({
      worker: [onTheWorker, onBoth, withNoText],
      supervisor: [onBoth, retired],
    })
  })
})

describe('b. the Role cards page draws them under each agent card’s How it works', () => {
  it('draws one line on a card with handbooks, naming each with its link, its state and its languages', async () => {
    const blocks = theBlocks(await theRoles())
    const en = createI18n('en').t
    // THE WORDS OF A TEXT IT LACKS ARE READ BY KEY, so the key, and not a copy of its words, is what this file holds.
    const noText: unknown = Reflect.get(WORD_LISTS.en, 'handbookPage.onACard.noText')
    expect(typeof noText, 'the English word list has no handbookPage.onACard.noText').toBe('string')
    for (const [card, listed] of [
      ['worker', [onTheWorker, onBoth, withNoText]],
      ['supervisor', [onBoth, retired]],
    ] as const) {
      const block = blocks.get(card)
      expect(block, `the page drew no block for the ${card} card`).toBeDefined()
      const lines = block!.split('data-handbooks-on-the-card=""').slice(1)
      expect(lines, `the ${card} card has other than one handbooks line`).toHaveLength(1)
      const line = lines[0]!.slice(0, lines[0]!.indexOf('</p>'))
      const items = line.split('class="rol-handbook"').slice(1)
      expect(items, `the ${card} card's line names other than its handbooks`).toHaveLength(listed.length)
      listed.forEach((one, i) => {
        const item = items[i]!
        expect(item, `${one.title}: its link`).toContain(`href="#${router.handbookPath(one.id)}"`)
        // THE TITLE IS TAKEN OUT before the facts are looked for, so a title cannot stand in for them.
        const text = textOf(`<span ${item}`)
        expect(text, `${one.title}: its title`).toContain(one.title)
        const facts = text.replace(one.title, '')
        expect(facts, `${one.title}: its state`).toContain(en(hp.handbookStateKey(one.state)))
        const languages = one.languages.length === 0 ? String(noText) : one.languages.map((language) => LANGUAGES[language]).join(', ')
        expect(facts, `${one.title}: its languages`).toContain(languages)
      })
      // UNDER HOW IT WORKS: the line follows the card's How it works in the block.
      expect(block!.indexOf('rol-how'), `the ${card} card's block has no How it works`).toBeGreaterThan(-1)
      expect(block!.indexOf('data-handbooks-on-the-card'), `the ${card} card's line is above its How it works`).toBeGreaterThan(block!.indexOf('rol-how'))
    }
  })

  it('draws a card with none exactly as an answer with no handbooks key draws it', async () => {
    const said = await theRoles()
    const handbooks = said['handbooks'] as Record<string, unknown> | undefined
    const { handbooks: _left, ...withNoKey } = said
    const now = theBlocks(said)
    const before = theBlocks(withNoKey)
    const none = [...now.keys()].filter((card) => handbooks?.[card] === undefined)
    expect(none.length, 'every agent card has a handbook here, so no card with none is drawn').toBeGreaterThan(0)
    for (const card of none) {
      expect(now.get(card), `the ${card} card, which has none, draws a handbooks line`).not.toContain('data-handbooks-on-the-card')
      expect(now.get(card), `the ${card} card, which has none, is drawn other than with no handbooks key`).toBe(before.get(card))
    }
  })
})
