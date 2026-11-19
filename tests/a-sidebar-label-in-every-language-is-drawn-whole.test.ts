// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE SIDEBAR DRAWS ITS LABELS WHOLE IN EVERY LANGUAGE WHOSE WORDS ARE WHOLE.
 *
 * At 1440 the rail's labels sit in a grid column and each is on one line with an ellipsis. The
 * English words fit. Greek, Spanish and Italian are longer, so five labels ended in an ellipsis and
 * the Spanish project word read PROYEC… instead of PROYECTO. A cut label names the wrong place: the
 * Spanish row for readiness checklists read "Listas de comprobación" and lost "de preparación".
 *
 * So, at 1440, this file holds every rail label and the project word to one thing: their words fit
 * their box. The browser answers that as scrollWidth against clientWidth. A cut of even one pixel
 * draws the ellipsis, so the two are compared with no allowance.
 *
 * Test change (wave 13y round 165): the sidebar keeps five pages and All pages in front, and every other row and
 * the project word are drawn on the All pages page. So the labels are read on that page, in the sidebar and in
 * the page's own rows together, and the project word in the page's project block.
 *
 * Test change (wave 13y round 165), a second one: the foot's name at 390 was held to one line and cut with an
 * ellipsis. It now wraps between words onto at most two lines, as design A of this round's sidebar draws it, and
 * only a name that needs more than two lines is cut, with an ellipsis at the end of its second line.
 *
 * Test change (wave 13y round 165), a third one: the owner took the project word out of the project block, so
 * there is no project word to measure, and only the labels are measured.
 *
 * THE OFFICE IS A TEST OFFICE, and nothing in it is a real observation.
 */

import { afterAll, beforeAll, expect, it } from 'vitest'
import { liveApp, waitForThePage, type LiveApp } from './helpers.ts'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { RAIL_WORD_KEYS } from '../src/shared/surfaces.ts'
import { WORD_LISTS, type Language } from '../src/shared/i18n.ts'

const WIDTH = 1440

let app: LiveApp
beforeAll(async () => {
  app = await liveApp({ name: 'sidebar-labels-in-every-language', workspace: 'default', viewport: { width: WIDTH, height: 1100 } })
  await app.context.addInitScript(({ id }) => {
    localStorage.setItem('mole-office.actor', JSON.stringify({ type: 'human', id }))
    localStorage.setItem('mole-office.preset.theme', 'light')
  }, { id: THE_TEST_OFFICES_OWNER.id })
}, 240_000)
afterAll(async () => {
  await app?.stop()
}, 120_000)

/** Opens the All pages page in one language and waits for the sidebar's labels and the page's rows. */
async function openTheSidebar(language: string): Promise<void> {
  await app.page.setViewportSize({ width: WIDTH, height: 1100 })
  await app.page.goto('about:blank')
  await app.page.goto(app.site + `/?lang=${language}&look=light&mode=normal#/all-pages`)
  await waitForThePage(app.page, 60_000)
  await app.page.locator('#shell-side .shell-label').first().waitFor({ timeout: 15_000 })
  await app.page.locator('#main a.ap-page').first().waitFor({ timeout: 15_000 })
}

interface Label {
  words: string
  clientWidth: number
  scrollWidth: number
}

/** Every rail label, as the browser laid them out. */
async function measureTheRail(): Promise<{ labels: Label[] }> {
  return await app.page.evaluate(() => {
    const read = (element: Element | null, what: string): Label => {
      if (element === null) throw new Error(`the sidebar has no ${what}`)
      return {
        words: element.textContent ?? '',
        clientWidth: element.clientWidth,
        scrollWidth: element.scrollWidth,
      }
    }
    const labels = [...document.querySelectorAll('#shell-side .shell-label, #main a.ap-page > span')].map((element, i) => read(element, `label ${String(i)}`))
    return { labels }
  })
}

/** The rail's labels that are cut, named with their words and widths. */
function theCut(labels: readonly Label[]): string[] {
  return labels
    .filter((label) => label.scrollWidth > label.clientWidth)
    .map((label) => `"${label.words}": the box is ${String(label.clientWidth)} pixels wide and the words need ${String(label.scrollWidth)}`)
}

