// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE CASTING PAGE FITS A PHONE IN EVERY LANGUAGE WHOSE WORDS ARE WHOLE.
 *
 * At 390 the Casting page was 501 pixels wide in Greek, 455 in Spanish and 574 in Italian, so the
 * page scrolled sideways. The sentence under each role that nobody has been cast in is drawn in the
 * shared absent part, whose rule keeps it on one line. The table on the same page already lets that
 * part wrap, but the sentence under a role did not.
 *
 * So, at 390, this file holds the page and that mark to one thing in each language: the page is no
 * wider than the window, and the mark's words fit the box it is drawn in. The browser answers that
 * with scrollWidth against clientWidth. The words are read with t() rather than copied here. The test
 * office is made up; nothing in it is a real observation.
 *
 * THE SENTENCE IS NOW A SHORT STATE. Until November 2026 the mark was the sentence "Nobody has cast this
 * role. The table holds no casting for it."; as decided then, it is the state "No list", the word the
 * glance at the top already draws. In a language whose list lacks that word, the page draws the
 * English word, and t() answers the same.
 */

import { afterAll, beforeAll, expect, it } from 'vitest'
import { liveApp, waitForThePage, type LiveApp } from './helpers.ts'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { createI18n, type Language } from '../src/shared/i18n.ts'

const WIDTH = 390

let app: LiveApp
beforeAll(async () => {
  app = await liveApp({ name: 'the-casting-page-fits-a-phone', workspace: 'default', viewport: { width: WIDTH, height: 1100 } })
  await app.context.addInitScript(({ id }) => {
    localStorage.setItem('mole-office.actor', JSON.stringify({ type: 'human', id }))
    localStorage.setItem('mole-office.preset.theme', 'light')
  }, { id: THE_TEST_OFFICES_OWNER.id })
}, 240_000)
afterAll(async () => {
  await app?.stop()
}, 120_000)

/** The state a role nobody has cast draws, in one language, as the page reads it. */
function noList(language: Language): string {
  return createI18n(language).t('casting.glance.nobody')
}

/** Opens the Casting page in one language at 390 and waits for the roles' absent marks to be drawn. */
async function openAt390(language: string): Promise<void> {
  await app.page.setViewportSize({ width: WIDTH, height: 1100 })
  await app.page.goto('about:blank')
  await app.page.goto(`${app.site}/?lang=${language}&look=light&mode=normal#/casting`)
  await waitForThePage(app.page, 60_000)
  await app.page.waitForSelector('main.page .cast-role .px-absent', { state: 'visible', timeout: 20_000 })
  await app.page.waitForTimeout(300)
}

/** The page's own width, and the first role's absent mark as the browser laid it out. */
async function measure(): Promise<{ page: number; window: number; sentence: { clientWidth: number; scrollWidth: number; words: string } }> {
  return await app.page.evaluate(() => {
    const sentence = document.querySelector('main.page .cast-role .px-absent')
    if (sentence === null) throw new Error('the Casting page drew no absent mark')
    return {
      page: document.documentElement.scrollWidth,
      window: document.documentElement.clientWidth,
      sentence: {
        clientWidth: sentence.clientWidth,
        scrollWidth: sentence.scrollWidth,
        words: (sentence.textContent ?? '').replace(/\s+/g, ' ').trim(),
      },
    }
  })
}

it('fits the Greek Casting page and its absent mark at 390', async () => {
  await openAt390('el')
  const at = await measure()
  expect(at.sentence.words, 'the role did not draw the Greek absent mark').toContain(noList('el'))
  expect(at.page, 'the Greek Casting page is wider than a 390-pixel window').toBeLessThanOrEqual(at.window + 1)
  expect(at.sentence.scrollWidth, "the Greek absent mark's words do not fit its box").toBeLessThanOrEqual(at.sentence.clientWidth + 1)
}, 120_000)

it('fits the Spanish Casting page and its absent mark at 390', async () => {
  await openAt390('es')
  const at = await measure()
  expect(at.sentence.words, 'the role did not draw the Spanish absent mark').toContain(noList('es'))
  expect(at.page, 'the Spanish Casting page is wider than a 390-pixel window').toBeLessThanOrEqual(at.window + 1)
  expect(at.sentence.scrollWidth, "the Spanish absent mark's words do not fit its box").toBeLessThanOrEqual(at.sentence.clientWidth + 1)
}, 120_000)

it('fits the Italian Casting page and its absent mark at 390', async () => {
  await openAt390('it')
  const at = await measure()
  expect(at.sentence.words, 'the role did not draw the Italian absent mark').toContain(noList('it'))
  expect(at.page, 'the Italian Casting page is wider than a 390-pixel window').toBeLessThanOrEqual(at.window + 1)
  expect(at.sentence.scrollWidth, "the Italian absent mark's words do not fit its box").toBeLessThanOrEqual(at.sentence.clientWidth + 1)
}, 120_000)

it('fits the English Casting page and its absent mark at 390, which is the control', async () => {
  await openAt390('en')
  const at = await measure()
  expect(at.sentence.words, 'the role did not draw the English absent mark').toContain(noList('en'))
  expect(at.page, 'the English Casting page is wider than a 390-pixel window').toBeLessThanOrEqual(at.window + 1)
  expect(at.sentence.scrollWidth, "the English absent mark's words do not fit its box").toBeLessThanOrEqual(at.sentence.clientWidth + 1)
}, 120_000)
