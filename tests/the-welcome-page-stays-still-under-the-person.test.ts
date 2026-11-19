// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE WELCOME PAGE STAYS STILL UNDER THE PERSON WHILE THEY TYPE THEIR NAME OR CHOOSE A LANGUAGE (wave 13y round 129,
 * item 68, problem jO3yTq0QyuE6).
 *
 * In a trial on a fresh office, typing over the name placeholder took the warning under the field away, and everything
 * below it moved up. Choosing a language then drew the title and the lead again in that language, and the field and the
 * choices moved again, so a press meant for one language landed on another. Now the warning keeps its place while it is
 * not shown, and the language choices are the first thing on the page, above the title, each written in its own
 * language. The parts under the choices are drawn again in the language chosen, so the name field may move once then.
 *
 *   1. Typing over the placeholder moves nothing: the name field, the warning's place, every choice and the press stay
 *      where they were, at 1440 and at 390. Once a name is typed, the warning is not shown, and the field no longer
 *      names it as what describes it.
 *   2. Choosing Chinese and then English moves no choice, at 1440 and at 390. The choices are above the title and come
 *      before the name field in the page's order, which a screen reader follows. Each choice's words are its own
 *      language's name, marked as that language.
 *
 * A FRESH OFFICE, owned by nobody named, as in tests/the-first-run-guide.test.ts: the two owner settings are empty in
 * the environment its server starts with. Nothing is filed in it.
 *
 * MUTATIONS, after a control run, in src/web/pages/WelcomePage.tsx: draw the warning only while the placeholder is kept,
 * as before, and case 1 fails; put the choices back under the name field, and case 2 fails.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Page } from 'playwright'
import { LANGUAGES, type Language } from '../src/shared/i18n.ts'
import { THE_OWNER_PLACEHOLDER } from '../src/shared/owner.ts'
import { liveApp, waitForThePage, type LiveApp } from './helpers.ts'

const OWNER_SETTINGS = ['MOLE_OFFICE_OWNER_ID', 'MOLE_OFFICE_OWNER_NAME'] as const
const WIDTHS = [1440, 390] as const

let app: LiveApp

beforeAll(async () => {
  // EMPTY AND NOT DELETED: a setting left out is read from the .env the checkout holds, as the first-run guide's test says.
  const saved = OWNER_SETTINGS.map((key) => [key, process.env[key]] as const)
  for (const key of OWNER_SETTINGS) process.env[key] = ''
  try {
    app = await liveApp({ name: 'welcome-stays-still', viewport: { width: 1440, height: 1000 } })
  } finally {
    for (const [key, value] of saved) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
  }
}, 180_000)

afterAll(async () => {
  await app?.stop()
}, 60_000)

/** A window of its own at one width, on the Welcome page, with no language in the address. */
async function aWindow(width: number) {
  const context = await app.browser.newContext({ viewport: { width, height: width === 390 ? 844 : 1000 } })
  const page = await context.newPage()
  await page.goto(`${app.site}/#/welcome`, { timeout: 60_000 })
  await waitForThePage(page, 60_000)
  await page.locator('.wlc-input').waitFor({ timeout: 30_000 })
  return { context, page }
}

/** Waits for two drawings, so what a change moved is on the screen before it is measured. */
const twoDrawings = (page: Page) => page.evaluate(() => new Promise((drawn) => requestAnimationFrame(() => requestAnimationFrame(drawn))))

/** Where each part starts, rounded to the pixel: the field, the warning's place, each choice by its language, the press. */
async function wherePartsAre(page: Page): Promise<Record<string, string | null>> {
  return page.evaluate(() => {
    const at = (element: Element | null): string | null => {
      if (element === null) return null
      const box = element.getBoundingClientRect()
      return `${Math.round(box.left)},${Math.round(box.top)}`
    }
    const parts: Record<string, string | null> = {
      field: at(document.querySelector('.wlc-input')),
      warning: at(document.querySelector('.wlc-kept')),
      press: at(document.querySelector('.wlc-foot .px-btn')),
    }
    for (const choice of document.querySelectorAll<HTMLInputElement>('.wlc-choice input')) {
      parts[`choice ${choice.value}`] = at(choice.closest('.wlc-choice'))
    }
    return parts
  })
}

