// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A CARD WITH NO PAGE IN THIS PROJECT SAYS SO IN THE READER'S WORDS — CRITERION P66.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THE OWNER MET, AND WHAT IT WAS MEASURED TO MEAN
 * ---------------------------------------------------------------------------------------
 *
 * There is a strange "not copied into this project yet".
 *
 * Measured on the owner's own corpus through GET /api/roles on the server they read: *5 of 5
 * cards have no current copy in this project: worker (not copied yet), supervisor (not copied yet),
 * secretary (not copied yet), inspector (not copied yet), administrator (not copied yet).* So the
 * line was on EVERY block, and nothing on the Role cards page opened a card at all.
 *
 * What it meant: no `role_card` record had ever been written in that project, which is what
 * `POST /api/roles/mirror` writes. The words named the mechanism — a copy — and chapter 6's fourth
 * rule is that a screen names the state. The state is that there is no page.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS MEASURED
 * ---------------------------------------------------------------------------------------
 *
 *   · the measurement itself, as a test: with nothing copied, every block says it and no block
 *     offers a way in. That is the condition the owner was looking at;
 *   · the block says the STATE, and the words the mechanism used are gone from the page;
 *   · the mark carries what makes a page and says the card's authority does not depend on one;
 *   · once the copies are written, the blocks open the cards and none of them says it any more. A
 *     suite proving only that the words changed would pass with the way in broken.
 *
 * ---------------------------------------------------------------------------------------
 * THE MUTATIONS THAT TURN THIS RED, WITH A CONTROL RUN FIRST
 * ---------------------------------------------------------------------------------------
 *
 *   put `notCopied: 'not copied into this project yet'` back and draw it → three cases go red.
 *   drop the `title` from the Absence → the case about what the mark carries goes red.
 */

import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'

import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import type { WhatTheRolesSay } from '../src/shared/roles.ts'

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

async function theRoles(): Promise<WhatTheRolesSay> {
  const reply = await app.inject({ method: 'GET', url: '/api/roles', headers: AS_THE_PERSON })
  expect(reply.statusCode, reply.body).toBe(200)
  return reply.json() as WhatTheRolesSay
}

function drawn(said: WhatTheRolesSay): string {
  return renderToStaticMarkup(h(rp.TheCards, { said, portraits: null }))
}

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
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
  rp = (await import('../src/web/pages/RolesPage.tsx')) as RolesModule
})

afterAll(async () => {
  await app.close()
  t.close()
})

describe('the state the person was looking at', () => {
  it('is every card at once, in a project where nobody has written the pages', async () => {
    const said = await theRoles()
    expect(said.mirror.length, 'every card of both lists').toBeGreaterThan(0)
    expect(
      said.mirror.every((one) => one.record === null),
      'this is the condition the person met: not one card has a page here',
    ).toBe(true)
  })

  it('says there is no page, and never names the copy that would make one', async () => {
    const html = drawn(await theRoles())
    expect(html).toContain('px-absent')
    expect(html).toContain('—')
    expect(html, 'the words the person called strange are gone from the page').not.toContain('not copied into this project')
  })

  it('carries what makes a page, and that the card allows the same either way', async () => {
    const html = drawn(await theRoles())
    // THE MARK'S OWN DETAIL, which is where this product puts the sentence behind an absence: the
    // word is what a reader sees and the sentence survives on the mark itself.
    // A STRETCH WITH NO APOSTROPHE IN IT, because the renderer escapes one and the comparison
    // would then be about HTML escaping rather than about the sentence being drawn.
    expect(html).toContain('A card page has not been written here.')
    expect(html, 'and it says the card is unaffected').toContain('changes nothing about what the card allows')
  })

  it('offers no way into a card while there is none', async () => {
    expect(drawn(await theRoles())).not.toContain(rp.ROLES_WORDS.open)
  })
})

describe('once the pages are written', () => {
  it('opens the cards, and no block says it any more', async () => {
    const wrote = await app.inject({ method: 'POST', url: '/api/roles/mirror', headers: AS_THE_PERSON })
    expect(wrote.statusCode, wrote.body).toBe(200)
    const said = await theRoles()
    expect(
      said.mirror.every((one) => one.record !== null),
      'every card has a page now',
    ).toBe(true)
    const html = drawn(said)
    expect(html).toContain(rp.ROLES_WORDS.open)
    expect(html, 'and nothing says there is no page').not.toContain(rp.ROLES_WORDS.noPage)
  })
})
