// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE CHECKLISTS WINDOW FOLDS ITS NAMES BEHIND A BACK PRESS. Wave 13y round 175, as decided: the window opens on the
 * reader's own cards, with Back at the start of its head, before the title, drawn like the ×. Back shows the names in
 * place of the cards. Choosing a name shows that person's cards, and the names go. The names are a group of plain
 * presses, and the press of the person last shown is marked as the current one. In a real browser, on this test's own
 * office, at 1440 and at 390, in English; case 7 is in Chinese.
 *
 * 1. THE WINDOW OPENS ON THE CARDS. Fails if the reader's cards are not drawn, if the names are drawn, if the head's
 *    first child is not Back with its words, or if anything in the window is drawn as a tab.
 * 2. BACK SHOWS THE NAMES IN THE CARDS' PLACE. Fails if the names are not a group named by `checklists.whose`, if a card
 *    or Back is still drawn, if the reader's press is not the current one or does not have the focus, or if anything
 *    in the window has the role tab, tablist or tabpanel, or aria-selected or aria-controls.
 * 3. A NAME SHOWS THAT PERSON'S CARDS. Fails if choosing the agent does not show the agent's cards, if the names are
 *    still drawn, or if the focus is not on Back. After Back again, fails if the agent's press is not the current one,
 *    if the reader's press is still marked, or if the agent's press is not filled with the accent colour, read from
 *    the page's token.
 * 4. BACK IS DRAWN LIKE THE ×. Fails if Back's height, colour, corner radius, border widths or background are not the
 *    ×'s, if its background under the pointer is not the ×'s under the pointer, or if its words are cut or take more
 *    than one line.
 * 5. EVERY WAY OF CLOSING LEAVES THE NAMES. Fails if the ×, Escape or the window's own press does not close the window
 *    from the names, or if the next opening is not the cards.
 * 6. AN ITEM HE ADDS TO AN AGENT'S CHECKLIST IN THE WINDOW SAYS HE ADDED IT. Fails if, after Back and the agent's name,
 *    the item added on the agent's card, opened, does not say "Added by" with his name as the office has it.
 * 7. IN CHINESE, BACK SAYS ITS CHINESE WORD. Fails if Back's words are not the Chinese word the word reader gives, or
 *    if that word is the English one or the mark of a missing word.
 *
 * Every word checked, and every press found, is read from its key with t(). The window's own press is found by its
 * words with any count, because the count changes as the cases add items.
 *
 * THE OFFICE IS THIS TEST'S OWN. `liveApp` starts its own API and database, and the browser is the person. Every
 * agent and checklist here is made up, and nothing is asked of the live office.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Locator, Page } from 'playwright'
import { THE_PERSON } from '../src/shared/person.ts'
import { createI18n, t, type Say } from '../src/shared/i18n.ts'
import { liveApp, waitForThePage, type LiveApp } from './helpers.ts'

let app: LiveApp
const zh = createI18n('zh')

const PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}
const AS = (handle: string) => ({ ...PERSON, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': handle })

async function send(method: string, url: string, body: object | undefined, headers: Record<string, string> = PERSON): Promise<Record<string, any>> {
  const reply = await fetch(app.api + url, { method, headers, ...(body === undefined ? {} : { body: JSON.stringify(body) }) })
  const text = await reply.text()
  expect(reply.status, `${method} ${url}: ${text.slice(0, 600)}`).toBeLessThan(300)
  return JSON.parse(text) as Record<string, any>
}

const LARK = 'Lark Fenwick'
const WIDTHS = [
  { width: 1440, height: 900 },
  { width: 390, height: 844 },
] as const
type Width = (typeof WIDTHS)[number]
const at = (one: Width): string => `at ${String(one.width)}`

let kiln = ''
let shelf = ''
let hisName = ''

beforeAll(async () => {
  app = await liveApp({ name: 'checklists-window-folds-its-names', viewport: { width: 1440, height: 900 }, workspace: 'default' })
  await send('POST', '/api/agents/started', { handle: 'lark', name: LARK, role: 'worker' })
  kiln = (await send('POST', '/api/checklists', { title: 'Kiln checklist', items: [{ words: 'Load the kiln' }, { words: 'Write the firing log' }] }))['checklist'].id as string
  shelf = (
    await send('POST', '/api/checklists', { title: "Lark's shelf list", items: [{ words: 'Clear the top shelf' }, { words: 'Sand the shelf edge' }] }, AS('lark'))
  )['checklist'].id as string
  hisName = (await send('GET', `/api/participants/person/${THE_PERSON}`, undefined))['participant'].name as string
  // THE OFFICE NAMES THE PERSON, so his press is found by his name and a name drawn after "Added by" is not his id.
  expect(hisName, 'the person has a name in the office').not.toBe('')
  expect(hisName, "the person's name is not the person's id").not.toBe(THE_PERSON)
}, 300_000)

afterAll(async () => {
  await app?.stop()
})

/** A browser window of this width, in this language, at the address, waiting for what it names. Closed by the case. */
async function opened(one: Width, hash: string, lang: 'en' | 'zh' = 'en'): Promise<{ page: Page; close: () => Promise<void> }> {
  const context = await app.browser.newContext({ viewport: { width: one.width, height: one.height } })
  const page = await context.newPage()
  page.setDefaultTimeout(20_000)
  await page.goto(`${app.site}/?lang=${lang}#${hash}`, { timeout: 60_000 })
  await waitForThePage(page, 60_000)
  return { page, close: () => context.close() }
}

const quoted = (words: string): string => words.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** The window's own press, by its words, with whatever count it draws. */
function theWindowsPress(page: Page, say: Say = t): Locator {
  const [before = '', after = ''] = say('checklists.window.pressTitle', { n: 9 }).split('9')
  return page.getByRole('button', { name: new RegExp(`^${quoted(before)}\\d+${quoted(after)}$`) })
}

const thePanel = (page: Page): Locator => page.locator('.ckw-panel')
const back = (panel: Locator, say: Say = t): Locator => panel.getByRole('button', { name: say('checklists.window.back'), exact: true })
const theX = (panel: Locator): Locator => panel.getByRole('button', { name: t('checklists.window.close'), exact: true })
const theNames = (panel: Locator): Locator => panel.locator('.ckw-names')
const pressOf = (panel: Locator, name: string): Locator => theNames(panel).getByRole('button').filter({ hasText: name })
const TABS = '[role="tab"], [role="tablist"], [role="tabpanel"], [aria-selected], [aria-controls]'

/** Opens the window with its own press, and waits for the reader's kiln card. */
async function openTheWindow(page: Page): Promise<Locator> {
  await theWindowsPress(page).click({ timeout: 30_000 })
  const panel = thePanel(page)
  await panel.locator(`.ckw-cards .cks-card[data-list="${kiln}"]`).waitFor({ timeout: 30_000 })
  await panel.evaluate((one) => Promise.all(one.getAnimations().map((motion) => motion.finished.catch(() => undefined))))
  return panel
}

/** Presses Back, and waits until the names hold the agent's press, which comes from everybody's checklists. */
async function theNamesShown(panel: Locator): Promise<void> {
  await back(panel).click()
  await pressOf(panel, LARK).waitFor({ timeout: 30_000 })
}

/** Is the cards screen drawn: the reader's cards, no names, and Back first in the head? */
async function theCardsScreen(panel: Locator, where: string, say: Say = t): Promise<void> {
  await panel.locator('.ckw-cards .cks-card').first().waitFor({ timeout: 30_000 })
  expect(await theNames(panel).count(), `${where}: no names`).toBe(0)
  const first = await panel.locator('.ckw-head').evaluate((head) => {
    const one = head.firstElementChild
    return { tag: one?.tagName.toLowerCase() ?? 'none', words: one?.textContent ?? '' }
  })
  expect(first, `${where}: the head's first child is Back`).toEqual({ tag: 'button', words: say('checklists.window.back') })
}

const isFocused = (one: Locator): Promise<boolean> => one.evaluate((element) => element === document.activeElement)

describe("1. the window opens on the reader's cards, with Back first in its head", () => {
  for (const one of WIDTHS) {
    it(`1. the cards, no names, and Back before the title, ${at(one)}`, async () => {
      const { page, close } = await opened(one, '/decisions')
      try {
        const panel = await openTheWindow(page)
        await theCardsScreen(panel, 'at the opening')
        expect(await back(panel).count(), 'one Back').toBe(1)
        expect(await panel.locator(TABS).count(), 'nothing drawn as a tab').toBe(0)
      } finally {
        await close()
      }
    }, 120_000)
  }
})

describe("2. Back shows the names in the cards' place", () => {
  for (const one of WIDTHS) {
    it(`2. the names are a group, no card and no Back, and the reader's press is current and focused, ${at(one)}`, async () => {
      const { page, close } = await opened(one, '/decisions')
      try {
        const panel = await openTheWindow(page)
        await theNamesShown(panel)
        const names = theNames(panel)
        expect(await names.getAttribute('role'), 'the names are a group').toBe('group')
        expect(await names.getAttribute('aria-label')).toBe(t('checklists.whose'))
        expect(await panel.locator('.cks-card').count(), 'no card').toBe(0)
        expect(await panel.locator('.ckw-cards').count(), 'no cards part').toBe(0)
        expect(await back(panel).count(), 'no Back').toBe(0)
        const reader = pressOf(panel, hisName)
        expect(await reader.count(), "the reader's press").toBe(1)
        expect(await names.getByRole('button').first().textContent(), "the reader's press is first").toContain(hisName)
        expect(await reader.getAttribute('aria-current'), "the reader's press is the current one").toBe('true')
        await expect.poll(() => isFocused(reader), { timeout: 5_000, message: "the focus is on the reader's press" }).toBe(true)
        expect(await panel.locator(TABS).count(), 'no tab, tab list or tab panel, and no aria-selected or aria-controls').toBe(0)
      } finally {
        await close()
      }
    }, 120_000)
  }
})

describe("3. a name shows that person's cards, and the names go", () => {
  for (const one of WIDTHS) {
    it(`3. the agent's cards, no names, the focus on Back; then the agent's press is current and filled, ${at(one)}`, async () => {
      const { page, close } = await opened(one, '/decisions')
      try {
        const panel = await openTheWindow(page)
        await theNamesShown(panel)
        await pressOf(panel, LARK).click()
        await panel.locator(`.ckw-cards .cks-card[data-list="${shelf}"]`).waitFor({ timeout: 30_000 })
        expect(await panel.locator(`.cks-card[data-list="${kiln}"]`).count(), "the reader's card is not shown").toBe(0)
        expect(await theNames(panel).count(), 'the names go').toBe(0)
        await expect.poll(() => isFocused(back(panel)), { timeout: 5_000, message: 'the focus is on Back' }).toBe(true)

        await back(panel).click()
        const lark = pressOf(panel, LARK)
        await lark.waitFor({ timeout: 10_000 })
        expect(await lark.getAttribute('aria-current'), "the agent's press is the current one").toBe('true')
        expect(await pressOf(panel, hisName).getAttribute('aria-current'), "the reader's press is not marked").toBeNull()
        await expect.poll(() => isFocused(lark), { timeout: 5_000, message: "the focus is on the agent's press" }).toBe(true)
        // THE POINTER LEAVES THE PRESSES, so the fill read is the current one's and not one under the pointer.
        await page.mouse.move(0, one.height - 1)
        const accent = await panel.evaluate((box) => {
          const probe = document.createElement('span')
          probe.style.backgroundColor = 'var(--accent)'
          box.append(probe)
          const colour = getComputedStyle(probe).backgroundColor
          probe.remove()
          return colour
        })
        expect(accent, 'the page has an accent colour').not.toBe('rgba(0, 0, 0, 0)')
        await expect
          .poll(() => lark.evaluate((press) => getComputedStyle(press).backgroundColor), { timeout: 5_000, message: "the agent's press is filled with the accent colour" })
          .toBe(accent)
      } finally {
        await close()
      }
    }, 120_000)
  }
})

describe('4. Back is drawn like the ×', () => {
  for (const one of WIDTHS) {
    it(`4. Back's height, colour, radius, borders and background are the ×'s, and its words are whole on one line, ${at(one)}`, async () => {
      const { page, close } = await opened(one, '/decisions')
      try {
        const panel = await openTheWindow(page)
        const look = (press: Locator) =>
          press.evaluate(async (element) => {
            await Promise.all(element.getAnimations().map((motion) => motion.finished.catch(() => undefined)))
            const style = getComputedStyle(element)
            return {
              height: style.height,
              colour: style.color,
              radius: [style.borderTopLeftRadius, style.borderTopRightRadius, style.borderBottomRightRadius, style.borderBottomLeftRadius],
              borders: [style.borderTopWidth, style.borderRightWidth, style.borderBottomWidth, style.borderLeftWidth],
              background: [style.backgroundColor, style.backgroundImage],
            }
          })
        await page.mouse.move(0, one.height - 1)
        expect(await look(back(panel)), "Back as the × is drawn").toEqual(await look(theX(panel)))
        const underThePointer = async (press: Locator): Promise<string> => {
          await press.hover()
          return press.evaluate(async (element) => {
            await Promise.all(element.getAnimations().map((motion) => motion.finished.catch(() => undefined)))
            return getComputedStyle(element).backgroundColor
          })
        }
        const xUnder = await underThePointer(theX(panel))
        expect(xUnder, 'the × has a background under the pointer').not.toBe('rgba(0, 0, 0, 0)')
        expect(await underThePointer(back(panel)), "Back's background under the pointer is the ×'s").toBe(xUnder)
        const words = await back(panel).evaluate((press) => {
          const range = document.createRange()
          range.selectNodeContents(press)
          return {
            text: press.textContent ?? '',
            lines: new Set([...range.getClientRects()].filter((box) => box.width > 0).map((box) => Math.round(box.top))).size,
            whole: press.scrollWidth <= press.clientWidth + 1,
          }
        })
        expect(words.text, "Back's words").toBe(t('checklists.window.back'))
        expect(words.lines, 'on one line').toBe(1)
        expect(words.whole, 'not cut').toBe(true)
      } finally {
        await close()
      }
    }, 120_000)
  }
})

describe('5. the ×, Escape and the window\'s own press close the window from the names', () => {
  for (const one of WIDTHS) {
    it(`5. each closes it from the names, and the next opening is the cards, ${at(one)}`, async () => {
      const { page, close } = await opened(one, '/decisions')
      try {
        const ways: [string, (panel: Locator) => Promise<void>][] = [
          ['the ×', (panel) => theX(panel).click()],
          ['Escape', () => page.keyboard.press('Escape')],
          ["the window's own press", () => theWindowsPress(page).click()],
        ]
        for (const [way, closeIt] of ways) {
          const panel = await openTheWindow(page)
          await theNamesShown(panel)
          await closeIt(panel)
          await expect.poll(() => thePanel(page).count(), { timeout: 5_000, message: `${way} closes the window` }).toBe(0)
          await theCardsScreen(await openTheWindow(page), `the opening after ${way}`)
          await theX(thePanel(page)).click()
          await expect.poll(() => thePanel(page).count(), { timeout: 5_000 }).toBe(0)
        }
      } finally {
        await close()
      }
    }, 180_000)
  }
})

describe("6. an item he adds to an agent's checklist in the window says he added it", () => {
  for (const one of WIDTHS) {
    it(`6. after Back and the agent's name, the item added on the agent's card says "Added by" and his name, ${at(one)}`, async () => {
      const words = `Wax the shelf brackets, ${at(one)}`
      const { page, close } = await opened(one, '/decisions')
      try {
        const panel = await openTheWindow(page)
        await theNamesShown(panel)
        await pressOf(panel, LARK).click()
        const card = panel.locator(`.ckw-cards .cks-card[data-list="${shelf}"]`)
        await card.waitFor({ timeout: 30_000 })
        const field = card.locator('.cks-add-field')
        await field.fill(words)
        const answered = page.waitForResponse((reply) => new URL(reply.url()).pathname === `/api/checklists/${shelf}/items` && reply.request().method() === 'POST')
        await field.press('Enter')
        expect((await answered).status(), 'the door stores the item').toBe(201)
        const row = card.locator('.ckp-item', { hasText: words })
        await row.waitFor({ timeout: 10_000 })
        await row.locator('.ckp-summary').click()
        await expect.poll(() => row.innerText(), { timeout: 10_000 }).toContain(t('w13j.checklistDone.addedBy', { name: hisName }))
      } finally {
        await close()
      }
    }, 120_000)
  }
})

describe('7. in Chinese, Back says its Chinese word', () => {
  for (const one of WIDTHS) {
    it(`7. Back's words are the word reader's Chinese word, ${at(one)}`, async () => {
      const word = zh.t('checklists.window.back')
      expect(word, 'the Chinese word is not the English one').not.toBe(t('checklists.window.back'))
      expect(word, 'the Chinese word is there').not.toContain('⟦')
      const { page, close } = await opened(one, '/decisions', 'zh')
      try {
        await theWindowsPress(page, zh.t).click({ timeout: 30_000 })
        const panel = thePanel(page)
        await theCardsScreen(panel, 'in Chinese', zh.t)
        expect(await back(panel, zh.t).innerText(), "Back's words").toBe(word)
      } finally {
        await close()
      }
    }, 120_000)
  }
})
