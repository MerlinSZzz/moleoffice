// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE ROLE CARDS PAGE DRAWS THE POWER TREE — CRITERION P68.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT WAS MISSING
 * ---------------------------------------------------------------------------------------
 *
 * The Role cards part could draw the power
 * tree. The page laid every card out as a block and said each card's rung as a number; who stands
 * above whom was a thing a reader worked out by comparing five numbers.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS MEASURED, AND THE ONE THAT MATTERS MOST
 * ---------------------------------------------------------------------------------------
 *
 *   · the drawing is there, with the cards on the tree in the declaration's own order, the person's
 *     card above them and the card off the tree beside them;
 *   · THE DRAWING IS THE SAME READING AS THE CARDS. For every card, the powers on its node are the
 *     powers on its block, name for name. That is the case that matters: a drawing built from a
 *     second reading of the tree would look right and could say something the refusals do not.
 *     Both come off the same reply, so this fails the moment somebody gives the drawing its own
 *     rule;
 *   · the powers are folded, which is what the criterion asks for.
 *
 * ---------------------------------------------------------------------------------------
 * THE MUTATIONS THAT TURN THIS RED, WITH A CONTROL RUN FIRST
 * ---------------------------------------------------------------------------------------
 *
 *   drop `<TheTree said={said} />` from `TheCards` → every case goes red.
 *   make `Node` draw the powers of the step (`tree[].adds`) instead of the card's own → the case
 *     that says the drawing and the cards read the same goes red, and nothing else does.
 *   leave the card off the tree out of the drawing → the case about the inspector goes red.
 */

import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'

import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { t as word } from '../src/shared/i18n.ts'
import type { WhatTheRolesSay } from '../src/shared/roles.ts'

type RolesModule = typeof import('../src/web/pages/RolesPage.tsx')

let t: TestDb
let app: FastifyInstance
let rp: RolesModule
let said: WhatTheRolesSay
let html = ''

const AS_THE_PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

/**
 * ONE STRING AS THE RENDERER WRITES IT.
 *
 * `renderToStaticMarkup` escapes an apostrophe, and two of the declared power names carry one. A
 * comparison against the raw name would fail on the positive cases and — worse — PASS on the
 * negative ones, where the whole point is that the name is absent.
 */
function asDrawn(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/'/g, '&#x27;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/** The text inside the drawing only, so a name in a card block below cannot be mistaken for it. */
function theDrawing(): string {
  const from = html.indexOf('data-target="uiSurface/roles.tree"')
  expect(from, 'the drawing declares itself, so a test can find it').toBeGreaterThan(-1)
  const to = html.indexOf('data-target="uiSurface/roles.agents"')
  return html.slice(from, to === -1 ? undefined : to)
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
  const reply = await app.inject({ method: 'GET', url: '/api/roles', headers: AS_THE_PERSON })
  expect(reply.statusCode, reply.body).toBe(200)
  said = reply.json() as WhatTheRolesSay
  html = renderToStaticMarkup(h(rp.TheCards, { said, portraits: null }))
})

afterAll(async () => {
  await app.close()
  t.close()
})

describe('the drawing', () => {
  it('holds every card on the tree, and says which rung each stands on', () => {
    const drawing = theDrawing()
    for (const step of said.tree) {
      expect(drawing, `${step.role} is on the tree and has to be on the drawing`).toContain(step.role)
      expect(drawing).toContain(`${rp.ROLES_WORDS.rung} ${String(step.rung)}`)
    }
  })

  it('draws a card the declaration gives no rung beside the tree, rather than leaving it out', () => {
    const onTheTree = new Set(said.tree.map((one) => one.role))
    const off = said.cards.filter((one) => !onTheTree.has(one.name))
    expect(off.length, 'this installation has one: the inspector').toBeGreaterThan(0)
    const drawing = theDrawing()
    for (const card of off) expect(drawing, `${card.name} is drawn rather than dropped`).toContain(card.name)
    expect(drawing).toContain(rp.ROLES_WORDS.beside)
  })

  it('folds the powers, and says how many are behind each fold', () => {
    const drawing = theDrawing()
    expect(drawing, 'a native fold, which survives find-in-page').toContain('<details')
    expect(drawing).toContain(rp.ROLES_WORDS.opensPowers)
    // CRITERION CHANGE, plan 7FEOshq3mBGG (G6b): the count reads the list's plural, so a card with one
    // power says "1 power". The mailer card that came with the summonses was the first with one; it
    // left the declaration on 1 October 2026, and the rule holds for any card.
    for (const card of said.cards) {
      const n = (card.powers ?? []).length
      expect(drawing).toContain(`${String(n)} ${word('g6b.roles.powerUnit', { n })}`)
    }
  })
})

describe('the drawing is the same reading as the cards', () => {
  it('gives every card the powers its own block gives it, name for name', () => {
    const drawing = theDrawing()
    // THE CARDS BELOW ARE DRAWN FROM `card.powers`, which the server filled in from the tree with
    // the reading a refusal uses. So this asks whether the drawing shows THAT list and no other.
    for (const card of [...said.cards, ...said.personCards]) {
      const powers = card.powers ?? []
      expect(powers.length, `${card.name} holds powers to compare`).toBeGreaterThan(0)
      for (const power of powers) {
        expect(drawing, `${card.name} holds ${power} on its block, so its node has to hold it too`).toContain(
          asDrawn(power),
        )
      }
    }
  })

  it('shows no power on a node that the card does not hold', () => {
    // THE OTHER DIRECTION, and it is the one a drawing with its own rule would fail: a node built
    // from a step of the tree would show the powers that step ADDS, which for the secretary is
    // none and for the worker is two of the five.
    const drawing = theDrawing()
    const everyPower = said.powers.map((one) => one.name)
    for (const card of said.cards) {
      const holds = new Set(card.powers ?? [])
      const nodeStart = drawing.indexOf(`>${card.name}</span>`)
      expect(nodeStart, `${card.name} has a node`).toBeGreaterThan(-1)
      const nodeEnd = drawing.indexOf('</details>', nodeStart)
      const node = drawing.slice(nodeStart, nodeEnd === -1 ? undefined : nodeEnd)
      for (const power of everyPower) {
        if (holds.has(power)) continue
        expect(node, `${card.name} does not hold ${power}, so its node must not show it`).not.toContain(
          `>${asDrawn(power)}</li>`,
        )
      }
    }
  })
})
