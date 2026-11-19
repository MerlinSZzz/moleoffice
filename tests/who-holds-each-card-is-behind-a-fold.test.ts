// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHO HOLDS EACH CARD, BEHIND A FOLD THAT IS SHUT — CRITERION P72.
 *
 * ---------------------------------------------------------------------------------------
 * THE DESIGN
 * ---------------------------------------------------------------------------------------
 *
 * Option a is good: it is a lookup both ways. A citizen's page shows that citizen's role, and the
 * role cards show the counts in detail, but the way to the counts is folded shut and opens on a
 * press, into a page with a bar chart for each role and each role's citizen list below it.
 *
 * Three things at once: the numbers exist, the way to them is folded shut, and the page they open is
 * a bar chart with each card's citizens under it.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS MEASURED
 * ---------------------------------------------------------------------------------------
 *
 *   · the count is two numbers, `holds` and `chose`, and a row nobody wrote a card on is counted
 *     under the card every refusal reads it as, marked as read rather than chosen;
 *   · a declared card nobody holds is still in the answer, with nought;
 *   · a retired row is counted nowhere;
 *   · a word no declaration holds comes back apart, not folded into a declared card;
 *   · the statistics page draws a bar per card and, under it, each card's citizens by name, each one
 *     a link to that citizen's own page;
 *   · the Role cards page carries the way in, and NOTHING on that page is open: every fold on it is
 *     shut, which is the half of the owner's sentence a chart drawn inline would break.
 *
 * ---------------------------------------------------------------------------------------
 * THE MUTATIONS THAT TURN THIS RED, WITH A CONTROL RUN FIRST
 * ---------------------------------------------------------------------------------------
 *
 *   drop `if (one.retired) continue` from `whoHoldsTheCards` → the retired case goes red.
 *   count `chose` as `holders.length` → the two-numbers case goes red.
 *   pass `open` to the `Explain` on the block in RolesPage.tsx → the folded-shut case goes red.
 *   drop the `Explain` from the block → the way-in case goes red.
 *   draw the holders without `RouteLink` → the link case goes red.
 */

import { THE_TEST_OFFICES_SECRETARY } from './a-page-of-a-test-office.ts'
import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'

import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { ROLE_CENSUS_SEGMENT, type CardHolders, type WhoHoldsTheCards } from '../src/shared/roles.ts'

type CensusModule = typeof import('../src/web/pages/RoleCensusPage.tsx')
type RolesModule = typeof import('../src/web/pages/RolesPage.tsx')

let t: TestDb
let app: FastifyInstance
let cp: CensusModule
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

async function register(headers: Record<string, string>, body: Record<string, unknown>): Promise<void> {
  const reply = await app.inject({ method: 'POST', url: '/api/agents/started', headers, payload: body })
  expect(reply.statusCode, reply.body).toBe(201)
}

async function census(): Promise<WhoHoldsTheCards> {
  const reply = await app.inject({ method: 'GET', url: '/api/roles/who-holds-them', headers: AS_THE_PERSON })
  expect(reply.statusCode, reply.body).toBe(200)
  return reply.json() as WhoHoldsTheCards
}

/** One card's entry, or a failure naming the cards that came back instead. */
function cardIn(said: WhoHoldsTheCards, name: string): CardHolders {
  const one = said.cards.find((each) => each.card === name)
  expect(one, `the answer holds the ${name} card, and holds ${said.cards.map((e) => e.card).join(', ')}`).toBeDefined()
  return one as CardHolders
}

/** The statistics page's own half, drawn with what the server actually said. */
function drawnCensus(said: WhoHoldsTheCards): string {
  return renderToStaticMarkup(h(cp.TheCensus, { said }))
}

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  await register(AS_THE_PERSON, { handle: THE_TEST_OFFICES_SECRETARY.handle, name: THE_TEST_OFFICES_SECRETARY.name, role: 'secretary' })
  await register(asAgent(THE_TEST_OFFICES_SECRETARY.handle), { handle: 'builder-one', name: 'Builder One', role: 'worker' })
  await register(asAgent(THE_TEST_OFFICES_SECRETARY.handle), { handle: 'builder-two', name: 'Builder Two', role: 'worker' })
  // A ROW NOBODY WROTE A CARD ON. Every refusal reads it as the worker card, so the census must too.
  await register(asAgent(THE_TEST_OFFICES_SECRETARY.handle), { handle: 'builder-three', name: 'Builder Three' })
  // AND A ROW WITH NO CARD WORD AT ALL, which is how an agent registered without naming a card before
  // 8 September 2026 still stands. An agent record written with no card is the one way a row gets
  // none now.
  t.api.createRecord({
    workspaceId: 'default',
    kind: 'agent',
    title: 'Builder Four',
    data: { handle: 'builder-four', runtime: 'claude-code', state: 'active' },
    actor: { type: 'human', id: THE_PERSON },
  })

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
  cp = (await import('../src/web/pages/RoleCensusPage.tsx')) as CensusModule
  rp = (await import('../src/web/pages/RolesPage.tsx')) as RolesModule
})