/** Where each choice starts, by its language. */
async function whereChoicesAre(page: Page): Promise<Record<string, string | null>> {
  const parts = await wherePartsAre(page)
  return Object.fromEntries(Object.entries(parts).filter(([name]) => name.startsWith('choice ')))
}

/** Presses one language's choice and waits until the title is drawn again in it. */
async function choose(page: Page, language: Language): Promise<void> {
  const before = await page.locator('.wlc-title').textContent()
  await page.locator('.wlc-choice', { has: page.locator(`input[value="${language}"]`) }).click()
  await page.waitForFunction((was) => document.querySelector('.wlc-title')?.textContent !== was, before, { timeout: 10_000 })
  await expect.poll(() => page.locator(`.wlc-choice input[value="${language}"]`).isChecked()).toBe(true)
  await twoDrawings(page)
}

describe('the Welcome page stays still under the person', () => {
  it('1. typing over the placeholder moves nothing, at 1440 and at 390, and the warning is then not shown', async () => {
    for (const width of WIDTHS) {
      const { context, page } = await aWindow(width)
      try {
        const field = page.locator('.wlc-input')
        expect(await field.inputValue(), `the placeholder at ${width}`).toBe(THE_OWNER_PLACEHOLDER.en)
        const warning = page.locator('.wlc-kept')
        expect(await warning.isVisible(), `the warning at ${width} before typing`).toBe(true)
        const before = await wherePartsAre(page)
        expect(Object.keys(before).filter((name) => name.startsWith('choice ')).length, `the choices at ${width}`).toBe(Object.keys(LANGUAGES).length)
        expect(Object.values(before).every((one) => one !== null), `every part at ${width}: ${JSON.stringify(before)}`).toBe(true)
        await field.fill('Ada')
        await twoDrawings(page)
        expect(await wherePartsAre(page), `where the parts are at ${width} after typing`).toEqual(before)
        expect(await warning.isVisible(), `the warning at ${width} after typing`).toBe(false)
        const describedBy = (await field.getAttribute('aria-describedby')) ?? ''
        const warningId = await warning.getAttribute('id')
        expect(describedBy.split(' ').filter((one) => one !== ''), `what describes the field at ${width}`).not.toContain(warningId)
      } finally {
        await context.close()
      }
    }
  }, 120_000)

  it('2. choosing Chinese and then English moves no choice, at 1440 and at 390, and the choices are above the title', async () => {
    for (const width of WIDTHS) {
      const { context, page } = await aWindow(width)
      try {
        const before = await whereChoicesAre(page)
        expect(Object.keys(before).length, `the choices at ${width}`).toBe(Object.keys(LANGUAGES).length)
        // EACH CHOICE IS ITS OWN LANGUAGE'S NAME, in that language, so a change of language draws it the same.
        for (const [language, word] of Object.entries(LANGUAGES)) {
          const said = page.locator('.wlc-choice', { has: page.locator(`input[value="${language}"]`) }).locator('span')
          expect(await said.textContent(), `the ${language} choice at ${width}`).toBe(word)
          expect(await said.getAttribute('lang'), `the ${language} choice's language at ${width}`).toBe(language)
        }
        const lowestChoice = await page.locator('.wlc-choice').evaluateAll((all) => Math.max(...all.map((one) => one.getBoundingClientRect().bottom)))
        const title = await page.locator('.wlc-title').evaluate((one) => one.getBoundingClientRect().top)
        expect(lowestChoice, `the choices end above the title at ${width}`).toBeLessThanOrEqual(title)
        // A SCREEN READER MEETS THE CHOICES BEFORE THE NAME FIELD, as a sighted reader does: it reads in the page's order,
        // and the last choice comes before the name field there.
        const choicesComeFirst = await page.evaluate(() => {
          const choices = document.querySelectorAll('.wlc-choice input')
          const field = document.querySelector('.wlc-input')
          return field !== null && choices.length > 0 && (choices[choices.length - 1]!.compareDocumentPosition(field) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0
        })
        expect(choicesComeFirst, `the choices come before the name field in the page's order at ${width}`).toBe(true)
        await choose(page, 'zh')
        expect(await whereChoicesAre(page), `where the choices are at ${width} after choosing Chinese`).toEqual(before)
        await choose(page, 'en')
        expect(await whereChoicesAre(page), `where the choices are at ${width} after choosing English again`).toEqual(before)
      } finally {
        await context.close()
      }
    }
  }, 120_000)
})
