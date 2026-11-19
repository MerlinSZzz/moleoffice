// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A ROLE CARD'S WAY OF WORKING IS FOLDED BY DEFAULT. Items 4 and 6
 * of a decision.
 *
 * Folded, a card's How it works shows its one-line summary and its first three numbered points. One
 * press shows the rest, the example too. Nothing remembers the press, so the next load is folded
 * again. The Role cards page and a card's own record page both draw it through the one component,
 * src/web/components/HowItWorks.tsx, so both fold the same way. Both pages draw the How it works
 * heading themselves, so they leave out the text's own bold How it works line (item 6 lets them).
 *
 * WHAT THIS MEASURES, in a browser, on the secretary card (thirteen points, the most of any card),
 * at #/roles and on the card's record page, in English:
 *   - on load the fold is closed: three points drawn, the fourth and the example not;
 *   - one press opens it: every point drawn, and the example;
 *   - after a reload it is closed again;
 *   - the text's bold How it works line is not drawn under the page's own heading.
 * The expected text is read from GET /api/roles, the declaration as this test's server read it.
 *
 * THE MUTATION THAT TURNS THIS RED, AFTER A CONTROL RUN. In src/web/components/HowItWorks.tsx, make
 * `theFoldOf` return null at once. Every case goes red on "three points are drawn on load", because
 * all thirteen are drawn.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Page } from 'playwright'

import { liveApp, one, type LiveApp, waitForThePage } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import type { RoleCard, WhatTheRolesSay } from '../src/shared/roles.ts'

let app: LiveApp
let page: Page
let secretaryCard = ''
let secretary: RoleCard

type Language = 'en' | 'zh'

const PLACES = [
  // THE SECRETARY'S BLOCK, BY THE NAME IT IS DRAWN WITH: 'secretary' on an English page and 秘书 on a
  // Chinese one, since a card's name is drawn in the page language (problem SGTqdnfCmQxh).
  { name: 'roles', where: () => '/roles', scope: '.rol-block:has(.rol-name:text-is("secretary")), .rol-block:has(.rol-name:text-is("秘书"))' },
  { name: 'record', where: () => `/r/${secretaryCard}`, scope: '.rc' },
] as const

async function open(where: string, language: Language, theme: 'light' | 'dark' = 'light', width = 1440): Promise<void> {
  await page.setViewportSize({ width, height: 900 })
  await page.emulateMedia({ colorScheme: theme })
  await page.goto(`${app.site}/${language === 'zh' ? '?lang=zh' : ''}#${where}`, { waitUntil: 'domcontentloaded', timeout: 60_000 })
  await page.reload({ timeout: 60_000 })
  await waitForThePage(page, 60_000)
}

/** The numbered points of a text, without their numbers, in order. */
function pointsOf(text: string): string[] {
  return text.split('\n').filter((l) => /^\d+\. /.test(l)).map((l) => l.replace(/^\d+\. /, '').trim())
}

/** The example line's words after its italic label, or null when the text has none. */
function exampleOf(text: string): string | null {
  const line = text.split('\n').find((l) => l.startsWith('*') && !l.startsWith('**'))
  return line === undefined ? null : line.replace(/^\*[^*]+\*\s*/, '').trim()
}

/** The bold line that heads the numbered points, without its asterisks. */
function headingOf(text: string): string {
  const lines = text.split('\n')
  const first = lines.findIndex((l) => /^\d+\. /.test(l))
  const before = lines.slice(0, first).filter((l) => l.trim() !== '')
  const line = before[before.length - 1] ?? ''
  expect(line, 'the text has a bold line over its points').toMatch(/^\*\*[^*]+\*\*$/)
  return line.replace(/\*\*/g, '').trim()
}

async function read(scope: string): Promise<{ folded: string | null; points: number; text: string; strong: string[]; expanded: string | null }> {
  const drawn = page.locator(scope).first().locator('.hiw').first()
  await drawn.waitFor({ timeout: 30_000 })
  return {
    folded: await drawn.getAttribute('data-folded'),
    points: await drawn.locator('ol > li').count(),
    text: (await drawn.locator('.hiw-text').textContent()) ?? '',
    strong: await drawn.locator('strong').allTextContents(),
    // NO PRESS DRAWN IS AN ANSWER (null), not a wait: a text with nothing folded draws none.
    expanded: (await drawn.locator('.hiw-more').count()) === 0 ? null : await drawn.locator('.hiw-more').getAttribute('aria-expanded'),
  }
}

beforeAll(async () => {
  app = await liveApp({ name: 'role-card-fold', viewport: { width: 1440, height: 900 } })
  page = app.page
  const roles = (await (await fetch(`${app.api}/api/roles`)).json()) as WhatTheRolesSay
  secretary = one(roles.cards.filter((c) => c.name === 'secretary'), 'the secretary card in the declaration')
  const res = await fetch(`${app.api}/api/roles/mirror`, {
    method: 'POST',
    headers: { 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON },
  })
  expect(res.ok, await res.clone().text()).toBe(true)
  const listed = (await (await fetch(`${app.api}/api/records?kind=role_card&shape=full`)).json()) as {
    records?: { id: string; data?: { roleName?: string } }[]
  }
  secretaryCard = one((listed.records ?? []).filter((r) => r.data?.roleName === 'secretary'), 'the secretary card copy').id
}, 180_000)

afterAll(async () => {
  await app?.stop()
}, 60_000)

for (const place of PLACES) {
  describe(`the secretary card's How it works at ${place.name}`, () => {
    // ENGLISH ONLY. Folding does not depend on the language, so the Chinese pass goes.
    for (const language of ['en'] as const) {
      it(`is folded on load, opens with one press, and is folded again after a reload, in ${language}`, async () => {
        const text = secretary.howItWorks?.[language] ?? ''
        const points = pointsOf(text)
        const example = exampleOf(text)
        expect(points.length, 'the secretary card has more than three points').toBeGreaterThan(3)
        expect(example, 'the secretary card has an example').not.toBeNull()

        await open(place.where(), language)
        const shut = await read(place.scope)
        expect(shut.points, 'three points are drawn on load').toBe(3)
        expect(shut.folded, 'the fold is closed on load').toBe('folded')
        for (const point of points.slice(0, 3)) expect(shut.text, 'a first point is missing').toContain(point)
        expect(shut.text, 'the fourth point is drawn while folded').not.toContain(points[3])
        expect(shut.text, 'the example is drawn while folded').not.toContain(example)
        expect(shut.expanded).toBe('false')
        // THE TEXT'S OWN HEADING LINE IS LEFT OUT under the page's heading; its one-line summary stays bold.
        expect(shut.strong, 'the How it works line is drawn twice').not.toContain(headingOf(text))
        expect(shut.strong.length, 'the one-line summary is not bold').toBeGreaterThan(0)

        await page.locator(place.scope).first().locator('.hiw-more').click()
        const opened = await read(place.scope)
        expect(opened.folded).toBe('open')
        expect(opened.expanded).toBe('true')
        expect(opened.points, 'every point is drawn after one press').toBe(points.length)
        expect(opened.text, 'the last point is not drawn after the press').toContain(points[points.length - 1])
        expect(opened.text, 'the example is not drawn after the press').toContain(example)

        await page.reload({ timeout: 60_000 })
        await waitForThePage(page, 60_000)
        const again = await read(place.scope)
        expect(again.folded, 'the fold stays open after a reload').toBe('folded')
        expect(again.points).toBe(3)
      }, 120_000)
    }

  })
}