afterAll(async () => {
  await app.close()
  t.close()
})

// ============================================================ 1. what is counted

describe('who holds each card', () => {
  it('counts what the card is read on, and how many of those chose it, apart', async () => {
    const worker = cardIn(await census(), 'worker')
    // FOUR: the two agents registered as workers, the one registered without naming a card, and the
    // older row that carries no card word. The office's own registry row is not one of them: it is
    // the office itself, it holds no card, and tests/the-office-itself-is-drawn-apart-with-no-card.test.ts
    // holds that it is counted under none.
    expect(worker.holds, 'two carded, one registered with none named, and one older row with no card word').toBe(4)
    // THREE HAVE THE WORD ON THE ROW SINCE 8 SEPTEMBER 2026, and it was two before. Criterion P75:
    // a registration that names no card now WRITES the worker card, with a mark saying the rule
    // chose it, so the agent registered without naming one carries the word as well. The older row
    // still carries none, which is what keeps `holds` and `chose` two different numbers.
    expect(worker.chose, 'and three of the four have the word written on the row').toBe(3)
    expect(worker.holds - worker.chose, 'the difference is exactly the rows nobody wrote a card on').toBe(
      worker.holders.filter((one) => one.readNotChosen).length,
    )
    // BUILDER THREE MOVED SIDES ON 8 SEPTEMBER 2026. It was registered without naming a card, so its
    // row held none and the census counted it as read-not-chosen. Criterion P75 writes the worker
    // card at its registration, so the word is on its row now. The older row is the one that is left:
    // it was written as a record with no card, and nothing chose one for it.
    expect(worker.holders.filter((one) => one.readNotChosen).map((one) => one.name)).toEqual(['Builder Four'])
    expect(worker.holders.filter((one) => !one.readNotChosen).map((one) => one.name)).toEqual([
      'Builder One',
      'Builder Three',
      'Builder Two',
    ])
  })

  it('names each holder with a picture and a way to its own page', async () => {
    const worker = cardIn(await census(), 'worker')
    expect(worker.holders.map((one) => one.name), 'name order').toEqual([
      'Builder Four',
      'Builder One',
      'Builder Three',
      'Builder Two',
    ])
    for (const one of worker.holders) {
      expect(one.kind, 'both halves of the address').toBe('agent')
      expect(one.id.length).toBeGreaterThan(0)
      expect(one.avatarUrl, 'a picture, never invented but never missing for an agent').not.toBeNull()
    }
  })

  it('keeps a declared card nobody holds in the answer, with nought', async () => {
    const said = await census()
    const inspector = cardIn(said, 'inspector')
    expect(inspector.holds, 'nobody was registered as an inspector here').toBe(0)
    expect(inspector.holders).toEqual([])
    expect(said.cards.map((one) => one.card), 'every declared card, agent cards first').toContain('supervisor')
  })

  it('counts a person under the person card list, which never crosses the agent one', async () => {
    const said = await census()
    const administrator = said.cards.find((one) => one.card === 'administrator')
    expect(administrator?.forWhom, 'a person card').toBe('person')
    expect(administrator?.holders.some((one) => one.kind === 'person'), 'and it holds a person').toBe(true)
    expect(cardIn(said, 'worker').forWhom).toBe('agent')
  })

  it('counts a retired row nowhere', async () => {
    const before = cardIn(await census(), 'worker').holds
    const row = await app.inject({
      method: 'GET',
      url: '/api/participants/agent/builder-two',
      headers: AS_THE_PERSON,
    })
    expect(row.statusCode).toBe(200)
    const record = ((row.json() as Record<string, unknown>)['participant'] as Record<string, unknown>)['record']
    expect(record, 'builder-two has an agent record to retire through').not.toBeNull()
    const retire = await app.inject({
      method: 'PATCH',
      url: `/api/records/${String(record)}`,
      headers: AS_THE_PERSON,
      // A MERGE AND NOT A WHOLE-OBJECT WRITE. Chapter 4's third rule, and the door said so: a `data`
      // here would empty handle, startedBy and role, and it is refused with those three named.
      payload: { dataPatch: { state: 'retired', retiredBecause: 'a test agent, closed' } },
    })
    expect(retire.statusCode, retire.body).toBe(200)
    const after = cardIn(await census(), 'worker')
    expect(after.holds, 'one fewer than before').toBe(before - 1)
    expect(after.holders.map((one) => one.name)).not.toContain('Builder Two')
  })

  it('keeps a word no declaration holds apart, rather than folding it into a declared card', async () => {
    const said = await census()
    // NO ROW NAMES ONE HERE, which is the ordinary answer and worth holding: a bug that swept
    // unknown words into the nearest card would show up as this list never being empty.
    expect(said.cardsNoLongerDeclared).toEqual([])
    expect(said.says, 'the sentence says what was counted').toContain('Retired rows are not counted')
  })
})

