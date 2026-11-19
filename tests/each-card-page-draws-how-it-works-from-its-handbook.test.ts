// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * EACH PAGE THAT DRAWS A ROLE CARD DRAWS ITS HOW IT WORKS FROM THE CARD'S HANDBOOK TEXT.
 *
 * A role card's How it works is its `howItWorks` text in design/permissions/roles.json, and it
 * follows the language switch. The same text is the handbook the office sends
 * an agent given the card. Until wave 13k round 17 the
 * three pages that draw a card drew the card's older `flow` notes under the How it works heading, so
 * a page and the handbook said two different things about one card.
 *
 * WHAT THIS MEASURES, in a browser, on the worker card, at each of the two places that draw it:
 *   · the list at #/roles, inside the worker's block;
 *   · the worker card's own record page, the copy the mirror writes.
 * In English and in Chinese (?lang=zh), each place draws the first step of the worker's How it works
 * in that language, draws the steps as a numbered list and the bold lines as bold, prints no "**",
 * and does not draw the worker card's flow notes.
 *
 * THE AGENT'S PAGE WAS THE THIRD PLACE UNTIL 1 OCTOBER 2026. Then answer 4 of a decision took
 * the card's duties and How it works off the page of an agent holding the card, and put a row there
 * that opens the Role cards page. So the profile is no longer one of the places above;
 * its own case below asks, in both languages, that its Card panel draws no How it works, no step of the
 * handbook and no flow note, and that it links to the Role cards page. Proved on 1 October 2026: the row to the
 * Role cards page taken out of TheirCard.tsx turns both of its cases red.
 *
 * WHAT IT READS THE EXPECTED TEXT FROM: GET /api/roles, the declaration as this test's own server
 * read it from the real roles.json. Nothing here is a copy of the handbook.
 *
 * PICTURES. With HIW_SHOTS set to a folder, it also photographs each place at 1440 and 390 in light
 * and dark in English, and at 1440 in Chinese, into that folder. Without it, it takes none.
 *
 * THE MUTATION THAT TURNS THIS RED, WITH A CONTROL RUN FIRST. In src/web/components/HowItWorks.tsx,
 * make `howItWorksHere` return the card's `flow` instead of `theHowItWorksOf(...)`: every case goes
 * red, first on "draws the first step of How it works" at #/roles in English, because the page draws
 * the flow notes again and not the handbook text. A second mutation, the rule
 * ".hiw strong { font-weight: 400; }" added to the same file's stylesheet: every case goes red on "the
 * bold lines are set at a bold weight", expected 400 to be at least 600. Measured 30 September 2026;
 * the runs are in the round's proofs file.
 *
 * THE WEIGHT IS READ AND NOT LOOKED AT because the browser the tests use on this machine has no bold
 * face for the sans-serif stack, so a picture from it shows the bold lines at normal weight.
 */

import { mkdirSync } from 'node:fs'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Page } from 'playwright'

import { liveApp, one, type LiveApp, waitForThePage } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import type { RoleCard, WhatTheRolesSay } from '../src/shared/roles.ts'

let app: LiveApp
let page: Page
/** The record holding the copy of the worker card. */
let workerCard = ''
/** The worker card as the server declares it. */
let worker: RoleCard

/** A made-up agent that holds the worker card. */
const HANDLE = 'fern-lindqvist'

const AS_THE_PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

const shots = process.env['HIW_SHOTS']

