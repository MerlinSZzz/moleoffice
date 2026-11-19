// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * TWO GREEK PAGES FIT A PHONE, AND TWO ENGLISH PAGES ARE THE CONTROL.
 *
 * At 390 the Greek Schedule page was 455 pixels wide and the Greek notifications panel was 414.
 * Both carried a press whose words are longer than its box: the find-work drawer summary on the
 * Schedule page, and the button that allows notifications. Each press keeps `.px-btn`'s
 * `white-space: nowrap`, so the words ran past the page and the whole page scrolled sideways.
 * English, Spanish and Italian fit at the same width.
 *
 * So, at 390, this file holds each page and each press to one thing: the page is no wider than the
 * window, and the press's words fit the box it is drawn in. The browser answers that with
 * scrollWidth against clientWidth. The test office is made up; nothing in it is a real observation.
 */

import { afterAll, beforeAll, expect, it } from 'vitest'
import { liveApp, waitForThePage, type LiveApp } from './helpers.ts'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { WORD_LISTS, type Language } from '../src/shared/i18n.ts'

const WIDTH = 390

let app: LiveApp
beforeAll(async () => {
  app = await liveApp({ name: 'two-greek-pages-fit-a-phone', workspace: 'default', viewport: { width: WIDTH, height: 1100 } })
  await app.context.addInitScript(({ id }) => {
    localStorage.setItem('mole-office.actor', JSON.stringify({ type: 'human', id }))
    localStorage.setItem('mole-office.preset.theme', 'light')
  }, { id: THE_TEST_OFFICES_OWNER.id })
}, 240_000)
afterAll(async () => {
  await app?.stop()
}, 120_000)

/** The words one key holds in one language, read from the word list the page draws from. */
function words(language: Language, key: string): string {
  const value = (WORD_LISTS[language] as Readonly<Record<string, unknown>>)[key]
  if (typeof value !== 'string' || value === '') throw new Error(`${language} has no words for ${key}`)
  return value
}

/** Opens one page in one language at 390 and waits for the page to be drawn. */
async function openAt390(language: string, route: string): Promise<void> {
  await app.page.setViewportSize({ width: WIDTH, height: 1100 })
  await app.page.goto('about:blank')
  await app.page.goto(app.site + `/?lang=${language}&look=light&mode=normal#${route}`)
  await waitForThePage(app.page, 60_000)
  await app.page.waitForSelector('main.page', { state: 'visible', timeout: 20_000 })
  await app.page.waitForTimeout(400)
}

/** The page's own width, and one element's box, as the browser laid them out. */
async function measure(selector: string): Promise<{ page: number; window: number; element: { right: number; clientWidth: number; scrollWidth: number; words: string } }> {
  return await app.page.evaluate((query) => {
    const element = document.querySelector(query)
    if (element === null) throw new Error(`the page has no ${query}`)
    const box = element.getBoundingClientRect()
    return {
      page: document.documentElement.scrollWidth,
      window: document.documentElement.clientWidth,
      element: {
        right: box.right,
        clientWidth: element.clientWidth,
        scrollWidth: element.scrollWidth,
        words: (element.textContent ?? '').replace(/\s+/g, ' ').trim(),
      },
    }
  }, selector)
}

it('fits the Greek Schedule page and its find-work drawer at 390', async () => {
  await openAt390('el', '/plan/2026-W44')
  const at = await measure('.px-pl-drawersum')
  expect(at.element.words, 'the drawer did not draw the Greek find-work words').toContain(words('el', 'schedule.findToPlace'))
  expect(at.page, 'the Greek Schedule page is wider than a 390-pixel window').toBeLessThanOrEqual(at.window + 1)
  expect(at.element.right, "the Greek find-work drawer's right edge is past the window").toBeLessThanOrEqual(at.window + 1)
  expect(at.element.scrollWidth, "the Greek find-work drawer's words do not fit its box").toBeLessThanOrEqual(at.element.clientWidth + 1)
}, 120_000)

it('fits the Greek notifications panel and its allow press at 390', async () => {
  await openAt390('el', '/settings/notifications')
  const at = await measure('.alnt-presses .px-btn')
  expect(at.element.words, 'the panel did not draw the Greek allow words').toContain(words('el', 'settingsPanel.notify.allow'))
  expect(at.page, 'the Greek notifications panel is wider than a 390-pixel window').toBeLessThanOrEqual(at.window + 1)
  expect(at.element.right, "the Greek allow press's right edge is past the window").toBeLessThanOrEqual(at.window + 1)
  expect(at.element.scrollWidth, "the Greek allow press's words do not fit its box").toBeLessThanOrEqual(at.element.clientWidth + 1)
}, 120_000)

it('fits the English Schedule page and its find-work drawer at 390, which is the control', async () => {
  await openAt390('en', '/plan/2026-W44')
  const at = await measure('.px-pl-drawersum')
  expect(at.element.words, 'the drawer did not draw the English find-work words').toContain(words('en', 'schedule.findToPlace'))
  expect(at.page, 'the English Schedule page is wider than a 390-pixel window').toBeLessThanOrEqual(at.window + 1)
  expect(at.element.right, "the English find-work drawer's right edge is past the window").toBeLessThanOrEqual(at.window + 1)
  expect(at.element.scrollWidth, "the English find-work drawer's words do not fit its box").toBeLessThanOrEqual(at.element.clientWidth + 1)
}, 120_000)

it('fits the English notifications panel and its allow press at 390, which is the control', async () => {
  await openAt390('en', '/settings/notifications')
  const at = await measure('.alnt-presses .px-btn')
  expect(at.element.words, 'the panel did not draw the English allow words').toContain(words('en', 'settingsPanel.notify.allow'))
  expect(at.page, 'the English notifications panel is wider than a 390-pixel window').toBeLessThanOrEqual(at.window + 1)
  expect(at.element.right, "the English allow press's right edge is past the window").toBeLessThanOrEqual(at.window + 1)
  expect(at.element.scrollWidth, "the English allow press's words do not fit its box").toBeLessThanOrEqual(at.element.clientWidth + 1)
}, 120_000)
