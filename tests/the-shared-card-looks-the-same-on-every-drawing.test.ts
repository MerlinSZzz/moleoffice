// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE SHARED CARD LOOKS THE SAME ON THE PLAN DRAWING AS ON THE MODULE DRAWING (problem Cr5JxwaYqink).
 *
 * The module drawing and the plan drawing both draw one component, CardFace. Its rules used to live
 * in the module drawing's stylesheet, which the plan drawing never loads. So on the plan drawing the
 * line saying a level is not written had no margin and the wrong colour. The rules now live with the card, in CARD_CSS in CardFace.tsx, and the
 * card loads them wherever it is drawn.
 *
 * WHAT THIS FILE MEASURES. One module record, drawn on the module drawing and on the Goals page's
 * plan drawing, with its level set by hand to level 1, which nobody wrote for it. On both drawings
 * it reads the computed style of the line saying so, and of the card's name, and asks two things:
 *   1. that the two drawings give the same values, and
 *   2. that the values are the shared rule's and not the browser's defaults. Without this, a page
 *      that loaded the card's rules nowhere would pass the first check, because both drawings would
 *      then draw the browser's defaults alike. This is asked of the line saying a level is not
 *      written, which has a dashed rule above it and a margin only the shared rule gives it.
 * It measures in the light look and the dark look.
 *
 * THE MUTATION THAT TURNS IT RED. Take the style element out of CardSays in CardFace.tsx, so the card
 * no longer loads its own rules: the second check goes red on both drawings. Put the rules back in
 * Canvas.tsx only, which is how main was: the first check goes red on the plan drawing.
 *
 * PICTURES. When TEST_SHOTS names a folder, the file photographs both drawings at 1440, 990, 660 and
 * 390 in both looks, at 1440 in Chinese, once in the test language, and the plan drawing once more
 * with the card pressed so its own controls show. Each picture is of the drawing alone, so no name
 * of the test person is in it.
 *
 * Made-up records in this test's own office; nothing here is a real person's work.
 */
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { BrowserContext, Page } from 'playwright'
import { liveApp, waitForThePage, type LiveApp } from './helpers.ts'
import { theDrawingHasSettled } from './the-drawing-has-settled.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { periodKey } from '../src/shared/planning.ts'

let app: LiveApp
let moduleId = ''
let period = ''

const headers = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

async function file(kind: string, title: string, data: Record<string, unknown>): Promise<string> {
  const reply = await fetch(`${app.api}/api/records`, { method: 'POST', headers, body: JSON.stringify({ kind, title, data }) })
  expect(reply.status, await reply.clone().text()).toBe(201)
  return ((await reply.json()) as { record: { id: string } }).record.id
}

async function link(fromId: string, toId: string, type: string): Promise<void> {
  const reply = await fetch(`${app.api}/api/links`, { method: 'POST', headers, body: JSON.stringify({ fromId, toId, type }) })
  expect(reply.status, await reply.clone().text()).toBe(201)
}

/** Where each drawing keeps a card's hand-set choices, as cardhere.ts names them. */
const MODULE_DRAWING = 'modules'
const planDrawing = (): string => `plan:${period}`

/**
 * A NEW WINDOW WITH THE CARD SET TO LEVEL 1 BY HAND ON BOTH DRAWINGS, in the look asked for.
 *
 * The choice is written into the window's session storage before the page loads, under the key
 * cardhere.ts reads, which is what a press on the card's level control writes.
 */
async function aWindow(width: number, theme: 'light' | 'dark'): Promise<{ context: BrowserContext; page: Page }> {
  const context = await app.browser.newContext({ viewport: { width, height: width < 700 ? 900 : 1000 }, colorScheme: theme })
  await context.addInitScript(
    ({ look, keys }) => {
      window.localStorage.setItem('mole-office.preset.theme', look)
      for (const key of keys) window.sessionStorage.setItem(key, JSON.stringify({ level: 'label' }))
    },
    {
      look: theme,
      keys: [MODULE_DRAWING, planDrawing()].map((drawing) => `mole-office.here.card.${drawing}.${moduleId}`),
    },
  )
  return { context, page: await context.newPage() }
}

