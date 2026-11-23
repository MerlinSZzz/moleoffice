// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE OFFICE'S OWN SENDER ROW IS DRAWN APART, AS THE OFFICE ITSELF, WITH NO CARD.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT WAS WRONG
 * ---------------------------------------------------------------------------------------
 *
 * The office writes its own messages from a row in the agent registry: reminders, notices, and the
 * results of checks and merges. That row holds no card word, and every reader of an empty card reads
 * it as the worker card. So the Embassy drew the office as one more worker among the agents, and
 * the count of who holds each card counted it as a worker that nobody chose.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS MEASURED, ON A FRESH OFFICE
 * ---------------------------------------------------------------------------------------
 *
 *   · the Embassy's rows hold no row for the office's own registry row;
 *   · the Embassy's reply names the office apart, with its name, and carries no card for it;
 *   · the count of who holds each card names the office's row under no card;
 *   · the office's own page is given no card, so it draws no card and no press to give one;
 *   · the page draws the office in its own section, with its name, and with no card word on it.
 *     The page draws its rows from the reply's rows alone, so the first case is what keeps the
 *     office out of the agents' section. Before, the section also drew a sentence on what the office
 *     sends; the page draws no explanation of a row now, as decided.
 *
 * The office's row is found with `moleOffice()`, the reader every screen that draws a message asks,
 * and never by a handle written here. It is imported inside the setup, after `freshDb`.
 *
 * ---------------------------------------------------------------------------------------
 * THE MUTATIONS THAT TURN THIS RED, WITH A CONTROL RUN FIRST
 * ---------------------------------------------------------------------------------------
 *
 *   drop the `officeTest` skip from the citizens loop in `theEmbassy` → the rows case goes red;
 *     answer no rows at all → it goes red at the read.
 *   name another row as the reply's `office` → the apart case goes red at the row; give it no name →
 *     red at the name; give it a `role` → red at the card.
 *   drop the `officeTest` skip from `whoHoldsTheCards` → the count case goes red; answer no cards at
 *     all → it goes red at the read.
 *   give the office's own page its card again → the profile case goes red; answer the page with no
 *     card field at all → it goes red at the read.
 *   give the office's section another group → the page case goes red at the section; drop the
 *     name from it → red at the name; draw the card key and word in it → red at the card.
 */

import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import type { ParticipantRef } from '../src/shared/participants.ts'
import type { ProfileFacts } from '../src/shared/profile.ts'
import type { WhoHoldsTheCards } from '../src/shared/roles.ts'
import type { WhatTheEmbassySays } from '../src/shared/worlds.ts'

type EmbassyModule = typeof import('../src/web/pages/EmbassyPage.tsx')

let t: TestDb
let app: FastifyInstance
let ep: EmbassyModule
/** The office's own registry row, read from the office's own reader once the database is up. */
let office: ParticipantRef

const AS_THE_PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

async function ask<T>(url: string): Promise<T> {
  const reply = await app.inject({ method: 'GET', url, headers: AS_THE_PERSON })
  expect(reply.statusCode, reply.body).toBe(200)
  return reply.json() as T
}

/** One section of the drawn page, by the group it declares. Empty when the page draws none. */
function section(html: string, group: string): string {
  const start = html.indexOf(`data-group="${group}"`)
  if (start === -1) return ''
  const end = html.indexOf('</section>', start)
  return html.slice(start, end === -1 ? undefined : end)
}

beforeAll(async () => {
  t = await freshDb()
  const built = await apiApp()
  app = built.app
  await app.ready()
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
  ep = (await import('../src/web/pages/EmbassyPage.tsx')) as EmbassyModule
  office = (await import('../src/shared/participants.ts')).moleOffice()
})

afterAll(async () => {
  await app.close()
  t.close()
})

describe("the office's own row on the Embassy", () => {
  it('is not one of the rows', async () => {
    const said = await ask<WhatTheEmbassySays>('/api/office/embassy')
    expect(said.rows.length, 'the reply was read').toBeGreaterThan(0)
    const drawnAsARow = said.rows.filter((one) => one.who.kind === office.kind && one.who.id === office.id)
    expect(drawnAsARow, 'the office is drawn as a row').toEqual([])
  })

  it('is named apart, with its name and no card', async () => {
    const said = await ask<WhatTheEmbassySays>('/api/office/embassy')
    expect(said.office.who, 'the office is named apart').toEqual(office)
    expect(said.office.name, 'with its name').toEqual(expect.any(String))
    expect(said.office, 'and with no card').not.toHaveProperty('role')
  })
})

describe('the count of who holds each card', () => {
  it("names the office's own row under no card", async () => {
    const said = await ask<WhoHoldsTheCards>('/api/roles/who-holds-them')
    const every = [...said.cards, ...said.cardsNoLongerDeclared]
    expect(every.length, 'the count was read').toBeGreaterThan(0)
    const holding = every.filter((one) => one.holders.some((holder) => holder.kind === office.kind && holder.id === office.id))
    expect(holding.map((one) => one.card), 'a card the office is counted under').toEqual([])
  })
})

describe("the office's own page", () => {
  it('is given no card', async () => {
    const said = await ask<ProfileFacts>(`/api/participants/${office.kind}/${encodeURIComponent(office.id)}/profile`)
    expect(said, 'the page was read').toHaveProperty('theCardTheyHold')
    expect(said.theCardTheyHold, 'the card the office is given').toBeNull()
  })
})

describe('the Embassy page', () => {
  it('draws the office in its own section, by its name, with no card', async () => {
    const said = await ask<WhatTheEmbassySays>('/api/office/embassy')
    const html = renderToStaticMarkup(h(ep.TheEmbassy, { said }))
    const itself = section(html, 'office')
    expect(itself, 'the office has a section of its own').not.toBe('')
    expect(itself, 'the section names the office').toContain(`>${String(said.office.name)}</a>`)
    expect(itself, 'the section draws no card').not.toContain(`>${ep.EMBASSY_WORDS.card}<`)
  })
})