/** A control that says the rail really drew its words in this language, before any cut is judged. */
function expectDrawn(language: string, labels: readonly Label[]): void {
  expect(labels.length, `${language}: the sidebar drew almost no labels`).toBeGreaterThan(8)
  for (const label of labels) {
    expect(label.words.trim(), `${language}: a rail label is empty`).not.toBe('')
    expect(label.words, `${language}: a word of a rail label is missing`).not.toContain('⟦')
    expect(label.clientWidth, `${language}: a rail label has no width, so nothing was measured`).toBeGreaterThan(0)
  }
}

/** One rail label's words in one language, read from the word list, with the English fallback the page uses. */
function railWords(language: Language, key: string): string | null {
  const list = WORD_LISTS[language] as Readonly<Record<string, unknown>>
  const english = WORD_LISTS.en as Readonly<Record<string, unknown>>
  const value = list[key] ?? english[key]
  return typeof value === 'string' ? value : null
}

/** The word inside a label that takes the most room. */
function theLongestWord(text: string): string {
  return text.split(/\s+/).reduce((longest, word) => (word.length > longest.length ? word : longest), '')
}

/** The drawn rail label whose longest word is the longest, read from the word lists rather than copied. */
function theHardestRailLabel(language: Language, drawn: readonly string[]): string {
  const words = Object.values(RAIL_WORD_KEYS)
    .map((key) => railWords(language, key))
    .filter((word): word is string => word !== null && word !== '' && drawn.includes(word))
  expect(words.length, `${language}: the rail draws almost none of the word list's labels`).toBeGreaterThan(8)
  return [...words].sort((a, b) => theLongestWord(b).length - theLongestWord(a).length || b.length - a.length)[0]!
}

it('draws the rail label with the longest word each word list holds, whole', async () => {
  for (const language of ['el', 'es', 'it'] as const) {
    await openTheSidebar(language)
    const at = await measureTheRail()
    const wanted = theHardestRailLabel(language, at.labels.map((label) => label.words))
    const found = at.labels.find((label) => label.words === wanted)
    expect(found, `${language}: the rail did not draw the label "${wanted}", whose longest word is the hardest the word list holds`).toBeDefined()
    expect(theCut([found!]), `${language}: the rail cuts its hardest label`).toEqual([])
  }
}, 240_000)

it("lets the foot's name wrap onto two lines at 390, and cuts it with an ellipsis after the second", async () => {
  await app.page.setViewportSize({ width: 390, height: 844 })
  await app.page.goto('about:blank')
  await app.page.goto(app.site + '/?lang=en&look=light&mode=normal#/office')
  await waitForThePage(app.page, 60_000)
  await app.page.locator('.shell-menu').click()
  await app.page.locator('#shell-side .sbp-person-name').waitFor({ timeout: 15_000 })
  const style = await app.page.locator('#shell-side .sbp-person-name').evaluate((element) => {
    const computed = getComputedStyle(element)
    return { whiteSpace: computed.whiteSpace, lineClamp: computed.webkitLineClamp, textOverflow: computed.textOverflow, overflow: computed.overflow }
  })
  expect(style.whiteSpace, "the foot's name is held to one line at 390, where it may take two").toBe('normal')
  expect(style.lineClamp, "the foot's name is not held to two lines at 390").toBe('2')
  expect(style.textOverflow, "the foot's name is not cut with an ellipsis at 390").toBe('ellipsis')
  expect(style.overflow, "the foot's name is not held inside its box at 390").toBe('hidden')
}, 120_000)

it('draws the English rail whole, which is the control', async () => {
  await openTheSidebar('en')
  const at = await measureTheRail()
  expectDrawn('en', at.labels)
  expect(theCut(at.labels), 'an English rail label is cut').toEqual([])
}, 120_000)

it('draws every Greek rail label whole', async () => {
  await openTheSidebar('el')
  const at = await measureTheRail()
  expectDrawn('el', at.labels)
  expect(theCut(at.labels), 'a Greek rail label is cut').toEqual([])
}, 120_000)

it('draws every Spanish rail label whole', async () => {
  await openTheSidebar('es')
  const at = await measureTheRail()
  expectDrawn('es', at.labels)
  expect(theCut(at.labels), 'a Spanish rail label is cut').toEqual([])
}, 120_000)

it('draws every Italian rail label whole', async () => {
  await openTheSidebar('it')
  const at = await measureTheRail()
  expectDrawn('it', at.labels)
  expect(theCut(at.labels), 'an Italian rail label is cut').toEqual([])
}, 120_000)