async function openTheModuleDrawing(page: Page, language = 'en'): Promise<void> {
  await page.goto(`${app.site}/?lang=${language}#/pipeline/drawing`, { timeout: 60_000 })
  await waitForThePage(page, 60_000)
  await page.waitForSelector('.gx-canvas-wrap[data-shows="1"]', { timeout: 60_000 })
  await theDrawingHasSettled(page)
}

async function openThePlanDrawing(page: Page, language = 'en'): Promise<void> {
  await page.goto(`${app.site}/?lang=${language}#/horizons`, { timeout: 60_000 })
  await waitForThePage(page, 60_000)
  await page.waitForSelector('.pg-band-plane .pg-cc', { timeout: 60_000 })
}

/** The floating chat button shows the test person's picture, so keep it out of screenshots. */
async function hideTheProfilePicture(page: Page): Promise<void> {
  await page.addStyleTag({ content: '.px-chat-circle { display: none !important; }' })
}

/** The properties the shared rules set on each part measured here. */
const MEASURED = {
  '.gx-card-unwritten': [
    'margin-top',
    'padding-top',
    'border-top-style',
    'border-top-width',
    'border-top-color',
    'font-size',
    'line-height',
    'color',
  ],
  // THE NAME, BY WHAT THE PLAN DRAWING DOES NOT OVERRIDE: it clamps the name to two lines and draws
  // the card it is about with a larger name, and neither is measured here.
  '.gx-card-title': ['font-weight', 'color', 'text-align', 'cursor', 'padding-top', 'border-top-width'],
} as const

type Measured = Record<string, Record<string, string> | null>

/**
 * THE COMPUTED STYLE OF EACH MEASURED PART OF THE ONE CARD THAT IS ON SCREEN.
 *
 * The plan drawing also draws each card once, hidden, to measure it, so the card read here is the
 * one with a box on the page.
 */
async function measure(page: Page, box: string): Promise<Measured> {
  return page.evaluate(
    ({ box, id, measured }) => {
      const cards = [...document.querySelectorAll<HTMLElement>(`${box}[data-target*="${id}"]`)].filter((card) => {
        const rect = card.getBoundingClientRect()
        return rect.width > 0 && rect.height > 0 && getComputedStyle(card).visibility === 'visible'
      })
      if (cards.length !== 1) throw new Error(`${String(cards.length)} cards for the module are on screen in ${box}, not one`)
      const card = cards[0]!
      const out: Record<string, Record<string, string> | null> = {}
      for (const [part, properties] of Object.entries(measured)) {
        const el = card.querySelector(part)
        if (el === null) {
          out[part] = null
          continue
        }
        const style = getComputedStyle(el)
        out[part] = Object.fromEntries(properties.map((property) => [property, style.getPropertyValue(property)]))
      }
      return out
    },
    { box, id: moduleId, measured: MEASURED },
  )
}

beforeAll(async () => {
  app = await liveApp({ name: 'shared-card-style', workspace: 'default', viewport: { width: 1440, height: 1000 } })
  const today = await (await fetch(`${app.api}/api/planning/today`, { headers })).json() as { day: string }
  // THE WEEK THE GOALS PAGE DRAWS, worked out the way drawingWeek in HorizonsPage.tsx works it out.
  period = periodKey('week', new Date(`${today.day}T12:00:00`))
  const goal = await file('goal', 'The tide gauge reads within a centimetre', {
    horizon: 'short',
    what: 'The gauge agrees with the harbour staff to a centimetre over a week.',
    owner: THE_PERSON,
    state: 'open',
  })
  // A MODULE WITH NO SHORT FORMS, so level 1 is not written for it on either drawing.
  moduleId = await file('module', 'Tide gauge bench', { state: 'active', parts: [] })
  await link(moduleId, goal, 'serves')
  // A SECOND RECORD SERVING THE GOAL, because the plan drawing draws a straight run of records as a
  // row of chips and lays out cards only where the links branch.
  const level = await file('task', 'Level the gauge against the staff', { state: 'todo' })
  await link(level, goal, 'serves')
  // A SECOND MODULE JOINED TO IT, because the module drawing leaves a module joined to nothing off
  // the picture and names it in the fold under the drawing instead.
  const staff = await file('module', 'Harbour staff board', { state: 'active', parts: [] })
  await link(moduleId, staff, 'relates_to')
}, 240_000)

