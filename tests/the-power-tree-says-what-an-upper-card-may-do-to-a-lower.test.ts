// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE POWER TREE SAYS WHAT AN UPPER CARD MAY DO TO A LOWER — CRITERION P79.
 *
 * ---------------------------------------------------------------------------------------
 * THE DEFECT
 * ---------------------------------------------------------------------------------------
 *
 * The power tree was only text
 * — the power tree's visualisation was never built: the cards were labelled with text rather than
 * drawn as a hierarchy. The half with no code was the line between one card and the card below it,
 * saying what the upper may do to the lower: give it its card, retire it, start it.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS MEASURED, AND THE ONE THAT MATTERS MOST
 * ---------------------------------------------------------------------------------------
 *
 *   · every rung of the tree has a line above it, and that line carries the acts the declaration
 *     declares for that step (`whatTheCardAboveMayDoToThis`);
 *   · THE LINE CARRIES ITS OWN STEP'S ACTS AND NO OTHER STEP'S. That is the case that matters: a
 *     drawing with a rule of its own, or one hard-coding the acts of one rung for every rung, would
 *     look right and could say an upper card may do something the declaration does not;
 *   · THE DRAWING READS THE ACTS OFF THE REPLY. The same page is drawn again from a copy of the reply
 *     with one step's acts replaced by words that appear nowhere else, and those words have to appear
 *     on that step's line and on no other. A component that carried its own sentences instead of the
 *     reply fails this and passes everything else.
 *
 * ---------------------------------------------------------------------------------------
 * THE MUTATIONS THAT TURN THIS RED, WITH A CONTROL RUN FIRST
 * ---------------------------------------------------------------------------------------
 *
 *   draw the bottom rung's acts on every line — `acts={said.tree[0].whatTheCardAboveMayDoToThis}` —
 *     the first case goes red for every rung but that one, and the second goes red for all of them;
 *   drop the line entirely — every case goes red, because there is no line to find.
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
let said: WhatTheRolesSay
let html = ''
let changedHtml = ''

/** The words that appear only on the line the test has rewritten the reply for. */
const SENTINEL = 'Sentinel act, said of one rung alone'

const AS_THE_PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

/** One string as the renderer writes it, for the same reason the P68 test carries this helper. */
function asDrawn(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/'/g, '&#x27;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/** The text inside the drawing only, so a word in a card block below cannot be mistaken for it. */
function theDrawing(markup: string): string {
  const from = markup.indexOf('data-target="uiSurface/roles.tree"')
  expect(from, 'the drawing declares itself, so a test can find it').toBeGreaterThan(-1)
  const to = markup.indexOf('data-target="uiSurface/roles.agents"')
  return markup.slice(from, to === -1 ? undefined : to)
}

/** The line that leads down to one card, from its own mark to the next line's. */
function lineTo(drawing: string, role: string): string {
  const marker = `data-tree-line="${role}"`
  const at = drawing.indexOf(marker)
  expect(at, `the drawing has a line above the ${role} card`).toBeGreaterThan(-1)
  const next = drawing.indexOf('data-tree-line="', at + marker.length)
  return drawing.slice(at, next === -1 ? undefined : next)
}

/** The step of the tree at the bottom rung, which is the one this file rewrites for the sentinel. */
function theBottomStep(): WhatTheRolesSay['tree'][number] {
  const sorted = [...said.tree].sort((a, b) => a.rung - b.rung)
  const bottom = sorted[0]
  if (bottom === undefined) throw new Error('the declaration holds no tree')
  return bottom
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

  // THE SAME REPLY, WITH ONE STEP'S ACTS REPLACED. It is read here rather than through a type, so
  // the copy cannot quietly pick up a shape the served reply does not have.
  const copy = JSON.parse(JSON.stringify(said)) as WhatTheRolesSay
  const bottom = [...copy.tree].sort((a, b) => a.rung - b.rung)[0]
  if (bottom === undefined) throw new Error('the declaration holds no tree')
  bottom.whatTheCardAboveMayDoToThis = [SENTINEL]
  changedHtml = renderToStaticMarkup(h(rp.TheCards, { said: copy, portraits: null }))
})

afterAll(async () => {
  await app.close()
  t.close()
})

describe('the lines say what the declaration says', () => {
  it('has a line above every rung, and it carries that step’s declared acts', () => {
    const drawing = theDrawing(html)
    for (const step of said.tree) {
      expect(
        step.whatTheCardAboveMayDoToThis.length,
        `the ${step.role} step declares what the card above it may do`,
      ).toBeGreaterThan(0)
      const line = lineTo(drawing, step.role)
      for (const act of step.whatTheCardAboveMayDoToThis) {
        expect(line, `the line above ${step.role} has to say "${act}"`).toContain(asDrawn(act))
      }
    }
  })

  it('gives a line its own step’s acts and no other step’s, so a hard-coded drawing fails', () => {
    // THE OTHER DIRECTION, and it is the one a drawing with its own rule fails: every act names the
    // card it is done to, so a line carrying another step's acts is a line with a rule of its own.
    const drawing = theDrawing(html)
    const everyAct = new Set(said.tree.flatMap((one) => one.whatTheCardAboveMayDoToThis))
    for (const step of said.tree) {
      const mine = new Set(step.whatTheCardAboveMayDoToThis)
      const line = lineTo(drawing, step.role)
      for (const act of everyAct) {
        if (mine.has(act)) continue
        expect(
          line,
          `the line above ${step.role} must not say "${act}", which belongs to another card`,
        ).not.toContain(asDrawn(act))
      }
    }
  })
})

describe('the drawing reads the acts off the same reply the cards are drawn from', () => {
  it('moves one step’s acts when the reply moves them, and leaves every other line alone', () => {
    const drawing = theDrawing(changedHtml)
    const bottom = theBottomStep()
    expect(lineTo(drawing, bottom.role), 'the rewritten line does not carry the reply’s words').toContain(SENTINEL)
    for (const step of said.tree) {
      if (step.role === bottom.role) continue
      expect(
        lineTo(drawing, step.role),
        `the line above ${step.role} carried words only the ${bottom.role} step was given`,
      ).not.toContain(SENTINEL)
    }
  })
})