async function post(path: string, body: unknown): Promise<Record<string, unknown>> {
  const res = await fetch(`${app.api}${path}`, {
    method: 'POST',
    headers: AS_THE_PERSON,
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`POST ${path} answered ${String(res.status)}: ${await res.text()}`)
  return (await res.json()) as Record<string, unknown>
}

/** The three places, each with the address that opens it and the part of the page that is the card. */
const PLACES = [
  // THE WORKER'S BLOCK, BY THE NAME IT IS DRAWN WITH: 'worker' on an English page and 工人 on a Chinese
  // one, since a card's name is drawn in the page language (problem SGTqdnfCmQxh).
  { name: 'roles', where: () => '/roles', scope: '.rol-block:has(.rol-name:text-is("worker")), .rol-block:has(.rol-name:text-is("工人"))' },
  { name: 'record', where: () => `/r/${workerCard}`, scope: '.rc' },
] as const

type Language = 'en' | 'zh'

async function open(where: string, language: Language, theme: 'light' | 'dark' = 'light', width = 1440): Promise<void> {
  await page.setViewportSize({ width, height: 900 })
  await page.emulateMedia({ colorScheme: theme })
  await page.goto(`${app.site}/${language === 'zh' ? '?lang=zh' : ''}#${where}`, { waitUntil: 'domcontentloaded', timeout: 60_000 })
  await page.reload({ timeout: 60_000 })
  await waitForThePage(page, 60_000)
}

/** The first numbered step of a handbook text, without its number. */
function firstStep(text: string): string {
  const line = one(
    text.split('\n').filter((l) => l.startsWith('1. ')),
    'the first numbered step of the worker card How it works',
  )
  return line.slice(3).trim()
}

/** What the How it works of one place draws. */
async function readHowItWorks(
  scope: string,
): Promise<{ text: string; steps: number; bold: number; lightestBold: number; wholeCard: string }> {
  const card = page.locator(scope).first()
  const drawn = card.locator('.hiw').first()
  await drawn.waitFor({ timeout: 30_000 })
  return {
    text: (await drawn.textContent()) ?? '',
    steps: await drawn.locator('ol > li').count(),
    bold: await drawn.locator('strong').count(),
    // THE WEIGHT THE PAGE ASKS FOR, so a rule that set strong back to normal weight would be caught.
    lightestBold: Math.min(
      ...(await drawn.locator('strong').evaluateAll((all) => all.map((one) => Number(getComputedStyle(one).fontWeight)))),
    ),
    wholeCard: (await card.textContent()) ?? '',
  }
}

beforeAll(async () => {
  app = await liveApp({ name: 'how-it-works', viewport: { width: 1440, height: 900 } })
  page = app.page

  const roles = (await (await fetch(`${app.api}/api/roles`)).json()) as WhatTheRolesSay
  worker = one(roles.cards.filter((c) => c.name === 'worker'), 'the worker card in the declaration')
  expect(worker.howItWorks, 'the worker card carries a How it works').toBeDefined()
  expect(worker.flow, 'the worker card still carries flow notes, which is what makes this a fair test').toBeDefined()

  const copied = (await post('/api/roles/mirror', undefined)) as { written?: string[] }
  expect(copied.written, 'the mirror copied no card into the project').toContain('worker')
  const listed = (await (await fetch(`${app.api}/api/records?kind=role_card&shape=full`)).json()) as {
    records?: { id: string; data?: { roleName?: string } }[]
  }
  workerCard = one(
    (listed.records ?? []).filter((r) => r.data?.roleName === 'worker'),
    'the record copying the worker card',
  ).id

  await post('/api/agents/started', { handle: HANDLE, name: 'Fern Lindqvist', runtime: 'claude-code', role: 'worker' })
  if (shots !== undefined) mkdirSync(shots, { recursive: true })
}, 180_000)

afterAll(async () => {
  await app?.stop()
}, 60_000)

for (const place of PLACES) {
  describe(`the worker card's How it works at ${place.name}`, () => {
    for (const language of ['en', 'zh'] as const) {
      it(`draws the first step of How it works in ${language}, as a numbered list with bold, and not the flow`, async () => {
        await open(place.where(), language)
        const seen = await readHowItWorks(place.scope)
        const text = worker.howItWorks?.[language] ?? ''
        expect(seen.text, 'draws the first step of How it works').toContain(firstStep(text))
        // The worker's text has eight numbered steps, and each is an item of a numbered list.
        // FOLDED ON LOAD SINCE 1 OCTOBER 2026, by item 4 of a decision: the page draws the first three of them until
        // the fold is pressed open. tests/a-role-cards-way-of-working-is-folded.test.ts presses
        // it and reads the rest.
        expect(text.split('\n').filter((l) => /^\d+\. /.test(l)).length, 'the worker card has more than three steps').toBeGreaterThan(3)
        expect(seen.steps, 'the first three steps are drawn as a numbered list, folded').toBe(3)
        expect(seen.bold, 'the bold lines are drawn as bold').toBeGreaterThan(0)
        expect(seen.lightestBold, 'the bold lines are set at a bold weight').toBeGreaterThanOrEqual(600)
        expect(seen.text, 'no markdown asterisks are printed').not.toContain('**')
        // THE FLOW IS NOT DRAWN, anywhere on the card, in either language.
        for (const paragraph of (worker.flow ?? '').split('\n\n')) {
          expect(seen.wholeCard, 'the card does not draw its flow notes').not.toContain(paragraph.trim())
        }
      }, 120_000)
    }

    if (shots !== undefined) {
      it('is photographed at 1440 and 390, light and dark, and at 1440 in Chinese', async () => {
        const runs: { language: Language; theme: 'light' | 'dark'; width: number }[] = [
          { language: 'en', theme: 'light', width: 1440 },
          { language: 'en', theme: 'dark', width: 1440 },
          { language: 'en', theme: 'light', width: 390 },
          { language: 'en', theme: 'dark', width: 390 },
          { language: 'zh', theme: 'light', width: 1440 },
        ]
        for (const run of runs) {
          await open(place.where(), run.language, run.theme, run.width)
          await page.locator(place.scope).first().locator('.hiw').first().waitFor({ timeout: 30_000 })
          await page.locator(place.scope).first().scrollIntoViewIfNeeded()
          const sideways = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
          expect(sideways, `${place.name} at ${String(run.width)} scrolls sideways`).toBe(0)
          await page.screenshot({
            path: `${shots}/${place.name}-${String(run.width)}-${run.theme}-${run.language}.png`,
            fullPage: true,
          })
        }
      }, 300_000)
    }
  })
}

describe('the agent page of an agent holding the worker card', () => {
  for (const language of ['en', 'zh'] as const) {
    it(`draws no How it works in ${language}, and links to the Role cards page instead`, async () => {
      await open(`/who/agent/${HANDLE}`, language)
      const panel = page.locator('[data-target="uiSurface/profile.theircard"]').first()
      await panel.locator('.tc-card').waitFor({ timeout: 30_000 })
      const whole = (await panel.textContent()) ?? ''
      expect(await panel.locator('.hiw').count(), 'no How it works is drawn').toBe(0)
      expect(whole, 'no step of the handbook').not.toContain(firstStep(worker.howItWorks?.[language] ?? ''))
      for (const paragraph of (worker.flow ?? '').split('\n\n')) {
        expect(whole, 'no flow note').not.toContain(paragraph.trim())
      }
      // ONE ROW OPENS THE ROLE CARDS PAGE; since wave 13q's round 33 the card's step sentence also links to the tree there.
      expect(await panel.locator('a.tc-card-all-link[href="#/roles"]').count(), 'the row that opens the Role cards page').toBe(1)
    }, 120_000)
  }
})