afterAll(async () => {
  await app?.stop()
}, 60_000)

describe('the shared card on the plan drawing and on the module drawing', () => {
  for (const theme of ['light', 'dark'] as const) {
    it(`draws the line saying a level is not written, and the name, alike in the ${theme} look`, async () => {
      const { context, page } = await aWindow(1440, theme)
      try {
        await openTheModuleDrawing(page)
        const onModules = await measure(page, '.gx-card')
        await openThePlanDrawing(page)
        const onPlan = await measure(page, '.pg-cc')

        for (const part of Object.keys(MEASURED)) {
          expect(onModules[part], `the module drawing draws no ${part} on the card`).not.toBeNull()
          expect(onPlan[part], `the plan drawing draws no ${part} on the card`).not.toBeNull()
        }
        // THE SHARED RULES REACH BOTH DRAWINGS, and not the browser's defaults on both.
        for (const [where, seen] of [['module', onModules], ['plan', onPlan]] as const) {
          expect(seen['.gx-card-unwritten']!['border-top-style'], `the ${where} drawing has no dashed rule above the unwritten line`).toBe('dashed')
          expect(seen['.gx-card-unwritten']!['margin-top'], `the ${where} drawing gives the unwritten line no margin`).not.toBe('0px')
        }
        // THE SAME VALUES ON BOTH.
        expect(onPlan, 'the card on the plan drawing is styled differently from the same card on the module drawing').toEqual(onModules)
      } finally {
        await context.close()
      }
    }, 180_000)
  }

  it('photographs both drawings when TEST_SHOTS names a folder', async () => {
    const shots = process.env['TEST_SHOTS']
    if (shots === undefined || shots === '') return
    mkdirSync(shots, { recursive: true })
    const take = async (width: number, theme: 'light' | 'dark', language: string): Promise<void> => {
      const { context, page } = await aWindow(width, theme)
      try {
        if (width < 500) {
          // AT 390 THE PAGE DRAWS A LIST IN PLACE OF THE CANVAS, so the picture is of what the
          // drawing's own section shows there.
          await page.goto(`${app.site}/?lang=${language}#/pipeline/drawing`, { timeout: 60_000 })
          await waitForThePage(page, 60_000)
          await hideTheProfilePicture(page)
          await page.locator('.gx').first().screenshot({ path: join(shots, `modules-${String(width)}-${theme}-${language}.png`) })
        } else {
          await openTheModuleDrawing(page, language)
          await hideTheProfilePicture(page)
          await page.locator('.gx-canvas-wrap').first().screenshot({ path: join(shots, `modules-${String(width)}-${theme}-${language}.png`) })
        }
        if (width < 500) {
          await page.goto(`${app.site}/?lang=${language}#/horizons`, { timeout: 60_000 })
          await waitForThePage(page, 60_000)
          await hideTheProfilePicture(page)
        } else {
          await openThePlanDrawing(page, language)
          await hideTheProfilePicture(page)
        }
        await page.locator('.pg').first().screenshot({ path: join(shots, `plan-${String(width)}-${theme}-${language}.png`) })
      } finally {
        await context.close()
      }
    }
    for (const width of [1440, 990, 660, 390]) {
      for (const theme of ['light', 'dark'] as const) await take(width, theme, 'en')
    }
    for (const theme of ['light', 'dark'] as const) await take(1440, theme, 'zh')
    await take(1440, 'light', 'xx')
    // THE PLAN CARD PRESSED, so its own controls are drawn and can be looked at.
    for (const theme of ['light', 'dark'] as const) {
      const { context, page } = await aWindow(1440, theme)
      try {
        await openThePlanDrawing(page)
        await hideTheProfilePicture(page)
        const card = page.locator(`.pg-band-plane .pg-cc[data-target*="${moduleId}"]`).first()
        await card.locator('.gx-card-title').click()
        await page.waitForSelector(`.pg-band-plane .pg-cc[data-target*="${moduleId}"] .gx-card-strip`, { timeout: 30_000 })
        await page.waitForTimeout(3000)
        await page.locator('.pg-canvas-wrap').first().screenshot({ path: join(shots, `plan-pressed-1440-${theme}-en.png`) })
      } finally {
        await context.close()
      }
    }
  }, 600_000)
})