// ============================================================ 2. the statistics page

describe('the statistics page', () => {
  it('draws a bar for every card, with its count', async () => {
    const said = await census()
    const drawn = drawnCensus(said)
    for (const one of said.cards) expect(drawn, `a bar for ${one.card}`).toContain(`>${one.card}<`)
    expect(drawn).toContain(cp.CENSUS_WORDS.chart)
    expect(drawn, 'and the legend saying what the two parts of a bar are').toContain(cp.CENSUS_WORDS.legendRead)
  })

  it('lists each card’s citizens by name, each a link to its own page', async () => {
    const said = await census()
    const drawn = drawnCensus(said)
    expect(drawn).toContain(cp.CENSUS_WORDS.lists)
    const worker = cardIn(said, 'worker')
    for (const one of worker.holders) {
      expect(drawn, `${one.name} is named`).toContain(one.name)
      expect(drawn, `${one.name} is a way to its own page`).toContain(`/who/agent/${one.id}`)
    }
  })

  it('marks a citizen whose row names no card, rather than drawing it as a choice', async () => {
    const drawn = drawnCensus(await census())
    expect(drawn).toContain(cp.CENSUS_WORDS.readAs)
  })

  it('says a declared card nobody holds is held by nobody', async () => {
    const drawn = drawnCensus(await census())
    expect(drawn).toContain(cp.CENSUS_WORDS.nobody)
  })
})

// ============================================================ 3. the fold on the Role cards page

describe('the Role cards page', () => {
  async function drawnCards(): Promise<string> {
    const reply = await app.inject({ method: 'GET', url: '/api/roles', headers: AS_THE_PERSON })
    expect(reply.statusCode, reply.body).toBe(200)
    return renderToStaticMarkup(
      h(rp.TheCards, { said: reply.json(), portraits: null } as unknown as Parameters<RolesModule['TheCards']>[0]),
    )
  }

  it('carries the way in, and it goes to the statistics page', async () => {
    const drawn = await drawnCards()
    expect(drawn).toContain(rp.ROLES_WORDS.whoHolds)
    expect(drawn).toContain(`/roles/${ROLE_CENSUS_SEGMENT}`)
  })

  it('opens nothing on its own: every fold on the page is shut', async () => {
    // NOTHING OPENS ON ITS OWN. A fold that is open when the page arrives is what was ruled out,
    // and the way React draws one is the bare attribute, so this is what to look for.
    const drawn = await drawnCards()
    expect(drawn, 'a details element').toContain('<details')
    expect(drawn.match(/<details[^>]*\sopen/), 'and not one of them open').toBeNull()
  })

  it('draws no chart and no citizen list on the cards page itself', async () => {
    const drawn = await drawnCards()
    expect(drawn, 'the statistics are on their own page').not.toContain(cp.CENSUS_WORDS.chart)
    expect(drawn).not.toContain(cp.CENSUS_WORDS.lists)
  })
})
